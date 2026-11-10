import assert from "node:assert/strict";
import { afterAll as after, test, vi } from "vitest";
import {
  assertLoginAllowed,
  clearFailedLogins,
  getSessionUser,
  recordFailedLogin,
  resolveClientIp,
  sessionSetCookie,
} from "./auth";
import { closePool, pool } from "./db";

after(() => closePool());

test("verified sessions check that the account still exists and is active", async () => {
  const previousSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "session-test-only-".repeat(3);
  const patchable = pool as unknown as { query: (...args: unknown[]) => Promise<unknown> };
  const query = patchable.query;
  let rows: unknown[] = [];
  let calls = 0;
  patchable.query = async (sql, ids) => {
    calls++;
    assert.match(String(sql), /is_active = 1/);
    assert.deepEqual(ids, [42]);
    return [rows, []];
  };
  try {
    assert.equal(await getSessionUser(new Request("http://api.test")), null);
    assert.equal(await getSessionUser(new Request("http://api.test", {
      headers: { cookie: "hi_session=invalid" },
    })), null);
    assert.equal(calls, 0);

    const cookie = await sessionSetCookie({ id: 42, username: "old", displayName: "Old" });
    const request = new Request("http://api.test", { headers: { cookie } });
    assert.equal(await getSessionUser(request), null);
    rows = [{ id: 42, username: "owner", display_name: "Current owner" }];
    assert.deepEqual(await getSessionUser(request), {
      id: 42, username: "owner", displayName: "Current owner",
    });
    patchable.query = async () => { throw Object.assign(new Error("offline"), { code: "ECONNREFUSED" }); };
    await assert.rejects(getSessionUser(request), (error: unknown) =>
      (error as { status?: number }).status === 503
    );
  } finally {
    patchable.query = query;
    if (previousSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousSecret;
  }
});

test("resolveClientIp ignores spoofed leftmost X-Forwarded-For and untrusted peer headers", () => {
  vi.stubEnv("NODE_ENV", "development");
  try {
    // Proxied through local Next.js (loopback socket): takes rightmost hop, never spoofed leftmost
    assert.equal(
      resolveClientIp(
        new Request("http://api.test/api/auth/login", {
          headers: {
            "x-socket-ip": "::ffff:127.0.0.1",
            "x-forwarded-for": "9.9.9.9, 192.168.68.55",
          },
        })
      ),
      "192.168.68.55"
    );

    // Direct non-loopback peer in dev cannot spoof X-Forwarded-For or CF-Connecting-IP
    assert.equal(
      resolveClientIp(
        new Request("http://api.test/api/auth/login", {
          headers: {
            "x-socket-ip": "::ffff:192.168.68.77",
            "cf-connecting-ip": "1.2.3.4",
            "x-forwarded-for": "5.6.7.8",
          },
        })
      ),
      "192.168.68.77"
    );

    // Production reverse proxy trusts CF-Connecting-IP / rightmost X-Forwarded-For
    vi.stubEnv("NODE_ENV", "production");
    assert.equal(
      resolveClientIp(
        new Request("http://api.test/api/auth/login", {
          headers: {
            "x-socket-ip": "10.0.1.9",
            "cf-connecting-ip": "203.0.113.42",
            "x-forwarded-for": "8.8.8.8, 203.0.113.42",
          },
        })
      ),
      "203.0.113.42"
    );

    assert.equal(
      resolveClientIp(
        new Request("http://api.test/api/auth/login", {
          headers: {
            "x-socket-ip": "10.0.1.9",
            "x-forwarded-for": "8.8.8.8, 198.51.100.7",
          },
        })
      ),
      "198.51.100.7"
    );
  } finally {
    vi.unstubAllEnvs();
  }
});

test("login rate-limiting isolates lockouts per resolved client IP", () => {
  const user = "rate-limit-test-owner";
  const ipA = "192.168.68.55";
  const ipB = "192.168.68.10";
  try {
    for (let i = 0; i < 8; i++) {
      assertLoginAllowed(user, ipA);
      recordFailedLogin(user, ipA);
    }
    assert.throws(
      () => assertLoginAllowed(user, ipA),
      (err: unknown) => (err as { status?: number }).status === 429
    );
    // Another device on the shop LAN is unaffected
    assert.doesNotThrow(() => assertLoginAllowed(user, ipB));
  } finally {
    clearFailedLogins(user, ipA);
    clearFailedLogins(user, ipB);
  }
});

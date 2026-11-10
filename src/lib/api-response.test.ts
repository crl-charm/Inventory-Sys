import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { z } from "zod";
import { closePool } from "./db";
import { ok, parseJsonBody, parseNumericParam, parsePagination, withApi } from "./api-response";
import { MAX_BODY_BYTES } from "./request-body";
import { productListQuery, saleListQuery, movementListQuery } from "./validation/query";

afterAll(() => closePool());

test("IDs and pagination reject values that cannot be used safely in SQL", () => {
  assert.deepEqual(parsePagination(new URLSearchParams("page=2&pageSize=200")), {
    page: 2, pageSize: 100, offset: 100,
  });
  assert.equal(parseNumericParam("123"), 123);
  for (const value of ["Infinity", "1.5", "-1", "0", "NaN", "9007199254740992", "0x10"]) {
    assert.throws(() => parseNumericParam(value));
    assert.throws(() => parsePagination(new URLSearchParams({ page: value })));
    assert.throws(() => parsePagination(new URLSearchParams({ pageSize: value })));
  }
  assert.throws(() => parsePagination(new URLSearchParams({ page: String(Number.MAX_SAFE_INTEGER) })));
});

test("list filters validate IDs, enums, real dates and date ordering", () => {
  assert.deepEqual(productListQuery.parse({ categoryId: "12", active: "active" }), {
    categoryId: 12, active: "active",
  });
  assert.equal(productListQuery.safeParse({ categoryId: "NaN" }).success, false);
  assert.equal(productListQuery.safeParse({ active: "unknown" }).success, false);
  assert.equal(saleListQuery.safeParse({ from: "2026-02-30" }).success, false);
  assert.equal(saleListQuery.safeParse({ from: "2026-11-02", to: "2026-11-01" }).success, false);
  assert.equal(movementListQuery.safeParse({ from: "invalid" }).success, false);
  assert.equal(movementListQuery.safeParse({ movementType: "unknown" }).success, false);
  assert.equal(saleListQuery.safeParse({ from: "2024-02-29", to: "2024-03-01" }).success, true);
});

test("parseJsonBody rejects payloads larger than 1 MiB with 413", async () => {
  const schema = z.object({ note: z.string() });
  const oversized = JSON.stringify({ note: "x".repeat(MAX_BODY_BYTES + 32) });
  await assert.rejects(
    parseJsonBody(
      new Request("http://localhost/api/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: oversized,
      }),
      schema
    ),
    (error: unknown) => (error as { status?: number }).status === 413
  );
});

test("withApi accepts same-origin Host headers and rejects cross-origin mutations", async () => {
  const handler = withApi({ auth: "none" }, async () => ok({ ok: true }));

  const allowed = await handler(
    new Request("http://127.0.0.1:3000/api/auth/logout", {
      method: "POST",
      headers: {
        host: "192.168.68.105:3000",
        origin: "http://192.168.68.105:3000",
      },
    })
  );
  assert.equal(allowed.status, 200);

  const rejected = await handler(
    new Request("http://127.0.0.1:3000/api/auth/logout", {
      method: "POST",
      headers: {
        host: "192.168.68.105:3000",
        origin: "https://evil.example",
      },
    })
  );
  assert.equal(rejected.status, 403);
});

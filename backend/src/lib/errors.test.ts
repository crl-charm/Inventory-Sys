import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDatabaseConnectionError, isStaleConnectionError } from "./errors";

describe("isDatabaseConnectionError", () => {
  it("recognises dropped / refused / timed-out connections", () => {
    for (const code of ["ECONNRESET", "EPIPE", "PROTOCOL_CONNECTION_LOST", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"]) {
      assert.equal(isDatabaseConnectionError({ code }), true, code);
    }
    assert.equal(
      isDatabaseConnectionError(new Error("Can't add new command when connection is in closed state")),
      true
    );
  });

  it("ignores ordinary SQL errors", () => {
    assert.equal(isDatabaseConnectionError({ code: "ER_DUP_ENTRY", errno: 1062 }), false);
    assert.equal(isDatabaseConnectionError(new Error("boom")), false);
    assert.equal(isDatabaseConnectionError(null), false);
  });

  it("only treats dead-socket errors as stale (safe to retry a read)", () => {
    assert.equal(isStaleConnectionError({ code: "ECONNRESET" }), true);
    assert.equal(isStaleConnectionError({ code: "ECONNREFUSED" }), false);
    assert.equal(isStaleConnectionError({ code: "ER_ACCESS_DENIED_ERROR" }), false);
  });
});

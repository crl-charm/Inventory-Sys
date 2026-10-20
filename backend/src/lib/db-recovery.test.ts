import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getValidatedConnection,
  isReadOnlySql,
  safeRollback,
  withReadRecovery,
} from "./db-recovery";

const staleError = () => Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });

describe("isReadOnlySql", () => {
  it("accepts SELECT/SHOW, including leading whitespace and comments", () => {
    assert.equal(isReadOnlySql("SELECT 1"), true);
    assert.equal(isReadOnlySql("  \n select * from products"), true);
    assert.equal(isReadOnlySql("/* hint */ SELECT 1"), true);
    assert.equal(isReadOnlySql({ sql: "SHOW TABLES" }), true);
  });
  it("rejects every kind of write", () => {
    for (const sql of [
      "INSERT INTO products VALUES (1)",
      "UPDATE products SET stock_on_hand = 0",
      "DELETE FROM products",
      "REPLACE INTO products VALUES (1)",
      "WITH x AS (SELECT 1) UPDATE products SET name = 'a'",
      "CALL do_something()",
    ]) {
      assert.equal(isReadOnlySql(sql), false, sql);
    }
    assert.equal(isReadOnlySql(undefined), false);
  });
});

describe("withReadRecovery", () => {
  it("re-runs a SELECT once after a dead-socket error", async () => {
    let calls = 0;
    const query = withReadRecovery(async (_sql: string) => {
      calls += 1;
      if (calls === 1) throw staleError();
      return "rows";
    }, "test");
    assert.equal(await query("SELECT 1"), "rows");
    assert.equal(calls, 2);
  });

  it("never re-runs a write, even on a dead-socket error", async () => {
    let calls = 0;
    const query = withReadRecovery(async (_sql: string) => {
      calls += 1;
      throw staleError();
    }, "test");
    await assert.rejects(() => query("UPDATE products SET stock_on_hand = 1"), /ECONNRESET/);
    assert.equal(calls, 1);
  });

  it("does not re-run on non-connection errors", async () => {
    let calls = 0;
    const query = withReadRecovery(async (_sql: string) => {
      calls += 1;
      throw Object.assign(new Error("bad sql"), { code: "ER_PARSE_ERROR" });
    }, "test");
    await assert.rejects(() => query("SELECT nope"), /bad sql/);
    assert.equal(calls, 1);
  });

  it("re-runs at most once", async () => {
    let calls = 0;
    const query = withReadRecovery(async (_sql: string) => {
      calls += 1;
      throw staleError();
    }, "test");
    await assert.rejects(() => query("SELECT 1"), /ECONNRESET/);
    assert.equal(calls, 2);
  });
});

describe("getValidatedConnection", () => {
  function fakeConnection(alive: boolean) {
    return {
      destroyed: false,
      ping: async () => {
        if (!alive) throw staleError();
      },
      destroy() {
        this.destroyed = true;
      },
    };
  }

  it("returns a healthy connection untouched", async () => {
    const good = fakeConnection(true);
    assert.equal(await getValidatedConnection(async () => good), good);
    assert.equal(good.destroyed, false);
  });

  it("destroys a dead connection and returns the next one", async () => {
    const dead = fakeConnection(false);
    const good = fakeConnection(true);
    const queue = [dead, good];
    const result = await getValidatedConnection(async () => queue.shift()!);
    assert.equal(result, good);
    assert.equal(dead.destroyed, true);
  });

  it("gives up after the configured attempts", async () => {
    let checkouts = 0;
    await assert.rejects(
      () =>
        getValidatedConnection(
          async () => {
            checkouts += 1;
            return fakeConnection(false);
          },
          { attempts: 3 }
        ),
      /ECONNRESET/
    );
    assert.equal(checkouts, 3);
  });

  it("treats a hung ping as dead", async () => {
    const hung = {
      destroyed: false,
      ping: () => new Promise<void>(() => undefined),
      destroy() {
        this.destroyed = true;
      },
    };
    const good = fakeConnection(true);
    const queue = [hung, good];
    const result = await getValidatedConnection(async () => queue.shift()!, {
      pingTimeoutMs: 20,
    });
    assert.equal(result, good);
    assert.equal(hung.destroyed, true);
  });
});

describe("safeRollback", () => {
  it("rolls back and keeps a healthy connection", async () => {
    let rolledBack = false;
    let destroyed = false;
    await safeRollback({
      rollback: async () => {
        rolledBack = true;
      },
      destroy: () => {
        destroyed = true;
      },
    });
    assert.equal(rolledBack, true);
    assert.equal(destroyed, false);
  });

  it("never throws and destroys the connection when rollback fails", async () => {
    let destroyed = false;
    await safeRollback({
      rollback: async () => {
        throw staleError();
      },
      destroy: () => {
        destroyed = true;
      },
    });
    assert.equal(destroyed, true);
  });
});

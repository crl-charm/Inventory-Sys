import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { runMigrations, withTestDatabase } from "./db-fixture";

test("fresh UTC data and sales idempotency", async (t) => {
  await withTestDatabase(async ({ connection, env }) => {
    await t.test("fresh UTC timestamps must not be shifted by migration 0002", async () => {
      const [before] = await connection.query<RowDataPacket[]>(
        "SELECT created_at FROM categories WHERE id = 1"
      );
      await runMigrations(env);
      const [after] = await connection.query<RowDataPacket[]>(
        "SELECT created_at FROM categories WHERE id = 1"
      );
      assert.equal(
        (after[0]?.created_at as Date).toISOString(),
        (before[0]?.created_at as Date).toISOString()
      );
    });

    const [user] = await connection.execute<ResultSetHeader>(
      "INSERT INTO users (username, password_hash, display_name) VALUES ('retry', 'unused', 'Retry')"
    );
    const userId = user.insertId;
    const { closePool, pool } = await import("../src/lib/db");
    const { createProduct } = await import("../src/services/product-service");
    const { postSalesBatch } = await import("../src/services/sales-service");
    const saleDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
    try {
      await t.test("reusing a requestId with changed contents must be rejected", async () => {
        const product = await createProduct({
          sku: "RETRY-CHANGED", name: "Changed request", categoryId: 1,
          unit: "piece", sellingPrice: "2.00", reorderLevel: "1", openingStock: "10",
        }, userId);
        const requestId = randomUUID();
        await postSalesBatch({
          saleDate, notes: undefined, requestId,
          items: [{ productId: product.product.id, quantity: "1", finalUnitPrice: "2.00" }],
        }, { userId });
        await assert.rejects(
          postSalesBatch({
            saleDate, notes: undefined, requestId,
            items: [{ productId: product.product.id, quantity: "2", finalUnitPrice: "2.00" }],
          }, { userId }),
          (error: unknown) => (error as { status?: number }).status === 409
        );
      });

      await t.test("simultaneous identical retries must both return the same sale", async () => {
        const product = await createProduct({
          sku: "RETRY-CONCURRENT", name: "Concurrent request", categoryId: 1,
          unit: "piece", sellingPrice: "2.00", reorderLevel: "1", openingStock: "1",
        }, userId);
        const input = {
          saleDate,
          notes: undefined,
          requestId: randomUUID(),
          items: [{ productId: product.product.id, quantity: "1", finalUnitPrice: "2.00" }],
        };

        // Start both header inserts together. The unique request id must
        // serialize them before either transaction checks stock.
        let reached = 0;
        let releaseBoth!: () => void;
        const bothReady = new Promise<void>((resolve) => { releaseBoth = resolve; });
        const guard = setTimeout(releaseBoth, 5_000);
        const patchable = pool as unknown as { getConnection: () => Promise<PoolConnection> };
        const checkout = patchable.getConnection;
        patchable.getConnection = async () => {
          const realConnection = await checkout.call(pool);
          return new Proxy(realConnection, {
            get(target, property) {
              if (property === "execute") {
                return async (...args: unknown[]) => {
                  if (typeof args[0] === "string" &&
                      args[0].startsWith("INSERT INTO sale_batches")) {
                    reached++;
                    if (reached === 2) releaseBoth();
                    await bothReady;
                  }
                  return Reflect.apply(target.execute, target, args);
                };
              }
              const value = Reflect.get(target, property, target);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
        };

        let results: PromiseSettledResult<Awaited<ReturnType<typeof postSalesBatch>>>[];
        try {
          results = await Promise.allSettled([
            postSalesBatch(input, { userId }),
            postSalesBatch(input, { userId }),
          ]);
        } finally {
          clearTimeout(guard);
          patchable.getConnection = checkout;
        }
        assert.equal(reached, 2, "both requests must attempt the header insert");
        assert.equal(results[0]?.status, "fulfilled");
        assert.equal(results[1]?.status, "fulfilled");
        if (results[0]?.status === "fulfilled" && results[1]?.status === "fulfilled") {
          assert.equal(results[0].value.sale.id, results[1].value.sale.id);
        }
        const [batches] = await connection.query<RowDataPacket[]>(
          "SELECT COUNT(*) AS count FROM sale_batches WHERE request_id = ?",
          [input.requestId]
        );
        assert.equal(Number(batches[0]?.count), 1);
      });
    } finally {
      await closePool();
    }
  });
});

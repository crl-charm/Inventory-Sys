import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { withTestDatabase } from "./db-fixture";

test("service limits, concurrent writes and rollback preserve stock and history", { timeout: 30_000 }, async (t) => {
  await withTestDatabase(async ({ connection }) => {
    const [user] = await connection.execute<ResultSetHeader>(
      "INSERT INTO users (username, password_hash, display_name) VALUES ('limits', 'unused', 'Limits')"
    );
    const userId = user.insertId;
    const { closePool } = await import("../src/lib/db");
    const { createProduct } = await import("../src/services/product-service");
    const { stockInProduct, recordPhysicalCount } = await import("../src/services/stock-service");
    const { postSalesBatch, voidSalesBatch } = await import("../src/services/sales-service");
    const { getDailyReport } = await import("../src/services/report-service");
    const saleDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
    const create = (sku: string, stock: string) => createProduct({
      sku, name: sku, categoryId: 1, unit: "piece", sellingPrice: "2.00", reorderLevel: "1", openingStock: stock,
    }, userId);
    const stock = async (id: number) => {
      const [rows] = await connection.query<RowDataPacket[]>("SELECT stock_on_hand FROM products WHERE id = ?", [id]);
      return rows[0]?.stock_on_hand;
    };
    try {
      await t.test("a full pool of simultaneous product creations releases connections before reading back", async () => {
        const products = await Promise.all(Array.from({ length: 5 }, (_, i) => create(`PARALLEL-${i}`, "1")));
        assert.equal(new Set(products.map((result) => result.product.id)).size, 5);
      });

      const maximum = (await create("MAXIMUM", "999999999.999")).product.id;
      await t.test("overflowing stock, merged quantities and sales totals are rejected without partial writes", async () => {
        await assert.rejects(stockInProduct({ productId: maximum, quantity: "0.001" }, userId),
          (error: unknown) => (error as { status?: number }).status === 400);
        const requestId = randomUUID();
        await assert.rejects(postSalesBatch({ saleDate, notes: undefined, requestId,
          items: [{ productId: maximum, quantity: "1000", finalUnitPrice: "9999999999.99" }],
        }, { userId }), (error: unknown) => (error as { status?: number }).status === 400);
        await assert.rejects(postSalesBatch({ saleDate, notes: undefined, requestId,
          items: [{ productId: maximum, quantity: "999999999.999" }, { productId: maximum, quantity: "0.001" }],
        }, { userId }), (error: unknown) => (error as { status?: number }).status === 400);
        assert.equal(await stock(maximum), "999999999.999");
        const [headers] = await connection.query<RowDataPacket[]>("SELECT id FROM sale_batches WHERE request_id = ?", [requestId]);
        assert.equal(headers.length, 0);
      });

      await t.test("a void that would exceed stock limits rolls back its status and ledger changes", async () => {
        const posted = await postSalesBatch({ saleDate, notes: undefined, requestId: randomUUID(),
          items: [{ productId: maximum, quantity: "1", finalUnitPrice: "2.00" }],
        }, { userId });
        await stockInProduct({ productId: maximum, quantity: "1" }, userId);
        await assert.rejects(voidSalesBatch(posted.sale.id, "Boundary reversal", userId),
          (error: unknown) => (error as { status?: number }).status === 409);
        const [headers] = await connection.query<RowDataPacket[]>("SELECT status FROM sale_batches WHERE id = ?", [posted.sale.id]);
        assert.equal(headers[0]?.status, "posted");
        assert.equal(await stock(maximum), "999999999.999");
        await recordPhysicalCount({ productId: maximum, physicalCount: "999999998.999", reason: "Boundary count" }, userId);
        await voidSalesBatch(posted.sale.id, "Boundary reversal", userId);
        assert.equal(await stock(maximum), "999999999.999");
      });

      await t.test("concurrent sales cannot oversell, and reports exclude the voided batch", async () => {
        const productId = (await create("LAST-ITEM", "1")).product.id;
        const results = await Promise.allSettled(Array.from({ length: 2 }, () => postSalesBatch({
          saleDate, notes: undefined, requestId: randomUUID(),
          items: [{ productId, quantity: "1", finalUnitPrice: "2.00" }],
        }, { userId })));
        assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
        assert.equal(results.filter((result) => result.status === "rejected" && result.reason.status === 409).length, 1);
        assert.equal(await stock(productId), "0.000");
        const report = await getDailyReport(saleDate);
        assert.equal(report.totalSales, "2.00");
        assert.equal(report.postedBatches, 1);
        assert.equal(report.productLines.length, 1);
        assert.equal(report.voidedBatches.length, 1);
      });

      const [imbalances] = await connection.query<RowDataPacket[]>(
        `SELECT p.id FROM products p LEFT JOIN stock_movements m ON m.product_id = p.id
         GROUP BY p.id, p.stock_on_hand HAVING p.stock_on_hand <> COALESCE(SUM(m.quantity_delta), 0)`
      );
      assert.equal(imbalances.length, 0);
    } finally { await closePool(); }
  });
});

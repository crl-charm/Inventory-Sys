import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { withTestDatabase } from "./db-fixture";

test("catalog pagination and stock ledger on a disposable database", async (t) => {
  await withTestDatabase(async ({ connection }) => {
    const [user] = await connection.execute<ResultSetHeader>(
      "INSERT INTO users (username, password_hash, display_name) VALUES ('integration', 'unused', 'Integration')"
    );
    const values = Array.from({ length: 101 }, (_, i) => {
      const suffix = String(i + 1).padStart(3, "0");
      return [`TEST-SKU-${suffix}`, `Test Product ${suffix}`];
    });
    await connection.execute(
      `INSERT INTO products (sku, name, category_id, unit, selling_price, reorder_level)
       VALUES ${values.map(() => "(?, ?, 1, 'piece', '3.25', '2')").join(", ")}`,
      values.flat()
    );

    const { closePool } = await import("../src/lib/db");
    const { listProducts, lookupProducts } = await import("../src/services/product-service");
    const { stockInProduct, recordPhysicalCount } = await import("../src/services/stock-service");
    const { postSalesBatch, voidSalesBatch } = await import("../src/services/sales-service");
    try {
      await t.test("the 101st product is available through pagination and lookup", async () => {
        const first = await listProducts({ active: "active", sort: "name" }, { offset: 0, pageSize: 100 });
        const second = await listProducts({ active: "active", sort: "name" }, { offset: 100, pageSize: 100 });
        assert.equal(first.total, 101);
        assert.equal(first.items.length, 100);
        assert.equal(second.items.length, 1);
        assert.equal(second.items[0]?.sku, "TEST-SKU-101");
        const matches = await lookupProducts("TEST-SKU-101");
        assert.equal(matches.length, 1);
        assert.equal(matches[0]?.sku, "TEST-SKU-101");
      });

      await t.test("stock operations, sale and void preserve the ledger balance", async () => {
        const [products] = await connection.query<RowDataPacket[]>(
          "SELECT id FROM products WHERE sku = 'TEST-SKU-101'"
        );
        const productId = Number(products[0]?.id);
        const userId = user.insertId;
        await stockInProduct({ productId, quantity: "10", reason: "Test delivery" }, userId);
        await recordPhysicalCount({ productId, physicalCount: "9.500", reason: "Test count" }, userId);

        const saleDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
        const posted = await postSalesBatch({
          saleDate,
          notes: undefined,
          requestId: randomUUID(),
          items: [{ productId, quantity: "2.500", finalUnitPrice: "3.25" }],
        }, { userId });
        assert.equal(posted.sale.totalAmount, "8.13");
        assert.equal(posted.stockUpdates[0]?.stockAfter, "7.000");
        const voided = await voidSalesBatch(posted.sale.id, "Integration reversal", userId);
        assert.equal(voided.status, "voided");

        const [movements] = await connection.query<RowDataPacket[]>(
          "SELECT movement_type, quantity_delta, stock_before, stock_after FROM stock_movements WHERE product_id = ? ORDER BY id",
          [productId]
        );
        assert.deepEqual(movements.map((row) => row.movement_type), [
          "stock_in", "physical_count_correction", "sale", "sale_void_reversal",
        ]);
        for (let i = 1; i < movements.length; i++) {
          assert.equal(movements[i]?.stock_before, movements[i - 1]?.stock_after);
        }
        const [balances] = await connection.query<RowDataPacket[]>(
          `SELECT p.stock_on_hand, SUM(m.quantity_delta) AS ledger_balance
             FROM products p JOIN stock_movements m ON m.product_id = p.id
            WHERE p.id = ? GROUP BY p.id`,
          [productId]
        );
        assert.equal(balances[0]?.stock_on_hand, "9.500");
        assert.equal(balances[0]?.ledger_balance, balances[0]?.stock_on_hand);
        assert.equal(movements.at(-1)?.stock_after, balances[0]?.stock_on_hand);
      });
    } finally {
      await closePool();
    }
  });
});

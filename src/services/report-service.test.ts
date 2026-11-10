import assert from "node:assert/strict";
import { afterAll as after, test } from "vitest";
import { closePool, pool } from "@/lib/db";
import { getDailyProductBreakdown } from "./report-service";

after(() => closePool());

test("getDailyProductBreakdown groups by final_unit_price and preserves each applied unit price", async () => {
  const patchable = pool as unknown as { query: (...args: unknown[]) => Promise<unknown> };
  const originalQuery = patchable.query;
  let capturedSql = "";
  let capturedParams: unknown[] = [];

  patchable.query = async (sql, params) => {
    capturedSql = String(sql);
    capturedParams = params as unknown[];
    return [
      [
        {
          product_id: 101,
          product_name: "Engine Oil 1L",
          sku: "OIL-1L",
          unit: "bottle",
          final_unit_price: "350.00",
          quantity: "2.000",
          total_amount: "700.00",
        },
        {
          product_id: 101,
          product_name: "Engine Oil 1L",
          sku: "OIL-1L",
          unit: "bottle",
          final_unit_price: "320.00",
          quantity: "1.000",
          total_amount: "320.00",
        },
      ],
      [],
    ];
  };

  try {
    const lines = await getDailyProductBreakdown("2026-11-10");
    assert.match(capturedSql, /GROUP BY[\s\S]*si\.final_unit_price/);
    assert.deepEqual(capturedParams, ["2026-11-10"]);
    assert.deepEqual(lines, [
      {
        productId: 101,
        productName: "Engine Oil 1L",
        sku: "OIL-1L",
        unit: "bottle",
        finalUnitPrice: "350.00",
        quantity: "2.000",
        totalAmount: "700.00",
      },
      {
        productId: 101,
        productName: "Engine Oil 1L",
        sku: "OIL-1L",
        unit: "bottle",
        finalUnitPrice: "320.00",
        quantity: "1.000",
        totalAmount: "320.00",
      },
    ]);
  } finally {
    patchable.query = originalQuery;
  }
});


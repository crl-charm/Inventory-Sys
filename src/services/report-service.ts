import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { pool } from "@/lib/db";
import { addDays, dbDateToString } from "@/lib/dates";
import { wrapDbError } from "./db-utils";

/**
 * Reports + dashboard read model (spec §16).
 *
 * Guardrails baked in here:
 * - revenue/product totals ALWAYS sum `sale_items.line_total` over
 *   `sale_batches.status='posted'` — never the client, never voided batches;
 * - grouping uses the historical snapshots on sale lines;
 * - filtering uses `sale_date` (business day), not `created_at`.
 */

// ---------------------------------------------------------------------------
// Daily totals
// ---------------------------------------------------------------------------

export interface DailyTotals {
  date: string;
  totalSales: string;
  postedBatches: number;
}

export async function getDailyTotals(date: string): Promise<DailyTotals> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(total_amount), 0.00) AS total_sales, COUNT(*) AS posted_batches
         FROM sale_batches
        WHERE sale_date = ? AND status = 'posted'`,
      [date]
    );
    const row = rows[0];
    return {
      date,
      totalSales: String(row?.total_sales ?? "0.00"),
      postedBatches: Number(row?.posted_batches ?? 0),
    };
  } catch (error) {
    wrapDbError(error);
  }
}

export interface DailyProductLine {
  productId: number;
  productName: string;
  sku: string | null;
  unit: string;
  quantity: string;
  totalAmount: string;
}

/** Product breakdown for a date, using sale-line snapshots. */
export async function getDailyProductBreakdown(
  date: string
): Promise<DailyProductLine[]> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT si.product_id,
              si.product_name_snapshot AS product_name,
              si.sku_snapshot AS sku,
              si.unit_snapshot AS unit,
              SUM(si.quantity) AS quantity,
              SUM(si.line_total) AS total_amount
         FROM sale_items si
         JOIN sale_batches b ON b.id = si.sale_batch_id
        WHERE b.sale_date = ? AND b.status = 'posted'
        GROUP BY si.product_name_snapshot, si.sku_snapshot, si.unit_snapshot,
                 si.product_id
        ORDER BY total_amount DESC, product_name ASC`,
      [date]
    );
    return rows.map((row) => ({
      productId: Number(row.product_id),
      productName: String(row.product_name),
      sku: row.sku === null ? null : String(row.sku),
      unit: String(row.unit),
      quantity: String(row.quantity),
      totalAmount: String(row.total_amount),
    }));
  } catch (error) {
    wrapDbError(error);
  }
}

export interface VoidedBatchLine {
  id: number;
  totalAmount: string;
  voidReason: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
}

export async function getVoidedBatchesForDate(
  date: string
): Promise<VoidedBatchLine[]> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT b.id, b.total_amount, b.void_reason, b.voided_at, u.display_name AS voided_by_name
         FROM sale_batches b
         LEFT JOIN users u ON u.id = b.voided_by
        WHERE b.sale_date = ? AND b.status = 'voided'
        ORDER BY b.voided_at DESC`,
      [date]
    );
    return rows.map((row) => ({
      id: Number(row.id),
      totalAmount: String(row.total_amount),
      voidReason: row.void_reason === null ? null : String(row.void_reason),
      voidedAt: row.voided_at === null ? null : (row.voided_at as Date).toISOString(),
      voidedBy: row.voided_by_name === null ? null : String(row.voided_by_name),
    }));
  } catch (error) {
    wrapDbError(error);
  }
}

export interface DailyBatchNotes {
  id: number;
  notes: string | null;
  createdAt: string;
}

export async function getPostedBatchNotesForDate(
  date: string
): Promise<DailyBatchNotes[]> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, notes, created_at
         FROM sale_batches
        WHERE sale_date = ? AND status = 'posted' AND notes IS NOT NULL
        ORDER BY created_at ASC`,
      [date]
    );
    return rows.map((row) => ({
      id: Number(row.id),
      notes: row.notes === null ? null : String(row.notes),
      createdAt: (row.created_at as Date).toISOString(),
    }));
  } catch (error) {
    wrapDbError(error);
  }
}

// ---------------------------------------------------------------------------
// Dashboard aggregates
// ---------------------------------------------------------------------------

export interface RecentBatch {
  id: number;
  saleDate: string;
  status: "posted" | "voided";
  totalAmount: string;
  createdAt: string;
}

export interface DashboardData {
  selectedDate: string;
  selectedDateTotals: DailyTotals;
  todayTotals: DailyTotals;
  activeProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  productLines: DailyProductLine[];
  lowStockProducts: Array<{
    id: number;
    name: string;
    unit: string;
    stockOnHand: string;
    reorderLevel: string;
    stockStatus: "low_stock" | "out_of_stock";
  }>;
  recentBatches: RecentBatch[];
}

export async function getDashboardData(
  selectedDate: string,
  today: string
): Promise<DashboardData> {
  try {
    const [selectedTotals, todayTotals] = await Promise.all([
      getDailyTotals(selectedDate),
      getDailyTotals(today),
    ]);

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT
         SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_products,
         SUM(CASE WHEN is_active = 1 AND stock_on_hand > 0 AND stock_on_hand <= reorder_level THEN 1 ELSE 0 END) AS low_stock,
         SUM(CASE WHEN is_active = 1 AND stock_on_hand = 0 THEN 1 ELSE 0 END) AS out_of_stock
       FROM products`
    );
    const counts = countRows[0];

    const [lowStockRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name, unit, stock_on_hand, reorder_level
         FROM products
        WHERE is_active = 1 AND stock_on_hand <= reorder_level
        ORDER BY (stock_on_hand = 0) DESC, stock_on_hand ASC, name ASC
        LIMIT 8`
    );

    const [recentRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, sale_date, status, total_amount, created_at
         FROM sale_batches
        ORDER BY id DESC
        LIMIT 5`
    );

    const productLines = await getDailyProductBreakdown(selectedDate);

    return {
      selectedDate,
      selectedDateTotals: selectedTotals,
      todayTotals,
      activeProducts: Number(counts?.active_products ?? 0),
      lowStockCount: Number(counts?.low_stock ?? 0),
      outOfStockCount: Number(counts?.out_of_stock ?? 0),
      productLines,
      lowStockProducts: lowStockRows.map((row) => ({
        id: Number(row.id),
        name: String(row.name),
        unit: String(row.unit),
        stockOnHand: String(row.stock_on_hand),
        reorderLevel: String(row.reorder_level),
        stockStatus:
          String(row.stock_on_hand) === "0.000" ? "out_of_stock" : "low_stock",
      })),
      recentBatches: recentRows.map((row) => ({
        id: Number(row.id),
        saleDate: dbDateToString(row.sale_date),
        status: String(row.status) as "posted" | "voided",
        totalAmount: String(row.total_amount),
        createdAt: (row.created_at as Date).toISOString(),
      })),
    };
  } catch (error) {
    wrapDbError(error);
  }
}

/** Full printable daily report payload. */
export interface DailyReport {
  date: string;
  totalSales: string;
  postedBatches: number;
  productLines: DailyProductLine[];
  voidedBatches: VoidedBatchLine[];
  notes: DailyBatchNotes[];
}

export async function getDailyReport(date: string): Promise<DailyReport> {
  const [totals, productLines, voidedBatches, notes] = await Promise.all([
    getDailyTotals(date),
    getDailyProductBreakdown(date),
    getVoidedBatchesForDate(date),
    getPostedBatchNotesForDate(date),
  ]);
  return {
    date,
    totalSales: totals.totalSales,
    postedBatches: totals.postedBatches,
    productLines,
    voidedBatches,
    notes,
  };
}

/** Used by pages to compute "yesterday" labels without extra queries. */
export function previousDate(date: string): string {
  return addDays(date, -1);
}

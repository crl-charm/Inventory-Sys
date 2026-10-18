import type { RowDataPacket } from "mysql2/promise";
import { pool } from "@/lib/db";
import { ConflictError, ValidationError } from "@/lib/errors";
import { addDays, storeDayToUtcBoundary } from "@/lib/dates";
import {
  compareQuantities,
  parseQuantityToThousandths,
  thousandthsToQuantityString,
} from "@/lib/money";
import { wrapDbError } from "./db-utils";
import type { StockInInput, PhysicalCountInput } from "@/lib/validation/product";

/**
 * Stock operations (spec §15). Every function:
 *   1. locks the product row (SELECT ... FOR UPDATE),
 *   2. computes before/after/delta on the server,
 *   3. updates products.stock_on_hand and inserts the ledger row in ONE
 *      transaction.
 * Client-supplied before/after values are never trusted.
 */

export interface StockOperationResult {
  productId: number;
  productName: string;
  unit: string;
  quantityDelta: string;
  stockBefore: string;
  stockAfter: string;
}

interface ProductLockRow extends RowDataPacket {
  id: number;
  name: string;
  unit: string;
  stock_on_hand: string;
  is_active: number;
}

async function lockProduct(
  connection: import("mysql2/promise").PoolConnection,
  productId: number
): Promise<ProductLockRow> {
  const [rows] = await connection.query<ProductLockRow[]>(
    "SELECT id, name, unit, stock_on_hand, is_active FROM products WHERE id = ? FOR UPDATE",
    [productId]
  );
  const row = rows[0];
  if (!row) {
    throw new ValidationError("That product does not exist.", {
      productId: ["Unknown product."],
    });
  }
  return row;
}

/** A. Stock In — more stock arrived. Adds quantity, records `stock_in`. */
export async function stockInProduct(
  input: StockInInput,
  userId: number
): Promise<StockOperationResult> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const product = await lockProduct(connection, input.productId);

    const before = product.stock_on_hand;
    const after = thousandthsToQuantityString(
      parseQuantityToThousandths(before) + parseQuantityToThousandths(input.quantity)
    );

    await connection.execute(
      "UPDATE products SET stock_on_hand = ? WHERE id = ?",
      [after, input.productId]
    );
    await connection.execute(
      `INSERT INTO stock_movements
         (product_id, movement_type, quantity_delta, stock_before, stock_after, reference_type, reference_id, note, created_by)
       VALUES (?, 'stock_in', ?, ?, ?, NULL, NULL, ?, ?)`,
      [input.productId, input.quantity, before, after, input.reason ?? null, userId]
    );

    await connection.commit();
    return {
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      quantityDelta: thousandthsToQuantityString(
        parseQuantityToThousandths(input.quantity)
      ),
      stockBefore: before,
      stockAfter: after,
    };
  } catch (error) {
    await connection.rollback();
    wrapDbError(error);
  } finally {
    connection.release();
  }
}

/**
 * B. Physical Count — owner counted the shelf. Server computes
 * delta = physical_count - current_stock, updates on-hand to the counted
 * value, and logs the signed correction. A count that matches current stock
 * is rejected (zero-change correction is almost always a mis-tap).
 */
export async function recordPhysicalCount(
  input: PhysicalCountInput,
  userId: number
): Promise<StockOperationResult> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const product = await lockProduct(connection, input.productId);

    const before = product.stock_on_hand;
    const delta =
      parseQuantityToThousandths(input.physicalCount) -
      parseQuantityToThousandths(before);

    if (delta === 0n) {
      throw new ConflictError(
        `The counted quantity matches the system (${before}). No correction needed.`
      );
    }

    const after = thousandthsToQuantityString(
      parseQuantityToThousandths(input.physicalCount)
    );
    const deltaString = thousandthsToQuantityString(delta);

    await connection.execute(
      "UPDATE products SET stock_on_hand = ? WHERE id = ?",
      [after, input.productId]
    );
    await connection.execute(
      `INSERT INTO stock_movements
         (product_id, movement_type, quantity_delta, stock_before, stock_after, reference_type, reference_id, note, created_by)
       VALUES (?, 'physical_count_correction', ?, ?, ?, NULL, NULL, ?, ?)`,
      [input.productId, deltaString, before, after, input.reason, userId]
    );

    await connection.commit();
    return {
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      quantityDelta: deltaString,
      stockBefore: before,
      stockAfter: after,
    };
  } catch (error) {
    await connection.rollback();
    if (error instanceof ConflictError) throw error;
    wrapDbError(error);
  } finally {
    connection.release();
  }
}

// ---------------------------------------------------------------------------
// Movement ledger (audit view)
// ---------------------------------------------------------------------------

export interface MovementFilters {
  productId?: number;
  movementType?: string;
  from?: string; // YYYY-MM-DD (store timezone)
  to?: string;
}

export interface MovementDto {
  id: number;
  productId: number;
  productName: string;
  movementType: string;
  quantityDelta: string;
  stockBefore: string;
  stockAfter: string;
  referenceType: string | null;
  referenceId: number | null;
  note: string | null;
  createdBy: string;
  createdAt: string;
}

export async function listMovements(
  filters: MovementFilters,
  pagination: { offset: number; pageSize: number }
): Promise<{ items: MovementDto[]; total: number }> {
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (filters.productId) {
    where.push("m.product_id = ?");
    params.push(filters.productId);
  }
  if (filters.movementType) {
    where.push("m.movement_type = ?");
    params.push(filters.movementType);
  }
  if (filters.from) {
    where.push("m.created_at >= ?");
    params.push(storeDayToUtcBoundary(filters.from));
  }
  if (filters.to) {
    where.push("m.created_at < ?");
    params.push(storeDayToUtcBoundary(addDays(filters.to, 1)));
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM stock_movements m ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT m.id, m.product_id, p.name AS product_name, m.movement_type,
              m.quantity_delta, m.stock_before, m.stock_after,
              m.reference_type, m.reference_id, m.note,
              u.display_name AS created_by_name, m.created_at
         FROM stock_movements m
         JOIN products p ON p.id = m.product_id
         JOIN users u ON u.id = m.created_by
         ${whereSql}
        ORDER BY m.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pagination.pageSize, pagination.offset]
    );

    return {
      total,
      items: rows.map((row) => ({
        id: Number(row.id),
        productId: Number(row.product_id),
        productName: String(row.product_name),
        movementType: String(row.movement_type),
        quantityDelta: String(row.quantity_delta),
        stockBefore: String(row.stock_before),
        stockAfter: String(row.stock_after),
        referenceType: row.reference_type === null ? null : String(row.reference_type),
        referenceId: row.reference_id === null ? null : Number(row.reference_id),
        note: row.note === null ? null : String(row.note),
        createdBy: String(row.created_by_name),
        createdAt: (row.created_at as Date).toISOString(),
      })),
    };
  } catch (error) {
    wrapDbError(error);
  }
}

/** True when the signed quantity increases stock (green in UI). */
export function isStockIncrease(quantityDelta: string): boolean {
  return compareQuantities(quantityDelta, "0") > 0;
}

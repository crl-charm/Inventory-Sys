import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { pool } from "@/lib/db";
import {
  AlreadyVoidedError,
  ConflictError,
  InsufficientStockError,
  NotFoundError,
  ValidationError,
  type StockShortage,
} from "@/lib/errors";
import {
  centavosToMoneyString,
  compareQuantities,
  computeLineTotalCentavos,
  parseMoneyToCentavos,
  parseQuantityToThousandths,
  sumCentavos,
  thousandthsToQuantityString,
} from "@/lib/money";
import { assertNotFutureDate, dbDateToString } from "@/lib/dates";
import { isDuplicateKeyError, wrapDbError } from "./db-utils";
import type { CreateSaleInput } from "@/lib/validation/sales";

/**
 * Sales service — the core of the system (spec §13, §14).
 *
 * Guarantees:
 * - All-or-nothing: batch, lines, stock deductions, and ledger rows commit in
 *   one transaction. If any line lacks stock, NOTHING is saved.
 * - Server-priced: line totals and the batch total are recomputed here with
 *   decimal-safe math; client-sent totals are ignored (there are none).
 * - Idempotent: a replayed requestId returns the original batch.
 * - Auditable: sale lines keep name/SKU/unit/price snapshots.
 */

export interface SaleLineDto {
  id: number;
  productId: number;
  productName: string;
  sku: string | null;
  unit: string;
  quantity: string;
  baseUnitPrice: string;
  finalUnitPrice: string;
  lineTotal: string;
  stockBefore?: string;
  stockAfter?: string;
}

export interface SaleBatchDto {
  id: number;
  saleDate: string;
  status: "posted" | "voided";
  totalAmount: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  voidedBy: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  items: SaleLineDto[];
}

export interface PostSaleResult {
  replayed: boolean;
  sale: SaleBatchDto;
  stockUpdates: Array<{
    productId: number;
    productName: string;
    unit: string;
    stockBefore: string;
    stockAfter: string;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ProductLockRow extends RowDataPacket {
  id: number;
  sku: string | null;
  name: string;
  unit: string;
  selling_price: string;
  stock_on_hand: string;
  is_active: number;
}

async function loadBatchRow(
  connection: PoolConnection,
  batchId: number
): Promise<RowDataPacket | undefined> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT b.id, b.sale_date, b.notes, b.status, b.total_amount, b.created_at,
            b.voided_at, b.void_reason,
            cu.display_name AS created_by_name,
            vu.display_name AS voided_by_name
       FROM sale_batches b
       JOIN users cu ON cu.id = b.created_by
       LEFT JOIN users vu ON vu.id = b.voided_by
      WHERE b.id = ?`,
    [batchId]
  );
  return rows[0];
}

async function loadBatchItems(
  connection: PoolConnection,
  batchId: number
): Promise<SaleLineDto[]> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT id, product_id, product_name_snapshot, sku_snapshot, unit_snapshot,
            quantity, base_unit_price, final_unit_price, line_total
       FROM sale_items
      WHERE sale_batch_id = ?
      ORDER BY id ASC`,
    [batchId]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    productId: Number(row.product_id),
    productName: String(row.product_name_snapshot),
    sku: row.sku_snapshot === null ? null : String(row.sku_snapshot),
    unit: String(row.unit_snapshot),
    quantity: String(row.quantity),
    baseUnitPrice: String(row.base_unit_price),
    finalUnitPrice: String(row.final_unit_price),
    lineTotal: String(row.line_total),
  }));
}

async function serializeBatch(
  connection: PoolConnection,
  batchId: number
): Promise<SaleBatchDto> {
  const row = await loadBatchRow(connection, batchId);
  if (!row) throw new NotFoundError("That sales entry does not exist.");
  const items = await loadBatchItems(connection, batchId);
  return {
    id: Number(row.id),
    saleDate: dbDateToString(row.sale_date),
    status: String(row.status) as "posted" | "voided",
    totalAmount: String(row.total_amount),
    notes: row.notes === null ? null : String(row.notes),
    createdBy: String(row.created_by_name),
    createdAt: (row.created_at as Date).toISOString(),
    voidedBy: row.voided_by_name === null ? null : String(row.voided_by_name),
    voidedAt: row.voided_at === null ? null : (row.voided_at as Date).toISOString(),
    voidReason: row.void_reason === null ? null : String(row.void_reason),
    items,
  };
}

// ---------------------------------------------------------------------------
// Post a sales batch
// ---------------------------------------------------------------------------

export interface PostSaleContext {
  userId: number;
}

export async function postSalesBatch(
  input: CreateSaleInput,
  context: PostSaleContext
): Promise<PostSaleResult> {
  assertNotFutureDate(input.saleDate);

  // Group by productId + requested final price (merged quantities) while
  // keeping per-price lines (BR-06). The legacy unitPrice alias is resolved
  // here once; finalUnitPrice always wins when both are present.
  const mergedLines: Array<{
    productId: number;
    quantity: string;
    finalUnitPrice?: string;
  }> = [];
  const mergedIndex = new Map<string, number>();
  for (const item of input.items) {
    const requestedPrice = item.finalUnitPrice ?? item.unitPrice;
    const key = `${item.productId}|${requestedPrice ?? ""}`;
    const existing = mergedIndex.get(key);
    if (existing === undefined) {
      mergedIndex.set(key, mergedLines.length);
      mergedLines.push({
        productId: item.productId,
        quantity: item.quantity,
        finalUnitPrice: requestedPrice,
      });
    } else {
      const line = mergedLines[existing]!;
      line.quantity = thousandthsToQuantityString(
        parseQuantityToThousandths(line.quantity) +
          parseQuantityToThousandths(item.quantity)
      );
    }
  }

  // One stock deduction per product across all of its lines.
  const qtyByProduct = new Map<number, bigint>();
  for (const line of mergedLines) {
    qtyByProduct.set(
      line.productId,
      (qtyByProduct.get(line.productId) ?? 0n) +
        parseQuantityToThousandths(line.quantity)
    );
  }
  const productIds = [...qtyByProduct.keys()].sort((a, b) => a - b);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Idempotency: same requestId -> same batch, no double deduction.
    if (input.requestId) {
      const [existing] = await connection.query<RowDataPacket[]>(
        "SELECT id FROM sale_batches WHERE request_id = ? LIMIT 1",
        [input.requestId]
      );
      const existingId = existing[0]?.id;
      if (existingId !== undefined) {
        const sale = await serializeBatch(connection, Number(existingId));
        await connection.commit();
        return { replayed: true, sale, stockUpdates: [] };
      }
    }

    // Lock all affected products in ascending id order (deadlock reduction).
    const [productRows] = await connection.query<ProductLockRow[]>(
      `SELECT id, sku, name, unit, selling_price, stock_on_hand, is_active
         FROM products
        WHERE id IN (${productIds.map(() => "?").join(", ")})
        ORDER BY id ASC
        FOR UPDATE`,
      productIds
    );
    const byId = new Map(productRows.map((row) => [row.id, row]));

    // Verify existence and activity before checking stock.
    const shortages: StockShortage[] = [];
    for (const productId of productIds) {
      const product = byId.get(productId);
      if (!product) {
        throw new ValidationError("One of the selected products no longer exists.", {
          productId: [`Product #${productId} was not found.`],
        });
      }
      if (product.is_active !== 1) {
        throw new ConflictError(
          `"${product.name}" is deactivated and cannot be sold. Remove it from this entry or reactivate it in Inventory.`
        );
      }
    }

    // Stock check (spec §13 step 5): any shortage rejects the whole batch.
    for (const productId of productIds) {
      const product = byId.get(productId)!;
      const requestedThousandths = qtyByProduct.get(productId)!;
      const availableThousandths = parseQuantityToThousandths(product.stock_on_hand);
      if (requestedThousandths > availableThousandths) {
        shortages.push({
          productId,
          productName: product.name,
          requested: thousandthsToQuantityString(requestedThousandths),
          available: product.stock_on_hand,
          unit: product.unit,
        });
      }
    }
    if (shortages.length > 0) {
      throw new InsufficientStockError(shortages);
    }

    // Compute line totals server-side; batch total = sum of saved lines.
    interface PricedLine {
      productId: number;
      product: ProductLockRow;
      quantity: string;
      baseUnitPrice: string;
      finalUnitPrice: string;
      lineTotalCentavos: bigint;
    }
    const pricedLines: PricedLine[] = mergedLines.map((line) => {
      const product = byId.get(line.productId)!;
      // Base Price is authoritative from the locked catalog row (spec §7.4);
      // the catalog itself is never modified by a sales entry.
      const baseUnitPrice = product.selling_price;
      // Final Price is the actual per-unit amount charged; it defaults to the
      // Base Price when the client does not send one.
      const finalUnitPrice = line.finalUnitPrice ?? baseUnitPrice;
      if (parseMoneyToCentavos(finalUnitPrice) < 0n) {
        throw new ValidationError("A price cannot be negative.");
      }
      return {
        productId: line.productId,
        product,
        quantity: line.quantity,
        baseUnitPrice,
        finalUnitPrice,
        lineTotalCentavos: computeLineTotalCentavos(line.quantity, finalUnitPrice),
      };
    });
    const totalCentavos = sumCentavos(pricedLines.map((l) => l.lineTotalCentavos));

    // Insert the batch header.
    let batchId: number;
    try {
      const [batchResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO sale_batches (sale_date, notes, status, total_amount, created_by, request_id)
         VALUES (?, ?, 'posted', ?, ?, ?)`,
        [
          input.saleDate,
          input.notes ?? null,
          centavosToMoneyString(totalCentavos),
          context.userId,
          input.requestId ?? null,
        ]
      );
      batchId = batchResult.insertId;
    } catch (error) {
      // Race on the unique request_id: someone else saved this exact request.
      if (input.requestId && isDuplicateKeyError(error, "uq_sale_batches_request_id")) {
        const [existing] = await connection.query<RowDataPacket[]>(
          "SELECT id FROM sale_batches WHERE request_id = ? LIMIT 1",
          [input.requestId]
        );
        const existingId = existing[0]?.id;
        if (existingId !== undefined) {
          const sale = await serializeBatch(connection, Number(existingId));
          await connection.commit();
          return { replayed: true, sale, stockUpdates: [] };
        }
      }
      throw error;
    }

    // Insert line snapshots.
    for (const line of pricedLines) {
      await connection.execute(
        `INSERT INTO sale_items
           (sale_batch_id, product_id, product_name_snapshot, sku_snapshot, unit_snapshot,
            quantity, base_unit_price, final_unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          batchId,
          line.productId,
          line.product.name,
          line.product.sku,
          line.product.unit,
          line.quantity,
          line.baseUnitPrice,
          line.finalUnitPrice,
          centavosToMoneyString(line.lineTotalCentavos),
        ]
      );
    }

    // Deduct stock and write one ledger row per product.
    const stockUpdates: PostSaleResult["stockUpdates"] = [];
    for (const productId of productIds) {
      const product = byId.get(productId)!;
      const deducted = qtyByProduct.get(productId)!;
      const before = product.stock_on_hand;
      const after = thousandthsToQuantityString(
        parseQuantityToThousandths(before) - deducted
      );
      if (compareQuantities(after, "0") < 0) {
        // Defensive: guarded above, but never allow negative stock to persist.
        throw new InsufficientStockError([
          {
            productId,
            productName: product.name,
            requested: thousandthsToQuantityString(deducted),
            available: before,
            unit: product.unit,
          },
        ]);
      }

      await connection.execute(
        "UPDATE products SET stock_on_hand = ? WHERE id = ?",
        [after, productId]
      );
      await connection.execute(
        `INSERT INTO stock_movements
           (product_id, movement_type, quantity_delta, stock_before, stock_after,
            reference_type, reference_id, note, created_by)
         VALUES (?, 'sale', ?, ?, ?, 'sale_batch', ?, NULL, ?)`,
        [
          productId,
          thousandthsToQuantityString(-deducted),
          before,
          after,
          batchId,
          context.userId,
        ]
      );

      stockUpdates.push({
        productId,
        productName: product.name,
        unit: product.unit,
        stockBefore: before,
        stockAfter: after,
      });
    }

    const sale = await serializeBatch(connection, batchId);
    // Attach the resulting stock balances to the line DTOs for the receipt view.
    for (const item of sale.items) {
      const update = stockUpdates.find((u) => u.productId === item.productId);
      if (update) {
        item.stockBefore = update.stockBefore;
        item.stockAfter = update.stockAfter;
      }
    }

    await connection.commit();
    return { replayed: false, sale, stockUpdates };
  } catch (error) {
    await connection.rollback();
    wrapDbError(error);
  } finally {
    connection.release();
  }
}

// ---------------------------------------------------------------------------
// Void a batch (spec §14)
// ---------------------------------------------------------------------------

export async function voidSalesBatch(
  batchId: number,
  reason: string,
  userId: number
): Promise<SaleBatchDto> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [batchRows] = await connection.query<RowDataPacket[]>(
      "SELECT id, status FROM sale_batches WHERE id = ? FOR UPDATE",
      [batchId]
    );
    const batch = batchRows[0];
    if (!batch) throw new NotFoundError("That sales entry does not exist.");
    if (String(batch.status) !== "posted") throw new AlreadyVoidedError();

    // Aggregate sold quantities per product from the immutable line snapshots.
    const [lineRows] = await connection.query<RowDataPacket[]>(
      `SELECT product_id, SUM(quantity) AS total_quantity
         FROM sale_items
        WHERE sale_batch_id = ?
        GROUP BY product_id
        ORDER BY product_id ASC`,
      [batchId]
    );

    // Defensive: prove this batch was never reversed before (no double restore).
    const [reversalRows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS reversals
         FROM stock_movements
        WHERE reference_type = 'sale_batch' AND reference_id = ?
          AND movement_type = 'sale_void_reversal'`,
      [batchId]
    );
    if (Number(reversalRows[0]?.reversals ?? 0) > 0) {
      throw new AlreadyVoidedError();
    }

    // Lock the affected products in a consistent order, then restore.
    const productIds = lineRows.map((row) => Number(row.product_id));
    if (productIds.length > 0) {
      const [productRows] = await connection.query<ProductLockRow[]>(
        `SELECT id, sku, name, unit, selling_price, stock_on_hand, is_active
           FROM products
          WHERE id IN (${productIds.map(() => "?").join(", ")})
          ORDER BY id ASC
          FOR UPDATE`,
        productIds
      );
      const byId = new Map(productRows.map((row) => [row.id, row]));

      for (const line of lineRows) {
        const product = byId.get(Number(line.product_id));
        if (!product) {
          throw new ConflictError(
            "A product from this entry no longer exists; cannot void safely."
          );
        }
        const restore = String(line.total_quantity);
        const before = product.stock_on_hand;
        const after = thousandthsToQuantityString(
          parseQuantityToThousandths(before) + parseQuantityToThousandths(restore)
        );
        await connection.execute(
          "UPDATE products SET stock_on_hand = ? WHERE id = ?",
          [after, product.id]
        );
        await connection.execute(
          `INSERT INTO stock_movements
             (product_id, movement_type, quantity_delta, stock_before, stock_after,
              reference_type, reference_id, note, created_by)
           VALUES (?, 'sale_void_reversal', ?, ?, ?, 'sale_batch', ?, ?, ?)`,
          [product.id, restore, before, after, batchId, `Voided: ${reason}`, userId]
        );
      }
    }

    // Guarded status flip: only a still-posted batch updates.
    const [updateResult] = await connection.execute<ResultSetHeader>(
      `UPDATE sale_batches
          SET status = 'voided', voided_by = ?, voided_at = UTC_TIMESTAMP(), void_reason = ?
        WHERE id = ? AND status = 'posted'`,
      [userId, reason, batchId]
    );
    if (updateResult.affectedRows !== 1) {
      throw new AlreadyVoidedError();
    }

    const sale = await serializeBatch(connection, batchId);
    await connection.commit();
    return sale;
  } catch (error) {
    await connection.rollback();
    wrapDbError(error);
  } finally {
    connection.release();
  }
}

// ---------------------------------------------------------------------------
// Reads: history, detail, per-day data
// ---------------------------------------------------------------------------

export interface SaleSummaryDto {
  id: number;
  saleDate: string;
  status: "posted" | "voided";
  totalAmount: string;
  lineCount: number;
  createdBy: string;
  createdAt: string;
}

export interface SaleListFilters {
  from?: string;
  to?: string;
  status?: "posted" | "voided" | "all";
}

export async function listSales(
  filters: SaleListFilters,
  pagination: { offset: number; pageSize: number }
): Promise<{ items: SaleSummaryDto[]; total: number }> {
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (filters.from) {
    where.push("b.sale_date >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("b.sale_date <= ?");
    params.push(filters.to);
  }
  if (filters.status && filters.status !== "all") {
    where.push("b.status = ?");
    params.push(filters.status);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM sale_batches b ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT b.id, b.sale_date, b.status, b.total_amount, b.created_at,
              u.display_name AS created_by_name,
              (SELECT COUNT(*) FROM sale_items si WHERE si.sale_batch_id = b.id) AS line_count
         FROM sale_batches b
         JOIN users u ON u.id = b.created_by
         ${whereSql}
        ORDER BY b.sale_date DESC, b.created_at DESC, b.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pagination.pageSize, pagination.offset]
    );

    return {
      total,
      items: rows.map((row) => ({
        id: Number(row.id),
        saleDate: dbDateToString(row.sale_date),
        status: String(row.status) as "posted" | "voided",
        totalAmount: String(row.total_amount),
        lineCount: Number(row.line_count),
        createdBy: String(row.created_by_name),
        createdAt: (row.created_at as Date).toISOString(),
      })),
    };
  } catch (error) {
    wrapDbError(error);
  }
}

export async function getSaleBatch(batchId: number): Promise<SaleBatchDto> {
  try {
    const connection = await pool.getConnection();
    try {
      return await serializeBatch(connection, batchId);
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    wrapDbError(error);
  }
}

/** True when at least one posted batch exists for the business date. */
export async function hasPostedSalesOnDate(date: string): Promise<boolean> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT 1 AS found FROM sale_batches WHERE sale_date = ? AND status = 'posted' LIMIT 1",
      [date]
    );
    return rows.length > 0;
  } catch (error) {
    wrapDbError(error);
  }
}

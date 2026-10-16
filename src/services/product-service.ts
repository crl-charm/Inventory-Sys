import "server-only";
import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { pool } from "@/lib/db";
import {
  ConflictError,
  DatabaseUnavailableError,
  DuplicateSkuError,
  NotFoundError,
  isDatabaseConnectionError,
} from "@/lib/errors";
import { toProductDto, type ProductRow } from "@/lib/dto";
import type { Product } from "@/types";
import type { ProductInput, ProductUpdateInput } from "@/lib/validation/product";

/**
 * Product catalog service. Route handlers and pages call these functions;
 * UI components never touch SQL (spec §6 architecture rules).
 */

export interface ProductListFilters {
  q?: string;
  categoryId?: number;
  stockStatus?: "all" | "in_stock" | "low_stock" | "out_of_stock";
  active?: "active" | "inactive" | "all";
  sort?: "name" | "stock" | "price";
  order?: "asc" | "desc";
}

export interface ProductListResult {
  items: Product[];
  total: number;
}

export interface ProductDetail {
  product: Product;
  /** Recent ledger entries for the product detail view. */
  recentMovements: Array<{
    id: number;
    movementType: string;
    quantityDelta: string;
    stockBefore: string;
    stockAfter: string;
    note: string | null;
    createdAt: string;
  }>;
}

function wrapDbError(error: unknown): never {
  if (isDatabaseConnectionError(error)) throw new DatabaseUnavailableError(error);
  throw error;
}

/** Name the constraint violation instead of leaking driver text. */
function isDuplicateKeyError(error: unknown, keyName: string): boolean {
  const message = String((error as { sqlMessage?: string }).sqlMessage ?? "");
  return (
    (error as { errno?: number }).errno === 1062 &&
    message.toLowerCase().includes(keyName.toLowerCase())
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listProducts(
  filters: ProductListFilters,
  pagination: { offset: number; pageSize: number }
): Promise<ProductListResult> {
  const where: string[] = [];
  const params: Array<string | number> = [];

  const active = filters.active ?? "active";
  if (active !== "all") {
    where.push("p.is_active = ?");
    params.push(active === "active" ? 1 : 0);
  }

  if (filters.categoryId) {
    where.push("p.category_id = ?");
    params.push(filters.categoryId);
  }

  if (filters.q) {
    const like = `%${filters.q.trim()}%`;
    where.push(
      "(p.name LIKE ? OR p.sku LIKE ? OR p.brand LIKE ? OR p.variant LIKE ?)"
    );
    params.push(like, like, like, like);
  }

  switch (filters.stockStatus) {
    case "low_stock":
      where.push("p.stock_on_hand > 0 AND p.stock_on_hand <= p.reorder_level");
      break;
    case "out_of_stock":
      where.push("p.stock_on_hand = 0");
      break;
    case "in_stock":
      where.push("p.stock_on_hand > 0 AND p.stock_on_hand > p.reorder_level");
      break;
    default:
      break; // "all" or undefined
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const sortColumns: Record<string, string> = {
    name: "p.name",
    stock: "p.stock_on_hand",
    price: "p.selling_price",
  };
  const sortColumn = sortColumns[filters.sort ?? "name"] ?? "p.name";
  const order = filters.order === "desc" ? "DESC" : "ASC";

  try {
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM products p ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await pool.query<ProductRow[]>(
      `SELECT p.*, c.name AS category_name
         FROM products p
         JOIN categories c ON c.id = p.category_id
         ${whereSql}
        ORDER BY ${sortColumn} ${order}, p.id ASC
        LIMIT ? OFFSET ?`,
      [...params, pagination.pageSize, pagination.offset]
    );

    return { items: rows.map(toProductDto), total };
  } catch (error) {
    wrapDbError(error);
  }
}

/** Lightweight list for pickers: active products only, name/sku/brand search. */
export async function lookupProducts(
  q: string | undefined,
  limit = 50
): Promise<Product[]> {
  const params: Array<string | number> = [];
  let whereSql = "WHERE p.is_active = 1";
  if (q && q.trim() !== "") {
    const like = `%${q.trim()}%`;
    whereSql +=
      " AND (p.name LIKE ? OR p.sku LIKE ? OR p.brand LIKE ? OR p.variant LIKE ?)";
    params.push(like, like, like, like);
  }
  params.push(Math.min(200, Math.max(1, limit)));
  try {
    const [rows] = await pool.query<ProductRow[]>(
      `SELECT p.*, c.name AS category_name
         FROM products p
         JOIN categories c ON c.id = p.category_id
         ${whereSql}
        ORDER BY p.name ASC
        LIMIT ?`,
      params
    );
    return rows.map(toProductDto);
  } catch (error) {
    wrapDbError(error);
  }
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

const PRODUCT_DETAIL_SQL = `
  SELECT p.*, c.name AS category_name
    FROM products p
    JOIN categories c ON c.id = p.category_id
   WHERE p.id = ?
   LIMIT 1`;

export async function getProduct(id: number): Promise<ProductDetail> {
  try {
    const [rows] = await pool.query<ProductRow[]>(PRODUCT_DETAIL_SQL, [id]);
    const row = rows[0];
    if (!row) throw new NotFoundError("That product does not exist.");

    const [movementRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, movement_type, quantity_delta, stock_before, stock_after, note, created_at
         FROM stock_movements
        WHERE product_id = ?
        ORDER BY id DESC
        LIMIT 10`,
      [id]
    );

    return {
      product: toProductDto(row),
      recentMovements: movementRows.map((m) => ({
        id: Number(m.id),
        movementType: String(m.movement_type),
        quantityDelta: String(m.quantity_delta),
        stockBefore: String(m.stock_before),
        stockAfter: String(m.stock_after),
        note: m.note === null ? null : String(m.note),
        createdAt: (m.created_at as Date).toISOString(),
      })),
    };
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    wrapDbError(error);
  }
}

/** Used by other services inside their own transactions. */
export async function lockProductRow(
  connection: PoolConnection,
  productId: number
): Promise<ProductRow> {
  const [rows] = await connection.query<ProductRow[]>(
    `${PRODUCT_DETAIL_SQL.replace("WHERE p.id = ?", "WHERE p.id = ? FOR UPDATE")}`,
    [productId]
  );
  const row = rows[0];
  if (!row) throw new NotFoundError("That product does not exist.");
  return row;
}

// ---------------------------------------------------------------------------
// Create / update / deactivate
// ---------------------------------------------------------------------------

export async function createProduct(
  input: ProductInput,
  userId: number
): Promise<ProductDetail> {
  const openingStock = input.openingStock ?? "0";

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [categoryRows] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM categories WHERE id = ? AND is_active = 1 LIMIT 1",
      [input.categoryId]
    );
    if (!categoryRows[0]) {
      throw new NotFoundError("That category does not exist or is inactive.");
    }

    let insertResult: ResultSetHeader;
    try {
      [insertResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO products
           (sku, name, category_id, brand, variant, unit, selling_price, stock_on_hand, reorder_level, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 1)`,
        [
          input.sku ?? null,
          input.name,
          input.categoryId,
          input.brand ?? null,
          input.variant ?? null,
          input.unit,
          input.sellingPrice,
          input.reorderLevel,
        ]
      );
    } catch (error) {
      if (isDuplicateKeyError(error, "uq_products_sku")) {
        throw new DuplicateSkuError(input.sku ?? "");
      }
      throw error;
    }

    const productId = insertResult.insertId;

    // Opening stock goes through the ledger, exactly like every other change.
    if (openingStock !== "0" && !/^0+(\.0+)?$/.test(openingStock)) {
      const [updateResult] = await connection.execute<ResultSetHeader>(
        "UPDATE products SET stock_on_hand = stock_on_hand + ? WHERE id = ?",
        [openingStock, productId]
      );
      if (updateResult.affectedRows !== 1) {
        throw new ConflictError("Could not set the opening stock.");
      }
      await connection.execute(
        `INSERT INTO stock_movements
           (product_id, movement_type, quantity_delta, stock_before, stock_after, reference_type, reference_id, note, created_by)
         VALUES (?, 'opening', ?, 0, ?, 'product', ?, 'Opening stock', ?)`,
        [productId, openingStock, openingStock, productId, userId]
      );
    }

    await connection.commit();
    return await getProduct(productId);
  } catch (error) {
    await connection.rollback();
    if (isDatabaseConnectionError(error)) throw new DatabaseUnavailableError(error);
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateProduct(
  id: number,
  input: ProductUpdateInput
): Promise<ProductDetail> {
  try {
    const [existingRows] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM products WHERE id = ? LIMIT 1",
      [id]
    );
    if (!existingRows[0]) throw new NotFoundError("That product does not exist.");

    const [categoryRows] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM categories WHERE id = ? LIMIT 1",
      [input.categoryId]
    );
    if (!categoryRows[0]) {
      throw new NotFoundError("That category does not exist.");
    }

    const assignments: string[] = [
      "sku = ?",
      "name = ?",
      "category_id = ?",
      "brand = ?",
      "variant = ?",
      "unit = ?",
      "selling_price = ?",
      "reorder_level = ?",
    ];
    const params: Array<string | number | null> = [
      input.sku ?? null,
      input.name,
      input.categoryId,
      input.brand ?? null,
      input.variant ?? null,
      input.unit,
      input.sellingPrice,
      input.reorderLevel,
    ];
    if (input.isActive !== undefined) {
      assignments.push("is_active = ?");
      params.push(input.isActive ? 1 : 0);
    }
    params.push(id);

    try {
      await pool.execute(
        `UPDATE products SET ${assignments.join(", ")} WHERE id = ?`,
        params
      );
    } catch (error) {
      if (isDuplicateKeyError(error, "uq_products_sku")) {
        throw new DuplicateSkuError(input.sku ?? "");
      }
      throw error;
    }

    return await getProduct(id);
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof DuplicateSkuError
    ) {
      throw error;
    }
    wrapDbError(error);
  }
}

export async function setProductActive(
  id: number,
  isActive: boolean
): Promise<ProductDetail> {
  try {
    const [result] = await pool.execute<ResultSetHeader>(
      "UPDATE products SET is_active = ? WHERE id = ?",
      [isActive ? 1 : 0, id]
    );
    if (result.affectedRows !== 1) {
      // May be 0 when the value is unchanged; check existence either way.
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM products WHERE id = ? LIMIT 1",
        [id]
      );
      if (!rows[0]) throw new NotFoundError("That product does not exist.");
    }
    return await getProduct(id);
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    wrapDbError(error);
  }
}

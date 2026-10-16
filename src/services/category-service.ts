import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { pool } from "@/lib/db";
import { DuplicateCategoryError, NotFoundError } from "@/lib/errors";
import { toCategoryDto, type CategoryRow } from "@/lib/dto";
import { isDuplicateKeyError, wrapDbError } from "./db-utils";
import type { CategoryInput } from "@/lib/validation/product";

/**
 * Category service. Categories cannot be deleted (spec §3.9 products keep
 * history); they may be deactivated once no active products reference them.
 */

export interface CategoryDto {
  id: number;
  name: string;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function listCategories(
  includeInactive = false
): Promise<CategoryDto[]> {
  const whereSql = includeInactive ? "" : "WHERE c.is_active = 1";
  try {
    const [rows] = await pool.query<(CategoryRow & RowDataPacket)[]>(
      `SELECT c.*, COUNT(p.id) AS product_count
         FROM categories c
         LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
         ${whereSql}
        GROUP BY c.id
        ORDER BY c.name ASC`
    );
    return rows.map((row) => toCategoryDto(row, Number(row.product_count ?? 0)));
  } catch (error) {
    wrapDbError(error);
  }
}

export async function createCategory(input: CategoryInput): Promise<CategoryDto> {
  try {
    const [result] = await pool.execute<{ insertId: number } & RowDataPacket[]>(
      "INSERT INTO categories (name) VALUES (?)",
      [input.name]
    );
    const insertId = (result as unknown as { insertId: number }).insertId;
    const [rows] = await pool.query<CategoryRow[]>(
      "SELECT * FROM categories WHERE id = ?",
      [insertId]
    );
    const row = rows[0];
    if (!row) throw new NotFoundError("Category was created but could not be read back.");
    return toCategoryDto(row, 0);
  } catch (error) {
    if (isDuplicateKeyError(error, "uq_categories_name")) {
      throw new DuplicateCategoryError(input.name);
    }
    wrapDbError(error);
  }
}

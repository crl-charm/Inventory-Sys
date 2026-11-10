import type { RowDataPacket } from "mysql2/promise";
import type { Product, StockStatus } from "@/types";

/**
 * Database row → API DTO mappers. mysql2 returns DECIMAL columns as strings
 * (see pool config: decimalNumbers: false) and TINYINT(1) as 0/1 numbers.
 */

export interface ProductRow extends RowDataPacket {
  id: number;
  sku: string | null;
  name: string;
  category_id: number;
  category_name: string;
  brand: string | null;
  variant: string | null;
  unit: string;
  selling_price: string;
  stock_on_hand: string;
  reorder_level: string;
  is_active: number;
  created_at: Date;
  updated_at: Date;
}

/** Stock status thresholds (spec §16): zero is OUT, <= reorder is LOW. */
export function stockStatusOf(
  stockOnHand: string,
  reorderLevel: string
): StockStatus {
  const stock = Number(stockOnHand);
  if (stock === 0) return "out_of_stock";
  if (stock <= Number(reorderLevel)) return "low_stock";
  return "in_stock";
}

export function toProductDto(row: ProductRow): Product {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    brand: row.brand,
    variant: row.variant,
    unit: row.unit,
    sellingPrice: row.selling_price,
    stockOnHand: row.stock_on_hand,
    reorderLevel: row.reorder_level,
    isActive: row.is_active === 1,
    stockStatus: stockStatusOf(row.stock_on_hand, row.reorder_level),
  };
}

export interface CategoryRow extends RowDataPacket {
  id: number;
  name: string;
  is_active: number;
  created_at: Date;
  updated_at: Date;
}

export function toCategoryDto(row: CategoryRow, productCount = 0) {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active === 1,
    productCount,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

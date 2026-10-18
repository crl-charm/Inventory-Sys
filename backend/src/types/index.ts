/**
 * Shared application types.
 *
 * Conventions (spec §12, §16):
 * - Money crosses the wire as strings with 2 decimals ("1050.00").
 * - Quantities cross the wire as strings with up to 3 decimals ("3.000", "1.5").
 * - Dates cross the wire as YYYY-MM-DD; timestamps as ISO 8601.
 */

export type UserRole = "owner";

/** Authenticated user, as stored in the session. */
export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
}

/** Stock status thresholds (spec §16). */
export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export type StockMovementType =
  | "opening"
  | "sale"
  | "stock_in"
  | "sale_void_reversal"
  | "physical_count_correction";

export interface Category {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: number;
  sku: string | null;
  name: string;
  categoryId: number;
  categoryName: string;
  brand: string | null;
  variant: string | null;
  unit: string;
  sellingPrice: string;
  stockOnHand: string;
  reorderLevel: string;
  isActive: boolean;
  stockStatus: StockStatus;
}

export interface StockMovement {
  id: number;
  productId: number;
  productName: string;
  movementType: StockMovementType;
  quantityDelta: string;
  stockBefore: string;
  stockAfter: string;
  referenceType: string | null;
  referenceId: number | null;
  note: string | null;
  createdAt: string;
}

/** Common units offered in product forms; custom labels are allowed. */
export const COMMON_UNITS = [
  "piece",
  "bottle",
  "pair",
  "set",
  "box",
  "pack",
  "liter",
  "gallon",
  "can",
  "roll",
  "meter",
] as const;

/** Unit label with sensible singular, e.g. "3 bottles", "1.5 liters", "2 pieces". */
export function formatQuantityWithUnit(
  quantity: string,
  unit: string
): string {
  const trimmed = trimQuantity(quantity);
  const asNumber = Number(trimmed);
  const isOne = !Number.isNaN(asNumber) && asNumber === 1;
  const label = isOne ? singularize(unit) : pluralize(unit);
  return `${trimmed} ${label}`;
}

/** "3.000" -> "3", "1.500" -> "1.5", "0.250" -> "0.25". */
export function trimQuantity(quantity: string): string {
  if (!quantity.includes(".")) return quantity;
  const trimmed = quantity.replace(/\.?0+$/, "");
  return trimmed === "" || trimmed === "-" ? "0" : trimmed;
}

function pluralize(unit: string): string {
  // Units we seed are English words; keep the rule simple and predictable.
  if (/[^aeiou]y$/i.test(unit)) return `${unit.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(unit)) return `${unit}es`;
  return `${unit}s`;
}

function singularize(unit: string): string {
  if (/ies$/i.test(unit)) return `${unit.slice(0, -3)}y`;
  if (/(ses|xes|zes|ches|shes)$/i.test(unit)) return unit.slice(0, -2);
  return unit;
}

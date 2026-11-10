import { z } from "zod";
import { MONEY_PATTERN, QUANTITY_PATTERN } from "@/lib/money";

/**
 * Shared field schemas used across products / stock / sales.
 * All quantity and money values travel as strings (see src/types/index.ts).
 */

export const idParam = z.coerce.number().int().positive();

export const moneyString = z
  .string()
  .trim()
  .regex(MONEY_PATTERN, "Enter an amount like 350 or 350.00 (max 2 decimals).");

export const quantityString = z
  .string()
  .trim()
  .regex(QUANTITY_PATTERN, "Enter a quantity like 3 or 1.5 (max 3 decimals).");

export const positiveQuantityString = quantityString.refine(
  (value) => !/^0+(\.0+)?$/.test(value),
  "Quantity must be greater than zero."
);

/** Optional text field: trims, treats "" as undefined, caps length. */
export function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} is too long (max ${max} characters).`)
    .transform((value) => (value === "" ? undefined : value))
    .optional();
}

export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a category name.")
    .max(100, "Category name is too long."),
});

export type CategoryInput = z.infer<typeof categorySchema>;

export const productSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a product name.")
    .max(180, "Product name is too long."),
  categoryId: z.coerce
    .number()
    .int()
    .positive("Choose a category."),
  sku: optionalText(80, "SKU"),
  brand: optionalText(120, "Brand"),
  variant: optionalText(180, "Variant"),
  unit: z
    .string()
    .trim()
    .min(1, "Enter a unit (e.g. piece, bottle, set).")
    .max(40, "Unit label is too long."),
  sellingPrice: moneyString,
  reorderLevel: quantityString,
  /** Creation only; ignored on update (stock changes go through stock routes). */
  openingStock: quantityString.optional(),
});

export type ProductInput = z.infer<typeof productSchema>;

export const productUpdateSchema = productSchema
  .omit({ openingStock: true })
  .extend({
    isActive: z.boolean().optional(),
  });

export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const stockInSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: positiveQuantityString,
  reason: optionalText(500, "Reason"),
});

export type StockInInput = z.infer<typeof stockInSchema>;

export const physicalCountSchema = z.object({
  productId: z.coerce.number().int().positive(),
  physicalCount: quantityString,
  reason: z
    .string()
    .trim()
    .min(3, "Give a short reason (at least 3 characters).")
    .max(500, "Reason is too long."),
});

export type PhysicalCountInput = z.infer<typeof physicalCountSchema>;

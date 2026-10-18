import { z } from "zod";
import { moneyString } from "./product";

/**
 * Sales input schema (spec §12 example, §13 input checks).
 * Requests: { saleDate, notes?, requestId?, items: [{ productId, quantity, finalUnitPrice? }] }
 * Quantity and price arrive as strings; the server recomputes all totals.
 * A legacy `unitPrice` alias is still accepted when `finalUnitPrice` is
 * absent (compatibility, see docs/DECISIONS.md D-17) — `finalUnitPrice`
 * always wins when both are present.
 */

export const saleItemInput = z.object({
  productId: z.coerce.number().int().positive("Choose a product."),
  quantity: z
    .string()
    .trim()
    .regex(
      /^\d{1,9}(\.\d{1,3})?$/,
      "Quantity must be like 3 or 1.5 (max 3 decimals)."
    )
    .refine(
      (value) => !/^0+(\.0+)?$/.test(value),
      "Quantity must be greater than zero."
    ),
  /** Actual per-unit price for this entry; defaults to the catalog Base Price. */
  finalUnitPrice: moneyString.optional(),
  /** Legacy alias from before the Base/Final price change (finalUnitPrice wins). */
  unitPrice: moneyString.optional(),
});

export type SaleItemInput = z.infer<typeof saleItemInput>;

export const createSaleSchema = z.object({
  saleDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.")
    .refine((value) => {
      const [y, m, d] = value.split("-").map(Number) as [number, number, number];
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth;
    }, "That date does not exist."),
  notes: z
    .string()
    .trim()
    .max(1000, "Notes are too long.")
    .optional()
    .transform((value) => (value === "" || value === undefined ? undefined : value)),
  requestId: z.uuid("The request id must be a UUID.").optional(),
  items: z
    .array(saleItemInput)
    .min(1, "Add at least one product line.")
    .max(200, "Too many lines in one entry (max 200)."),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const voidSaleSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Give a reason (at least 3 characters).")
    .max(500, "Reason is too long."),
});

export type VoidSaleInput = z.infer<typeof voidSaleSchema>;

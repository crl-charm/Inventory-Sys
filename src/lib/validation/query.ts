import { z } from "zod";
import { isValidDateString } from "../dates";

const optionalDate = z.string().refine(isValidDateString, "Choose a valid date.").optional();
const optionalId = z.string().regex(/^\d+$/, "Choose a valid ID.")
  .transform(Number).refine((value) => Number.isSafeInteger(value) && value > 0, "Choose a valid ID.").optional();

export const productListQuery = z.object({
  q: z.string().trim().max(200).optional(),
  categoryId: optionalId,
  stockStatus: z.enum(["all", "in_stock", "low_stock", "out_of_stock"]).optional(),
  active: z.enum(["active", "inactive", "all"]).optional(),
  sort: z.enum(["name", "stock", "price"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

export const saleListQuery = z.object({
  from: optionalDate,
  to: optionalDate,
  status: z.enum(["posted", "voided", "all"]).optional(),
}).refine(({ from, to }) => !from || !to || from <= to, {
  path: ["to"], message: "End date must be on or after the start date.",
});

export const movementListQuery = z.object({
  productId: optionalId,
  movementType: z.enum(["opening", "sale", "stock_in", "sale_void_reversal", "physical_count_correction"]).optional(),
  from: optionalDate,
  to: optionalDate,
}).refine(({ from, to }) => !from || !to || from <= to, {
  path: ["to"], message: "End date must be on or after the start date.",
});

import { ok, parseJsonBody, withApi } from "@/lib/api-response";
import { stockInSchema } from "@/lib/validation/product";
import { stockInProduct } from "@/services/stock-service";

export const runtime = "nodejs";

/**
 * POST /api/stock-movements/stock-in — { productId, quantity, reason? }
 * Adds stock and records a positive `stock_in` movement in one transaction.
 */
export const POST = withApi({ auth: "required" }, async (request, user) => {
  const input = await parseJsonBody(request, stockInSchema);
  const result = await stockInProduct(input, user!.id);
  return ok(result, "Stock added.", 201);
});

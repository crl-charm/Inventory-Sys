import { ok, parseNumericParam, parseSearchParams, withApi } from "@/lib/api-response";
import { lookupProducts } from "@/services/product-service";

/**
 * GET /api/products/lookup?q=&limit=
 * Lightweight, active-only product list for the sales-entry picker.
 */
export const GET = withApi({ auth: "required" }, async (request) => {
  const params = await parseSearchParams(request);
  const q = params.get("q") ?? undefined;
  const limit = parseNumericParam(params.get("limit") ?? "50", "limit");
  const products = await lookupProducts(q, Math.min(200, limit));
  return ok(products);
});

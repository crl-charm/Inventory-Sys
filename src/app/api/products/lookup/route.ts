import { ok, parseSearchParams, withApi } from "@/lib/api-response";
import { lookupProducts } from "@/services/product-service";

export const runtime = "nodejs";

/**
 * GET /api/products/lookup?q=&limit=
 * Lightweight, active-only product list for the sales-entry picker.
 */
export const GET = withApi({ auth: "required" }, async (request) => {
  const params = await parseSearchParams(request);
  const q = params.get("q") ?? undefined;
  const limit = Number(params.get("limit") ?? "50");
  const products = await lookupProducts(q, Number.isFinite(limit) ? limit : 50);
  return ok(products);
});

import {
  ok,
  parseJsonBody,
  parseNumericParam,
  withApi,
} from "@/lib/api-response";
import { productUpdateSchema } from "@/lib/validation/product";
import { getProduct, updateProduct } from "@/services/product-service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/products/:id — product + recent movements.
 * PATCH /api/products/:id — catalog fields only; stock changes go through
 * the stock endpoints, never product edit (spec §4.7).
 */
export const GET = async (
  request: Request,
  context: RouteContext
): Promise<Response> => {
  return withApi({ auth: "required" }, async () => {
    const { id } = await context.params;
    const detail = await getProduct(parseNumericParam(id, "product id"));
    return ok(detail);
  })(request);
};

export const PATCH = async (
  request: Request,
  context: RouteContext
): Promise<Response> => {
  return withApi({ auth: "required" }, async () => {
    const { id } = await context.params;
    const input = await parseJsonBody(request, productUpdateSchema);
    const detail = await updateProduct(parseNumericParam(id, "product id"), input);
    return ok(detail, "Product updated.");
  })(request);
};

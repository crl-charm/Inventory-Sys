import { ok, parseNumericParam, withApi } from "@/lib/api-response";
import { setProductActive } from "@/services/product-service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/products/:id/deactivate
 * Products with sale or movement history are never deleted; they are
 * deactivated and stay visible with an "inactive" label (spec §3.9).
 */
export const POST = async (
  request: Request,
  context: RouteContext
): Promise<Response> => {
  return withApi({ auth: "required" }, async () => {
    const { id } = await context.params;
    const detail = await setProductActive(parseNumericParam(id, "product id"), false);
    return ok(detail, "Product deactivated. History is preserved.");
  })(request);
};

import { ok, parseNumericParam, withApi } from "@/lib/api-response";
import { setProductActive } from "@/services/product-service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** POST /api/products/:id/activate */
export const POST = async (
  request: Request,
  context: RouteContext
): Promise<Response> => {
  return withApi({ auth: "required" }, async () => {
    const { id } = await context.params;
    const detail = await setProductActive(parseNumericParam(id, "product id"), true);
    return ok(detail, "Product activated.");
  })(request);
};

import { ok, parseNumericParam, withApi } from "@/lib/api-response";
import { setProductActive } from "@/services/product-service";

interface RouteContext {
  params: { id: string };
}

/** POST /api/products/:id/activate */
export const POST = async (
  request: Request,
  context: RouteContext
): Promise<Response> => {
  return withApi({ auth: "required" }, async () => {
    const detail = await setProductActive(
      parseNumericParam(context.params.id, "product id"),
      true
    );
    return ok(detail, "Product activated.");
  })(request);
};

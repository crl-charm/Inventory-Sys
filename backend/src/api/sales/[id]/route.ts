import { ok, parseNumericParam, withApi } from "@/lib/api-response";
import { getSaleBatch } from "@/services/sales-service";

interface RouteContext {
  params: { id: string };
}

/** GET /api/sales/:id — immutable line snapshots + void state. */
export const GET = async (
  request: Request,
  context: RouteContext
): Promise<Response> => {
  return withApi({ auth: "required" }, async () => {
    const sale = await getSaleBatch(
      parseNumericParam(context.params.id, "sales entry id")
    );
    return ok(sale);
  })(request);
};

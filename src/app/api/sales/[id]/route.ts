import { ok, parseNumericParam, withApi } from "@/lib/api-response";
import { getSaleBatch } from "@/services/sales-service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** GET /api/sales/:id — immutable line snapshots + void state. */
export const GET = async (
  request: Request,
  context: RouteContext
): Promise<Response> => {
  return withApi({ auth: "required" }, async () => {
    const { id } = await context.params;
    const sale = await getSaleBatch(parseNumericParam(id, "sales entry id"));
    return ok(sale);
  })(request);
};

import { ok, parseJsonBody, parseNumericParam, withApi } from "@/lib/api-response";
import { voidSaleSchema } from "@/lib/validation/sales";
import { voidSalesBatch } from "@/services/sales-service";

interface RouteContext {
  params: { id: string };
}

/**
 * POST /api/sales/:id/void — { reason }
 * Restores stock exactly once, keeps the original lines for audit, and
 * excludes the batch from every total (spec §14). A second void fails safely.
 */
export const POST = async (
  request: Request,
  context: RouteContext
): Promise<Response> => {
  return withApi({ auth: "required" }, async (_request, user) => {
    const input = await parseJsonBody(request, voidSaleSchema);
    const sale = await voidSalesBatch(
      parseNumericParam(context.params.id, "sales entry id"),
      input.reason,
      user!.id
    );
    return ok(sale, "Entry voided. Stock restored.");
  })(request);
};

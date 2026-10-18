import { ok, parseJsonBody, withApi } from "@/lib/api-response";
import { physicalCountSchema } from "@/lib/validation/product";
import { recordPhysicalCount } from "@/services/stock-service";

export const runtime = "nodejs";

/**
 * POST /api/stock-movements/physical-count — { productId, physicalCount, reason }
 * The server computes delta = physicalCount - current stock while holding a
 * row lock; the client never sends before/after values (spec §15).
 */
export const POST = withApi({ auth: "required" }, async (request, user) => {
  const input = await parseJsonBody(request, physicalCountSchema);
  const result = await recordPhysicalCount(input, user!.id);
  return ok(result, "Stock corrected to the counted quantity.", 201);
});

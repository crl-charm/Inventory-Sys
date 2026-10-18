import {
  ok,
  okPaginated,
  parseJsonBody,
  parsePagination,
  parseSearchParams,
  withApi,
} from "@/lib/api-response";
import { createSaleSchema } from "@/lib/validation/sales";
import {
  listSales,
  postSalesBatch,
  type SaleListFilters,
} from "@/services/sales-service";

export const runtime = "nodejs";

/** GET /api/sales?from=&to=&status=&page=&pageSize= — history list. */
export const GET = withApi({ auth: "required" }, async (request) => {
  const params = await parseSearchParams(request);
  const { page, pageSize, offset } = parsePagination(params);

  const filters: SaleListFilters = {
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    status: (params.get("status") as SaleListFilters["status"]) ?? undefined,
  };

  const { items, total } = await listSales(filters, { offset, pageSize });
  return okPaginated({
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

/** POST /api/sales — post one end-of-day batch (all-or-nothing). */
export const POST = withApi({ auth: "required" }, async (request, user) => {
  const input = await parseJsonBody(request, createSaleSchema);
  const result = await postSalesBatch(input, { userId: user!.id });
  return ok(result, "Sales saved. Stock updated.", result.replayed ? 200 : 201);
});

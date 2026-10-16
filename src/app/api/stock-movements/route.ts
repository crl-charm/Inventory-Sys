import {
  okPaginated,
  parsePagination,
  parseSearchParams,
  withApi,
} from "@/lib/api-response";
import { listMovements, type MovementFilters } from "@/services/stock-service";

export const runtime = "nodejs";

/**
 * GET /api/stock-movements?productId=&movementType=&from=&to=&page=&pageSize=
 * The permanent audit ledger, newest first.
 */
export const GET = withApi({ auth: "required" }, async (request) => {
  const params = await parseSearchParams(request);
  const { page, pageSize, offset } = parsePagination(params, { pageSize: 25 });

  const filters: MovementFilters = {
    productId: params.get("productId")
      ? Number(params.get("productId"))
      : undefined,
    movementType: params.get("movementType") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  };

  const { items, total } = await listMovements(filters, { offset, pageSize });
  return okPaginated({
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

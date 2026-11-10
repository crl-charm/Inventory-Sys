import {
  okPaginated,
  parsePagination,
  parseSearchParams,
  withApi,
} from "@/lib/api-response";
import { listMovements } from "@/services/stock-service";
import { movementListQuery } from "@/lib/validation/query";

/**
 * GET /api/stock-movements?productId=&movementType=&from=&to=&page=&pageSize=
 * The permanent audit ledger, newest first.
 */
export const GET = withApi({ auth: "required" }, async (request) => {
  const params = await parseSearchParams(request);
  const { page, pageSize, offset } = parsePagination(params, { pageSize: 25 });

  const filters = movementListQuery.parse(Object.fromEntries(params));

  const { items, total } = await listMovements(filters, { offset, pageSize });
  return okPaginated({
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

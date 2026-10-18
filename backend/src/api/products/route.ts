import {
  ok,
  okPaginated,
  parseJsonBody,
  parsePagination,
  parseSearchParams,
  withApi,
} from "@/lib/api-response";
import { productSchema } from "@/lib/validation/product";
import {
  createProduct,
  listProducts,
  type ProductListFilters,
} from "@/services/product-service";

export const runtime = "nodejs";

/** GET /api/products?q=&categoryId=&stockStatus=&active=&sort=&order=&page=&pageSize= */
export const GET = withApi({ auth: "required" }, async (request) => {
  const params = await parseSearchParams(request);
  const { page, pageSize, offset } = parsePagination(params);

  const filters: ProductListFilters = {
    q: params.get("q") ?? undefined,
    categoryId: params.get("categoryId")
      ? Number(params.get("categoryId"))
      : undefined,
    stockStatus:
      (params.get("stockStatus") as ProductListFilters["stockStatus"]) ??
      undefined,
    active: (params.get("active") as ProductListFilters["active"]) ?? undefined,
    sort: (params.get("sort") as ProductListFilters["sort"]) ?? undefined,
    order: (params.get("order") as ProductListFilters["order"]) ?? undefined,
  };

  const { items, total } = await listProducts(filters, { offset, pageSize });
  return okPaginated({
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

/** POST /api/products — catalog fields (+ optional openingStock on create). */
export const POST = withApi({ auth: "required" }, async (request, user) => {
  const input = await parseJsonBody(request, productSchema);
  const detail = await createProduct(input, user!.id);
  return ok(detail, "Product added.", 201);
});

import {
  ok,
  okPaginated,
  parseJsonBody,
  parsePagination,
  parseSearchParams,
  withApi,
} from "@/lib/api-response";
import { productSchema } from "@/lib/validation/product";
import { productListQuery } from "@/lib/validation/query";
import {
  createProduct,
  listProducts,
} from "@/services/product-service";

/** GET /api/products?q=&categoryId=&stockStatus=&active=&sort=&order=&page=&pageSize= */
export const GET = withApi({ auth: "required" }, async (request) => {
  const params = await parseSearchParams(request);
  const { page, pageSize, offset } = parsePagination(params);

  const filters = productListQuery.parse(Object.fromEntries(params));

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

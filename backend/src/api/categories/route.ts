import {
  ok,
  parseJsonBody,
  parseSearchParams,
  withApi,
} from "@/lib/api-response";
import { categorySchema } from "@/lib/validation/product";
import { createCategory, listCategories } from "@/services/category-service";

export const runtime = "nodejs";

/** GET /api/categories?includeInactive=true */
export const GET = withApi({ auth: "required" }, async (request) => {
  const params = await parseSearchParams(request);
  const includeInactive = params.get("includeInactive") === "true";
  const categories = await listCategories(includeInactive);
  return ok(categories);
});

/** POST /api/categories — { name } */
export const POST = withApi({ auth: "required" }, async (request) => {
  const input = await parseJsonBody(request, categorySchema);
  const category = await createCategory(input);
  return ok(category, "Category added.", 201);
});

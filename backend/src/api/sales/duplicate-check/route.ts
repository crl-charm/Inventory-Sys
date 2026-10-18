import { ok, parseSearchParams, withApi } from "@/lib/api-response";
import { requireDateString } from "@/lib/dates";
import { hasPostedSalesOnDate } from "@/services/sales-service";

export const runtime = "nodejs";

/**
 * GET /api/sales/duplicate-check?date=YYYY-MM-DD
 * Feeds the "sales already recorded for this date" warning on the entry form
 * (spec §4.5). Informational only — posting a second batch is allowed.
 */
export const GET = withApi({ auth: "required" }, async (request) => {
  const params = await parseSearchParams(request);
  const date = requireDateString(params.get("date"), "date");
  const hasEntries = await hasPostedSalesOnDate(date);
  return ok({ date, hasPostedEntries: hasEntries });
});

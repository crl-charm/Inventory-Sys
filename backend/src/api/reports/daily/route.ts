import { ok, parseSearchParams, withApi } from "@/lib/api-response";
import { requireDateString, todayInStoreTz } from "@/lib/dates";
import { getDailyReport } from "@/services/report-service";

export const runtime = "nodejs";

/**
 * GET /api/reports/daily?date=YYYY-MM-DD
 * Posted totals for the business date, per-product quantities with units,
 * voided batches (excluded from totals), and batch notes (spec §16).
 */
export const GET = withApi({ auth: "required" }, async (request) => {
  const params = await parseSearchParams(request);
  const date = params.get("date")
    ? requireDateString(params.get("date"), "date")
    : todayInStoreTz();
  const report = await getDailyReport(date);
  return ok(report);
});

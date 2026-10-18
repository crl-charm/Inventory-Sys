import { ok, parseSearchParams, withApi } from "@/lib/api-response";
import { requireDateString, todayInStoreTz } from "@/lib/dates";
import { getDashboardData } from "@/services/report-service";

export const runtime = "nodejs";

/** GET /api/dashboard?date=YYYY-MM-DD — one payload for every dashboard card. */
export const GET = withApi({ auth: "required" }, async (request) => {
  const params = await parseSearchParams(request);
  const today = todayInStoreTz();
  const date = params.get("date")
    ? requireDateString(params.get("date"), "date")
    : today;
  const data = await getDashboardData(date, today);
  return ok({ ...data, today });
});

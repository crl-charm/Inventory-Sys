import { PageHeader } from "@/components/page-header";
import { DailyReportView } from "@/components/daily-report-view";
import { todayInStoreTz } from "@/lib/dates";

export const metadata = { title: "Daily Report" };

export default function DailyReportPage() {
  const today = todayInStoreTz();
  return (
    <>
      <PageHeader
        title="Daily Report"
        description="One day's recorded sales, ready to print."
      />
      <DailyReportView today={today} />
    </>
  );
}

import { PageHeader } from "@/components/page-header";
import { DashboardView } from "@/components/dashboard-view";
import { todayInStoreTz } from "@/lib/dates";

export const metadata = { title: "Dashboard" };

export default function DashboardPage() {
  const today = todayInStoreTz();
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Today's sales and current stock at a glance."
      />
      <DashboardView today={today} />
    </>
  );
}

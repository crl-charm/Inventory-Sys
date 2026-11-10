import { PageHeader } from "@/components/page-header";
import { SalesEntryForm } from "@/components/sales-entry-form";
import { todayInStoreTz } from "@/lib/dates";

export const metadata = { title: "Record Daily Sales" };

export default function NewSalePage() {
  const today = todayInStoreTz();
  return (
    <>
      <PageHeader
        title="Record Daily Sales"
        description="Enter the quantities sold per product. Saving deducts stock and updates the daily totals."
      />
      <SalesEntryForm today={today} />
    </>
  );
}

import { PageHeader } from "@/components/page-header";
import { MovementsView } from "@/components/movements-view";

export const metadata = { title: "Stock Movements" };

export default function MovementsPage() {
  return (
    <>
      <PageHeader
        title="Stock Movements"
        description="Why did stock change? Every movement is listed here, newest first."
      />
      <MovementsView />
    </>
  );
}

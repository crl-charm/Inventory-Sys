import { PageHeader } from "@/components/page-header";
import { InventoryTable } from "@/components/inventory-table";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ stockStatus?: string; updated?: string }>;
}) {
  const resolved = searchParams ? await searchParams : undefined;
  const initialNotice = resolved?.updated === "1" ? "Product updated." : null;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Products, stock on hand, and reorder levels. Stock changes through Stock In, Physical Count, and sales."
      />
      <InventoryTable
        initialStockStatus={resolved?.stockStatus}
        initialNotice={initialNotice}
      />
    </>
  );
}

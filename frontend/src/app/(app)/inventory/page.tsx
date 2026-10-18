import { PageHeader } from "@/components/page-header";
import { InventoryTable } from "@/components/inventory-table";

export const metadata = { title: "Inventory" };

export default function InventoryPage() {
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Products, stock on hand, and reorder levels. Stock changes through Stock In, Physical Count, and sales."
      />
      <InventoryTable />
    </>
  );
}

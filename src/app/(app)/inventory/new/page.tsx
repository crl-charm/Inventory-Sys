import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ProductForm } from "@/components/product-form";

export const metadata = { title: "Add Product" };

export default function NewProductPage() {
  return (
    <>
      <PageHeader
        title="Add Product"
        description="Register a product with its unit, selling price, and starting stock."
      >
        <Link href="/inventory" className="btn-secondary">
          Back to inventory
        </Link>
      </PageHeader>
      <ProductForm mode="create" />
    </>
  );
}

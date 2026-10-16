import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ProductForm } from "@/components/product-form";
import { ProductRowActions } from "@/components/product-row-actions";
import { getProduct } from "@/services/product-service";
import { NotFoundError } from "@/lib/errors";

export const metadata = { title: "Edit Product" };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  let detail;
  try {
    detail = await getProduct(numericId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader
        title={`Edit — ${detail.product.name}`}
        description="Changing the price or name never rewrites past sales; sale lines keep their snapshots."
      >
        <Link href="/inventory" className="btn-secondary">
          Back to inventory
        </Link>
      </PageHeader>
      <div className="space-y-6">
        <ProductForm mode="edit" product={detail.product} />
        <ProductRowActions
          product={detail.product}
          recentMovements={detail.recentMovements}
        />
      </div>
    </>
  );
}

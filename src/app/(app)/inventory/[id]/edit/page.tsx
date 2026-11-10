import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ProductForm } from "@/components/product-form";
import { ProductRowActions } from "@/components/product-row-actions";
import { backendGet } from "@/lib/backend";
import type { Product } from "@/types";

export const metadata = { title: "Edit Product" };

interface ProductDetail {
  product: Product;
  recentMovements: Array<{
    id: number;
    movementType: string;
    quantityDelta: string;
    stockBefore: string;
    stockAfter: string;
    note: string | null;
    createdAt: string;
  }>;
}

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const resolvedSearch = searchParams ? await searchParams : undefined;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const detail = await backendGet<ProductDetail>(`/api/products/${numericId}`);

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
        {resolvedSearch?.created === "1" ? (
          <p
            role="status"
            className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300"
          >
            Product added.
          </p>
        ) : null}
        <ProductForm mode="edit" product={detail.product} />
        <ProductRowActions
          product={detail.product}
          recentMovements={detail.recentMovements}
        />
      </div>
    </>
  );
}

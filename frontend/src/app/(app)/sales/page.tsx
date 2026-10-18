import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SalesHistory } from "@/components/sales-history";

export const metadata = { title: "Sales History" };

export default function SalesPage() {
  return (
    <>
      <PageHeader
        title="Sales History"
        description="Every recorded entry, with status. Voided entries stay visible for audit."
      >
        <Link href="/sales/new" className="btn-primary">
          + Record Daily Sales
        </Link>
      </PageHeader>
      <Suspense
        fallback={
          <div className="card animate-pulse">
            <div className="h-6 rounded bg-slate-100" />
          </div>
        }
      >
        <SalesHistory />
      </Suspense>
    </>
  );
}

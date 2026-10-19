import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CancelSaleButton } from "@/components/cancel-sale-button";
import { backendGet } from "@/lib/backend";
import { formatPhp } from "@/lib/money";
import { formatDateLong, formatDateTimeInStoreTz } from "@/lib/dates";
import { formatQuantityWithUnit } from "@/types";

export const metadata = { title: "Sales Entry" };

interface SaleBatch {
  id: number;
  saleDate: string;
  status: "posted" | "voided";
  totalAmount: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  voidedBy: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  items: Array<{
    id: number;
    productName: string;
    sku: string | null;
    quantity: string;
    unit: string;
    finalUnitPrice: string;
    lineTotal: string;
  }>;
}

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const sale = await backendGet<SaleBatch>(`/api/sales/${numericId}`);

  const isVoided = sale.status === "voided";

  return (
    <>
      <PageHeader
        title={`Sales entry #${sale.id}`}
        description={`Business date: ${formatDateLong(sale.saleDate)}`}
      >
        <Link href="/sales" className="btn-secondary">
          Back to history
        </Link>
        {!isVoided ? <CancelSaleButton saleId={sale.id} /> : null}
      </PageHeader>

      <div className="space-y-4">
        {isVoided ? (
          <div className="card text-sm">
            <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Voided
            </span>
            <p className="mt-2 text-slate-200">
              Voided by <strong>{sale.voidedBy}</strong>
              {sale.voidedAt
                ? ` on ${formatDateTimeInStoreTz(sale.voidedAt)}`
                : ""}
              .
            </p>
            {sale.voidReason ? (
              <p className="mt-1 text-slate-300">
                Reason: <em>{sale.voidReason}</em>
              </p>
            ) : null}
            <p className="mt-1 text-xs text-slate-500">
              The quantities were returned to stock. This entry is kept for the
              audit trail and is excluded from sales totals.
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card">
            <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
            <p className="mt-1 font-semibold">
              {isVoided ? "Voided" : "Posted"}
            </p>
          </div>
          <div className="card">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
            <p className="mt-1 text-xl font-bold">{formatPhp(sale.totalAmount)}</p>
          </div>
          <div className="card">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Recorded
            </p>
            <p className="mt-1 text-sm">
              {formatDateTimeInStoreTz(sale.createdAt)}
              <span className="block text-xs text-slate-500">
                by {sale.createdBy}
              </span>
            </p>
          </div>
        </div>

        {sale.notes ? (
          <div className="card text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Notes</p>
            <p className="mt-1">{sale.notes}</p>
          </div>
        ) : null}

        <section>
          <h2 className="text-sm font-semibold">Products (as sold)</h2>
          <ul className="mt-3 space-y-3">
            {sale.items.map((item) => (
              <li
                key={item.id}
                className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
              >
                <p className="font-medium">{item.productName}</p>
                {item.sku ? (
                  <p className="mt-0.5 text-xs text-slate-400">{item.sku}</p>
                ) : null}
                <dl className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-slate-400">Quantity</dt>
                    <dd>{formatQuantityWithUnit(item.quantity, item.unit)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-slate-400">Unit price</dt>
                    <dd>{formatPhp(item.finalUnitPrice)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 font-semibold">
                    <dt>Line total</dt>
                    <dd>{formatPhp(item.lineTotal)}</dd>
                  </div>
                </dl>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 border-t-2 border-white/15 pt-3 text-sm font-semibold">
              <span>Batch total</span>
              <span>{formatPhp(sale.totalAmount)}</span>
            </li>
          </ul>
        </section>

        <p className="text-xs text-slate-500">
          Prices and names shown here are the snapshots recorded when this entry
          was saved — later catalog edits never change this history.
        </p>

        {!isVoided ? (
          <div className="card text-sm text-slate-400">
            Made a mistake?{" "}
            <CancelSaleButton
              saleId={sale.id}
              label="Void this entry and re-enter it"
              variant="link"
            />
            . Voiding returns the quantities to stock and keeps the original
            record for audit.
          </div>
        ) : null}
      </div>
    </>
  );
}

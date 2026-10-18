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
          <div className="rounded-xl border border-slate-300 bg-slate-100 p-4 text-sm text-slate-700">
            <p className="font-semibold uppercase tracking-wide text-slate-500">
              Voided
            </p>
            <p className="mt-1">
              Voided by <strong>{sale.voidedBy}</strong>
              {sale.voidedAt
                ? ` on ${formatDateTimeInStoreTz(sale.voidedAt)}`
                : ""}
              .
            </p>
            {sale.voidReason ? (
              <p className="mt-1">
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

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Product (as sold)</th>
                <th className="px-3 py-2.5 text-right font-medium">Quantity</th>
                <th className="px-3 py-2.5 text-right font-medium">Unit price</th>
                <th className="px-3 py-2.5 text-right font-medium">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sale.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2.5">
                    <p className="font-medium">{item.productName}</p>
                    {item.sku ? (
                      <p className="text-xs text-slate-500">{item.sku}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {formatQuantityWithUnit(item.quantity, item.unit)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {formatPhp(item.finalUnitPrice)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold">
                    {formatPhp(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td className="px-3 py-3" colSpan={3}>
                  Batch total
                </td>
                <td className="px-3 py-3 text-right">
                  {formatPhp(sale.totalAmount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="text-xs text-slate-500">
          Prices and names shown here are the snapshots recorded when this entry
          was saved — later catalog edits never change this history.
        </p>

        {!isVoided ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
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

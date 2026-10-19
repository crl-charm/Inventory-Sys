"use client";

import { useState } from "react";
import Link from "next/link";
import { qs } from "@/lib/api-client";
import { useCachedPagedApi } from "@/lib/use-cached-api";
import { formatPhp } from "@/lib/money";
import { formatDateLong, formatDateTimeInStoreTz } from "@/lib/dates";
import { EmptyState } from "./empty-state";
import { PaginationBar } from "./pagination-bar";

/**
 * Sales history list (spec §4.6): filter by date range and status, with
 * server-side pagination. Voided batches stay visible, clearly labeled.
 */

interface SaleSummary {
  id: number;
  saleDate: string;
  status: "posted" | "voided";
  totalAmount: string;
  lineCount: number;
  createdBy: string;
  createdAt: string;
}

export function SalesHistory() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<"all" | "posted" | "voided">("all");
  const [page, setPage] = useState(1);

  const {
    data,
    loading,
    error,
    refresh,
  } = useCachedPagedApi<SaleSummary>(
    `/api/sales${qs({ from, to, status, page, pageSize: 20 })}`
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <div>
          <label htmlFor="sales-from" className="mb-1 block text-xs font-medium text-slate-400">
            From date
          </label>
          <input
            id="sales-from"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="sales-to" className="mb-1 block text-xs font-medium text-slate-400">
            To date
          </label>
          <input
            id="sales-to"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="sales-status" className="mb-1 block text-xs font-medium text-slate-400">
            Status
          </label>
          <select
            id="sales-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setPage(1);
            }}
            className="input"
          >
            <option value="all">All</option>
            <option value="posted">Posted</option>
            <option value="voided">Voided</option>
          </select>
        </div>
        {from || to || status !== "all" ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setFrom("");
              setTo("");
              setStatus("all");
              setPage(1);
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="card animate-pulse space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-6 rounded bg-white/10" />
          ))}
        </div>
      ) : error ? (
        <div className="card text-center">
          <p className="text-sm text-red-300">{error}</p>
          <button type="button" onClick={refresh} className="btn-secondary mt-3">
            Retry
          </button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title={`No sales ${
            from || to || status !== "all" ? "match these filters" : "recorded yet"
          }.`}
          description="Record the day's quantities in one simple entry."
          action={
            <Link href="/sales/new" className="btn-primary">
              Record Daily Sales
            </Link>
          }
        />
      ) : (
        <>
          {/* Phone: stacked cards */}
          <ul className="space-y-3 md:hidden">
            {data.items.map((sale) => (
              <li key={sale.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{formatDateLong(sale.saleDate)}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      entered {formatDateTimeInStoreTz(sale.createdAt)} · by{" "}
                      {sale.createdBy}
                    </p>
                  </div>
                  {sale.status === "posted" ? (
                    <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                      Posted
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Voided
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    {sale.lineCount} product line{sale.lineCount === 1 ? "" : "s"}
                  </span>
                  <span
                    className={
                      sale.status === "voided"
                        ? "font-semibold text-slate-400 line-through"
                        : "font-semibold"
                    }
                  >
                    {formatPhp(sale.totalAmount)}
                  </span>
                </div>
                <Link
                  href={`/sales/${sale.id}`}
                  className="btn-secondary mt-3 w-full"
                >
                  View details
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.035] md:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Sale date</th>
                  <th className="px-3 py-2.5 font-medium">Recorded</th>
                  <th className="px-3 py-2.5 text-right font-medium">Products</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Entered by</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.items.map((sale) => (
                  <tr
                    key={sale.id}
                    className={sale.status === "voided" ? "text-slate-400" : ""}
                  >
                    <td className="px-3 py-2.5 font-medium">
                      {formatDateLong(sale.saleDate)}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {formatDateTimeInStoreTz(sale.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 text-right">{sale.lineCount}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">
                      {formatPhp(sale.totalAmount)}
                    </td>
                    <td className="px-3 py-2.5">
                      {sale.status === "posted" ? (
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                          Posted
                        </span>
                      ) : (
                        <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Voided
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs">{sale.createdBy}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Link
                        href={`/sales/${sale.id}`}
                        className="text-xs font-medium text-brand-gold hover:underline"
                      >
                        View details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationBar
            page={data.page}
            totalPages={data.totalPages}
            summary={`Page ${data.page} of ${data.totalPages} · ${data.total} entries`}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

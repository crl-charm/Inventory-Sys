"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiClientError, qs, type Paginated } from "@/lib/api-client";
import { formatPhp } from "@/lib/money";
import { formatDateLong, formatDateTimeInStoreTz } from "@/lib/dates";

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

  const [data, setData] = useState<Paginated<SaleSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getPaginated<SaleSummary>(
        `/api/sales${qs({ from, to, status, page, pageSize: 20 })}`
      );
      setData(result);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not load sales."
      );
    } finally {
      setLoading(false);
    }
  }, [from, to, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <label htmlFor="sales-from" className="mb-1 block text-xs font-medium text-slate-600">
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
          <label htmlFor="sales-to" className="mb-1 block text-xs font-medium text-slate-600">
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
          <label htmlFor="sales-status" className="mb-1 block text-xs font-medium text-slate-600">
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
            <div key={i} className="h-6 rounded bg-slate-100" />
          ))}
        </div>
      ) : error ? (
        <div className="card text-center">
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={load} className="btn-secondary mt-3">
            Retry
          </button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-800">
            No sales {from || to || status !== "all" ? "match these filters" : "recorded yet"}.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Record the day&apos;s quantities in one simple entry.
          </p>
          <Link href="/sales/new" className="btn-primary mt-4">
            Record Daily Sales
          </Link>
        </div>
      ) : (
        <>
          {/* Phone: stacked cards */}
          <ul className="space-y-3 md:hidden">
            {data.items.map((sale) => (
              <li key={sale.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{formatDateLong(sale.saleDate)}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      entered {formatDateTimeInStoreTz(sale.createdAt)} · by{" "}
                      {sale.createdBy}
                    </p>
                  </div>
                  {sale.status === "posted" ? (
                    <span className="shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      Posted
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Voided
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
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
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
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
              <tbody className="divide-y divide-slate-100">
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
                        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          Posted
                        </span>
                      ) : (
                        <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Voided
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs">{sale.createdBy}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Link
                        href={`/sales/${sale.id}`}
                        className="text-xs font-medium text-sky-700 hover:underline"
                      >
                        View details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.totalPages > 1 ? (
            <div className="flex items-center justify-between text-sm">
              <p className="text-xs text-slate-500">
                Page {data.page} of {data.totalPages} · {data.total} entries
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

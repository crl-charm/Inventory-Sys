"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiClientError, qs } from "@/lib/api-client";
import { formatPhp } from "@/lib/money";
import { formatDateLong, formatDateTimeInStoreTz } from "@/lib/dates";
import { formatQuantityWithUnit } from "@/types";

/**
 * Daily Report (spec §4.8): one selectable day, posted totals only,
 * voided batches listed separately (excluded from the total), and a
 * print-friendly layout via browser print.
 */

interface DailyReport {
  date: string;
  totalSales: string;
  postedBatches: number;
  productLines: Array<{
    productId: number;
    productName: string;
    sku: string | null;
    unit: string;
    quantity: string;
    totalAmount: string;
  }>;
  voidedBatches: Array<{
    id: number;
    totalAmount: string;
    voidReason: string | null;
    voidedAt: string | null;
    voidedBy: string | null;
  }>;
  notes: Array<{ id: number; notes: string | null; createdAt: string }>;
}

export function DailyReportView({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<DailyReport>(`/api/reports/daily${qs({ date })}`);
      setReport(result);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not load the report."
      );
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="print-hidden flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <label htmlFor="report-date" className="mb-1 block text-xs font-medium text-slate-600">
            Report date
          </label>
          <input
            id="report-date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setDate(today)}
          disabled={date === today}
        >
          Today
        </button>
        <button
          type="button"
          className="btn-primary ml-auto"
          onClick={() => window.print()}
          disabled={loading || !report}
        >
          Print Report
        </button>
      </div>

      {error ? (
        <div className="card text-center">
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={load} className="btn-secondary mt-3">
            Retry
          </button>
        </div>
      ) : loading || !report ? (
        <div className="card h-64 animate-pulse bg-slate-50" />
      ) : (
        <div className="print-area space-y-5">
          {/* Header block */}
          <div className="card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Daily Sales Report</h2>
                <p className="text-sm text-slate-600">
                  {formatDateLong(report.date)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Total recorded sales
                </p>
                <p className="text-2xl font-bold">{formatPhp(report.totalSales)}</p>
                <p className="text-xs text-slate-500">
                  {report.postedBatches} posted entr
                  {report.postedBatches === 1 ? "y" : "ies"}
                </p>
              </div>
            </div>
          </div>

          {/* Product breakdown */}
          <div className="card">
            <h3 className="text-sm font-semibold">Products sold</h3>
            {report.productLines.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No posted sales on this date.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Product</th>
                      <th className="py-2 pr-3 text-right font-medium">Quantity sold</th>
                      <th className="py-2 pr-3 text-right font-medium">Applied unit price</th>
                      <th className="py-2 text-right font-medium">Total amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.productLines.map((line) => (
                      <tr key={`${line.productId}-${line.unit}`}>
                        <td className="py-2 pr-3">
                          <p className="font-medium">{line.productName}</p>
                          {line.sku ? (
                            <p className="text-xs text-slate-500">{line.sku}</p>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {formatQuantityWithUnit(line.quantity, line.unit)}
                        </td>
                        <td className="py-2 pr-3 text-right text-slate-600">
                          {formatPhp(
                            (Number(line.totalAmount) /
                              Math.max(Number(line.quantity), 0.001)).toFixed(2)
                          )}
                        </td>
                        <td className="py-2 text-right font-semibold">
                          {formatPhp(line.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 font-semibold">
                      <td className="py-2 pr-3" colSpan={3}>
                        Total recorded sales
                      </td>
                      <td className="py-2 text-right">
                        {formatPhp(report.totalSales)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Notes */}
          {report.notes.length > 0 ? (
            <div className="card">
              <h3 className="text-sm font-semibold">Entry notes</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {report.notes.map((note) => (
                  <li key={note.id}>
                    <span className="text-xs text-slate-400">
                      {formatDateTimeInStoreTz(note.createdAt)} —
                    </span>{" "}
                    {note.notes}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Voided (informational only) */}
          <div className="card">
            <h3 className="text-sm font-semibold">Voided entries (not included in totals)</h3>
            {report.voidedBatches.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">None for this date.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {report.voidedBatches.map((batch) => (
                  <li key={batch.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <p>
                        Entry #{batch.id} —{" "}
                        <span className="text-slate-400 line-through">
                          {formatPhp(batch.totalAmount)}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {batch.voidReason ?? "No reason recorded"}
                        {batch.voidedBy ? ` · by ${batch.voidedBy}` : ""}
                        {batch.voidedAt
                          ? ` · ${formatDateTimeInStoreTz(batch.voidedAt)}`
                          : ""}
                      </p>
                    </div>
                    <Link
                      href={`/sales/${batch.id}`}
                      className="print-hidden text-xs font-medium text-sky-700 hover:underline"
                    >
                      View
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-xs text-slate-400">
            Generated {formatDateTimeInStoreTz(new Date())} · R Garage Auto
            Repair &amp; Motor Oil
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { qs } from "@/lib/api-client";
import { useCachedApi } from "@/lib/use-cached-api";
import { displayQuantity, formatPhp } from "@/lib/money";
import { addDays, formatDateLong, formatDateTimeInStoreTz } from "@/lib/dates";
import { InstallAppCard } from "./install-app";

/**
 * Dashboard (spec §4.2): sales cards for the selected date and today,
 * product activity, low/out-of-stock review, and recent entries.
 * Quantities are grouped by product with unit labels — never as one
 * unitless "items sold" number alone.
 */

interface DashboardData {
  selectedDate: string;
  today: string;
  selectedDateTotals: { date: string; totalSales: string; postedBatches: number };
  todayTotals: { date: string; totalSales: string; postedBatches: number };
  activeProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  productLines: Array<{
    productId: number;
    productName: string;
    sku: string | null;
    unit: string;
    quantity: string;
    totalAmount: string;
  }>;
  lowStockProducts: Array<{
    id: number;
    name: string;
    unit: string;
    stockOnHand: string;
    reorderLevel: string;
    stockStatus: "low_stock" | "out_of_stock";
  }>;
  recentBatches: Array<{
    id: number;
    saleDate: string;
    status: "posted" | "voided";
    totalAmount: string;
    createdAt: string;
  }>;
}

export function DashboardView({ today }: { today: string }) {
  const [selectedDate, setSelectedDate] = useState(today);
  const {
    data,
    loading,
    error,
    refresh,
  } = useCachedApi<DashboardData>(
    `/api/dashboard${qs({ date: selectedDate })}`
  );

  const isToday = selectedDate === today;

  return (
    <div className="space-y-5">
      {/* Date navigator */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
        <button
          type="button"
          aria-label="Previous day"
          className="btn-secondary !px-2.5"
          onClick={() => setSelectedDate((d) => addDays(d, -1))}
        >
          ◀
        </button>
        <input
          type="date"
          value={selectedDate}
          max={today}
          onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
          className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-sm text-white shadow-sm transition-all duration-200 hover:border-white/20"
          aria-label="Selected business date"
        />
        <button
          type="button"
          aria-label="Next day"
          className="btn-secondary !px-2.5"
          disabled={isToday}
          onClick={() => setSelectedDate((d) => addDays(d, 1))}
        >
          ▶
        </button>
        {!isToday ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setSelectedDate(today)}
          >
            Today
          </button>
        ) : (
          <span className="px-2 text-sm font-medium text-slate-400">Today</span>
        )}
        <span className="ml-1 hidden text-sm text-slate-400 sm:block">
          {formatDateLong(selectedDate)}
        </span>
        <Link href="/sales/new" className="btn-primary ml-auto max-sm:hidden">
          + Record Daily Sales
        </Link>
      </div>

      {error ? (
        <div className="card text-center">
          <p className="text-sm text-red-300">{error}</p>
          <button type="button" onClick={refresh} className="btn-secondary mt-3">
            Retry
          </button>
        </div>
      ) : loading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card h-24 animate-pulse bg-white/5" />
          ))}
        </div>
      ) : (
        <>
          {/* Install banner — hides itself once installed or dismissed */}
          <InstallAppCard />
          {/* Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              label={isToday ? "Sales today" : `Sales on ${formatDateLong(selectedDate)}`}
              value={formatPhp(data.selectedDateTotals.totalSales)}
              hint={`${data.selectedDateTotals.postedBatches} entr${
                data.selectedDateTotals.postedBatches === 1 ? "y" : "ies"
              } recorded`}
              primary
            />
            {!isToday ? (
              <StatCard
                label="Sales today"
                value={formatPhp(data.todayTotals.totalSales)}
                hint={`${data.todayTotals.postedBatches} entr${
                  data.todayTotals.postedBatches === 1 ? "y" : "ies"
                }`}
                delay={60}
              />
            ) : null}
            <StatCard
              label="Active products"
              value={String(data.activeProducts)}
              hint="Products currently on sale"
              delay={120}
            />
            <StatCard
              label="Low stock"
              value={String(data.lowStockCount)}
              hint="At or below reorder level"
              tone={data.lowStockCount > 0 ? "warn" : undefined}
              delay={180}
            />
            <StatCard
              label="Out of stock"
              value={String(data.outOfStockCount)}
              hint="Nothing left on the shelf"
              tone={data.outOfStockCount > 0 ? "danger" : undefined}
              delay={240}
            />
          </div>

          <div
            className="animate-fade-up grid gap-5 lg:grid-cols-3"
            style={{ animationDelay: "300ms" }}
          >
            {/* Sales by product */}
            <div className="card min-w-0 lg:col-span-2">
              <h2 className="text-sm font-semibold">
                Sales by product — {formatDateLong(selectedDate)}
              </h2>
              {data.productLines.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-slate-300">
                    No sales recorded for this day yet.
                  </p>
                  <Link href="/sales/new" className="btn-primary mt-3">
                    Record Daily Sales
                  </Link>
                </div>
              ) : (
                <>
                  {/* Phone: stacked lines so nothing overflows the screen */}
                  <ul className="mt-2 divide-y divide-white/5 md:hidden">
                    {data.productLines.map((line) => (
                      <li
                        key={`${line.productId}-${line.unit}`}
                        className="flex items-start justify-between gap-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {line.productName}
                          </p>
                          <p className="text-xs text-slate-400">
                            {displayQuantity(line.quantity)} {line.unit} ×{" "}
                            {formatPhp(
                              perUnitPrice(line.totalAmount, line.quantity)
                            )}
                            {line.sku ? ` · ${line.sku}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold">
                          {formatPhp(line.totalAmount)}
                        </span>
                      </li>
                    ))}
                    <li className="flex items-center justify-between border-t-2 border-white/15 py-2.5 text-sm font-semibold">
                      <span>Total</span>
                      <span>
                        {formatPhp(data.selectedDateTotals.totalSales)}
                      </span>
                    </li>
                  </ul>

                  {/* Tablet and up: full table */}
                  <div className="mt-3 hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[480px] text-left text-sm">
                      <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
                        <tr>
                          <th className="py-2 pr-3 font-medium">Product</th>
                          <th className="py-2 pr-3 text-right font-medium">Qty sold</th>
                          <th className="py-2 pr-3 text-right font-medium">Price</th>
                          <th className="py-2 text-right font-medium">Line total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {data.productLines.map((line) => (
                          <tr key={`${line.productId}-${line.unit}`}>
                            <td className="py-2 pr-3">
                              <p className="font-medium">{line.productName}</p>
                              {line.sku ? (
                                <p className="text-xs text-slate-400">{line.sku}</p>
                              ) : null}
                            </td>
                            <td className="py-2 pr-3 text-right">
                              {displayQuantity(line.quantity)} {line.unit}
                            </td>
                            <td className="py-2 pr-3 text-right text-slate-300">
                              {formatPhp(
                                // price per unit = line total / qty, display-only
                                perUnitPrice(line.totalAmount, line.quantity)
                              )}
                            </td>
                            <td className="py-2 text-right font-semibold">
                              {formatPhp(line.totalAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-white/15 font-semibold">
                          <td className="py-2 pr-3">Total</td>
                          <td />
                          <td />
                          <td className="py-2 text-right">
                            {formatPhp(data.selectedDateTotals.totalSales)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Low stock */}
            <div className="card min-w-0">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Low stock to review</h2>
                <Link
                  href="/inventory?stockStatus=low_stock"
                  className="text-xs font-medium text-brand-gold hover:underline"
                >
                  Open inventory
                </Link>
              </div>
              {data.lowStockProducts.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">
                  Nothing is low or out of stock. ✓
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-white/5">
                  {data.lowStockProducts.map((product) => (
                    <li
                      key={product.id}
                      className="flex items-center justify-between gap-2 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{product.name}</p>
                        <p className="text-xs text-slate-400">
                          reorder at {displayQuantity(product.reorderLevel)}{" "}
                          {product.unit}
                        </p>
                      </div>
                      {product.stockStatus === "out_of_stock" ? (
                        <span className="shrink-0 rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-300">
                          OUT
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-300">
                          {displayQuantity(product.stockOnHand)} left
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Recent entries */}
          <div
            className="animate-fade-up card"
            style={{ animationDelay: "360ms" }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recent sales entries</h2>
              <Link
                href="/sales"
                className="text-xs font-medium text-brand-gold hover:underline"
              >
                View all
              </Link>
            </div>
            {data.recentBatches.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">
                No entries yet. Your first saved entry will appear here.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-white/5">
                {data.recentBatches.map((batch) => (
                  <li
                    key={batch.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {formatDateLong(batch.saleDate)}
                        {batch.status === "voided" ? (
                          <span className="ml-2 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Voided
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-slate-400">
                        entered {formatDateTimeInStoreTz(batch.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={
                          batch.status === "voided"
                            ? "font-semibold text-slate-400 line-through"
                            : "font-semibold"
                        }
                      >
                        {formatPhp(batch.totalAmount)}
                      </span>
                      <Link
                        href={`/sales/${batch.id}`}
                        className="text-xs font-medium text-brand-gold hover:underline"
                      >
                        View
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  primary,
  tone,
  delay = 0,
}: {
  label: string;
  value: string;
  hint?: string;
  primary?: boolean;
  tone?: "warn" | "danger";
  delay?: number;
}) {
  return (
    <div
      className={`animate-fade-up card ${
        primary ? "border-brand-gold/25 bg-brand-gold/[0.10]" : ""
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <p
        className={`text-xs uppercase tracking-wide ${
          primary ? "text-brand-gold" : "text-slate-400"
        }`}
      >
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      {hint ? (
        <p
          className={`mt-1 text-xs ${
            primary
              ? "text-brand-gold/80"
              : tone === "danger"
                ? "text-red-400"
                : tone === "warn"
                  ? "text-amber-300"
                  : "text-slate-400"
          }`}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Display-only per-unit price from saved line figures. */
function perUnitPrice(totalAmount: string, quantity: string): string {
  const quantityNumber = Number(quantity);
  const totalNumber = Number(totalAmount);
  if (!Number.isFinite(quantityNumber) || quantityNumber <= 0) return "0.00";
  return (totalNumber / quantityNumber).toFixed(2);
}

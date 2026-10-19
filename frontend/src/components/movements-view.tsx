"use client";

import { useState } from "react";
import Link from "next/link";
import { qs } from "@/lib/api-client";
import { useCachedPagedApi } from "@/lib/use-cached-api";
import { displayQuantity } from "@/lib/money";
import { formatDateTimeInStoreTz } from "@/lib/dates";
import { EmptyState } from "./empty-state";
import { PaginationBar } from "./pagination-bar";

/**
 * Stock Movement History (spec §4.9): the audit ledger — why every
 * quantity changed, with before/after and the related sale entry.
 */

interface Movement {
  id: number;
  productId: number;
  productName: string;
  movementType: string;
  quantityDelta: string;
  stockBefore: string;
  stockAfter: string;
  referenceType: string | null;
  referenceId: number | null;
  note: string | null;
  createdBy: string;
  createdAt: string;
}

const MOVEMENT_LABELS: Record<string, string> = {
  opening: "Opening stock",
  sale: "Sale",
  stock_in: "Stock in",
  sale_void_reversal: "Sale voided",
  physical_count_correction: "Physical count",
};

export function MovementsView() {
  const [productId, setProductId] = useState("");
  const [movementType, setMovementType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const {
    data,
    loading,
    error,
    refresh,
  } = useCachedPagedApi<Movement>(
    `/api/stock-movements${qs({
      productId,
      movementType,
      from,
      to,
      page,
      pageSize: 25,
    })}`
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <div>
          <label htmlFor="mv-type" className="mb-1 block text-xs font-medium text-slate-400">
            Movement type
          </label>
          <select
            id="mv-type"
            value={movementType}
            onChange={(e) => {
              setMovementType(e.target.value);
              setPage(1);
            }}
            className="input"
          >
            <option value="">All types</option>
            <option value="opening">Opening stock</option>
            <option value="sale">Sale</option>
            <option value="stock_in">Stock in</option>
            <option value="sale_void_reversal">Sale voided</option>
            <option value="physical_count_correction">Physical count</option>
          </select>
        </div>
        <div>
          <label htmlFor="mv-product" className="mb-1 block text-xs font-medium text-slate-400">
            Product ID
          </label>
          <input
            id="mv-product"
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value.replace(/\D/g, ""));
              setPage(1);
            }}
            inputMode="numeric"
            placeholder="e.g. 12"
            className="input !w-28"
          />
        </div>
        <div>
          <label htmlFor="mv-from" className="mb-1 block text-xs font-medium text-slate-400">
            From
          </label>
          <input
            id="mv-from"
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
          <label htmlFor="mv-to" className="mb-1 block text-xs font-medium text-slate-400">
            To
          </label>
          <input
            id="mv-to"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="input"
          />
        </div>
        {productId || movementType || from || to ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setProductId("");
              setMovementType("");
              setFrom("");
              setTo("");
              setPage(1);
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="card animate-pulse space-y-3">
          {[0, 1, 2, 3].map((i) => (
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
          title="No movements found."
          description="Stock changes (sales, stock-in, corrections) will be listed here."
        />
      ) : (
        <>
          {/* Phone: stacked cards */}
          <ul className="space-y-3 md:hidden">
            {data.items.map((movement) => {
              const positive = !movement.quantityDelta.startsWith("-");
              return (
                <li key={movement.id} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/inventory/${movement.productId}/edit`}
                        className="font-medium hover:underline"
                      >
                        {movement.productName}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {formatDateTimeInStoreTz(movement.createdAt)} ·{" "}
                        {MOVEMENT_LABELS[movement.movementType] ??
                          movement.movementType}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 font-semibold ${
                        positive ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {positive ? "+" : ""}
                      {displayQuantity(movement.quantityDelta)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span>
                      Stock {displayQuantity(movement.stockBefore)} →{" "}
                      <span className="font-medium text-slate-200">
                        {displayQuantity(movement.stockAfter)}
                      </span>
                    </span>
                    <span>
                      {movement.note ??
                        (movement.movementType === "sale" ||
                        movement.movementType === "sale_void_reversal"
                          ? "Sales entry"
                          : "—")}
                      {movement.referenceType === "sale_batch" &&
                      movement.referenceId !== null ? (
                        <>
                          {" "}
                          <Link
                            href={`/sales/${movement.referenceId}`}
                            className="font-medium text-brand-gold hover:underline"
                          >
                            #{movement.referenceId}
                          </Link>
                        </>
                      ) : null}
                      {" · by "}
                      {movement.createdBy}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.035] md:block">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2.5 font-medium">When</th>
                  <th className="px-3 py-2.5 font-medium">Product</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 text-right font-medium">Change</th>
                  <th className="px-3 py-2.5 text-right font-medium">Before</th>
                  <th className="px-3 py-2.5 text-right font-medium">After</th>
                  <th className="px-3 py-2.5 font-medium">Reason / reference</th>
                  <th className="px-3 py-2.5 font-medium">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.items.map((movement) => {
                  const positive = !movement.quantityDelta.startsWith("-");
                  return (
                    <tr key={movement.id}>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-300">
                        {formatDateTimeInStoreTz(movement.createdAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/inventory/${movement.productId}/edit`}
                          className="font-medium hover:underline"
                        >
                          {movement.productName}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {MOVEMENT_LABELS[movement.movementType] ??
                          movement.movementType}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-semibold ${
                          positive ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {positive ? "+" : ""}
                        {displayQuantity(movement.quantityDelta)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-300">
                        {displayQuantity(movement.stockBefore)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-300">
                        {displayQuantity(movement.stockAfter)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-300">
                        {movement.note ??
                          (movement.movementType === "sale" ||
                          movement.movementType === "sale_void_reversal"
                            ? "Sales entry"
                            : "—")}
                        {movement.referenceType === "sale_batch" &&
                        movement.referenceId !== null ? (
                          <>
                            {" "}
                            <Link
                              href={`/sales/${movement.referenceId}`}
                              className="font-medium text-brand-gold hover:underline"
                            >
                              #{movement.referenceId}
                            </Link>
                          </>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-300">
                        {movement.createdBy}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <PaginationBar
            page={data.page}
            totalPages={data.totalPages}
            summary={`Page ${data.page} of ${data.totalPages} · ${data.total} movements`}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

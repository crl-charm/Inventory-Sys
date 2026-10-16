import type { StockStatus } from "@/types";

/**
 * Stock status badge: text label + shape, never color alone (spec §4.3).
 */
export function StockStatusBadge({
  status,
  stockOnHand,
}: {
  status: StockStatus;
  stockOnHand: string;
}) {
  if (status === "out_of_stock") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
        <span aria-hidden="true">✕</span> Out of stock
      </span>
    );
  }
  if (status === "low_stock") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
        <span aria-hidden="true">!</span> Low
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
      <span aria-hidden="true">✓</span> In stock
      <span className="sr-only"> ({stockOnHand})</span>
    </span>
  );
}

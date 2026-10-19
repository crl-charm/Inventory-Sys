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
      <span className="inline-flex items-center gap-1 rounded-full border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-300">
        <span aria-hidden="true">✕</span> Out of stock
      </span>
    );
  }
  if (status === "low_stock") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-300">
        <span aria-hidden="true">!</span> Low
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
      <span aria-hidden="true">✓</span> In stock
      <span className="sr-only"> ({stockOnHand})</span>
    </span>
  );
}

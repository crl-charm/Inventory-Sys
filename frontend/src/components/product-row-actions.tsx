"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { invalidateApiCache } from "@/lib/use-cached-api";
import { displayQuantity } from "@/lib/money";
import { formatDateTimeInStoreTz } from "@/lib/dates";
import { Modal } from "./modal";
import { StockActionDialogs, type StockDialogKind } from "./stock-action-dialogs";
import type { Product } from "@/types";

interface MovementSummary {
  id: number;
  movementType: string;
  quantityDelta: string;
  stockBefore: string;
  stockAfter: string;
  note: string | null;
  createdAt: string;
}

const MOVEMENT_LABELS: Record<string, string> = {
  opening: "Opening stock",
  sale: "Sale",
  stock_in: "Stock in",
  sale_void_reversal: "Sale voided (restored)",
  physical_count_correction: "Physical count",
};

/**
 * Product detail actions: Stock In, Physical Count, Deactivate/Activate,
 * plus the recent movement list. Deletion is intentionally impossible
 * (spec §3.9) — history must stay intact.
 */
export function ProductRowActions({
  product,
  recentMovements,
}: {
  product: Product;
  recentMovements: MovementSummary[];
}) {
  const router = useRouter();
  const [dialogKind, setDialogKind] = useState<StockDialogKind>(null);
  const [confirmToggle, setConfirmToggle] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function toggleActive() {
    setPending(true);
    setError(null);
    try {
      const action = product.isActive ? "deactivate" : "activate";
      await api.post(`/api/products/${product.id}/${action}`);
      setNotice(
        product.isActive
          ? "Product deactivated. It stays in reports and history."
          : "Product activated."
      );
      setConfirmToggle(false);
      invalidateApiCache();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {notice ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <div className="card">
        <h2 className="text-sm font-semibold">Stock actions</h2>
        <p className="mt-1 text-xs text-slate-400">
          Stock only changes through these actions or recorded sales.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setDialogKind("stock-in")}
          >
            Stock In (new delivery)
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setDialogKind("physical-count")}
          >
            Physical Count
          </button>
          <button
            type="button"
            className={product.isActive ? "btn-danger" : "btn-primary"}
            onClick={() => setConfirmToggle(true)}
          >
            {product.isActive ? "Deactivate product" : "Activate product"}
          </button>
        </div>
        {product.isActive && Number(product.stockOnHand) > 0 ? (
          <p className="mt-2 text-xs text-amber-300">
            Note: this product still has {displayQuantity(product.stockOnHand)}{" "}
            {product.unit} in stock. Deactivating hides it from sales entry but
            keeps the quantity.
          </p>
        ) : null}
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold">Recent stock movements</h2>
        {recentMovements.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">
            No movements recorded yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-white/5">
            {recentMovements.map((movement) => {
              const positive = !movement.quantityDelta.startsWith("-");
              return (
                <li
                  key={movement.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {MOVEMENT_LABELS[movement.movementType] ?? movement.movementType}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatDateTimeInStoreTz(movement.createdAt)}
                      {movement.note ? ` — ${movement.note}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={
                        positive
                          ? "font-semibold text-emerald-400"
                          : "font-semibold text-red-400"
                      }
                    >
                      {positive ? "+" : ""}
                      {displayQuantity(movement.quantityDelta)} {product.unit}
                    </p>
                    <p className="text-xs text-slate-400">
                      {displayQuantity(movement.stockBefore)} →{" "}
                      {displayQuantity(movement.stockAfter)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <StockActionDialogs
        product={product}
        kind={dialogKind}
        onClose={() => setDialogKind(null)}
        onDone={(message) => {
          setNotice(message);
          invalidateApiCache();
          router.refresh();
        }}
      />

      <Modal
        open={confirmToggle}
        title={product.isActive ? "Deactivate this product?" : "Activate this product?"}
        onClose={() => setConfirmToggle(false)}
      >
        <p className="text-sm text-slate-300">
          {product.isActive
            ? "Deactivated products are hidden from sales entry but stay in inventory (with an inactive label), reports, and stock history. You can reactivate any time."
            : "The product becomes available for sales entry and stock actions again."}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setConfirmToggle(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={product.isActive ? "btn-danger" : "btn-primary"}
            disabled={pending}
            onClick={toggleActive}
          >
            {pending
              ? "Saving…"
              : product.isActive
                ? "Yes, deactivate"
                : "Yes, activate"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

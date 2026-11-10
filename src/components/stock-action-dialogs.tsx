"use client";

import { useState } from "react";
import { api, ApiClientError } from "@/lib/api-client";
import { Modal } from "./modal";
import { displayQuantity, formatPhp } from "@/lib/money";
import type { Product } from "@/types";

/**
 * Row actions for stock corrections (spec §4.7):
 *  A. Stock In — quantity received, optional reason.
 *  B. Physical Count — counted quantity; the server computes the delta.
 * Both are transactional services behind the API; this is just the form.
 */

export type StockDialogKind = "stock-in" | "physical-count" | null;

export function StockActionDialogs({
  product,
  kind,
  onClose,
  onDone,
}: {
  product: Product;
  kind: StockDialogKind;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <>
      <StockInDialog
        product={product}
        open={kind === "stock-in"}
        onClose={onClose}
        onDone={onDone}
      />
      <PhysicalCountDialog
        product={product}
        open={kind === "physical-count"}
        onClose={onClose}
        onDone={onDone}
      />
    </>
  );
}

function StockInDialog({
  product,
  open,
  onClose,
  onDone,
}: {
  product: Product;
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await api.post<{
        productName: string;
        stockAfter: string;
        unit: string;
      }>("/api/stock-movements/stock-in", {
        productId: product.id,
        quantity: quantity.trim(),
        reason: reason.trim(),
      });
      onDone(
        `Stock In saved: ${result.productName} is now ${displayQuantity(result.stockAfter)} ${result.unit}.`
      );
      setQuantity("");
      setReason("");
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={open} title={`Stock In — ${product.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300">
          On hand: <strong>{displayQuantity(product.stockOnHand)}</strong>{" "}
          {product.unit} at {formatPhp(product.sellingPrice)}
        </p>
        <div>
          <label htmlFor={`si-qty-${product.id}`} className="mb-1 block text-sm font-medium">
            Quantity received <span className="text-red-400">*</span>
          </label>
          <input
            id={`si-qty-${product.id}`}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputMode="decimal"
            required
            className="input"
            placeholder="e.g. 12"
          />
        </div>
        <div>
          <label htmlFor={`si-reason-${product.id}`} className="mb-1 block text-sm font-medium">
            Reason / reference (optional)
          </label>
          <input
            id={`si-reason-${product.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            className="input"
            placeholder="e.g. New delivery"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-400">{error}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Saving…" : "Add stock"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PhysicalCountDialog({
  product,
  open,
  onClose,
  onDone,
}: {
  product: Product;
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await api.post<{
        productName: string;
        quantityDelta: string;
        stockAfter: string;
        unit: string;
      }>("/api/stock-movements/physical-count", {
        productId: product.id,
        physicalCount: counted.trim(),
        reason: reason.trim(),
      });
      const delta = displayQuantity(result.quantityDelta);
      const sign = delta.startsWith("-") ? "" : "+";
      onDone(
        `Physical count saved: ${result.productName} corrected by ${sign}${delta} ${result.unit}, now ${displayQuantity(result.stockAfter)}.`
      );
      setCounted("");
      setReason("");
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`Physical Count — ${product.name}`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300">
          System says <strong>{displayQuantity(product.stockOnHand)}</strong>{" "}
          {product.unit}. Count the shelf and enter the real number.
        </p>
        <div>
          <label htmlFor={`pc-qty-${product.id}`} className="mb-1 block text-sm font-medium">
            Counted quantity <span className="text-red-400">*</span>
          </label>
          <input
            id={`pc-qty-${product.id}`}
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            inputMode="decimal"
            required
            className="input"
            placeholder="e.g. 18"
          />
          <p className="mt-1 text-xs text-slate-400">
            Enter exactly what you counted. Zero is valid if nothing is left.
          </p>
        </div>
        <div>
          <label htmlFor={`pc-reason-${product.id}`} className="mb-1 block text-sm font-medium">
            Reason <span className="text-red-400">*</span>
          </label>
          <input
            id={`pc-reason-${product.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            maxLength={500}
            className="input"
            placeholder="e.g. Physical count correction"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-400">{error}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={pending} className="btn-danger">
            {pending ? "Saving…" : "Correct stock"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { Modal } from "./modal";

/**
 * Void entry (spec §4.6): requires a reason, restores stock exactly once,
 * excludes the batch from totals, and keeps the original record.
 */
export function CancelSaleButton({
  saleId,
  label = "Void entry",
  variant = "danger",
}: {
  saleId: number;
  label?: string;
  variant?: "danger" | "link";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.post(`/api/sales/${saleId}/void`, { reason: reason.trim() });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not void this entry."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {variant === "link" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-medium text-red-700 underline hover:text-red-800"
        >
          {label}
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="btn-danger">
          {label}
        </button>
      )}

      <Modal open={open} title="Void this sales entry?" onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-slate-600">
            This returns every quantity in the entry back to stock and removes
            it from sales totals. The original record stays visible for audit,
            and this cannot be undone. Create a corrected entry afterwards.
          </p>
          <div>
            <label htmlFor={`void-reason-${saleId}`} className="mb-1 block text-sm font-medium">
              Reason <span className="text-red-600">*</span>
            </label>
            <input
              id={`void-reason-${saleId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              maxLength={500}
              className="input"
              placeholder="e.g. Wrong quantities entered"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-red-600">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-danger"
              disabled={pending || reason.trim().length < 3}
            >
              {pending ? "Voiding…" : "Void entry and restore stock"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

"use client";

import { useEffect, useRef } from "react";

/**
 * Minimal accessible modal: Escape closes, backdrop click closes, focus is
 * moved into the dialog, body scroll is locked while open.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="animate-sheet-up relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl outline-none sm:max-w-md sm:animate-scale-in sm:rounded-2xl"
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden"
        />
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn-icon -mt-1 -mr-1 h-9 w-9"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-5 w-5"
            >
              <path d="M6 18 18 6M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
        {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

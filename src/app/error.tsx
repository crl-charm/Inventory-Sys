"use client";

import { useEffect } from "react";
import { Icon } from "@/components/icons";

/**
 * Root error boundary. Without it, any uncaught page error shows the
 * framework's bare "This page couldn't load" screen; the shop gets this
 * branded one instead, with two clear ways out.
 */
export default function Error({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // A full reload is deliberate. router.refresh() + reset() can re-render the
  // same failed server payload, which made the button look dead. The plain
  // "Go to dashboard" link always worked because it makes a fresh request.
  function retry() {
    window.location.reload();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-ink px-4 py-10">
      <div className="animate-fade-up w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.035] p-6 text-center shadow-[0_30px_70px_-30px_rgba(0,0,0,0.9)]">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold/15 text-brand-gold">
          <Icon name="alert" className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-white">
          This screen hit a problem
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Your saved data is safe. The server may be waking up after a quiet
          period — wait a few seconds and try again. If it keeps happening,
          close and reopen the app.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button type="button" onClick={retry} className="btn-gold w-full">
            Try again
          </button>
          <a
            href="/dashboard"
            className="flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-medium text-slate-400 transition-colors duration-200 hover:bg-white/5 hover:text-white"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    </main>
  );
}

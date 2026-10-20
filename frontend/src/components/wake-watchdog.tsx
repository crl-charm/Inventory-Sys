"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";

/**
 * The WakingUp fallback lives inside a suspended server boundary, so React
 * may not hydrate its own timers while the RSC request is still pending. This
 * watchdog sits outside that boundary: it hydrates with the shell, polls the
 * API's readiness, and reloads as soon as the app can actually load.
 *
 * It also offers a real way out after the normal 90 s retry budget instead of
 * leaving the phone on a spinner forever.
 */
const SLOW_WAKE_MS = 95_000;
const FIRST_POLL_MS = 5_000;
const MARKER_CHECK_MS = 2_000;
const MAX_POLL_MS = 30_000;

export function WakeWatchdog() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (document.querySelector("[data-waking]")) setStuck(true);
    }, SLOW_WAKE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!stuck) return;
    const interval = window.setInterval(() => {
      if (!document.querySelector("[data-waking]")) setStuck(false);
    }, MARKER_CHECK_MS);
    return () => window.clearInterval(interval);
  }, [stuck]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let delay = FIRST_POLL_MS;

    const tick = async () => {
      if (cancelled) return;

      // Do not poll (or keep the web awake) on normal screens.
      if (!document.querySelector("[data-waking]")) {
        delay = FIRST_POLL_MS;
        timer = window.setTimeout(tick, MARKER_CHECK_MS);
        return;
      }

      try {
        const response = await fetch("/api/wake", { cache: "no-store" });
        if (cancelled) return;
        if (response.ok) {
          const status = (await response.json()) as { ready?: boolean };
          if (status.ready) {
            window.location.reload();
            return;
          }
        }
      } catch {
        // The API is still unreachable; keep waiting.
      }

      if (cancelled) return;
      delay = Math.min(MAX_POLL_MS, delay + 5_000);
      timer = window.setTimeout(tick, delay);
    };

    timer = window.setTimeout(tick, FIRST_POLL_MS);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  if (!stuck) return null;

  return (
    <div
      role="alert"
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/95 px-4 py-10 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-brand-panel p-6 text-center shadow-[0_30px_70px_-30px_rgba(0,0,0,0.9)]">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold/15 text-brand-gold">
          <Icon name="alert" className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-white">
          The server is taking longer than usual
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          The shop server is still starting. Nothing you saved is lost. We&apos;ll
          open the app automatically when it&apos;s ready, or you can try again
          now.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-gold mt-6 w-full"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

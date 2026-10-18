"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "./brand-mark";

type LoginApiResult =
  | { success: true; data: { user: { id: number } } }
  | { success: false; error: { message: string } };

/**
 * Owner sign-in. Calls POST /api/auth/login; the session cookie is set by the
 * server. Error text never reveals whether a username exists. This screen is
 * the shop's front door: near-black, brass accents, one clear action.
 */
export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json()) as LoginApiResult;
      if (!response.ok || !payload.success) {
        setError(
          payload.success
            ? "Sign in failed. Try again."
            : payload.error.message
        );
        setPending(false);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError(
        "Cannot reach the app server. Is `npm run dev` still running?"
      );
      setPending(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-ink px-4 py-10">
      {/* Faint warm glow (shop lights) and a low sheen so black never looks flat. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-44 left-1/2 h-[24rem] w-[38rem] -translate-x-1/2 rounded-full bg-brand-gold/[0.08] blur-3xl" />
        <div className="absolute -bottom-44 left-1/2 h-80 w-[32rem] -translate-x-1/2 rounded-full bg-white/[0.05] blur-3xl" />
      </div>

      <div className="animate-fade-up relative w-full max-w-sm">
        <div className="mb-9 text-center">
          <div className="animate-scale-in mx-auto mb-5 w-fit">
            <BrandMark className="h-14 w-14 rounded-2xl text-xl shadow-lg shadow-black/60" />
          </div>
          <h1 className="text-xl font-semibold tracking-[0.22em] text-white">
            R GARAGE
          </h1>
          <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.3em] text-slate-400">
            Auto Repair &amp; Motor Oil
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <span
              aria-hidden="true"
              className="hidden h-px w-10 bg-gradient-to-r from-transparent to-brand-gold/70 sm:block"
            />
            <p className="max-w-[17rem] text-xs leading-relaxed text-slate-400">
              <span className="font-medium text-slate-200">R Garage</span> —
              keeping you moving, driving you forward.
            </p>
            <span
              aria-hidden="true"
              className="hidden h-px w-10 bg-gradient-to-l from-transparent to-brand-gold/70 sm:block"
            />
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.9)] backdrop-blur-sm"
        >
          <div className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="mb-1 block text-sm font-medium text-slate-300"
              >
                Username
              </label>
              <input
                id="username"
                name="username"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-dark"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium text-slate-300"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-dark"
              />
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="animate-scale-in mt-4 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={pending} className="btn-gold mt-6 w-full">
            {pending ? (
              <>
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-brand-ink/30 border-t-brand-ink"
                />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Single-owner sign-in. No public registration.
        </p>
      </div>
    </main>
  );
}

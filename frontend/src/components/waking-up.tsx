/**
 * Shown while the protected layout waits for the API to answer `/api/auth/me`.
 * On Render's free plan the API can take 30-60 s to wake; without this
 * fallback the browser would sit on a blank page until the retry budget ends.
 */
export function WakingUp() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-ink px-4 py-10">
      <div
        className="animate-fade-up w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.035] p-6 text-center shadow-[0_30px_70px_-30px_rgba(0,0,0,0.9)] motion-reduce:animate-none"
        style={{ animationDelay: "1s" }}
      >
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold/15">
          <span
            role="status"
            aria-label="Waking up the server"
            className="h-6 w-6 animate-spin rounded-full border-2 border-brand-gold/30 border-t-brand-gold"
          />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-white">
          Waking up the server
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          The shop server was resting after a quiet period. This usually takes
          under a minute — the page will open by itself. Please don&apos;t close
          the app.
        </p>
      </div>
    </main>
  );
}

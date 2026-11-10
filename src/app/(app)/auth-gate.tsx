import { redirect } from "next/navigation";
import { backendGet, isBackendUnavailable } from "@/lib/backend";
import { WakingUp } from "@/components/waking-up";
import { AppShell } from "@/components/app-shell";
import type { SessionUser } from "@/types";

/**
 * Async auth check, kept separate from the layout so the layout can render a
 * Suspense fallback while the API wakes up. The API verifies the session on
 * every write; this only decides whether the shell can be shown.
 *
 * If the API stays unreachable past the retry budget, return the waking screen
 * instead of throwing. A thrown server component becomes React error #441 and
 * can leave the streamed fallback on screen; returning normal content keeps
 * the watchdog and auto-recovery alive.
 */
export async function AuthGate({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let user: SessionUser | null = null;
  let unavailable = false;

  try {
    ({ user } = await backendGet<{ user: SessionUser }>("/api/auth/me"));
  } catch (error) {
    if (isBackendUnavailable(error)) unavailable = true;
    else throw error;
  }

  if (unavailable) return <WakingUp />;
  if (!user) redirect("/login");

  return <AppShell user={user}>{children}</AppShell>;
}

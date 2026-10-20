import { redirect } from "next/navigation";
import { backendGet } from "@/lib/backend";
import { AppShell } from "@/components/app-shell";
import type { SessionUser } from "@/types";

/**
 * Async auth check, kept separate from the layout so the layout can render a
 * Suspense fallback while the API wakes up. The API verifies the session on
 * every write; this only decides whether the shell can be shown.
 */
export async function AuthGate({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = await backendGet<{ user: SessionUser }>("/api/auth/me");
  if (!user) redirect("/login");

  return <AppShell user={user}>{children}</AppShell>;
}

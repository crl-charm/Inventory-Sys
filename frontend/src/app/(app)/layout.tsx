import { redirect } from "next/navigation";
import { backendGet } from "@/lib/backend";
import { AppShell } from "@/components/app-shell";
import type { SessionUser } from "@/types";

/**
 * Protected app layout: verifies the session via the API and renders the
 * navigation shell. Hiding nav links is not authorization — every write API
 * re-checks the session (spec §17).
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = await backendGet<{ user: SessionUser }>("/api/auth/me");
  if (!user) redirect("/login");

  return <AppShell user={user}>{children}</AppShell>;
}

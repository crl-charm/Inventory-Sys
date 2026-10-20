import { Suspense } from "react";
import { AuthGate } from "./auth-gate";
import { WakingUp } from "@/components/waking-up";

/**
 * Protected app layout. AuthGate is async, so it lives inside Suspense: while
 * the API wakes (Render free can take 30-60 s), the branded WakingUp screen is
 * streamed immediately instead of leaving the browser blank or showing the
 * error boundary. Hiding nav links is not authorization — every write API
 * re-checks the session (spec §17).
 */
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={<WakingUp />}>
      <AuthGate>{children}</AuthGate>
    </Suspense>
  );
}

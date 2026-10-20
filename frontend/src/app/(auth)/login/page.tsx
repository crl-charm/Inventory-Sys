import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { resolveBackendUrl } from "@/lib/backend-url";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Free-plan Render services sleep when idle. Showing the login page is the
 * moment we know someone is about to use the app, so send ONE fire-and-forget
 * request to wake the API while they type their password. Not polling: one
 * request per page view, never awaited, failures ignored.
 */
function wakeBackend(): void {
  try {
    const url = resolveBackendUrl();
    void fetch(`${url}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    }).catch(() => undefined);
  } catch {
    // misconfigured BACKEND_URL is reported by the proxy; the form still renders
  }
}

export default async function LoginPage() {
  const cookie = (await cookies()).toString();
  let signedIn = false;
  if (cookie) {
    try {
      const response = await fetch(`${resolveBackendUrl()}/api/auth/me`, {
        headers: { cookie },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000), // never let a sleeping API hang the login page
      });
      signedIn = response.ok;
    } catch {
      // show the form if the API is down or still waking up
    }
  } else {
    wakeBackend();
  }
  // redirect() works by throwing, so it must stay outside the try/catch.
  if (signedIn) redirect("/dashboard");
  return <LoginForm />;
}

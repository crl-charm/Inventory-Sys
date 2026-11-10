import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getSessionUser } from "@/lib/auth";
import { isDatabaseReady } from "@/lib/db";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Showing the login page is the moment we know someone is about to use the app,
 * so warm up the MySQL pool in the background while they type their password.
 */
function warmDatabase(): void {
  void isDatabaseReady().catch(() => undefined);
}

export default async function LoginPage() {
  const cookie = (await cookies()).toString();
  let signedIn = false;
  if (cookie) {
    try {
      const user = await getSessionUser(
        new Request("http://localhost/api/auth/me", { headers: { cookie } })
      );
      signedIn = Boolean(user);
    } catch {
      // show the form if the database is temporarily unavailable
    }
  } else {
    warmDatabase();
  }
  // redirect() works by throwing, so it must stay outside the try/catch.
  if (signedIn) redirect("/dashboard");
  return <LoginForm />;
}

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const cookie = (await cookies()).toString();
  if (cookie) {
    try {
      const response = await fetch(
        `${process.env.BACKEND_URL ?? "http://localhost:4000"}/api/auth/me`,
        { headers: { cookie }, cache: "no-store" }
      );
      if (response.ok) redirect("/dashboard");
    } catch {
      // show the form if the API is down
    }
  }
  return <LoginForm />;
}

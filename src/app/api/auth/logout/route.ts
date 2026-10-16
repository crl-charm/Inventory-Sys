import { ok, withApi } from "@/lib/api-response";
import { clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

/** POST /api/auth/logout — clears the session cookie. */
export const POST = withApi({ auth: "none" }, async () => {
  await clearSessionCookie();
  return ok(null, "Signed out.");
});

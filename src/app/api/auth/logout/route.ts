import { ok, withApi } from "@/lib/api-response";
import { sessionClearCookie } from "@/lib/auth";

/**
 * POST /api/auth/logout — clears the stateless JWT session cookie locally
 * without requiring database connectivity.
 */
export const POST = withApi({ auth: "none" }, async (request) => {
  const response = ok(null, "Signed out.");
  response.headers.set("Set-Cookie", sessionClearCookie(request));
  response.headers.set("Cache-Control", "no-store");
  return response;
});

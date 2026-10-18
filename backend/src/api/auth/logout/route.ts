import { ok, withApi } from "@/lib/api-response";
import { sessionClearCookie } from "@/lib/auth";

/** POST /api/auth/logout — clears the session cookie. */
export const POST = withApi({ auth: "none" }, async () => {
  const response = ok(null, "Signed out.");
  response.headers.append("Set-Cookie", sessionClearCookie());
  return response;
});

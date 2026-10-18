import { ok, parseJsonBody, withApi } from "@/lib/api-response";
import {
  assertLoginAllowed,
  clearFailedLogins,
  recordFailedLogin,
  sessionSetCookie,
  verifyCredentials,
} from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { loginSchema } from "@/lib/validation/auth";

/** POST /api/auth/login — sets the HttpOnly session cookie. */
export const POST = withApi({ auth: "none" }, async (request) => {
  const input = await parseJsonBody(request, loginSchema);
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

  assertLoginAllowed(input.username, ip);

  const user = await verifyCredentials(input.username, input.password);
  if (!user) {
    recordFailedLogin(input.username, ip);
    throw new AppError("UNAUTHENTICATED", 401, "Incorrect username or password.");
  }

  clearFailedLogins(input.username, ip);
  const response = ok({ user }, "Signed in.");
  response.headers.append("Set-Cookie", await sessionSetCookie(user));
  return response;
});

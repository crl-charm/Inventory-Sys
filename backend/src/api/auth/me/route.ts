import { ok, withApi } from "@/lib/api-response";
import { getSessionUser } from "@/lib/auth";
import { UnauthenticatedError } from "@/lib/errors";

/** GET /api/auth/me — current session user. */
export const GET = withApi({ auth: "none" }, async (request) => {
  const user = await getSessionUser(request);
  if (!user) throw new UnauthenticatedError();
  return ok({ user });
});

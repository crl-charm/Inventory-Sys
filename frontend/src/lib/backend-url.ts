/**
 * Single source of truth for the API address, used by the /api proxy,
 * server-side page loads and the login page.
 *
 * On Render (RENDER=true) a missing or localhost BACKEND_URL is a deployment
 * mistake, so it fails with an actionable message instead of silently calling
 * http://localhost:4000 (which then looks like "the server is down").
 * Everywhere else (the shop PC, `npm run dev`) the localhost default stays.
 */

export class BackendConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendConfigError";
  }
}

const LOCAL_DEFAULT = "http://localhost:4000";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

export function resolveBackendUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.BACKEND_URL?.trim();
  const onRender = env.RENDER === "true";

  if (!raw) {
    if (onRender) {
      throw new BackendConfigError(
        "BACKEND_URL is not set on this service. In Render → rgarage-web → Environment, set it to the API's public URL (https://<your-api>.onrender.com)."
      );
    }
    return LOCAL_DEFAULT;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BackendConfigError(
      "BACKEND_URL is not a valid URL. It must look like https://<your-api>.onrender.com."
    );
  }
  if (onRender && LOCAL_HOSTS.has(parsed.hostname)) {
    throw new BackendConfigError(
      "BACKEND_URL points at localhost, which cannot work on Render. Set it to the API's public https URL."
    );
  }
  return raw.replace(/\/+$/, "");
}

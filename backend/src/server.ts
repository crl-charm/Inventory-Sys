import "./load-env";
import "./startup-check";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { closePool, pingDatabase } from "./lib/db";
import { log, requestContext, serializeError } from "./lib/logger";
import * as authLogin from "./api/auth/login/route";
import * as authLogout from "./api/auth/logout/route";
import * as authMe from "./api/auth/me/route";
import * as categories from "./api/categories/route";
import * as dashboard from "./api/dashboard/route";
import * as products from "./api/products/route";
import * as productsLookup from "./api/products/lookup/route";
import * as productById from "./api/products/[id]/route";
import * as productActivate from "./api/products/[id]/activate/route";
import * as productDeactivate from "./api/products/[id]/deactivate/route";
import * as reportsDaily from "./api/reports/daily/route";
import * as sales from "./api/sales/route";
import * as salesDuplicate from "./api/sales/duplicate-check/route";
import * as saleById from "./api/sales/[id]/route";
import * as saleVoid from "./api/sales/[id]/void/route";
import * as movements from "./api/stock-movements/route";
import * as stockIn from "./api/stock-movements/stock-in/route";
import * as physicalCount from "./api/stock-movements/physical-count/route";

type Params = Record<string, string>;
type Handler = (request: Request, params: Params) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

function route(method: string, path: string, handler: Handler): Route {
  const keys: string[] = [];
  const pattern = new RegExp(
    "^" +
      path.replace(/:([A-Za-z]+)/g, (_, key: string) => {
        keys.push(key);
        return "([^/]+)";
      }) +
      "$"
  );
  return { method, pattern, keys, handler };
}

function bind<P extends Params>(
  fn: (request: Request, context: { params: P }) => Promise<Response>
): Handler {
  return (request, params) => fn(request, { params: params as P });
}

/**
 * Liveness (/health): "the process is up". No database access, so it is cheap
 * and keeps answering even while Aiven is down (Render must not restart a
 * healthy API just because the database is unreachable).
 *
 * Readiness (/ready): "this API can actually serve requests" = can it reach
 * MySQL. The answer is cached for 10 s and shared between concurrent callers,
 * so polling it can never flood the database. Nothing sensitive is returned.
 * Do NOT point Render's healthCheckPath at /ready (see docs).
 */
const READY_TTL_MS = 10_000;
let readyCheck: { at: number; result: Promise<boolean> } | null = null;

function isReady(): Promise<boolean> {
  const now = Date.now();
  if (!readyCheck || now - readyCheck.at > READY_TTL_MS) {
    readyCheck = { at: now, result: pingDatabase(3000) };
  }
  return readyCheck.result;
}

async function readiness(): Promise<Response> {
  const ready = await isReady();
  return ready
    ? Response.json({ status: "ready" })
    : Response.json(
        { status: "unavailable" },
        { status: 503, headers: { "retry-after": "5" } }
      );
}

const routes: Route[] = [
  route("GET", "/health", async () => new Response("ok")),
  route("GET", "/ready", () => readiness()),
  route("POST", "/api/auth/login", (req) => authLogin.POST(req)),
  route("POST", "/api/auth/logout", (req) => authLogout.POST(req)),
  route("GET", "/api/auth/me", (req) => authMe.GET(req)),
  route("GET", "/api/products/lookup", (req) => productsLookup.GET(req)),
  route("GET", "/api/products", (req) => products.GET(req)),
  route("POST", "/api/products", (req) => products.POST(req)),
  route("GET", "/api/products/:id", bind(productById.GET)),
  route("PATCH", "/api/products/:id", bind(productById.PATCH)),
  route("POST", "/api/products/:id/activate", bind(productActivate.POST)),
  route("POST", "/api/products/:id/deactivate", bind(productDeactivate.POST)),
  route("GET", "/api/sales/duplicate-check", (req) => salesDuplicate.GET(req)),
  route("GET", "/api/sales", (req) => sales.GET(req)),
  route("POST", "/api/sales", (req) => sales.POST(req)),
  route("GET", "/api/sales/:id", bind(saleById.GET)),
  route("POST", "/api/sales/:id/void", bind(saleVoid.POST)),
  route("GET", "/api/categories", (req) => categories.GET(req)),
  route("POST", "/api/categories", (req) => categories.POST(req)),
  route("GET", "/api/dashboard", (req) => dashboard.GET(req)),
  route("GET", "/api/reports/daily", (req) => reportsDaily.GET(req)),
  route("GET", "/api/stock-movements", (req) => movements.GET(req)),
  route("POST", "/api/stock-movements/stock-in", (req) => stockIn.POST(req)),
  route("POST", "/api/stock-movements/physical-count", (req) =>
    physicalCount.POST(req)
  ),
];

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
  const host = req.headers.host ?? "localhost";
  const url = `${proto}://${host}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  const method = req.method ?? "GET";
  const init: RequestInit & { duplex?: "half" } = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = new Uint8Array(await readBody(req));
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    headers[key] = value;
  });
  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  if (cookies.length > 0) headers["set-cookie"] = cookies;
  res.writeHead(response.status, headers);
  if (!response.body) {
    res.end();
    return;
  }
  const buf = Buffer.from(await response.arrayBuffer());
  res.end(buf);
}

function matchRoute(method: string, pathname: string): { route: Route; params: Params } | null {
  for (const candidate of routes) {
    if (candidate.method !== method) continue;
    const match = candidate.pattern.exec(pathname);
    if (!match) continue;
    const params: Params = {};
    candidate.keys.forEach((key, i) => {
      params[key] = match[i + 1] ?? "";
    });
    return { route: candidate, params };
  }
  return null;
}

const port = Number(process.env.PORT ?? 4000);
// LAN-only by default: the Next.js frontend proxies every /api call from
// localhost, so nothing else needs to reach the API over the network. When
// deploying to a public host (Render), set HOST=0.0.0.0 there.
const host = process.env.HOST ?? "127.0.0.1";

function pickRequestId(req: IncomingMessage): string {
  const incoming = req.headers["x-request-id"];
  const value = Array.isArray(incoming) ? incoming[0] : incoming;
  return value && /^[A-Za-z0-9._-]{8,64}$/.test(value) ? value : randomUUID();
}

const SLOW_REQUEST_MS = 3000;

const server = createServer((req, res) => {
  const requestId = pickRequestId(req);
  res.setHeader("x-request-id", requestId);
  const startedAt = performance.now();

  void requestContext.run({ requestId }, async () => {
    let status = 500;
    let path = "/";
    try {
      const request = await toRequest(req);
      const url = new URL(request.url);
      path = url.pathname; // path only: query strings can hold search terms
      const found = matchRoute(request.method, url.pathname);
      if (!found) {
        const notFound = Response.json(
          { success: false, error: { code: "NOT_FOUND", message: "Not found." } },
          { status: 404 }
        );
        status = notFound.status;
        await writeResponse(res, notFound);
        return;
      }
      const response = await found.route.handler(request, found.params);
      status = response.status;
      await writeResponse(res, response);
    } catch (error) {
      status = 500;
      log("error", "server_error", { error: serializeError(error) });
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
          })
        );
      }
    } finally {
      const durationMs = Math.round(performance.now() - startedAt);
      const isProbe = path === "/health" || path === "/ready";
      // 503 = "dependency unavailable" (already logged with detail) → warn.
      const level =
        status >= 500 && status !== 503
          ? "error"
          : status === 503 || durationMs > SLOW_REQUEST_MS
            ? "warn"
            : isProbe
              ? "debug"
              : "info";
      log(level, "request", { method: req.method, path, status, durationMs });
    }
  });
});

// Render's load balancer reuses idle connections for longer than Node's
// default 5 s keep-alive. If Node closes first, the proxy occasionally sends a
// request on a socket that is already closing and the user sees a 502.
// Keep Node's timeouts above the proxy's.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.listen(port, host, () => {
  log("info", "server_started", {
    host,
    port,
    nodeEnv: process.env.NODE_ENV ?? "development",
  });
  // Non-blocking warm-up: opens the first pooled connection and records
  // whether the database is reachable. Startup never waits for it.
  void pingDatabase(5000).then((ok) =>
    log(ok ? "info" : "warn", "startup_db_check", { reachable: ok })
  );
});

// --- Shutdown: Render sends SIGTERM on deploy / restart ----------------------
let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", "shutdown_started", { signal });
  const force = setTimeout(() => {
    log("error", "shutdown_forced");
    process.exit(1);
  }, 10_000);
  force.unref();
  server.close(() => {
    closePool()
      .catch((error: unknown) =>
        log("warn", "shutdown_pool_error", { error: serializeError(error) })
      )
      .finally(() => {
        log("info", "shutdown_complete");
        process.exit(0);
      });
  });
  server.closeIdleConnections();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  log("error", "unhandled_rejection", { error: serializeError(reason) });
});
process.on("uncaughtException", (error) => {
  log("error", "uncaught_exception", { error: serializeError(error) });
  process.exit(1);
});

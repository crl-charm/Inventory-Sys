import "./load-env";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
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

const routes: Route[] = [
  route("GET", "/health", async () => new Response("ok")),
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

const server = createServer((req, res) => {
  void (async () => {
    try {
      const request = await toRequest(req);
      const url = new URL(request.url);
      const found = matchRoute(request.method, url.pathname);
      if (!found) {
        await writeResponse(
          res,
          Response.json(
            { success: false, error: { code: "NOT_FOUND", message: "Not found." } },
            { status: 404 }
          )
        );
        return;
      }
      const response = await found.route.handler(request, found.params);
      await writeResponse(res, response);
    } catch (error) {
      console.error("[api] server error:", error);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
          })
        );
      }
    }
  })();
});

server.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

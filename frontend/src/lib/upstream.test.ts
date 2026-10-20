import { describe, expect, it } from "vitest";
import { resolveBackendUrl, BackendConfigError } from "./backend-url";
import { isReplaySafe } from "./upstream";

const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer;

describe("isReplaySafe", () => {
  it("allows reads, login and logout", () => {
    expect(isReplaySafe("GET", "/api/products")).toBe(true);
    expect(isReplaySafe("POST", "/api/auth/login", json({}))).toBe(true);
    expect(isReplaySafe("POST", "/api/auth/logout")).toBe(true);
  });

  it("allows a sale only when it carries an idempotency key", () => {
    expect(isReplaySafe("POST", "/api/sales", json({ requestId: "7d0f2c0e-0000-4000-8000-000000000000", items: [] }))).toBe(true);
    expect(isReplaySafe("POST", "/api/sales", json({ items: [] }))).toBe(false);
    expect(isReplaySafe("POST", "/api/sales", new TextEncoder().encode("not json").buffer as ArrayBuffer)).toBe(false);
  });

  it("never allows inventory-changing or destructive writes", () => {
    for (const [method, path] of [
      ["POST", "/api/stock-movements/stock-in"],
      ["POST", "/api/stock-movements/physical-count"],
      ["POST", "/api/sales/12/void"],
      ["POST", "/api/products"],
      ["PATCH", "/api/products/3"],
      ["POST", "/api/products/3/deactivate"],
      ["POST", "/api/categories"],
      ["DELETE", "/api/products/3"],
      ["PUT", "/api/products/3"],
    ] as const) {
      expect(isReplaySafe(method, path, json({ requestId: "abc" })), `${method} ${path}`).toBe(false);
    }
  });
});

describe("resolveBackendUrl", () => {
  it("keeps the localhost default for local use", () => {
    expect(resolveBackendUrl({})).toBe("http://localhost:4000");
    expect(resolveBackendUrl({ BACKEND_URL: "http://localhost:4000/" })).toBe("http://localhost:4000");
  });
  it("uses the configured URL and trims a trailing slash", () => {
    expect(resolveBackendUrl({ RENDER: "true", BACKEND_URL: "https://rgarage-api.onrender.com/" })).toBe(
      "https://rgarage-api.onrender.com"
    );
  });
  it("on Render, a missing, invalid or localhost URL is an actionable error", () => {
    expect(() => resolveBackendUrl({ RENDER: "true" })).toThrow(BackendConfigError);
    expect(() => resolveBackendUrl({ RENDER: "true", BACKEND_URL: "not a url" })).toThrow(/valid URL/);
    expect(() => resolveBackendUrl({ RENDER: "true", BACKEND_URL: "http://localhost:4000" })).toThrow(/localhost/);
  });
});

import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("clears the session locally when the backend is unreachable", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetchMock);
  const response = await POST(new Request("https://web.test/api/auth/logout", {
    method: "POST", headers: { origin: "https://web.test" },
  }));
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toMatch(/hi_session=;.*HttpOnly;.*Path=\/;.*Max-Age=0; Secure/);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("rejects missing and cross-site origins", async () => {
  for (const headers of [new Headers(), new Headers({ origin: "https://other.test" })]) {
    const response = await POST(new Request("https://web.test/api/auth/logout", { method: "POST", headers }));
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  }
});

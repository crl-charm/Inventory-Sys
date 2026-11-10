// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { api } from "./api-client";
import { invalidateApiCache, useCachedApi } from "./use-cached-api";

it("refetches a mounted view after a matching cache invalidation", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  invalidateApiCache();
  const get = vi.spyOn(api, "get").mockResolvedValueOnce("old stock").mockResolvedValueOnce("new stock");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  function View() {
    const { data, loading } = useCachedApi<string>("/api/products");
    return createElement("p", null, loading ? "Loading" : data);
  }
  try {
    await act(async () => root.render(createElement(View)));
    expect(container.textContent).toBe("old stock");
    await act(async () => invalidateApiCache("/api/products"));
    expect(container.textContent).toBe("new stock");
    expect(get).toHaveBeenCalledTimes(2);
  } finally {
    act(() => root.unmount());
    container.remove();
    get.mockRestore();
    invalidateApiCache();
  }
});

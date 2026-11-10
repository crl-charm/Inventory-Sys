// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api-client";
import { invalidateApiCache } from "@/lib/use-cached-api";
import { DailyReportView } from "./daily-report-view";
import { InventoryTable } from "./inventory-table";
import { MovementsView } from "./movements-view";
import { ProductForm } from "./product-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  invalidateApiCache();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  invalidateApiCache();
});

it("InventoryTable honors initialStockStatus and initialNotice from query params", async () => {
  const requestedPaths: string[] = [];
  vi.spyOn(api, "getPaginated").mockImplementation(async (path: string) => {
    requestedPaths.push(path);
    return { items: [], page: 1, pageSize: 100, total: 0, totalPages: 1 };
  });
  vi.spyOn(api, "get").mockResolvedValue([]);

  await act(async () => {
    root.render(
      createElement(InventoryTable, {
        initialStockStatus: "low_stock",
        initialNotice: "Product updated.",
      })
    );
  });

  expect(requestedPaths.some((p) => p.includes("stockStatus=low_stock"))).toBe(true);
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Product updated.");
  expect(container.querySelector<HTMLSelectElement>("#inv-stock")?.value).toBe("low_stock");
});

it("MovementsView honors initialProductId and renders a product selector", async () => {
  const requestedPaths: string[] = [];
  vi.spyOn(api, "getPaginated").mockImplementation(async (path: string) => {
    requestedPaths.push(path);
    if (path.startsWith("/api/products")) {
      return {
        items: [
          {
            id: 42,
            sku: "OIL-1L",
            name: "Engine Oil 1L",
            categoryId: 1,
            categoryName: "Engine Oil & Fluids",
            brand: "Shell",
            variant: null,
            unit: "bottle",
            sellingPrice: "350.00",
            stockOnHand: "10.000",
            reorderLevel: "3.000",
            isActive: true,
            stockStatus: "in_stock",
          },
        ],
        page: 1,
        pageSize: 100,
        total: 1,
        totalPages: 1,
      };
    }
    return { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 };
  });

  await act(async () => {
    root.render(createElement(MovementsView, { initialProductId: "42" }));
  });

  expect(requestedPaths.some((p) => p.includes("/api/stock-movements") && p.includes("productId=42"))).toBe(true);
  const select = container.querySelector<HTMLSelectElement>("#mv-product")!;
  expect(select.tagName).toBe("SELECT");
  expect(select.value).toBe("42");
  expect(select.textContent).toContain("Engine Oil 1L (OIL-1L)");
});

it("ProductForm links labels to controls and Enter in new-category input creates the category without submitting the form", async () => {
  vi.spyOn(api, "get").mockResolvedValue([
    { id: 1, name: "Hardware", isActive: true, productCount: 2 },
  ]);
  const postSpy = vi.spyOn(api, "post").mockResolvedValue({
    id: 9,
    name: "Lubricants",
    isActive: true,
    productCount: 0,
  });

  await act(async () => {
    root.render(createElement(ProductForm, { mode: "create" }));
  });

  // Every label with htmlFor points to a real control id in the form
  const labels = Array.from(container.querySelectorAll<HTMLLabelElement>("label[for]"));
  expect(labels.length).toBeGreaterThanOrEqual(8);
  for (const label of labels) {
    const targetId = label.getAttribute("for")!;
    expect(container.querySelector(`#${targetId}`)).not.toBeNull();
  }

  // Open "+ Add a category" and press Enter in the category input
  const addCategoryToggle = Array.from(container.querySelectorAll("button")).find((btn) =>
    btn.textContent?.includes("+ Add a category")
  )!;
  await act(async () => {
    addCategoryToggle.click();
  });

  const newCatInput = container.querySelector<HTMLInputElement>('input[aria-label="New category name"]')!;
  await act(async () => {
    setInputValue(newCatInput, "Lubricants");
  });
  await act(async () => {
    newCatInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });

  expect(postSpy).toHaveBeenCalledOnce();
  expect(postSpy).toHaveBeenCalledWith("/api/categories", { name: "Lubricants" });
  expect(container.querySelector<HTMLSelectElement>("#prod-category")?.value).toBe("9");
});

it("DailyReportView displays each distinct finalUnitPrice instead of a blended average", async () => {
  vi.spyOn(api, "get").mockResolvedValue({
    date: "2026-11-10",
    totalSales: "1020.00",
    postedBatches: 1,
    productLines: [
      {
        productId: 101,
        productName: "Engine Oil 1L",
        sku: "OIL-1L",
        unit: "bottle",
        finalUnitPrice: "350.00",
        quantity: "2.000",
        totalAmount: "700.00",
      },
      {
        productId: 101,
        productName: "Engine Oil 1L",
        sku: "OIL-1L",
        unit: "bottle",
        finalUnitPrice: "320.00",
        quantity: "1.000",
        totalAmount: "320.00",
      },
    ],
    voidedBatches: [],
    notes: [],
  });

  await act(async () => {
    root.render(createElement(DailyReportView, { today: "2026-11-10" }));
  });

  const rows = container.querySelectorAll("tbody tr");
  expect(rows.length).toBe(2);
  expect(rows[0]?.textContent).toContain("₱350.00");
  expect(rows[0]?.textContent).toContain("₱700.00");
  expect(rows[1]?.textContent).toContain("₱320.00");
  expect(container.textContent).not.toContain("₱340.00");
});


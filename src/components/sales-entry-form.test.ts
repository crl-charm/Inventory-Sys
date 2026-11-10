// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api-client";
import { invalidateApiCache } from "@/lib/use-cached-api";
import type { Product } from "@/types";
import { SalesEntryForm } from "./sales-entry-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const sampleOil: Product = {
  id: 101,
  sku: "OIL-1L",
  name: "Engine Oil 1L",
  categoryId: 1,
  categoryName: "Engine Oil & Fluids",
  brand: "Shell",
  variant: "10W-40",
  unit: "bottle",
  sellingPrice: "350.00",
  stockOnHand: "5.000",
  reorderLevel: "2.000",
  isActive: true,
  stockStatus: "in_stock",
};

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

it("supports multiple price lines for the same product and sums stock checks across lines", async () => {
  vi.spyOn(api, "get").mockImplementation(async (path: string) => {
    if (path.startsWith("/api/products/lookup")) return [sampleOil];
    if (path.startsWith("/api/sales/duplicate-check")) return { hasPostedEntries: false };
    throw new Error(`Unexpected GET ${path}`);
  });
  const postSpy = vi.spyOn(api, "post").mockResolvedValue({
    replayed: false,
    sale: {
      id: 77,
      saleDate: "2026-11-08",
      totalAmount: "1690.00",
      items: [{ quantity: "3.000" }, { quantity: "2.000" }],
    },
  });

  await act(async () => {
    root.render(createElement(SalesEntryForm, { today: "2026-11-08" }));
  });

  const picker = container.querySelector<HTMLInputElement>("#product-picker")!;

  // Add first line via picker
  await act(async () => {
    picker.click();
  });
  const firstOption = container.querySelector<HTMLButtonElement>('#product-picker-list button')!;
  expect(firstOption.textContent).toContain("Engine Oil 1L");
  expect(firstOption.textContent).not.toContain("In list");
  await act(async () => {
    firstOption.click();
  });

  // Open picker again: same product stays selectable with "In list" badge
  await act(async () => {
    picker.click();
  });
  const secondOption = container.querySelector<HTMLButtonElement>('#product-picker-list button')!;
  expect(secondOption.textContent).toContain("In list");
  await act(async () => {
    secondOption.click();
  });

  // Ensure all DOM element IDs remain unique when the same product appears twice
  const ids = Array.from(container.querySelectorAll("[id]")).map((el) => el.id);
  expect(new Set(ids).size).toBe(ids.length);

  const desktopRows = container.querySelectorAll("tbody tr");
  expect(desktopRows.length).toBe(2);

  const qtyInputs = container.querySelectorAll<HTMLInputElement>(
    'tbody input[aria-label="Quantity sold for Engine Oil 1L"]'
  );
  const priceInputs = container.querySelectorAll<HTMLInputElement>(
    'tbody input[aria-label="Final price for Engine Oil 1L"]'
  );
  expect(qtyInputs.length).toBe(2);
  expect(priceInputs.length).toBe(2);

  // Set quantities to 3 + 3 = 6 against 5.000 stockOnHand -> combined warning appears
  await act(async () => {
    setInputValue(qtyInputs[0]!, "3");
    setInputValue(qtyInputs[1]!, "3");
  });
  expect(container.textContent).toContain("6 across 2 lines — only 5 in stock");

  // Adjust second line to 2 (3 + 2 = 5 <= 5) and set discounted price 320.00
  await act(async () => {
    setInputValue(qtyInputs[1]!, "2");
    setInputValue(priceInputs[1]!, "320.00");
  });
  expect(container.textContent).not.toContain("across 2 lines");

  // Save batch and verify payload carries both price lines
  const saveBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
    btn.textContent?.includes("Save Sales")
  )!;
  await act(async () => {
    saveBtn.click();
  });

  expect(postSpy).toHaveBeenCalledOnce();
  expect(postSpy).toHaveBeenCalledWith(
    "/api/sales",
    expect.objectContaining({
      saleDate: "2026-11-08",
      items: [
        { productId: 101, quantity: "3", finalUnitPrice: "350.00" },
        { productId: 101, quantity: "2", finalUnitPrice: "320.00" },
      ],
    })
  );
});

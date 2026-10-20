"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiClientError, qs } from "@/lib/api-client";
import { invalidateApiCache, useCachedApi } from "@/lib/use-cached-api";
import {
  centavosToMoneyString,
  compareQuantities,
  computeLineTotalCentavos,
  displayQuantity,
  formatPhp,
  normalizeMoneyInput,
  normalizeQuantityInput,
} from "@/lib/money";
import { formatDateLong } from "@/lib/dates";
import { newRequestId } from "@/lib/request-id";
import { Icon } from "./icons";
import type { Product } from "@/types";

/**
 * Record Daily Sales (spec §4.5) — the primary workflow.
 *
 * - The list of active products loads once (local now has the whole catalog);
 *   selection then filters instantly.
 * - Line totals and batch total are UI previews; the server recalculates
 *   everything and is the only authority.
 * - One requestId per form session: retries and double-clicks cannot
 *   double-deduct stock.
 */

interface Line {
  product: Product;
  quantity: string;
  finalUnitPrice: string;
}

interface ShortageInfo {
  productId: number;
  productName: string;
  requested: string;
  available: string;
  unit: string;
}

interface SuccessInfo {
  saleId: number;
  saleDate: string;
  totalAmount: string;
  totalLines: number;
  totalQuantity: number;
}

export function SalesEntryForm({ today }: { today: string }) {
  const router = useRouter();

  const [saleDate, setSaleDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const [dateHasEntries, setDateHasEntries] = useState(false);
  const [shortages, setShortages] = useState<ShortageInfo[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // One idempotency key per form session, regenerated after each save.
  // useState's lazy initializer keeps generation out of render and works on
  // plain-http LAN origins too (see newRequestId).
  const [requestId, setRequestId] = useState(newRequestId);
  const pickerInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const suppressPickerOpenRef = useRef(false);

  const {
    data: productsData,
    loading: loadingProducts,
    error: productsError,
    refresh: refreshProducts,
  } = useCachedApi<Product[]>(
    `/api/products${qs({ active: "active", pageSize: 200, sort: "name", order: "asc" })}`
  );
  const products = useMemo(() => productsData ?? [], [productsData]);

  // Warn when the selected date already has posted entries (spec §4.5).
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ hasPostedEntries: boolean }>(
        `/api/sales/duplicate-check${qs({ date: saleDate })}`
      )
      .then((result) => {
        if (!cancelled) setDateHasEntries(result.hasPostedEntries);
      })
      .catch(() => {
        /* warning is informational; ignore transient failures */
      });
    return () => {
      cancelled = true;
    };
  }, [saleDate]);

  // Close the product picker when tapping anywhere outside it. Without this,
  // the list stayed open on phones and covered the product cards below.
  useEffect(() => {
    if (!pickerOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [pickerOpen]);

  const filteredProducts = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();
    const selectedIds = new Set(lines.map((line) => line.product.id));
    return products.filter((product) => {
      if (selectedIds.has(product.id)) return false;
      if (!query) return true;
      const haystack = [product.name, product.sku, product.brand, product.variant]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [products, pickerQuery, lines]);

  const totals = useMemo(() => {
    let centavos = 0n;
    let quantity = 0;
    let hasInvalidLine = false;
    for (const line of lines) {
      const quantityNormalized = normalizeQuantityInput(line.quantity);
      const priceNormalized = normalizeMoneyInput(line.finalUnitPrice);
      if (!quantityNormalized || !priceNormalized) {
        hasInvalidLine = true;
        continue;
      }
      centavos += computeLineTotalCentavos(quantityNormalized, priceNormalized);
      quantity += Number(quantityNormalized) || 0;
    }
    return {
      totalCentavos: centavos,
      quantity,
      count: lines.length,
      hasInvalidLine,
    };
  }, [lines]);

  function addProduct(product: Product) {
    setLines((prev) => [
      ...prev,
      // Final price starts at the catalog Base Price for every new line.
      { product, quantity: "1", finalUnitPrice: product.sellingPrice },
    ]);
    setPickerQuery("");
    setPickerOpen(false);
    setShortages([]);
    // Return focus for fast keyboard entry, but suppress the focus handler so
    // it does not immediately reopen the list over the line we just added.
    suppressPickerOpenRef.current = true;
    requestAnimationFrame(() => {
      pickerInputRef.current?.focus();
      suppressPickerOpenRef.current = false;
    });
  }

  function updateLine(index: number, patch: Partial<Pick<Line, "quantity" | "finalUnitPrice">>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
    setShortages([]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
    setShortages([]);
  }

  function resetForm(nextDate: string = today) {
    setLines([]);
    setNotes("");
    setSaleDate(nextDate);
    setPickerQuery("");
    setShortages([]);
    setFormError(null);
    setSuccess(null);
    setRequestId(newRequestId()); // new key after a successful save
  }

  async function handleSave() {
    setFormError(null);
    setShortages([]);

    if (lines.length === 0) {
      setFormError("Add at least one product line before saving.");
      return;
    }
    for (const [index, line] of lines.entries()) {
      const quantity = normalizeQuantityInput(line.quantity);
      if (!quantity) {
        setFormError(`Line ${index + 1}: enter a quantity like 3 or 1.5.`);
        return;
      }
      const price = normalizeMoneyInput(line.finalUnitPrice);
      if (!price) {
        setFormError(
          `Line ${index + 1}: enter a valid final price (e.g. 350 or 350.50, up to 2 decimals).`
        );
        return;
      }
    }

    setPending(true);
    try {
      const payload = {
        saleDate,
        notes: notes.trim() === "" ? undefined : notes.trim(),
        requestId,
        items: lines.map((line) => ({
          productId: line.product.id,
          quantity: normalizeQuantityInput(line.quantity)!,
          finalUnitPrice: normalizeMoneyInput(line.finalUnitPrice)!,
        })),
      };
      const result = await api.post<{
        replayed: boolean;
        sale: {
          id: number;
          saleDate: string;
          totalAmount: string;
          items: Array<{ quantity: string }>;
        };
      }>("/api/sales", payload);

      const totalQuantity = result.sale.items.reduce(
        (sum, item) => sum + (Number(item.quantity) || 0),
        0
      );
      setSuccess({
        saleId: result.sale.id,
        saleDate: result.sale.saleDate,
        totalAmount: result.sale.totalAmount,
        totalLines: result.sale.items.length,
        totalQuantity,
      });
      setSuccessMessage(
        result.replayed
          ? "This entry was already saved earlier — nothing was deducted twice."
          : "Sales saved. Stock updated."
      );
      // Keep this form's picker fresh and let every other screen refetch.
      refreshProducts();
      invalidateApiCache("/api/dashboard");
      invalidateApiCache("/api/sales");
      invalidateApiCache("/api/reports/daily");
      invalidateApiCache("/api/stock-movements");
      setDateHasEntries(true);
    } catch (error) {
      if (error instanceof ApiClientError) {
        const details = error.details as { shortages?: ShortageInfo[] } | undefined;
        if (error.code === "INSUFFICIENT_STOCK" && details?.shortages) {
          setShortages(details.shortages);
          setFormError(
            "Not enough stock — nothing was saved. Adjust the highlighted quantities and try again."
          );
          // Refresh stock numbers so the form shows current availability.
          refreshProducts();
        } else {
          setFormError(error.message);
        }
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setPending(false);
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="card text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-2xl text-emerald-300">
            ✓
          </div>
          <h2 className="mt-3 text-lg font-semibold">Saved</h2>
          <p className="mt-1 text-sm text-slate-300">
            {formatDateLong(success.saleDate)} · {success.totalLines}{" "}
            {success.totalLines === 1 ? "product" : "products"} ·{" "}
            {displayQuantity(String(success.totalQuantity))} total quantity
          </p>
          <p className="mt-2 text-2xl font-bold text-white">
            {formatPhp(success.totalAmount)}
          </p>
          {successMessage ? (
            <p className="mt-2 text-xs text-slate-400">{successMessage}</p>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => resetForm()}
            >
              Record another entry
            </button>
            <Link
              href={`/sales/${success.saleId}`}
              className="btn-secondary"
              onClick={() => router.refresh()}
            >
              View entry
            </Link>
            <Link href="/dashboard" className="btn-secondary">
              View dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Date + notes */}
      <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:grid-cols-3">
        <div>
          <label htmlFor="sale-date" className="mb-1 block text-sm font-medium text-slate-200">
            Business date <span className="text-red-400">*</span>
          </label>
          <input
            id="sale-date"
            type="date"
            value={saleDate}
            max={today}
            onChange={(e) => setSaleDate(e.target.value)}
            className="input"
          />
          <p className="mt-1 text-xs text-slate-400">
            The day these sales happened — reports use this date.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="sale-notes" className="mb-1 block text-sm font-medium text-slate-200">
            Notes (optional)
          </label>
          <input
            id="sale-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            className="input"
            placeholder="e.g. Notebook total checked by owner"
          />
        </div>
      </div>

      {saleDate !== today ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          You are recording sales for <strong>{formatDateLong(saleDate)}</strong>.
          Saving deducts these quantities from the <em>current</em> stock today.
        </p>
      ) : null}
      {dateHasEntries ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Sales have already been recorded for this date. Confirm this is an
          additional entry before saving.
        </p>
      ) : null}

      {/* Product picker */}
      <div
        ref={pickerRef}
        className="relative rounded-2xl border border-white/10 bg-white/[0.035] p-5"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setPickerOpen(false);
          }
        }}
      >
        <label htmlFor="product-picker" className="mb-1 block text-sm font-medium text-slate-200">
          Add a product
        </label>
        <input
          id="product-picker"
          ref={pickerInputRef}
          value={pickerQuery}
          onChange={(e) => {
            setPickerQuery(e.target.value);
            setPickerOpen(true);
          }}
          onFocus={() => {
            if (!suppressPickerOpenRef.current) setPickerOpen(true);
          }}
          onClick={() => setPickerOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const first = filteredProducts[0];
              if (first) addProduct(first);
            }
            if (e.key === "Escape") setPickerOpen(false);
          }}
          className="input"
          placeholder={
            loadingProducts
              ? "Loading products…"
              : "Type to search by name, SKU, brand… (Enter adds the first match)"
          }
          disabled={loadingProducts || products.length === 0}
          role="combobox"
          aria-expanded={pickerOpen}
          aria-controls="product-picker-list"
          autoComplete="off"
        />
        {productsError ? (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {productsError}{" "}
            <button type="button" onClick={refreshProducts} className="underline">
              Retry
            </button>
          </p>
        ) : null}
        {!loadingProducts && products.length === 0 && !productsError ? (
          <p className="mt-2 text-sm text-slate-400">
            No active products yet.{" "}
            <Link href="/inventory/new" className="font-medium text-brand-gold underline">
              Add your first product
            </Link>{" "}
            before recording sales.
          </p>
        ) : null}

        {pickerOpen && filteredProducts.length > 0 ? (
          <ul
            id="product-picker-list"
            role="listbox"
            className="relative z-20 mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-brand-panel shadow-2xl shadow-black/60 md:absolute md:left-5 md:right-5 md:mt-1"
          >
            {filteredProducts.slice(0, 50).map((product) => {
              const outOfStock = product.stockStatus === "out_of_stock";
              return (
                <li key={product.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    disabled={outOfStock}
                    onClick={() => addProduct(product)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {product.name}
                        {product.brand ? (
                          <span className="ml-2 text-xs text-slate-400">{product.brand}</span>
                        ) : null}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {product.sku ? `${product.sku} · ` : ""}
                        {product.categoryName}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs">
                      <span className="block font-semibold">
                        {displayQuantity(product.stockOnHand)} {product.unit}
                      </span>
                      <span className="block text-slate-400">
                        {outOfStock ? "Out of stock" : formatPhp(product.sellingPrice)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {pickerOpen &&
        !loadingProducts &&
        filteredProducts.length === 0 &&
        pickerQuery.trim() !== "" ? (
          <p className="mt-2 text-sm text-slate-400">No matching products.</p>
        ) : null}
      </div>

      {shortages.length > 0 ? (
        <div
          role="alert"
          className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-300"
        >
          <p className="font-semibold">Not enough stock — nothing was saved:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {shortages.map((shortage) => (
              <li key={shortage.productId}>
                <strong>{shortage.productName}</strong> — requested{" "}
                {displayQuantity(shortage.requested)}, available{" "}
                {displayQuantity(shortage.available)} {shortage.unit}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {formError && shortages.length === 0 ? (
        <p
          role="alert"
          className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {formError}
        </p>
      ) : null}

      {/* Lines table */}
      {lines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-10 text-center">
          <p className="text-sm font-semibold text-slate-100">
            No products added yet
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Search above and press Enter (or click a result) to add the first line.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop / tablet: full table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.035] md:block">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Product</th>
                  <th className="px-3 py-2.5 text-right font-medium">Available stock</th>
                  <th className="px-3 py-2.5 font-medium">Unit</th>
                  <th className="px-3 py-2.5 font-medium">Quantity sold</th>
                  <th className="px-3 py-2.5 text-right font-medium">Base price</th>
                  <th className="px-3 py-2.5 font-medium">Final price</th>
                  <th className="px-3 py-2.5 text-right font-medium">Line total</th>
                  <th className="px-3 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {lines.map((line, index) => {
                  const quantityNormalized = normalizeQuantityInput(line.quantity);
                  const priceNormalized = normalizeMoneyInput(line.finalUnitPrice);
                  const priceBlank = line.finalUnitPrice.trim() === "";
                  const priceInvalid = !priceBlank && priceNormalized === null;
                  const lineTotal =
                    quantityNormalized && priceNormalized
                      ? centavosToMoneyString(
                          computeLineTotalCentavos(quantityNormalized, priceNormalized)
                        )
                      : null;
                  const exceeded =
                    quantityNormalized !== null &&
                    compareQuantities(quantityNormalized, line.product.stockOnHand) > 0;
                  const shortage = shortages.find(
                    (s) => s.productId === line.product.id
                  );
                  return (
                    <tr key={line.product.id} className={exceeded ? "bg-red-500/[0.07]" : ""}>
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{line.product.name}</p>
                        <p className="text-xs text-slate-400">
                          {[line.product.sku, line.product.brand]
                            .filter(Boolean)
                            .join(" · ") || line.product.categoryName}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {displayQuantity(line.product.stockOnHand)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-300">{line.product.unit}</td>
                      <td className="px-3 py-2.5">
                        <input
                          value={line.quantity}
                          onChange={(e) => updateLine(index, { quantity: e.target.value })}
                          inputMode="decimal"
                          aria-label={`Quantity sold for ${line.product.name}`}
                          className="w-24 rounded-lg border border-white/10 bg-white/[0.045] px-2 py-1.5 text-sm text-white hover:border-white/20"
                        />
                        {exceeded || shortage ? (
                          <p className="mt-1 text-xs font-medium text-red-400">
                            Only {displayQuantity(line.product.stockOnHand)} in stock
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">
                        {formatPhp(line.product.sellingPrice)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="relative inline-flex items-center">
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute left-2 text-sm text-slate-400"
                          >
                            ₱
                          </span>
                          <input
                            value={line.finalUnitPrice}
                            onChange={(e) =>
                              updateLine(index, { finalUnitPrice: e.target.value })
                            }
                            inputMode="decimal"
                            aria-label={`Final price for ${line.product.name}`}
                            aria-invalid={priceInvalid || priceBlank}
                            className={`w-28 rounded-lg border bg-white/[0.045] py-1.5 pl-6 pr-2 text-sm text-white ${
                              priceInvalid || priceBlank
                                ? "border-red-400 bg-red-500/10"
                                : "border-white/10 hover:border-white/20"
                            }`}
                          />
                        </div>
                        {priceInvalid || priceBlank ? (
                          <p className="mt-1 text-xs font-medium text-red-400">
                            {priceBlank ? "Enter a price." : "Like 350 or 350.50."}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold">
                        {lineTotal ? formatPhp(lineTotal) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => removeLine(index)}
                          aria-label={`Remove ${line.product.name}`}
                          className="rounded-lg p-1.5 text-slate-400 transition-all duration-200 hover:bg-red-500/10 hover:text-red-300 active:scale-90"
                        >
                          <Icon name="close" className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phone: stacked cards (no wide table, no page-level scrolling) */}
          <ul className="space-y-3 md:hidden">
            {lines.map((line, index) => {
              const quantityNormalized = normalizeQuantityInput(line.quantity);
              const priceNormalized = normalizeMoneyInput(line.finalUnitPrice);
              const priceBlank = line.finalUnitPrice.trim() === "";
              const priceInvalid = !priceBlank && priceNormalized === null;
              const lineTotal =
                quantityNormalized && priceNormalized
                  ? centavosToMoneyString(
                      computeLineTotalCentavos(quantityNormalized, priceNormalized)
                    )
                  : null;
              const exceeded =
                quantityNormalized !== null &&
                compareQuantities(quantityNormalized, line.product.stockOnHand) > 0;
              const shortage = shortages.find(
                (s) => s.productId === line.product.id
              );
              return (
                <li
                  key={line.product.id}
                  className={`rounded-2xl border bg-white/[0.035] p-4 ${
                    exceeded ? "border-red-400/40 bg-red-500/[0.08]" : "border-white/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{line.product.name}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {line.product.sku ? `${line.product.sku} · ` : ""}
                        Available: {displayQuantity(line.product.stockOnHand)}{" "}
                        {line.product.unit}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      aria-label={`Remove ${line.product.name}`}
                      className="rounded-lg p-2 text-slate-400 transition-all duration-200 hover:bg-red-500/10 hover:text-red-300 active:scale-90"
                    >
                      <Icon name="close" className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor={`qty-${line.product.id}`}
                        className="mb-1 block text-xs font-medium text-slate-400"
                      >
                        Quantity sold ({line.product.unit})
                      </label>
                      <input
                        id={`qty-${line.product.id}`}
                        value={line.quantity}
                        onChange={(e) => updateLine(index, { quantity: e.target.value })}
                        inputMode="decimal"
                        className="w-full rounded-lg border border-white/10 bg-white/[0.045] px-2.5 py-2 text-sm text-white hover:border-white/20"
                      />
                      {exceeded || shortage ? (
                        <p className="mt-1 text-xs font-medium text-red-400">
                          Only {displayQuantity(line.product.stockOnHand)} in stock
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label
                        htmlFor={`price-${line.product.id}`}
                        className="mb-1 block text-xs font-medium text-slate-400"
                      >
                        Final price
                      </label>
                      <div className="relative">
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-slate-400"
                        >
                          ₱
                        </span>
                        <input
                          id={`price-${line.product.id}`}
                          value={line.finalUnitPrice}
                          onChange={(e) =>
                            updateLine(index, { finalUnitPrice: e.target.value })
                          }
                          inputMode="decimal"
                          aria-invalid={priceInvalid || priceBlank}
                          className={`w-full rounded-lg border bg-white/[0.045] py-2 pl-7 pr-2 text-sm text-white ${
                            priceInvalid || priceBlank
                              ? "border-red-400 bg-red-500/10"
                              : "border-white/10 hover:border-white/20"
                          }`}
                        />
                      </div>
                      {priceInvalid || priceBlank ? (
                        <p className="mt-1 text-xs font-medium text-red-400">
                          {priceBlank ? "Enter a price." : "Like 350 or 350.50."}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-sm">
                    <span className="text-slate-300">
                      Base price:{" "}
                      <span className="font-medium text-slate-100">
                        {formatPhp(line.product.sellingPrice)}
                      </span>
                    </span>
                    <span className="font-semibold">
                      {lineTotal ? formatPhp(lineTotal) : "—"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Total + save — sticky action bar on phones, card on desktop.
          The mobile bottom nav steps aside on this screen, so the bar owns
          the bottom edge: total always visible while scrolling a long entry. */}
      <div className="sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t border-white/10 bg-brand-ink/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.5)] backdrop-blur-md md:static md:mx-0 md:flex-wrap md:gap-4 md:rounded-2xl md:border md:p-5 md:shadow-sm">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-400 md:text-xs">
            {totals.count} {totals.count === 1 ? "product" : "products"} ·{" "}
            {displayQuantity(String(totals.quantity))} total quantity
          </p>
          <p className="text-2xl font-bold tracking-tight md:text-3xl">
            {formatPhp(centavosToMoneyString(totals.totalCentavos))}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || lines.length === 0 || totals.hasInvalidLine}
          className="btn-primary shrink-0 !px-5 md:!px-6 md:!text-base"
        >
          {pending ? (
            <>
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-brand-ink/30 border-t-brand-ink"
              />
              Saving…
            </>
          ) : (
            <>
              <span className="md:hidden">Save</span>
              <span className="hidden md:inline">
                Save Sales &amp; Update Inventory
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

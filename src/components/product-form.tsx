"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { COMMON_UNITS } from "@/types";
import type { Product } from "@/types";

/**
 * Add/Edit product form (spec §4.4).
 * - `openingStock` appears on creation only; on edit, stock is read-only and
 *   changes only through Stock In / Physical Count.
 * - Selling price encourages a positive value but allows zero.
 */

export interface CategoryOption {
  id: number;
  name: string;
  isActive: boolean;
  productCount: number;
}

interface ProductFormProps {
  mode: "create" | "edit";
  product?: Product;
}

interface FieldErrors {
  [field: string]: string[];
}

export function ProductForm({ mode, product }: ProductFormProps) {
  const router = useRouter();

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState<string>(
    product ? String(product.categoryId) : ""
  );
  const [newCategory, setNewCategory] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [sku, setSku] = useState(product?.sku ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [variant, setVariant] = useState(product?.variant ?? "");
  const [unit, setUnit] = useState(product?.unit ?? "piece");
  const [sellingPrice, setSellingPrice] = useState(
    product?.sellingPrice ?? ""
  );
  const [openingStock, setOpeningStock] = useState("");
  const [reorderLevel, setReorderLevel] = useState(
    product?.reorderLevel ? trimZeros(product.reorderLevel) : "5"
  );

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<CategoryOption[]>("/api/categories")
      .then((items) => {
        if (!cancelled) setCategories(items);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCategoriesError(
            error instanceof ApiClientError
              ? error.message
              : "Could not load categories."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const unitOptions = useMemo(() => {
    if (product && !COMMON_UNITS.includes(product.unit as never)) {
      return [product.unit, ...COMMON_UNITS];
    }
    return [...COMMON_UNITS];
  }, [product]);

  async function handleCreateCategory() {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    try {
      const created = await api.post<CategoryOption>("/api/categories", {
        name: trimmed,
      });
      setCategories((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
      );
      setCategoryId(String(created.id));
      setShowNewCategory(false);
      setNewCategory("");
    } catch (error) {
      setFormError(
        error instanceof ApiClientError
          ? error.message
          : "Could not add the category."
      );
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setFieldErrors({});

    const payload: Record<string, unknown> = {
      name,
      categoryId: categoryId ? Number(categoryId) : 0,
      sku: sku.trim(),
      brand: brand.trim(),
      variant: variant.trim(),
      unit: unit.trim(),
      sellingPrice: sellingPrice.trim(),
      reorderLevel: reorderLevel.trim(),
    };
    if (mode === "create") {
      payload.openingStock = openingStock.trim() === "" ? "0" : openingStock.trim();
    }

    try {
      if (mode === "create") {
        const detail = await api.post<{ product: Product }>("/api/products", payload);
        router.push(`/inventory/${detail.product.id}/edit?created=1`);
      } else {
        await api.patch(`/api/products/${product!.id}`, payload);
        router.push("/inventory?updated=1");
      }
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        const details = error.details as { fieldErrors?: FieldErrors } | undefined;
        if (details?.fieldErrors) setFieldErrors(details.fieldErrors);
        setFormError(error.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setPending(false);
    }
  }

  function fieldError(name: string): string | null {
    return fieldErrors[name]?.[0] ?? null;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {formError ? (
        <p
          role="alert"
          className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {formError}
        </p>
      ) : null}

      <div className="grid gap-5 rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.95)] sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            htmlFor="prod-name"
            label="Product name"
            required
            error={fieldError("name")}
          >
            <input
              id="prod-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={180}
              className="input"
              placeholder="e.g. Engine Oil 1L"
            />
          </Field>
        </div>

        <Field
          htmlFor="prod-category"
          label="Category"
          required
          error={fieldError("categoryId")}
        >
          <select
            id="prod-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
            className="input"
          >
            <option value="">Choose a category…</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.isActive ? "" : " (inactive)"}
              </option>
            ))}
          </select>
          {showNewCategory ? (
            <div className="mt-2 flex gap-2">
              <input
                aria-label="New category name"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreateCategory();
                  }
                  if (e.key === "Escape") {
                    setShowNewCategory(false);
                    setNewCategory("");
                  }
                }}
                placeholder="New category name"
                className="input"
                maxLength={100}
              />
              <button
                type="button"
                onClick={handleCreateCategory}
                className="btn-secondary shrink-0"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNewCategory(true)}
              className="mt-1 text-xs font-medium text-brand-gold hover:underline"
            >
              + Add a category
            </button>
          )}
          {categoriesError ? (
            <p className="mt-1 text-xs text-red-400">{categoriesError}</p>
          ) : null}
        </Field>

        <Field
          htmlFor="prod-sku"
          label="SKU / product code"
          error={fieldError("sku")}
          hint="Optional. Must be unique when filled in."
        >
          <input
            id="prod-sku"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            maxLength={80}
            className="input"
            placeholder="e.g. OIL-1L-10W40"
          />
        </Field>

        <Field htmlFor="prod-brand" label="Brand" error={fieldError("brand")} hint="Optional.">
          <input
            id="prod-brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            maxLength={120}
            className="input"
          />
        </Field>

        <Field
          htmlFor="prod-variant"
          label="Variant / specification"
          error={fieldError("variant")}
          hint="Optional, e.g. 1L, 14-inch, 205/55R16."
        >
          <input
            id="prod-variant"
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
            maxLength={180}
            className="input"
          />
        </Field>

        <Field htmlFor="prod-unit" label="Unit" required error={fieldError("unit")}>
          <div className="flex gap-2">
            <select
              id="prod-unit"
              value={COMMON_UNITS.includes(unit as never) ? unit : "custom"}
              onChange={(e) => {
                if (e.target.value === "custom") setUnit("");
                else setUnit(e.target.value);
              }}
              className="input"
            >
              {unitOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
            {!COMMON_UNITS.includes(unit as never) ? (
              <input
                aria-label="Custom unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Custom unit"
                maxLength={40}
                className="input"
              />
            ) : null}
          </div>
        </Field>

        <Field
          htmlFor="prod-price"
          label="Selling price (₱)"
          required
          error={fieldError("sellingPrice")}
          hint="Enter 0 only for free items."
        >
          <input
            id="prod-price"
            value={sellingPrice}
            onChange={(e) => setSellingPrice(e.target.value)}
            inputMode="decimal"
            required
            className="input"
            placeholder="350.00"
          />
        </Field>

        <Field
          htmlFor="prod-reorder"
          label="Reorder level"
          required
          error={fieldError("reorderLevel")}
          hint="Low-stock warnings start at or below this quantity."
        >
          <input
            id="prod-reorder"
            value={reorderLevel}
            onChange={(e) => setReorderLevel(e.target.value)}
            inputMode="decimal"
            required
            className="input"
            placeholder="5"
          />
        </Field>

        {mode === "create" ? (
          <Field
            htmlFor="prod-opening-stock"
            label="Opening stock"
            required
            error={fieldError("openingStock")}
            hint="Stock on the shelf right now. Zero is allowed; an opening movement is recorded."
          >
            <input
              id="prod-opening-stock"
              value={openingStock}
              onChange={(e) => setOpeningStock(e.target.value)}
              inputMode="decimal"
              required
              className="input"
              placeholder="0"
            />
          </Field>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-xs font-medium text-slate-400">
              Stock on hand (read-only)
            </p>
            <p className="mt-1 text-lg font-semibold">
              {product!.stockOnHand.replace(/\.?0+$/, "")} {product!.unit}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Stock changes only through Stock In, Physical Count, or sales.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push("/inventory")}
          className="btn-secondary"
        >
          Cancel
        </button>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending
            ? "Saving…"
            : mode === "create"
              ? "Add product"
              : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Field({
  htmlFor,
  label,
  required,
  error,
  hint,
  children,
}: {
  htmlFor: string;
  label: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-sm font-medium text-slate-200"
      >
        {label}
        {required ? <span className="text-red-400"> *</span> : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
      {error ? (
        <p role="alert" className="mt-1 text-xs font-medium text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function trimZeros(quantity: string): string {
  return quantity.includes(".") ? quantity.replace(/\.?0+$/, "") || "0" : quantity;
}

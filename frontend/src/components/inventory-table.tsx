"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { qs } from "@/lib/api-client";
import { useCachedApi, invalidateApiCache } from "@/lib/use-cached-api";
import { displayQuantity, formatPhp } from "@/lib/money";
import { StockStatusBadge } from "./stock-status-badge";
import { StockActionDialogs, type StockDialogKind } from "./stock-action-dialogs";
import type { Product } from "@/types";
import type { CategoryOption } from "./product-form";

/**
 * Inventory screen (spec §4.3): search, category filter, stock-status filter,
 * sorting, clear stock status (never color alone), and row actions for
 * Stock In / Physical Count. Deactivated products stay visible when the
 * owner selects that filter.
 */

export function InventoryTable() {
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [stockStatus, setStockStatus] = useState("all");
  const [activeFilter, setActiveFilter] = useState<"active" | "inactive" | "all">(
    "active"
  );
  const [sort, setSort] = useState("name");
  const [order, setOrder] = useState<"asc" | "desc">("asc");

  const [dialogFor, setDialogFor] = useState<{
    product: Product;
    kind: StockDialogKind;
  } | null>(null);

  // Debounce only the typed search; dropdown changes apply immediately.
  useEffect(() => {
    const handle = setTimeout(
      () => setDebouncedSearch(search.trim()),
      search ? 250 : 0
    );
    return () => clearTimeout(handle);
  }, [search]);

  const productsPath = `/api/products${qs({
    q: debouncedSearch,
    categoryId,
    stockStatus: stockStatus === "all" ? "" : stockStatus,
    active: activeFilter,
    sort,
    order,
    pageSize: 200,
  })}`;
  const {
    data: productsData,
    loading,
    error: loadError,
    refresh: refreshProducts,
  } = useCachedApi<Product[]>(productsPath);
  const products = productsData ?? [];

  const { data: categoriesData } = useCachedApi<CategoryOption[]>(
    "/api/categories?includeInactive=true"
  );
  const categories = categoriesData ?? [];

  const productCountLabel = useMemo(() => {
    if (loading) return "Loading…";
    if (products.length === 0) return "No products";
    return `${products.length} product${products.length === 1 ? "" : "s"}`;
  }, [loading, products.length]);

  return (
    <div className="space-y-4">
      {notice ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300"
        >
          {notice}
        </p>
      ) : null}

      {/* Filters — 2-column grid on phones, one wrapped row from small screens up. */}
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:flex sm:flex-wrap sm:items-end">
        <div className="col-span-2 sm:min-w-52 sm:flex-1">
          <label htmlFor="inv-search" className="mb-1 block text-xs font-medium text-slate-400">
            Search
          </label>
          <input
            id="inv-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, SKU, brand, or variant"
            className="input"
          />
        </div>
        <div>
          <label htmlFor="inv-category" className="mb-1 block text-xs font-medium text-slate-400">
            Category
          </label>
          <select
            id="inv-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="input"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="inv-stock" className="mb-1 block text-xs font-medium text-slate-400">
            Stock status
          </label>
          <select
            id="inv-stock"
            value={stockStatus}
            onChange={(e) => setStockStatus(e.target.value)}
            className="input"
          >
            <option value="all">All</option>
            <option value="in_stock">In stock</option>
            <option value="low_stock">Low stock</option>
            <option value="out_of_stock">Out of stock</option>
          </select>
        </div>
        <div>
          <label htmlFor="inv-active" className="mb-1 block text-xs font-medium text-slate-400">
            Products
          </label>
          <select
            id="inv-active"
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as typeof activeFilter)}
            className="input"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>
        <div>
          <label htmlFor="inv-sort" className="mb-1 block text-xs font-medium text-slate-400">
            Sort by
          </label>
          <select
            id="inv-sort"
            value={`${sort}:${order}`}
            onChange={(e) => {
              const [nextSort = "name", nextOrder = "asc"] =
                e.target.value.split(":");
              setSort(nextSort);
              setOrder(nextOrder as "asc" | "desc");
            }}
            className="input"
          >
            <option value="name:asc">Name A–Z</option>
            <option value="name:desc">Name Z–A</option>
            <option value="stock:asc">Stock low → high</option>
            <option value="stock:desc">Stock high → low</option>
            <option value="price:asc">Price low → high</option>
            <option value="price:desc">Price high → low</option>
          </select>
        </div>
        <div className="col-span-2 flex sm:col-span-1 sm:ml-auto">
          <Link href="/inventory/new" className="btn-primary w-full sm:w-auto">
            + Add product
          </Link>
        </div>
      </div>

      {/* States */}
      {loading ? (
        <div className="card animate-pulse space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-6 rounded bg-white/10" />
          ))}
        </div>
      ) : loadError ? (
        <div className="card text-center">
          <p className="text-sm text-red-300">{loadError}</p>
          <button type="button" onClick={refreshProducts} className="btn-secondary mt-3">
            Retry
          </button>
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-100">
            {search || categoryId || stockStatus !== "all" || activeFilter !== "active"
              ? "No products match these filters."
              : "No products yet."}
          </p>
          <p className="mt-1 max-w-md text-sm text-slate-400">
            {search || categoryId || stockStatus !== "all" || activeFilter !== "active"
              ? "Try clearing the search or choosing different filters."
              : "Add your first product to start tracking stock and daily sales."}
          </p>
          {!search && !categoryId && stockStatus === "all" && activeFilter === "active" ? (
            <Link href="/inventory/new" className="btn-primary mt-4">
              Add your first product
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400">{productCountLabel}</p>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.035] md:block">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <Th>Product</Th>
                  <Th>SKU</Th>
                  <Th>Category</Th>
                  <Th>Unit</Th>
                  <Th align="right">Price</Th>
                  <Th align="right">Stock</Th>
                  <Th align="right">Reorder</Th>
                  <Th>Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {products.map((product) => (
                  <tr key={product.id} className={product.isActive ? "" : "bg-white/[0.02]"}>
                    <Td>
                      <div className="font-medium text-slate-100">
                        {product.name}
                        {product.isActive ? null : (
                          <span className="ml-2 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Inactive
                          </span>
                        )}
                      </div>
                      {product.brand || product.variant ? (
                        <div className="text-xs text-slate-400">
                          {[product.brand, product.variant].filter(Boolean).join(" · ")}
                        </div>
                      ) : null}
                    </Td>
                    <Td className="text-slate-300">{product.sku ?? "—"}</Td>
                    <Td className="text-slate-300">{product.categoryName}</Td>
                    <Td className="text-slate-300">{product.unit}</Td>
                    <Td align="right">{formatPhp(product.sellingPrice)}</Td>
                    <Td align="right" className="font-semibold">
                      {displayQuantity(product.stockOnHand)}
                    </Td>
                    <Td align="right" className="text-slate-300">
                      {displayQuantity(product.reorderLevel)}
                    </Td>
                    <Td>
                      <StockStatusBadge
                        status={product.stockStatus}
                        stockOnHand={product.stockOnHand}
                      />
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/inventory/${product.id}/edit`}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-slate-300 hover:bg-white/10"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() => setDialogFor({ product, kind: "stock-in" })}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-brand-gold hover:bg-brand-gold/10"
                        >
                          Stock In
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDialogFor({ product, kind: "physical-count" })
                          }
                          className="rounded-lg px-2 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/10"
                        >
                          Count
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {products.map((product) => (
              <li key={product.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {product.name}
                      {product.isActive ? null : (
                        <span className="ml-2 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-400">
                          Inactive
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">
                      {[product.sku, product.categoryName, product.brand]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <StockStatusBadge
                    status={product.stockStatus}
                    stockOnHand={product.stockOnHand}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span>
                    <strong>{displayQuantity(product.stockOnHand)}</strong>{" "}
                    {product.unit} · reorder at {displayQuantity(product.reorderLevel)}
                  </span>
                  <span>{formatPhp(product.sellingPrice)}</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/inventory/${product.id}/edit`}
                    className="btn-secondary flex-1 text-xs"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => setDialogFor({ product, kind: "stock-in" })}
                    className="btn-secondary flex-1 text-xs"
                  >
                    Stock In
                  </button>
                  <button
                    type="button"
                    onClick={() => setDialogFor({ product, kind: "physical-count" })}
                    className="btn-secondary flex-1 text-xs"
                  >
                    Count
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {dialogFor ? (
        <StockActionDialogs
          product={dialogFor.product}
          kind={dialogFor.kind}
          onClose={() => setDialogFor(null)}
          onDone={(message) => {
            setNotice(message);
            refreshProducts();
            invalidateApiCache("/api/dashboard");
            invalidateApiCache("/api/stock-movements");
          }}
        />
      ) : null}
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-3 py-2.5 font-medium ${align === "right" ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`px-3 py-2.5 ${align === "right" ? "text-right" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

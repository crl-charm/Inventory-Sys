"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./icons";
import { cn } from "@/lib/cn";
import type { SessionUser } from "@/types";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/inventory", label: "Inventory", icon: "inventory" },
  { href: "/sales/new", label: "Record Daily Sales", icon: "record" },
  { href: "/sales", label: "Sales History", icon: "history" },
  { href: "/reports/daily", label: "Daily Report", icon: "report" },
  { href: "/inventory/movements", label: "Stock Movements", icon: "movements" },
];

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME ?? "Hardware Store";

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="print-hidden hidden w-64 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
        <SidebarContent user={user} />
      </aside>

      {/* Mobile top bar */}
      <header className="print-hidden sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">
            HW
          </div>
          <span className="text-sm font-semibold">{STORE_NAME}</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
        >
          <Icon name="menu" />
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="print-hidden fixed inset-0 z-30 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-900/40"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-end p-3">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              >
                <Icon name="close" />
              </button>
            </div>
            <SidebarContent
              user={user}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

function SidebarContent({
  user,
  onNavigate,
}: {
  user: SessionUser;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  function isActive(href: string): boolean {
    if (href === "/sales/new") return pathname === "/sales/new";
    if (href === "/sales") {
      return pathname === "/sales" || /^\/sales\/\d+$/.test(pathname);
    }
    if (href === "/inventory") {
      return pathname === "/inventory" || pathname === "/inventory/new" ||
        /^\/inventory\/\d+/.test(pathname);
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      <div className="hidden items-center gap-2.5 border-b border-slate-200 px-5 py-4 md:flex">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white">
          HW
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">
            {STORE_NAME}
          </p>
          <p className="text-xs text-slate-500">Inventory &amp; Daily Sales</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const isPrimary = item.href === "/sales/new";
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100",
                isPrimary && !active && "bg-sky-50 text-sky-900 hover:bg-sky-100"
              )}
            >
              <Icon name={item.icon} className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.displayName}</p>
            <p className="truncate text-xs text-slate-500">@{user.username}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          <Icon name="logout" className="h-5 w-5 shrink-0" />
          {loggingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </>
  );
}

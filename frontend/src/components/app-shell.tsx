"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./icons";
import { BrandMark } from "./brand-mark";
import { InstallAppMenuItem } from "./install-app";
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

/** Bottom tab bar: the five most-used destinations on a phone. */
const BOTTOM_TABS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: "dashboard" },
  { href: "/inventory", label: "Inventory", icon: "inventory" },
  { href: "/sales/new", label: "Record", icon: "record" },
  { href: "/sales", label: "Sales", icon: "history" },
  { href: "/reports/daily", label: "Report", icon: "report" },
];

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME ?? "R Garage";

/** Shared active-link logic for the sidebar and the bottom tab bar. */
function isNavActive(pathname: string, href: string): boolean {
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

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Focused flow: on the sales form the bottom bar steps aside for the
  // sticky total + save bar, and the header swaps in a back button.
  const recordMode = pathname === "/sales/new";

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="print-hidden hidden w-64 shrink-0 border-r border-white/10 bg-white/[0.03] md:flex md:flex-col">
        <SidebarContent user={user} />
      </aside>

      {/* Mobile top bar */}
      <header className="print-hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/10 bg-brand-ink/85 px-4 py-3 shadow-sm shadow-black/30 backdrop-blur-md md:hidden">
        {recordMode ? (
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go back"
              className="btn-icon -ml-2"
            >
              <Icon name="back" />
            </button>
            <span className="truncate text-sm font-semibold">
              Record Daily Sales
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-8 w-8" />
            <span className="text-sm font-semibold">{STORE_NAME}</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          className="btn-icon border border-white/15"
        >
          <Icon name="menu" />
        </button>
      </header>

      {/*
       * Mobile drawer. Always mounted so opening AND closing both animate; a
       * group data attribute lets the nav items stagger in behind the panel.
       */}
      <div
        data-drawer={mobileOpen ? "open" : "closed"}
        inert={!mobileOpen}
        aria-hidden={!mobileOpen}
        className={cn(
          "group print-hidden fixed inset-0 z-40 md:hidden",
          !mobileOpen && "pointer-events-none"
        )}
      >
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
          className={cn(
            "absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 ease-out",
            mobileOpen ? "opacity-100" : "opacity-0"
          )}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-brand-panel shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <BrandMark className="h-9 w-9" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight">
                  {STORE_NAME}
                </p>
                <p className="text-xs text-slate-400">Auto Repair &amp; Motor Oil</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="btn-icon"
            >
              <Icon name="close" />
            </button>
          </div>
          <SidebarContent
            user={user}
            inDrawer
            onNavigate={() => setMobileOpen(false)}
          />
        </div>
      </div>

      <main className="min-w-0 flex-1">
        {/* Keyed on the pathname so each navigation eases in. */}
        <div
          key={pathname}
          className={cn(
            "animate-fade-up mx-auto max-w-6xl px-4 pt-6 md:px-8 md:py-8",
            recordMode ? "pb-8" : "pb-28"
          )}
        >
          {children}
        </div>
      </main>

      {/* Mobile bottom navigation */}
      {!recordMode ? (
        <nav
          aria-label="Primary"
          className="print-hidden fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-brand-ink/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.5)] backdrop-blur-md md:hidden"
        >
          <div className="mx-auto grid h-16 max-w-md grid-cols-5">
            {BOTTOM_TABS.map((tab) => {
              const active = isNavActive(pathname, tab.href);
              if (tab.href === "/sales/new") {
                // Center action: raised "Record" button.
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    aria-label="Record daily sales"
                    aria-current={active ? "page" : undefined}
                    className="group relative flex items-end justify-center pb-1.5"
                  >
                    <span
                      className={cn(
                        "absolute -top-4 flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(180deg,#242329_0%,#0a0a0b_75%)] text-brand-gold shadow-lg shadow-black/50 ring-4 ring-brand-ink transition-all duration-200 ease-out group-hover:brightness-110 group-hover:shadow-xl group-hover:shadow-black/50 group-active:scale-90 group-active:brightness-100",
                        active && "ring-brand-gold/30"
                      )}
                    >
                      <Icon
                        name="record"
                        className="h-6 w-6 transition-transform duration-300 ease-out group-hover:rotate-90"
                      />
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-semibold transition-colors duration-200",
                        active ? "text-brand-gold" : "text-slate-400"
                      )}
                    >
                      Record
                    </span>
                  </Link>
                );
              }
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 text-[10px] font-medium transition-colors duration-200",
                    active ? "text-brand-gold" : "text-slate-400 hover:text-white"
                  )}
                >
                  <Icon
                    name={tab.icon}
                    className={cn(
                      "h-6 w-6 transition-transform duration-200 ease-out",
                      active && "-translate-y-0.5 scale-110"
                    )}
                  />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function SidebarContent({
  user,
  onNavigate,
  inDrawer = false,
}: {
  user: SessionUser;
  onNavigate?: () => void;
  inDrawer?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // offline / server asleep: still leave the screen; the cookie expires on its own
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <>
      <div className="hidden items-center gap-2.5 border-b border-white/10 px-5 py-4 md:flex">
        <BrandMark className="h-9 w-9" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">
            {STORE_NAME}
          </p>
          <p className="text-xs text-slate-400">Auto Repair &amp; Motor Oil</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main">
        {NAV_ITEMS.map((item, index) => {
          const active = isNavActive(pathname, item.href);
          const isPrimary = item.href === "/sales/new";
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              style={
                inDrawer
                  ? { transitionDelay: `${60 + index * 35}ms` }
                  : undefined
              }
              className={cn(
                "group/item flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                inDrawer
                  ? "transition-all duration-300 ease-out group-data-[drawer=closed]:translate-x-6 group-data-[drawer=closed]:opacity-0"
                  : "transition-all duration-200",
                active
                  ? "bg-brand-gold/[0.16] text-brand-gold"
                  : "text-slate-300 hover:bg-white/[0.06] hover:text-white",
                isPrimary &&
                  !active &&
                  "bg-brand-gold/[0.07] text-brand-gold/90 hover:bg-brand-gold/[0.12]"
              )}
            >
              <Icon
                name={item.icon}
                className="h-5 w-5 shrink-0 transition-transform duration-200 ease-out group-hover/item:scale-110"
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <InstallAppMenuItem />
        <div className="mb-2 flex items-center gap-3 rounded-xl px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-slate-200">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.displayName}</p>
            <p className="truncate text-xs text-slate-400">@{user.username}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 transition-all duration-200 hover:bg-white/[0.06] hover:text-white active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
        >
          <Icon name="logout" className="h-5 w-5 shrink-0" />
          {loggingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </>
  );
}

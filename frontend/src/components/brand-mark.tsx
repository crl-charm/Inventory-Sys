import { cn } from "@/lib/cn";

/**
 * The shop's monogram: a black tile with a brushed-brass "R". Used on the
 * sign-in screen, the mobile top bar, and the sidebar so the brand reads the
 * same everywhere. Decorative — the name is always rendered next to it.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-xl bg-[linear-gradient(180deg,#242329_0%,#0a0a0b_62%)] text-sm font-bold tracking-[-0.02em] text-brand-gold shadow-sm ring-1 ring-black/40",
        className
      )}
    >
      R
    </span>
  );
}

import Image from "next/image";
import { cn } from "@/lib/cn";

/**
 * The shop's logo tile (`public/logo.svg`, generated from the master artwork
 * in `npm run icons`). Decorative — the name always appears next to it.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.svg"
      alt=""
      width={128}
      height={128}
      unoptimized
      aria-hidden="true"
      className={cn("h-9 w-9 shrink-0 select-none", className)}
    />
  );
}

/**
 * Inline stroke icons (24px grid, currentColor). Small hand-rolled set to
 * avoid pulling in an icon package for six glyphs.
 */

const PATHS: Record<string, string> = {
  dashboard:
    "M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z",
  inventory:
    "M20.25 7.5 12 3.75 3.75 7.5m16.5 0-8.25 3.75m8.25-3.75v9L12 20.25m0-9L3.75 7.5m8.25 3.75v9m0-9L3.75 7.5m0 0v9L12 20.25",
  sales:
    "M9 12h6m-6 3.75h6M9.75 3.75h4.5l4.5 4.5v10.5a1.5 1.5 0 0 1-1.5 1.5H7.5a1.5 1.5 0 0 1-1.5-1.5V5.25a1.5 1.5 0 0 1 1.5-1.5h2.25Z",
  record:
    "M12 5.25v13.5M5.25 12h13.5",
  history:
    "M12 6v6h4.5m4.5 0a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z",
  report:
    "M3.75 20.25h16.5M6.75 16.5v-6m5.25 6v-10.5m5.25 10.5v-3",
  movements:
    "M7.5 4.5 4.5 7.5m0 0 3 3m-3-3H12m4.5 12 3-3m0 0-3-3m3 3H12",
  logout:
    "M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3-3H9.75m8.25 0-3-3m3 3-3 3",
  menu: "M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5",
  close: "M6 18 18 6M6 6l12 12",
};

export function Icon({
  name,
  className,
}: {
  name: keyof typeof PATHS | string;
  className?: string;
}) {
  const path = PATHS[name] ?? PATHS.dashboard;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? "h-5 w-5"}
    >
      <path d={path} />
    </svg>
  );
}

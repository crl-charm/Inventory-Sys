import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "R Garage Auto Repair & Motor Oil",
    template: "%s · R Garage",
  },
  description:
    "Daily sales and inventory for R Garage Auto Repair & Motor Oil. Replaces the notebook.",
};

/**
 * `viewportFit: cover` lets the app paint under notches/home indicators so the
 * `env(safe-area-inset-*)` padding on the mobile bars actually engages.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0b",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

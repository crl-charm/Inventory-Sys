import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

export const metadata: Metadata = {
  title: {
    default: "R Garage Auto Repair & Motor Oil",
    template: "%s · R Garage",
  },
  description:
    "Daily sales and inventory for R Garage Auto Repair & Motor Oil. Replaces the notebook.",
  applicationName: "R Garage",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "R Garage",
  },
  other: {
    // Older iPhones read the apple-prefixed flag (Next emits the non-prefixed one).
    "apple-mobile-web-app-capable": "yes",
  },
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
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}

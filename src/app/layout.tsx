import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Hardware Store Inventory",
    template: "%s · Hardware Store Inventory",
  },
  description:
    "Daily sales recording and inventory for the hardware store. Replaces the notebook.",
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

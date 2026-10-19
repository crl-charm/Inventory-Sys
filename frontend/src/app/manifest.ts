import type { MetadataRoute } from "next";

/**
 * PWA manifest (served at /manifest.webmanifest). Installability needs
 * name + icons (192/512 + maskable) + display: standalone; browsers also
 * want the network-only service worker in `public/sw.js` on HTTPS.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "R Garage Auto Repair & Motor Oil",
    short_name: "R Garage",
    description:
      "Daily sales and inventory for R Garage Auto Repair & Motor Oil.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    lang: "en",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

"use client";

import { useEffect } from "react";

/**
 * Registers the network-only service worker (`public/sw.js`) that makes the
 * app installable on HTTPS. Registration is a silent no-op on non-secure
 * origins (like the shop's LAN address), where browsers don't allow service
 * workers at all.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-secure origin (LAN HTTP): installability stays off; the app is
      // unaffected.
    });
  }, []);
  return null;
}

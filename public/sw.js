/*
 * R Garage service worker.
 *
 * Strategy stays deliberately conservative for the shop screens:
 *  - Pages and API responses: network-only. Nobody can ever be shown a stale
 *    screen, an old sales form, or stale numbers.
 *  - `/_next/static/*` (content-hashed filenames): cache-first. These are
 *    immutable by construction — a new build ships new names — so caching
 *    them can never serve outdated code; it only makes reloads fast.
 *  - Icons/logo (stable filenames): stale-while-revalidate — instant paint,
 *    refreshed in the background for the next visit.
 * Browsers also require this file to exist before they offer the full
 * "Install app" experience on HTTPS.
 */

const CACHE_NAME = "rgarage-static-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

const ICON_PATTERN = /\.(png|ico|svg|webp)$/;

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // default network behaviour

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Content-hashed build assets: cache-first, safe forever.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) void cache.put(request, response.clone());
        return response;
      })()
    );
    return;
  }

  // Icons and logo: stale-while-revalidate.
  if (ICON_PATTERN.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const hit = await cache.match(request);
        const refresh = fetch(request)
          .then((response) => {
            if (response.ok) void cache.put(request, response.clone());
            return response;
          })
          .catch(() => hit);
        return hit ?? refresh;
      })()
    );
    return;
  }

  // Everything else (pages, API): let the browser go straight to the network.
  // Do NOT wrap this in respondWith(fetch(...)): if the request fails (for
  // example a server component stream dropping while the API is retrying), a
  // rejected respondWith becomes a network error for the whole navigation and
  // the previous screen can stay stuck instead of React showing the error
  // boundary. Returning here is the true network-only behaviour.
  return;
});

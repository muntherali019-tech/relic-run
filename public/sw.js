/* Offline support for the web build. Registered only in production web
 * builds (see src/main.jsx). Strategy:
 *   - /api/*            never touched — AI answers and auth must stay fresh
 *   - navigations       network-first, falling back to the cached shell so
 *                       the app (and its offline question bank) opens offline
 *   - /assets/*, icons  cache-first — filenames are content-hashed, so a hit
 *                       is always correct and updates arrive under new names
 * Bump VERSION to drop all old caches on the next activation.
 */
const VERSION = "v1";
const SHELL = `whisker-shell-${VERSION}`;
const ASSETS = `whisker-assets-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== SHELL && key !== ASSETS) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (e.request.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(e.request);
        // Only the app shell itself may refresh the cached shell — otherwise a
        // visit to /privacy or /terms would overwrite it and offline reloads
        // of the app would serve the wrong page.
        if (fresh.ok && url.pathname === "/") (await caches.open(SHELL)).put("/", fresh.clone());
        return fresh;
      } catch {
        return (await caches.match("/")) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith("/assets/") || /\.(png|svg|webmanifest|ico)$/.test(url.pathname)) {
    e.respondWith((async () => {
      const hit = await caches.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) (await caches.open(ASSETS)).put(e.request, res.clone());
      return res;
    })());
  }
});

const CACHE = "sideline-__BUILD_VERSION__";
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/build-info.json",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  /* __PRECACHE_ASSETS__ */
];
self.addEventListener("install", (event) => {
  // Bypass HTTP caches. addAll succeeds only for a complete, usable shell.
  event.waitUntil(caches.open(CACHE).then((cache) =>
    cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" }))),
  ));
  // Never force activation or reload a coach's open match.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("sideline-") && key !== CACHE)
      .map((key) => caches.delete(key)),
  )));
  // Activation occurs after old clients close; only application caches are retired.
});
async function networkFirst(request, cache, fallbackPath, contentType) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(request, { cache: "no-store", signal: controller.signal });
    if (response.ok && response.headers.get("content-type")?.includes(contentType)) {
      // A newer online document may refer to a newer asset set. Do NOT replace
      // this worker's fully precached offline shell with that partial update.
      return response;
    }
    const fallback = await cache.match(fallbackPath);
    return fallback || response;
  } catch (error) {
    const fallback = await cache.match(fallbackPath);
    if (fallback) return fallback;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const path = new URL(request.url).pathname;
    if (path === "/build-info.json") return networkFirst(request, cache, path, "application/json");
    const documentPath = path === "/" || path === "/index.html" || !path.split("/").at(-1).includes(".");
    if (request.mode === "navigate" && documentPath) return networkFirst(request, cache, "/index.html", "text/html");
    const cached = await cache.match(request, {
      ignoreVary: path.startsWith("/assets/") || path.startsWith("/ocr/"),
    });
    if (cached) return cached;
    // A waiting worker may already have precached a newer document's immutable
    // chunks. Those content-hashed URLs are safe to share, even while offline.
    if (path.startsWith("/assets/")) {
      for (const key of await caches.keys()) {
        if (key === CACHE || !key.startsWith("sideline-")) continue;
        const asset = await (await caches.open(key)).match(request, { ignoreVary: true });
        if (asset) return asset;
      }
    }
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});

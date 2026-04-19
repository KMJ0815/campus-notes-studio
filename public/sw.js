const SW_VERSION = "v4";
const SHELL_CACHE = `campus-notes-shell-${SW_VERSION}`;
const RUNTIME_CACHE = `campus-notes-runtime-${SW_VERSION}`;
const CACHEABLE_IMAGE_EXT = [".png", ".svg", ".webp", ".jpg", ".jpeg", ".gif", ".ico"];

function scopeUrl() {
  return self.registration?.scope || self.location.origin + "/";
}

function scopedAsset(path = "") {
  return new URL(path, scopeUrl()).toString();
}

function scopePathname() {
  return new URL(scopeUrl()).pathname;
}

function coreAssets() {
  return [
    scopedAsset(""),
    scopedAsset("offline.html"),
    scopedAsset("manifest.webmanifest"),
    scopedAsset("icon-192.png"),
    scopedAsset("icon-512.png"),
  ];
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(coreAssets())).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![SHELL_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(scopePathname())) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, scopedAsset("offline.html")));
    return;
  }

  if (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "manifest" ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css")
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (
    ["image", "font"].includes(request.destination) ||
    CACHEABLE_IMAGE_EXT.some((ext) => url.pathname.endsWith(ext))
  ) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

async function networkFirst(request, offlineFallbackUrl = null) {
  const runtimeCache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    runtimeCache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (offlineFallbackUrl) {
      const fallback = await caches.match(offlineFallbackUrl);
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const runtimeCache = await caches.open(RUNTIME_CACHE);
  const cached = await caches.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      runtimeCache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || networkPromise;
}

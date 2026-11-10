const CACHE = "family-hub-v75";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./theme-veggie.css",
  "./img/splash-family.jpg",
  "./img/home-portrait.jpg",
  "./img/home-wide.jpg",
  "./img/home-portrait-styled.jpg",
  "./img/home-wide-styled.jpg",
  "./app.js",
  "./gif-encode.js",
  "./gifenc.esm.js",
  "./gcal.js",
  "./widget-snapshot.js",
  "./firebase-config.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("gstatic.com") ||
    url.hostname.includes("accounts.google.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("apis.data.go.kr") ||
    url.hostname.includes("open-meteo.com") ||
    url.hostname.includes("pokeapi.co") ||
    url.hostname.includes("open.neis.go.kr") ||
    url.hostname.includes("raw.githubusercontent.com")
  ) {
    return;
  }

  // Show the saved app shell immediately, then refresh it in the background.
  const isAppShell =
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/gif-encode.js") ||
    url.pathname.endsWith("/gifenc.esm.js") ||
    url.pathname.endsWith("/styles.css") ||
    url.pathname.endsWith("/theme-veggie.css") ||
    url.pathname.endsWith("/firebase-config.js") ||
    url.pathname.endsWith("/gcal.js") ||
    url.pathname.endsWith("/widget-snapshot.js") ||
    url.pathname.endsWith("/sw.js");

  if (isAppShell) {
    const pending = (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const refresh = fetch(req)
        .then((res) => {
          if (res && res.ok) return cache.put(req, res.clone()).then(() => res);
          return res;
        })
        .catch(() => null);
      if (cached) return { response: cached, refresh };
      const fresh = await refresh;
      return { response: fresh || cached || new Response("", { status: 503 }), refresh: Promise.resolve() };
    })();
    event.waitUntil(pending.then((result) => result.refresh));
    event.respondWith(pending.then((result) => result.response));
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

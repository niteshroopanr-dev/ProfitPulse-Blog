// ---------------------------------------------------------------------------
// service-worker.js
//
// A service worker is required for an app to be "installable". This one keeps
// things simple and safe: it tries the network first (so you always see the
// freshest draft and analytics), and only falls back to a cached copy of the
// app shell when you are offline. It never caches your draft or analytics data,
// so you are never shown stale content.
// ---------------------------------------------------------------------------

const SHELL = "profitpulse-shell-v1";
const SHELL_FILES = [
  ".",
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only handle same-origin GETs (the app shell). Everything else (the GitHub
  // raw files, the Worker call) goes straight to the network untouched.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("index.html")))
  );
});

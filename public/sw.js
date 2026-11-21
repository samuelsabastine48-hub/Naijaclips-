
/*
 * NaijaClips Service Worker
 * File: public/sw.js
 */

const CACHE_NAME = "naijaclips-v1";

const APP_FILES = [
  "/",
  "/index.html",
  "/manifest.webmanifest"
];

// Install the service worker and cache core app files.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

// Remove old NaijaClips caches after an update.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("naijaclips-") &&
                key !== CACHE_NAME
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Serve cached app pages offline and fetch other resources normally.
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Do not cache Supabase API calls, uploads, or video streams.
  if (url.origin !== self.location.origin) return;

  // Use the network first for navigation, with an offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        return (
          await caches.match("/index.html")
        ) || Response.error();
      })
    );
    return;
  }

  // Use cached same-origin assets when available.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, copy);
          });
        }

        return response;
      });
    })
  );
});

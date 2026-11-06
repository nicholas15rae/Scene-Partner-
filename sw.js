// Scene Reader service worker: makes the app open offline AND keeps it up to date.
// Bump VERSION whenever you change any file (the CHANGELOG lists each release).
const VERSION = 'sr-v1.3.0';
// The big high-quality-voice engine files only change when the library changes,
// so they live in their own cache and survive app updates (no 23 MB re-download).
const ENGINE_CACHE = 'sr-engine-kokoro-1.2.1';
const KEEP = [VERSION, ENGINE_CACHE];
// Never touched: 'transformers-cache' (the voice model) and 'kokoro-voices' (voice files).

const CORE = [
  './', 'index.html', 'styles.css', 'app.js', 'parser.js', 'tones.js', 'handsfree.js', 'library.js', 'pdf-import.js', 'kokoro-worker.js',
  'manifest.webmanifest', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'vendor/qrcode.js', 'vendor/jsQR.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // cache: 'reload' skips the browser's HTTP cache, so a new version never stores old files
      .then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sr-') && !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Hugging Face downloads are handled by the voice engine

  // Voice-engine files: cache-first (large, versioned by library)
  if (url.pathname.includes('/vendor/kokoro/')) {
    e.respondWith(
      caches.open(ENGINE_CACHE).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) c.put(e.request, res.clone());
        return res;
      })
    );
    return;
  }

  // Everything else: network first (always the newest version), saved copy when offline.
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});

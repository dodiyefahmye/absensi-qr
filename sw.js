// Service worker: cache app shell & library CDN agar bisa dibuka saat offline.
const VERSION = 'absensi-qr-v1';
const SHELL = [
  './', './index.html', './config.js', './css/app.css', './manifest.webmanifest', './assets/icon.svg',
  './js/main.js', './js/lib/api.js', './js/lib/ui.js', './js/lib/vendor.js', './js/lib/theme.js', './js/lib/form.js',
  './js/lib/qr.js', './js/lib/offline.js', './js/lib/exporter.js',
  './js/components/form-builder.js', './js/components/participants.js',
  './js/pages/login.js', './js/pages/dashboard.js', './js/pages/editor.js', './js/pages/scanner.js',
  './js/pages/display.js', './js/pages/report.js', './js/pages/public-form.js', './js/pages/ticket.js', './js/pages/join.js',
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdn.sheetjs.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Library CDN & font: cache-first (versinya terkunci)
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }

  // File aplikasi sendiri: network-first, fallback ke cache saat offline
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))));
  }
  // Request ke Supabase tidak di-cache (selalu langsung ke server)
});

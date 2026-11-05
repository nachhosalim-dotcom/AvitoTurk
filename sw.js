/* Avito Türk — Service Worker v2: офлайн-оболочка + быстрый повторный запуск */
const VERSION = 'avito-turk-v3';
const SHELL = ['/', '/index.html', '/supabase-config.js', '/config.js', '/api.js', '/ui.components.js', '/handlers.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // API и динамика — всегда напрямую в сеть, без кэша
  if (url.pathname.startsWith('/supabase-api') || url.hostname.endsWith('.supabase.co')) return;

  const sameOrigin = url.origin === self.location.origin;
  const isCdn = /(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|cdn\.tailwindcss\.com|fonts\.(googleapis|gstatic)\.com)$/.test(url.hostname);

  if (req.mode === 'navigate' || (sameOrigin && /\.(html|js)$/.test(url.pathname))) {
    // network-first: пользователь всегда получает свежий код, офлайн — кэш
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
    );
    return;
  }
  if (isCdn || (sameOrigin && /\.(css|woff2?|png|jpg|svg|webp)$/.test(url.pathname))) {
    // stale-while-revalidate для библиотек и статики
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});

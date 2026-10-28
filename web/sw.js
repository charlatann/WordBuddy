// 离线缓存
const CACHE = 'wordbuddy-v5';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/app.js', 'js/store.js', 'js/speech.js', 'js/data.js',
  'js/core/content.js', 'js/core/text.js', 'js/core/srs.js', 'js/core/scoring.js', 'js/core/generator.js',
  'js/core/dict.js', 'js/core/scenegen.js', 'js/ocr.js', 'data/dict.json', 'js/core/sync.js', 'js/syncmgr.js',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// 联网时优先取最新版本（3 秒超时），离线或超时时用缓存
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    });
    if (!cached) return network;
    const timeout = new Promise(r => setTimeout(() => r(cached), 3000));
    return Promise.race([network.catch(() => cached), timeout]);
  }));
});

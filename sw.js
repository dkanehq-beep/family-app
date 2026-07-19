// 캐시 이름의 버전을 올리면 예전 캐시가 통째로 버려지고 새로 받아진다
const CACHE_NAME = 'family-app-v4';
const CORE_ASSETS = [
  './',
  './index.html',
  './home.html',
  './calendar.html',
  './board.html',
  './schedule.html',
  './mileage.html',
  './travel.html',
  './style.css',
  './common.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // 네트워크 우선: 인터넷이 되면 항상 최신 버전을 받고 캐시를 갱신,
  // 오프라인이거나 실패했을 때만 저장해둔 캐시를 사용
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

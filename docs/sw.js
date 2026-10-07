// Primero la red, para que los datos estén siempre al día; si no hay conexión, lo último que se vio.
const CACHE = 'produccion-qualita-v36';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const key = url.origin + url.pathname; // sin el ?v= de datos.json
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((res) => {   // siempre se consulta al servidor: la página y el programa van juntos
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
      return res;
    }).catch(() => caches.match(key).then((hit) => hit || Response.error()))
  );
});

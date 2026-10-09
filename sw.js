/* Service worker de Facility OS EC
   - Guarda la app y los scripts de Firebase para que abra aunque no haya internet.
   - La pagina (HTML) siempre intenta la red primero, asi las actualizaciones llegan solas.
   - Los datos (Firestore / Auth) NO pasan por aqui: Firestore ya guarda sus propios datos sin conexion.
   Para forzar una actualizacion de archivos guardados, sube el numero de VERSION. */
const VERSION = 'facility-v3';
const CACHE = VERSION;
const FIREBASE = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js'
];
const LOCAL = [
  './', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled([
      ...LOCAL.map(u => c.add(new Request(u, {cache: 'reload'}))),
      ...FIREBASE.map(async u => { const r = await fetch(u, {mode: 'no-cors'}); await c.put(u, r); })
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if(e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  // La pagina: red primero (para recibir actualizaciones); sin red, la ultima copia guardada
  if(req.mode === 'navigate'){
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if(res && res.ok){ const c = await caches.open(CACHE); c.put(req, res.clone()).catch(() => {}); c.put('./', res.clone()).catch(() => {}); }
        return res;
      } catch(err) {
        const c = await caches.open(CACHE);
        return (await c.match(req, {ignoreSearch: true})) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Archivos de la app y scripts de Firebase: usar lo guardado y refrescarlo en segundo plano
  const esLocal = url.origin === self.location.origin;
  const esFirebase = url.href.indexOf('https://www.gstatic.com/firebasejs/') === 0;
  if(esLocal || esFirebase){
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      const red = fetch(req).then(res => { if(res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()).catch(() => {}); return res; }).catch(() => null);
      return hit || (await red) || Response.error();
    })());
  }
  // Todo lo demas (Firestore, Auth, etc.) va directo a internet
});

const CACHE='nsite-archive-shell-repair-0.2.1-reviewfix1';
const FILES=['./','./index.html','./style.css','./app.js','./model.js','./archive-worker.js','./collect-worker.js','./vendor/archive-engine.js','./vendor/collector-engine.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('nsite-archive-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const url=new URL(e.request.url),scope=new URL(self.registration.scope);
 if(url.origin!==scope.origin||!FILES.some(f=>new URL(f,scope).pathname===url.pathname))return;
 e.respondWith(caches.open(CACHE).then(async c=>(await c.match(e.request))||fetch(e.request)));
});

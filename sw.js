const CACHE='buffet-v9-officer-quick-search-v946';
const ASSETS=['./index.html','./manifest.json','./online.js?v=9.4.6-officer-quick-search','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./robots.txt'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('buffet-v9-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==self.location.origin){e.respondWith(fetch(req));return;}
  if(req.mode==='navigate'){
    e.respondWith(fetch(req).then(r=>{
      if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy));}
      return r;
    }).catch(async()=>{const shell=new URL('./index.html',self.registration.scope).href;return (await caches.match(shell))||new Response('التطبيق غير محفوظ لهذا الجهاز بعد. افتحه مرة بالإنترنت أولًا.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});}));
    return;
  }
  e.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy));}return r;})));
});

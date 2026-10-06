const CACHE='buffet-v9-online-final-3';
const ASSETS=['./index.html','./verified.html','./manifest.json','./online.js','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./robots.txt'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('buffet-v9-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==self.location.origin){e.respondWith(fetch(req));return;}
  if(req.mode==='navigate'){
    const isVerify=/\/verified\.html$/.test(url.pathname);
    const fallback=isVerify?'./verified.html':'./index.html';
    e.respondWith(fetch(req).then(r=>{
      if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(fallback,copy));}
      return r;
    }).catch(()=>caches.match(fallback)));
    return;
  }
  e.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy));}return r;})));
});

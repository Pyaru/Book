// মাকতাবা সার্ভিস ওয়ার্কার: অ্যাপের ফাইল অফলাইনে চালানোর জন্য।
// বইয়ের PDF এখানে নয় — সেগুলো index.html আলাদা 'mk-books' ক্যাশে রাখে।
const VER = 'mk-shell-v2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VER);
    await c.addAll(SHELL).catch(() => {});
    // CDN ফাইল no-cors-এ রাখা হয় (opaque হলেও <script> হিসেবে চলে)
    await Promise.all(CDN.map(u => fetch(u, { mode: 'no-cors' }).then(r => c.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('mk-shell-') && k !== VER).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // পেজ: আগে নেটওয়ার্ক (সবসময় নতুন কোড), না পেলে ক্যাশ। ?b=... লিংকও একই index.html
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        const c = await caches.open(VER);
        c.put('index.html', r.clone());
        return r;
      } catch (_) {
        return (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // CDN স্ক্রিপ্ট/ফন্ট: ক্যাশ আগে
  if (CDN.includes(req.url) || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const r = await fetch(req);
        const c = await caches.open(VER);
        c.put(req, r.clone());
        return r;
      } catch (_) { return Response.error(); }
    })());
    return;
  }

  // নিজের ডোমেইনের ছোট ফাইল (আইকন, manifest): ক্যাশ আগে, পেছনে আপডেট
  // বই/অডিও (PDF, mp3…) ও Range অনুরোধ এখানে ধরা হয় না: সরাসরি নেটওয়ার্কে যাবে (206 উত্তর ক্যাশে রাখা যায় না, ধরলে বই খুলত না)
  if (url.origin === location.origin && (req.headers.has('range') || /\.(pdf|mp3|m4a|wav|ogg|aac)$/i.test(url.pathname))) return;
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      const net = fetch(req).then(async r => {
        if (r.ok) (await caches.open(VER)).put(req, r.clone());
        return r;
      }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
  // বাকি সব (শিট, বই, অডিও, প্রক্সি) সরাসরি নেটওয়ার্কে যায়
});

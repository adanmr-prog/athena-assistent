/* Athena Assistent — service worker: HTML cache-first met verversen op de achtergrond (v7.6, stale-while-revalidate), statische shell cache-first, API altijd via netwerk */
var CACHE = 'athena-assistent-v7.9';  // bump bij elke release (zie /release)
// v7.3 (iOS-review R2): de app luistert op controllerchange en toont dan de vaste balk #updateBalk (Herladen / Later); deze worker neemt met
// skipWaiting + clients.claim meteen over en herlaadt nooit zelf, zodat een open venster of composer niet verloren gaat.
// v7.9: de app registreert deze worker bij een eerste bezoek pas na de eerste geslaagde aanroep (of na 5 s, ook op het koppelscherm) en probeert een
// mislukte registratie opnieuw zodra de app weer in beeld komt; antwoordt de backend "Herlaad de app", dan toont ze #updateBalk en vraagt ze een update.
// v7.6: './index.html' staat niet meer apart in SHELL: dat was hetzelfde bestand (609 kB) twee keer downloaden bij elke installatie; install zet de
// response van './' ook onder die sleutel, zodat uitCache() en een navigatie naar /index.html hem blijven vinden.
var SHELL = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];  // './' moet vooraan blijven: install haalt hem apart op (zie hieronder)

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // v7.6 (iOS-review B1): './' altijd vers van het netwerk: GitHub Pages stuurt max-age=600, dus via de HTTP-cache kon een nieuwe worker vlak na een
    // release de oude index.html in zijn cache zetten en bleef die na Herladen staan. Eén download, twee sleutels.
    return c.addAll([new Request('./', { cache: 'no-cache' })].concat(SHELL.slice(1))).then(function () { return c.match('./'); }).then(function (r) { return r ? c.put('./index.html', r) : null; });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    // v1.0: alleen oude caches van deze app opruimen. CacheStorage is per origin, dus andere apps op hetzelfde domein blijven met rust.
    return Promise.all(keys.filter(function (k) { return k.indexOf('athena-assistent-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function isHtml(req, url) {
  return req.mode === 'navigate' || url.pathname.slice(-1) === '/' || url.pathname.slice(-11) === '/index.html';
}

// v4.3: HTML één keer per pad bewaren, niet per query (?demo=1&rol=…); opzoeken zonder query
function htmlSleutel(req) { var u = new URL(req.url); return u.origin + u.pathname; }
function uitCache(req) {
  return caches.match(req, { ignoreSearch: true, cacheName: CACHE }).then(function (hit) { return hit || caches.match('./index.html', { cacheName: CACHE }); });  // v7.6 (iOS-review O2): alleen de eigen cache
}

// Een response die via een redirect binnenkwam mag niet aan een navigatie worden geserveerd (Safari en Chrome weigeren die)
// en hoort ook niet zo in de cache. Herverpakken maakt er een gewone response van.
function zonderRedirect(resp) {
  if (!resp.redirected) return Promise.resolve(resp);
  return resp.blob().then(function (b) { return new Response(b, { status: resp.status, statusText: resp.statusText, headers: resp.headers }); });
}

// v7.6: cache-first met verversen op de achtergrond (stale-while-revalidate) voor HTML. Tot v7.5 was dit network-first met een time-out van 3 s:
// ook een warme start wachtte dan op het netwerk (gemeten: scriptstart 366 ms tegenover 239 ms uit de cache bij 150 ms RTT, en 3,5 s bij een hangende
// server). Nu komt de gecachte shell meteen; het netwerk ververst de cache voor de volgende keer. Een nieuwe release bumpt CACHE in dit bestand,
// waarna install de nieuwe shell ophaalt en de app via controllerchange de balk #updateBalk toont (v7.3) — de gebruiker kiest zelf Herladen.
function cacheEerst(e) {
  var req = e.request, sleutel = htmlSleutel(req), kopie = null;
  var vanNet = fetch(req.url, { cache: 'no-cache' }).then(function (resp) {
    if (!(resp && resp.ok)) return resp;  // serverfout: niet in de cache zetten
    return zonderRedirect(resp).then(function (schoon) { kopie = schoon.clone(); return schoon; });
  });
  // De verversing loopt buiten het antwoord om (de pagina wacht er niet op; iOS mag de worker anders stoppen vóór de put klaar is) en alleen als deze
  // cache nog bestaat: een nieuwere worker heeft hem anders net verwijderd en caches.open zou een achtergebleven cache maken (iOS-review O2).
  e.waitUntil(vanNet.then(function (resp) {
    if (!(resp && resp.ok) || !kopie) return;
    return caches.has(CACHE).then(function (ja) { if (ja) return caches.open(CACHE).then(function (c) { return c.put(sleutel, kopie); }); });
  }).then(null, function () {}));
  return uitCache(req).then(function (hit) {
    if (hit) return hit;  // warme start: meteen de shell uit de cache
    return vanNet.then(function (resp) { return resp && resp.ok ? resp : uitCache(req).then(function (h2) { return h2 || resp; }); });  // eerste bezoek: netwerk
  }).catch(function () { return uitCache(req); });  // offline zonder cache: niets te doen
}

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;  // API (POST, ander domein) nooit cachen
  if (/\/api(\/|$)/.test(url.pathname)) return;  // v6.0: de eigen server (Vercel: /api, /api/config) altijd via het netwerk
  if (isHtml(e.request, url)) { e.respondWith(cacheEerst(e)); return; }  // v7.6: stale-while-revalidate
  // v4.3: demo-code en de backend die de demo draait network-first; de cache is alleen de offline-terugval (nooit index.html als JS)
  if (/\/demo\/[\w-]+\.js$|\/backend\/Code\.gs$/.test(url.pathname)) {
    e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then(function (resp) {
      if (resp && resp.ok) { var kopie = resp.clone(); e.waitUntil(caches.open(CACHE).then(function (c) { return c.put(e.request, kopie); })); }
      return resp;
    }).catch(function () { return caches.match(e.request); }));
    return;
  }
  e.respondWith(  // statische assets: cache-first
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (resp) {
        if (!(resp && resp.ok)) return resp;  // v1.1: een 404 of serverfout nooit in de cache zetten, anders blijft die tot de volgende CACHE-bump
        var kopie = resp.clone();
        e.waitUntil(caches.open(CACHE).then(function (c) { return c.put(e.request, kopie); }));
        return resp;
      });
    })
  );
});

// Petri Angelführer – Service Worker v1.2
// Strategie: Cache-first für App-Shell, Network-first für API-Daten

const CACHE_NAME = 'petri-v1.2';
const CACHE_STATIC = 'petri-static-v1.2';
const CACHE_API    = 'petri-api-v1.2';

// Lokale App-Shell: ohne die startet die App offline nicht, muss vollständig sein
const STATIC_LOCAL = [
  './index.html',
  './manifest.json',
];

// Externe Assets: nice-to-have. Ein Ausfall beim Install darf die App-Shell
// nicht mitreißen, deshalb einzeln statt über addAll().
const STATIC_CDN = [
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
];

// API-Domains die gecacht werden (mit Ablaufzeit)
const API_CACHE_DURATION = {
  'api.open-meteo.com':       10 * 60 * 1000,  // 10 Minuten
  'pegelonline.wsv.de':        5 * 60 * 1000,  //  5 Minuten
  'tile.openstreetmap.org':   24 * 60 * 60 * 1000,  // 24 Stunden (Kartenkacheln)
};

// ── INSTALL ────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(async cache => {
        // Atomar: schlägt das fehl, soll auch der Install fehlschlagen
        await cache.addAll(STATIC_LOCAL);

        // Einzeln: jedes CDN-Asset darf für sich scheitern
        const results = await Promise.allSettled(STATIC_CDN.map(url => cache.add(url)));
        results.forEach((r, i) => {
          if (r.status === 'rejected')
            console.warn('[SW] CDN-Asset nicht gecacht:', STATIC_CDN[i], r.reason);
        });

        await self.skipWaiting();
      })
      .catch(err => {
        // Install scheitern lassen, damit der Browser es später erneut versucht –
        // besser als ein aktiver SW ohne App-Shell im Cache
        console.error('[SW] Install fehlgeschlagen, App-Shell nicht gecacht:', err);
        throw err;
      })
  );
});

// ── ACTIVATE ───────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_API)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Kartenkacheln: Cache-first mit langer TTL
  if (url.hostname.includes('openstreetmap.org') || url.pathname.includes('/tile/')) {
    event.respondWith(tileStrategy(event.request));
    return;
  }

  // API-Daten: Network-first, Fallback auf Cache
  if (url.hostname === 'api.open-meteo.com' || url.hostname.includes('pegelonline.wsv.de')) {
    event.respondWith(networkFirstWithCache(event.request, url.hostname));
    return;
  }

  // App-Shell: Cache-first
  if (event.request.destination === 'document' ||
      url.pathname.endsWith('.html') ||
      url.pathname.endsWith('.json') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Alles andere: normal fetchen
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

// ── STRATEGIEN ─────────────────────────────────────────────────────────────

// Cache-first: schnellster Pfad für statische Assets
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_STATIC);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    return new Response('Offline – kein Cache verfügbar', { status: 503 });
  }
}

// Network-first: für API-Daten, frischt Cache auf
async function networkFirstWithCache(request, hostname) {
  const cache = await caches.open(CACHE_API);
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Mit Zeitstempel speichern
      const body = await response.clone().text();
      const stamped = JSON.stringify({
        ts: Date.now(),
        ttl: API_CACHE_DURATION[hostname] || 300000,
        data: JSON.parse(body)
      });
      cache.put(request, new Response(body, {
        headers: { 'Content-Type': 'application/json', 'X-Cached-At': Date.now() }
      }));
    }
    return response;
  } catch (e) {
    // Offline: Cache zurückgeben (auch wenn veraltet)
    const cached = await cache.match(request);
    if (cached) {
      console.log('[SW] Offline – nutze gecachte API-Antwort');
      return cached;
    }
    return new Response(JSON.stringify({ error: 'offline', message: 'Keine Internetverbindung' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Kartenkacheln langzeit cachen
async function tileStrategy(request) {
  const cache = await caches.open(CACHE_API);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (e) {
    return cached || new Response('', { status: 503 });
  }
}

// ── HINTERGRUND-SYNC (zukünftig: Fang-Log hochladen) ──────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-catch-log') {
    event.waitUntil(syncCatchLog());
  }
});

async function syncCatchLog() {
  // Placeholder für zukünftigen Fang-Log Backend-Upload
  console.log('[SW] Background sync: catch log würde hier hochgeladen');
}

// ── PUSH-BENACHRICHTIGUNGEN (Score > 80%) ─────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Petri – Fang-Score', {
      body: data.body || 'Aktuelle Bedingungen prüfen!',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'petri-score',
      renotify: true,
      data: { url: data.url || './index.html' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || './index.html')
  );
});

console.log('[SW] Petri Service Worker v1.2 geladen');

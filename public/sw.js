// Service Worker for Egels Map PWA
// Version: 1.0.3
// IMPORTANT: Increment this version number with EVERY deployment to trigger PWA updates!
const CACHE_NAME = 'egels-map-v6';
const TILE_CACHE_NAME = 'egels-map-tiles-v4';

// Val Thorens area bounding box (just Val Thorens ski resort)
const VAL_THORENS_BOUNDS = {
  minLat: 45.27,  // South
  maxLat: 45.32,  // North
  minLng: 6.56,   // West
  maxLng: 6.61    // East
};

// Zoom levels to cache (12-17 for detailed coverage)
const ZOOM_LEVELS = [12, 13, 14, 15, 16, 17];

// Convert lat/lng to tile coordinates
function latLngToTile(lat, lng, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lng + 180) / 360 * n);
  const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
  return { x, y, z: zoom };
}

// Generate all tile URLs for Val Thorens area
function generateTileUrls() {
  const urls = [];
  const servers = ['a', 'b', 'c']; // OpenStreetMap tile servers

  ZOOM_LEVELS.forEach(zoom => {
    const minTile = latLngToTile(VAL_THORENS_BOUNDS.maxLat, VAL_THORENS_BOUNDS.minLng, zoom);
    const maxTile = latLngToTile(VAL_THORENS_BOUNDS.minLat, VAL_THORENS_BOUNDS.maxLng, zoom);

    for (let x = minTile.x; x <= maxTile.x; x++) {
      for (let y = minTile.y; y <= maxTile.y; y++) {
        const server = servers[(x + y) % 3]; // Distribute across servers
        urls.push(`https://${server}.tile.openstreetmap.org/${zoom}/${x}/${y}.png`);
      }
    }
  });

  console.log(`Generated ${urls.length} tile URLs for caching`);
  return urls;
}

// Listen for SKIP_WAITING message
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Listen for cache tiles message from app
  if (event.data && event.data.type === 'CACHE_TILES') {
    event.waitUntil(cacheTiles());
  }
});

// Cache tiles progressively
async function cacheTiles() {
  const tileUrls = generateTileUrls();
  const cache = await caches.open(TILE_CACHE_NAME);

  console.log(`🗺️ Starting tile cache download... (${tileUrls.length} tiles)`);
  let cached = 0;
  const batchSize = 50; // Cache in batches to avoid overwhelming

  for (let i = 0; i < tileUrls.length; i += batchSize) {
    const batch = tileUrls.slice(i, i + batchSize);

    await Promise.allSettled(
      batch.map(async url => {
        try {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
            cached++;

            // Send progress update to all clients
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
              client.postMessage({
                type: 'CACHE_PROGRESS',
                cached,
                total: tileUrls.length,
                percentage: Math.round((cached / tileUrls.length) * 100)
              });
            });
          }
        } catch (err) {
          console.error('Failed to cache tile:', url, err);
        }
      })
    );

    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`Cached ${cached} tiles out of ${tileUrls.length}`);

  // Notify completion
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'CACHE_COMPLETE',
      cached,
      total: tileUrls.length
    });
  });
}

// Install service worker
self.addEventListener('install', (event) => {
  console.log('Service worker installed');
  // Don't cache tiles on install - wait for user trigger
});

// Fetch strategy: Cache-first for tiles, network-first for everything else
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Check if this is a map tile request
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // Not in cache, fetch from network and cache it
        return fetch(event.request).then(response => {
          if (response.ok) {
            caches.open(TILE_CACHE_NAME).then(cache => {
              cache.put(event.request, response.clone());
            });
          }
          return response;
        });
      })
    );
  } else {
    // Network-first for app resources (including CSS and JS)
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Only cache successful responses
          if (response.ok) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // If no cache, return a basic error response
            return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
          });
        })
    );
  }
});

// Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== TILE_CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Force claim clients to ensure new service worker takes control
      return self.clients.claim();
    })
  );
});

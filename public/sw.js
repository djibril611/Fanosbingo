const CACHE_NAME = 'bingo-game-v1';
const RUNTIME_CACHE = 'bingo-runtime-v1';
const SYNC_TAG = 'sync-game-actions';

const urlsToCache = [
  '/',
  '/index.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    if (request.method === 'POST' && url.pathname.includes('/functions/v1/')) {
      event.respondWith(handleOfflineRequest(request));
    }
    return;
  }

  event.respondWith(
    caches.match(request).then((response) => {
      if (response) {
        return response;
      }

      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          return caches.match(request);
        });
    })
  );
});

async function handleOfflineRequest(request) {
  try {
    return await fetch(request);
  } catch {
    const requestData = await request.json();
    const syncQueue = await getOrCreateSyncQueue();

    syncQueue.push({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers),
      body: requestData,
      timestamp: Date.now(),
      id: Math.random().toString(36).substr(2, 9),
    });

    await saveSyncQueue(syncQueue);

    return new Response(
      JSON.stringify({
        success: true,
        offline: true,
        id: syncQueue[syncQueue.length - 1].id,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

async function getOrCreateSyncQueue() {
  const db = await openDB();
  const tx = db.transaction('syncQueue', 'readonly');
  const store = tx.objectStore('syncQueue');
  return new Promise((resolve) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
  });
}

async function saveSyncQueue(queue) {
  const db = await openDB();
  const tx = db.transaction('syncQueue', 'readwrite');
  const store = tx.objectStore('syncQueue');
  await new Promise((resolve) => {
    store.clear();
    queue.forEach((item) => store.add(item));
    tx.oncomplete = resolve;
  });
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('BingoGameDB', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('gameCache')) {
        db.createObjectStore('gameCache', { keyPath: 'id' });
      }
    };
  });
}

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncQueue());
  }
});

async function syncQueue() {
  const syncQueue = await getOrCreateSyncQueue();

  for (const item of syncQueue) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: JSON.stringify(item.body),
      });

      if (response.ok) {
        await removeSyncItem(item.id);
      }
    } catch (error) {
      console.error('Sync failed for item:', item.id, error);
    }
  }
}

async function removeSyncItem(id) {
  const db = await openDB();
  const tx = db.transaction('syncQueue', 'readwrite');
  const store = tx.objectStore('syncQueue');
  await new Promise((resolve) => {
    store.delete(id);
    tx.oncomplete = resolve;
  });
}

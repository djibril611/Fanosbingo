const DB_NAME = 'bingo-card-layouts';
const DB_VERSION = 1;
const STORE_NAME = 'layouts';
const CACHE_KEY = 'all_layouts';
const CACHE_VERSION_KEY = 'cache_version';
const CURRENT_CACHE_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });

  return dbPromise;
}

export async function getCachedLayouts(): Promise<Record<number, number[][]> | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      const versionRequest = store.get(CACHE_VERSION_KEY);
      versionRequest.onsuccess = () => {
        const cachedVersion = versionRequest.result;
        if (cachedVersion !== CURRENT_CACHE_VERSION) {
          resolve(null);
          return;
        }

        const layoutRequest = store.get(CACHE_KEY);
        layoutRequest.onsuccess = () => {
          resolve(layoutRequest.result || null);
        };
        layoutRequest.onerror = () => reject(layoutRequest.error);
      };
      versionRequest.onerror = () => reject(versionRequest.error);
    });
  } catch {
    return null;
  }
}

export async function setCachedLayouts(layouts: Record<number, number[][]>): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      store.put(CURRENT_CACHE_VERSION, CACHE_VERSION_KEY);
      const request = store.put(layouts, CACHE_KEY);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    return;
  }
}

export async function getLayoutFromCache(cardNumber: number): Promise<number[][] | null> {
  try {
    const layouts = await getCachedLayouts();
    if (layouts && layouts[cardNumber]) {
      return layouts[cardNumber];
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearLayoutCache(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    return;
  }
}

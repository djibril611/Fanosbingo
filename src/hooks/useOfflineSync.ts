import { useEffect, useRef, useCallback } from 'react';

interface SyncQueueItem {
  id: string;
  url: string;
  method: string;
  body: any;
  timestamp: number;
}

export function useOfflineSync() {
  const syncQueueRef = useRef<SyncQueueItem[]>([]);
  const dbRef = useRef<IDBDatabase | null>(null);

  useEffect(() => {
    registerServiceWorker();
    openIndexedDB();
  }, []);

  const registerServiceWorker = async () => {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch (error) {
        console.error('Service worker registration failed:', error);
      }
    }
  };

  const openIndexedDB = () => {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('BingoGameDB', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        dbRef.current = request.result;
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('gameCache')) {
          db.createObjectStore('gameCache', { keyPath: 'id' });
        }
      };
    });
  };

  const addToSyncQueue = useCallback(
    async (item: Omit<SyncQueueItem, 'id' | 'timestamp'>): Promise<string> => {
      const id = Math.random().toString(36).substr(2, 9);
      const queueItem: SyncQueueItem = {
        ...item,
        id,
        timestamp: Date.now(),
      };

      syncQueueRef.current.push(queueItem);

      if (dbRef.current) {
        const tx = dbRef.current.transaction('syncQueue', 'readwrite');
        const store = tx.objectStore('syncQueue');
        store.add(queueItem);
      }

      return id;
    },
    []
  );

  const getSyncQueue = useCallback(async (): Promise<SyncQueueItem[]> => {
    if (!dbRef.current) {
      await openIndexedDB();
    }

    return new Promise((resolve) => {
      const tx = dbRef.current!.transaction('syncQueue', 'readonly');
      const store = tx.objectStore('syncQueue');
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };
    });
  }, []);

  const removeSyncQueueItem = useCallback(async (id: string): Promise<void> => {
    syncQueueRef.current = syncQueueRef.current.filter(item => item.id !== id);

    if (dbRef.current) {
      const tx = dbRef.current.transaction('syncQueue', 'readwrite');
      const store = tx.objectStore('syncQueue');
      store.delete(id);
    }
  }, []);

  const cacheGameData = useCallback(
    async (key: string, data: any): Promise<void> => {
      if (!dbRef.current) {
        await openIndexedDB();
      }

      const tx = dbRef.current!.transaction('gameCache', 'readwrite');
      const store = tx.objectStore('gameCache');
      store.put({ id: key, data, timestamp: Date.now() });
    },
    []
  );

  const getCachedGameData = useCallback(async (key: string): Promise<any | null> => {
    if (!dbRef.current) {
      await openIndexedDB();
    }

    return new Promise((resolve) => {
      const tx = dbRef.current!.transaction('gameCache', 'readonly');
      const store = tx.objectStore('gameCache');
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result?.data || null);
      };
    });
  }, []);

  const processSyncQueue = useCallback(async () => {
    const queue = await getSyncQueue();

    for (const item of queue) {
      try {
        const response = await fetch(item.url, {
          method: item.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.body),
        });

        if (response.ok) {
          await removeSyncQueueItem(item.id);
        }
      } catch (error) {
        console.error('Sync failed for item:', item.id, error);
      }
    }
  }, [getSyncQueue, removeSyncQueueItem]);

  useEffect(() => {
    const handleOnline = () => {
      processSyncQueue();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [processSyncQueue]);

  return {
    addToSyncQueue,
    getSyncQueue,
    removeSyncQueueItem,
    cacheGameData,
    getCachedGameData,
    processSyncQueue,
  };
}

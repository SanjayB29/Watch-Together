// IndexedDB storage for local host video file so it survives page navigation and refresh
const DB_NAME = 'CineLinkDB';
const STORE_NAME = 'mediaFiles';
const DB_VERSION = 1;

let inMemoryFile: File | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveHostFile(file: File): Promise<void> {
  inMemoryFile = file;
  if (typeof window !== 'undefined') {
    (window as any).__activeHostFile = file;
  }
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(file, 'currentHostMovie');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[FileStore] Failed to save to IndexedDB, fallback to memory:', e);
  }
}

export async function loadHostFile(): Promise<File | null> {
  if (typeof window !== 'undefined' && (window as any).__activeHostFile) {
    return (window as any).__activeHostFile;
  }
  if (inMemoryFile) {
    return inMemoryFile;
  }
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('currentHostMovie');
      req.onsuccess = () => {
        const file = req.result as File | undefined;
        if (file) {
          inMemoryFile = file;
          if (typeof window !== 'undefined') {
            (window as any).__activeHostFile = file;
          }
          resolve(file);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return inMemoryFile;
  }
}

export function getActiveHostFile(): File | null {
  if (typeof window !== 'undefined' && (window as any).__activeHostFile) {
    return (window as any).__activeHostFile;
  }
  return inMemoryFile;
}

export function setActiveHostFile(file: File | null) {
  inMemoryFile = file;
  if (typeof window !== 'undefined') {
    (window as any).__activeHostFile = file;
  }
  if (file) {
    saveHostFile(file).catch(console.warn);
  }
}

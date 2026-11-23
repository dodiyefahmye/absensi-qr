// Antrean offline & cache lokal (IndexedDB).
const DB_NAME = 'absensi-qr';
let dbp = null;

function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', { keyPath: 'client_id' });
      if (!d.objectStoreNames.contains('cache')) d.createObjectStore('cache');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export const queue = {
  add: (item) => tx('queue', 'readwrite', (s) => s.put(item)),
  all: () => tx('queue', 'readonly', (s) => s.getAll()),
  remove: (id) => tx('queue', 'readwrite', (s) => s.delete(id)),
  async forEvent(eventId) { return (await this.all()).filter((x) => x.event_id === eventId); },
};

export const cache = {
  set: (key, val) => tx('cache', 'readwrite', (s) => s.put(val, key)),
  get: (key) => tx('cache', 'readonly', (s) => s.get(key)),
};

export function deviceId() {
  let id = localStorage.getItem('device-id');
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('device-id', id);
  }
  return id;
}

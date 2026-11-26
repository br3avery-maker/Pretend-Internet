const prefix = 'pretend-nostr:';
let connection;

export function setting(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(prefix + key)) ?? fallback; }
  catch { return fallback; }
}
export function setSetting(key, value) {
  localStorage.setItem(prefix + key, JSON.stringify(value));
}
function database() {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('pretend-internet-nostr', 3);
    request.onupgradeneeded = event => {
      if (event.oldVersion < 1) {
        for (const name of ['events', 'books', 'files', 'receipts']) request.result.createObjectStore(name, { keyPath: 'id' });
      }
      if (event.oldVersion < 2) request.result.createObjectStore('connections', { keyPath: 'id' });
      if (event.oldVersion < 3) {
        const events = request.transaction.objectStore('events');
        events.createIndex('kind','kind');
        events.createIndex('authorKind',['pubkey','kind']);
        const meta = request.result.createObjectStore('cache-meta', {keyPath:'id'});
        const usage = {id:'events',count:0,bytes:0};
        const cursor = events.openCursor();
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (row) { usage.count++; usage.bytes += eventBytes(row.value); row.continue(); }
          else meta.put(usage);
        };
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); connection = undefined; };
      resolve(request.result);
    };
    request.onblocked = () => { connection = undefined; reject(new Error('Close older Pretend Internet tabs before continuing.')); };
    request.onerror = () => reject(request.error);
  });
  return connection;
}
async function transact(name, mode, operation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const result = operation(tx.objectStore(name));
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
export const all = name => transact(name, 'readonly', store => store.getAll());
export const get = (name, id) => transact(name, 'readonly', store => store.get(id));
export const put = (name, value) => name === 'events' ? putMany(name,[value]) : transact(name, 'readwrite', store => store.put(value));
export const drop = (name, id) => {
  if (name === 'events') throw Error('Signed cache records are preserved; use explicit backup/recovery tools.');
  return transact(name, 'readwrite', store => store.delete(id));
};
export function putMany(name, records) {
  if (name === 'events') return storeEvents(records);
  return transact(name, 'readwrite', store => {
    for (const record of records) store.put(record);
  });
}
export function saveCollections(collections) { setSetting('collections', collections); }
export function toggleList(key, value) {
  const list = new Set(setting(key, []));
  const added = !list.delete(value);
  if (added) list.add(value);
  setSetting(key, [...list]);
  return added;
}
export function saveAccount(pubkey, activate = true) {
  setSetting('accounts', [...new Set([...setting('accounts', []), pubkey])]);
  if (activate) setSetting('account', pubkey);
}

// Refuse new cache rows when the budget is reached, never evict signed evidence
// or silently overwrite an existing event. Existing oversized databases remain readable.
export const eventCacheLimits = { count: 20000, bytes: 64 * 1024 * 1024 };
const eventBytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
export function fitsEventCache(usage, bytes) {
  return usage.count < eventCacheLimits.count && usage.bytes + bytes <= eventCacheLimits.bytes;
}
async function storeEvents(records) {
  const db = await database();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(['events','cache-meta'],'readwrite');
    const events = tx.objectStore('events'), meta = tx.objectStore('cache-meta');
    const counts = {stored:0,skipped:0};
    const request = meta.get('events');
    request.onsuccess = () => {
      const usage = request.result ?? {id:'events',count:0,bytes:0};
      let index=0;
      const next = () => {
        if (index===records.length) { meta.put(usage); return; }
        const row=records[index++];
        const lookup=events.getKey(row.id);
        lookup.onsuccess=()=>{
          if (lookup.result === undefined) {
            const bytes=eventBytes(row);
            if (fitsEventCache(usage,bytes)) { events.add(row); usage.count++; usage.bytes+=bytes; counts.stored++; }
            else counts.skipped++;
          }
          next();
        };
      };
      next();
    };
    tx.oncomplete=()=>resolve(counts);
    tx.onerror=tx.onabort=()=>reject(tx.error??Error('Cache transaction failed.'));
  });
}
export async function cachedEvents(kinds,author='') {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('events','readonly');
    const index=tx.objectStore('events').index(author?'authorKind':'kind');
    const requests=[...new Set(kinds)].map(kind=>index.getAll(author?[author,kind]:kind));
    tx.oncomplete=()=>resolve(requests.flatMap(request=>request.result));
    tx.onerror=tx.onabort=()=>reject(tx.error);
  });
}

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
    const request = indexedDB.open('pretend-internet-nostr', 2);
    request.onupgradeneeded = event => {
      if (event.oldVersion < 1) {
        for (const name of ['events', 'books', 'files', 'receipts']) request.result.createObjectStore(name, { keyPath: 'id' });
      }
      request.result.createObjectStore('connections', { keyPath: 'id' });
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
export const put = (name, value) => transact(name, 'readwrite', store => store.put(value));
export const drop = (name, id) => transact(name, 'readwrite', store => store.delete(id));
export function putMany(name, records) {
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

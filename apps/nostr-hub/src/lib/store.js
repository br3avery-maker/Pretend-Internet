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

// A single read transaction gives a consistent local record snapshot. Connections
// and their wrapping keys are deliberately not among the portable stores.
const portableStores=['events','books','files','receipts'];
export async function backupSnapshot() {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(portableStores,'readonly');
    const requests=portableStores.map(name=>[name,tx.objectStore(name).getAll()]);
    tx.oncomplete=()=>resolve(Object.fromEntries(requests.map(([name,r])=>[name,r.result])));
    tx.onerror=tx.onabort=()=>reject(tx.error);
  });
}
export function localBackupSettings(allowed) {
  const values=Object.create(null);
  for(let i=0;i<localStorage.length;i++){
    const name=localStorage.key(i);
    if(name?.startsWith(prefix)&&allowed(name.slice(prefix.length)))values[name.slice(prefix.length)]=JSON.parse(localStorage.getItem(name));
  }
  return values;
}
export function restoreBackupSettings(values,equal) {
  const added=[];
  const rollback=()=>{for(const key of added)localStorage.removeItem(prefix+key);};
  for(const [key,value] of Object.entries(values)){
    const raw=localStorage.getItem(prefix+key);
    if(raw!==null&&!equal(JSON.parse(raw),value))throw Error('Backup conflicts with existing setting: '+key+'. Nothing overwritten.');
  }
  try {
    for(const [key,value] of Object.entries(values))if(localStorage.getItem(prefix+key)===null){
      setSetting(key,value);added.push(key);
    }
  }catch(error){rollback();throw error;}
  return rollback;
}
export async function restoreBackupRecords(records,equal) {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction([...portableStores,'cache-meta'],'readwrite');
    const meta=tx.objectStore('cache-meta');
    let failure;
    const requests=portableStores.map(name=>[name,tx.objectStore(name).getAll()]);
    const usage=meta.get('events');
    let pending=requests.length+1;
    const ready=()=>{
      if(--pending)return;
      try{
        const next={...usage.result};
        for(const [name,request] of requests){
          const existing=new Map(request.result.map(row=>[row.id,row]));
          for(const row of records[name]){
            if(existing.has(row.id)){
              if(!equal(existing.get(row.id),row))throw Error('Backup conflicts with existing '+name+' record: '+row.id+'. Nothing overwritten.');
              continue;
            }
            if(name==='events'){
              const bytes=eventBytes(row);
              if(!fitsEventCache(next,bytes))throw Error('Backup exceeds remaining signed-event cache capacity.');
              next.bytes+=bytes;next.count++;
            }
            tx.objectStore(name).add(row);
          }
        }
        meta.put(next);
      }catch(error){failure=error;tx.abort();}
    };
    for(const [,request] of requests)request.onsuccess=ready;
    usage.onsuccess=ready;
    tx.oncomplete=()=>resolve();
    tx.onerror=tx.onabort=()=>reject(failure??tx.error??Error('Restore transaction aborted.'));
  });
}

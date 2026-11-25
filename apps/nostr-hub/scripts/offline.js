import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dir = resolve(import.meta.dirname, '../dist');
const paths = (await readdir(dir, { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name !== 'sw.js')
  .map(entry => resolve(entry.parentPath, entry.name).slice(dir.length + 1))
  .sort();
const version = createHash('sha256');
for (const path of paths) version.update(path).update(await readFile(resolve(dir, path)));
const files = JSON.stringify(paths);
await writeFile(resolve(dir,'sw.js'), `const scope = self.registration.scope;
const group = 'pretend-internet:' + scope + ':';
const key = group + '${version.digest('hex').slice(0,16)}';
const files = new Set(${files});
self.addEventListener('install', event => {
  event.waitUntil(caches.open(key).then(cache => cache.addAll([...files].map(path => new URL(path, scope)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(name => name.startsWith(group) && name !== key).map(name => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(scope)) return;
  const url = new URL(event.request.url);
  const path = url.pathname.slice(new URL(scope).pathname.length) || 'index.html';
  if (!files.has(path)) return;
  event.respondWith(caches.open(key).then(cache => cache.match(new URL(path, scope))).then(result => result || fetch(event.request)));
});
`);

import { unzipSync } from 'fflate';
import { digest, kinds, safePath, siteURL, webURL } from './model.js';

const maxBytes = 48 * 1024 * 1024;
const maxFile = 24 * 1024 * 1024;
const maxFiles = 256;
const hex = /^[0-9a-f]{64}$/;
const enc = new TextEncoder();
const mime = {
  html: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json',
  txt: 'text/plain', md: 'text/markdown', wasm: 'application/wasm', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  ico: 'image/x-icon', woff2: 'font/woff2', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4',
};
const typeFor = path => mime[path.split('.').at(-1)?.toLowerCase()] ?? 'application/octet-stream';
export const now = () => Math.floor(Date.now() / 1000);
export const slugValid = name => /^[a-z0-9](?:[a-z0-9-]{0,11}[a-z0-9])?$/.test(name);
const bounded = (size, limit) => { if (size > limit) throw new Error('The selected input exceeds the file-size limit.'); };

export async function siteFiles(selected) {
  if (!selected.length) throw new Error('Choose an HTML file, ZIP, or folder.');
  const first = selected[0];
  const loose = selected.length === 1 && !first.webkitRelativePath;
  let files;
  if (loose && /\.zip$/i.test(first.name)) {
    bounded(first.size, maxBytes);
    let count = 0;
    let total = 0;
    const zipPaths = new Set();
    const contents = unzipSync(new Uint8Array(await first.arrayBuffer()), { filter(entry) {
      if (entry.name.endsWith('/')) return false;
      const path = safePath(entry.name);
      if (zipPaths.has(path)) throw new Error('Two ZIP entries use the same site path.');
      zipPaths.add(path);
      bounded(entry.originalSize, maxFile);
      total += entry.originalSize;
      bounded(total, maxBytes);
      if (++count > maxFiles) throw new Error('A site can contain up to 256 files.');
      return true;
    } });
    files = Object.entries(contents).map(([path, bytes]) => ({ path, bytes }));
  } else {
    if (loose && !/\.html?$/i.test(first.name)) throw new Error('Choose an HTML file, ZIP, or folder.');
    bounded(selected.reduce((sum,file) => sum + file.size, 0), maxBytes);
    if (selected.length > maxFiles) throw new Error('A site can contain up to 256 files.');
    files = await Promise.all(selected.map(async file => {
      bounded(file.size, maxFile);
      return { path: loose ? 'index.html' : file.webkitRelativePath || file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
    }));
  }
  const input = files.map(file => ({ ...file, path: safePath(file.path) }));
  if (!input.some(file => file.path === 'index.html')) {
    const root = input[0]?.path.split('/')[0];
    if (root && input.every(file => file.path.startsWith(root + '/'))) {
      for (const file of input) file.path = file.path.slice(root.length + 1);
    }
  }
  if (!input.some(file => file.path === 'index.html' && file.bytes.length)) throw new Error('The folder or ZIP needs a nonempty index.html entry.');
  bounded(input.reduce((sum,file) => sum + file.bytes.length, 0), maxBytes);
  const paths = new Set();
  return Promise.all(input.map(async file => {
    const path = '/' + safePath(file.path);
    bounded(file.bytes.length, maxFile);
    if (paths.has(path)) throw new Error('Two inputs use the same site path.');
    paths.add(path);
    return { ...file, path, hash: await digest(file.bytes), type: typeFor(path) };
  }));
}
export async function mediaFile(file, prefix) {
  if (!file || file.size === 0 || !file.type.startsWith(prefix)) throw new Error(`Choose a valid ${prefix.replace('/', '')} file.`);
  bounded(file.size, maxFile);
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { path: file.name, bytes, hash: await digest(bytes), type: file.type };
}
export async function aggregate(files) {
  return digest(enc.encode(files.map(file => `${file.hash} ${file.path}\n`).sort().join('')));
}
export function uploadAuth(file, server, clock = now()) {
  return { kind: 24242, created_at: clock, content: 'Upload ' + file.hash,
    tags: [['t', 'upload'], ['x', file.hash], ['expiration', String(clock + 300)], ['server', new URL(server).host]] };
}
export async function uploadVerified(file, server, sign, fetcher = fetch) {
  const auth = await sign(uploadAuth(file, server));
  const token = btoa(String.fromCharCode(...enc.encode(JSON.stringify(auth)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const response = await fetcher(server.replace(/\/$/, '') + '/upload', {
    method: 'PUT', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { Authorization: 'Nostr ' + token, 'Content-Type': file.type, 'X-SHA-256': file.hash },
    body: file.bytes,
  });
  if (!response.ok) throw new Error(`Blossom declined ${file.path} with HTTP ${response.status}.`);
  const item = await response.json();
  const url = webURL(item.url);
  const serverHost = new URL(server).hostname;
  const fileHost = url && new URL(url).hostname;
  const sameService = fileHost && (fileHost === serverHost || fileHost.endsWith('.' + serverHost));
  if (item.sha256 !== file.hash || !sameService) throw new Error('The Blossom upload descriptor did not match the reviewed file and server.');
  const checked = await fetcher(url, { credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(25000) });
  if (!checked.ok) throw new Error('The uploaded file could not be independently retrieved.');
  const reader = checked.body?.getReader();
  if (!reader) throw new Error('The Blossom server returned no file body.');
  const bytes = new Uint8Array(file.bytes.length);
  let offset = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (offset + value.length > bytes.length) { await reader.cancel(); throw new Error('The retrieved Blossom file is larger than the selected file.'); }
    bytes.set(value, offset);
    offset += value.length;
  }
  if (offset !== file.bytes.length || await digest(bytes) !== file.hash) throw new Error('The retrieved Blossom file differs from the selected file.');
  return url;
}
export async function template(draft, files, urls, clock = now()) {
  if (draft.type === 'nsite') {
    return {
      kind: kinds.site, created_at: clock, content: '',
      tags: [['d', draft.slug], ['title', draft.title], ['description', draft.body],
        ...files.map(file => ['path', file.path, file.hash]), ['x', await aggregate(files), 'aggregate'], ['server', draft.server]],
    };
  }
  if (draft.type === 'track') {
    const audio = files[0];
    return {
      kind: kinds.track, created_at: clock, content: draft.body,
      tags: [['d', draft.slug], ['title', draft.title], ['artist', draft.artist], ['t', 'music'], ['url', urls[audio.hash]], ['m', audio.type],
        ...(files[1] ? [['image', urls[files[1].hash]]] : [])],
    };
  }
  if (draft.type === 'article') {
    return {
      kind: kinds.article, created_at: clock, content: draft.body,
      tags: [['d', draft.slug], ['title', draft.title], ['published_at', String(clock)]],
    };
  }
  return { kind: kinds.note, created_at: clock, content: draft.body, tags: [] };
}
export function verifyReview(draft, files) {
  if (!['note', 'article', 'track', 'nsite'].includes(draft.type)) throw new Error('Choose a publication type.');
  if (!draft.relays.length) throw new Error('Choose at least one reviewed relay.');
  if (draft.type !== 'note' && (!draft.title || !draft.slug)) throw new Error('Add a title and a stable identifier.');
  if (draft.type === 'nsite' && (!slugValid(draft.slug) || !files.some(file => file.path === '/index.html'))) {
    throw new Error('An nsite needs a lowercase identifier of up to 13 characters and index.html.');
  }
  if (draft.type === 'track' && (!draft.artist || !files[0]?.type.startsWith('audio/'))) throw new Error('Add an artist and an audio file before reviewing this release.');
  if (['track', 'nsite'].includes(draft.type) && !draft.server) throw new Error('Choose a Blossom server for the selected files.');
  if (['article', 'note'].includes(draft.type) && !draft.body) throw new Error('Write something before reviewing.');
  if (files.some(file => !hex.test(file.hash))) throw new Error('A file digest is missing.');
}
export function jobId(author, draft, files) {
  return digest(enc.encode(JSON.stringify({ author, draft, files: files.map(file => [file.path, file.hash]) })));
}
export async function execute({ draft, files, signer, transport, previous, checkpoint, upload = uploadVerified }) {
  verifyReview(draft, files);
  const fingerprint = await jobId(signer.pubkey, draft, files);
  const job = previous?.id === fingerprint ? structuredClone(previous) : {
    id: fingerprint, account: signer.pubkey, type: draft.type, title: draft.title, createdAt: Date.now(), status: 'reviewed', uploads: {}, attempts: [],
  };
  for (const file of files) {
    if (job.uploads[file.hash]) continue;
    job.uploads[file.hash] = await upload(file, draft.server, signed => signer.sign(signed));
    job.status = 'uploading';
    await checkpoint(job);
  }
  job.event ??= await signer.sign(await template(draft, files, job.uploads));
  job.status = 'signed';
  await checkpoint(job);
  const outcomes = await Promise.all(draft.relays.map(async url => {
    try {
      const entry = await transport.publish(url, job.event, { authPubkey: signer.pubkey, signAuth: value => signer.sign(value) });
      return { url, accepted: entry.accepted, verified: entry.verified === true, code: entry.code };
    } catch (error) { return { url, accepted: false, verified: false, code: error.code || 'unavailable' }; }
  }));
  job.attempts = outcomes;
  job.status = outcomes.every(item => item.verified) ? 'verified' : outcomes.some(item => item.verified)
    ? 'partially-verified' : outcomes.some(item => item.accepted) ? 'accepted-unverified' : 'not-delivered';
  job.url = draft.type === 'nsite' ? siteURL(signer.pubkey, draft.slug) : '';
  await checkpoint(job);
  return job;
}

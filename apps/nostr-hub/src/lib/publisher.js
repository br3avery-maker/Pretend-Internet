import { unzipSync } from 'fflate';
import { nip19 } from 'nostr-tools';
import { checkSignature } from './nostr.js';
import { assertHeads, planSite, siteHeads, siteServers, siteSlug, verifySavedFiles } from './site-publication.js';
import { digest, kinds, safePath, siteURL, tag, tags, webURL } from './model.js';

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
export const slugValid = siteSlug;
const bounded = (size, limit) => { if (size > limit) throw new Error('The selected input exceeds the file-size limit.'); };

export async function siteFiles(selected, { partial = false } = {}) {
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
    if (loose && !partial && !/\.html?$/i.test(first.name)) throw new Error('Choose an HTML file, ZIP, or folder.');
    bounded(selected.reduce((sum,file) => sum + file.size, 0), maxBytes);
    if (selected.length > maxFiles) throw new Error('A site can contain up to 256 files.');
    files = await Promise.all(selected.map(async file => {
      bounded(file.size, maxFile);
      return { path: loose && !partial ? 'index.html' : file.webkitRelativePath || file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
    }));
  }
  const input = files.map(file => ({ ...file, path: safePath(file.path) }));
  if ((!partial || first.webkitRelativePath) && !input.some(file => file.path === 'index.html')) {
    const root = input[0]?.path.split('/')[0];
    if (root && input.every(file => file.path.startsWith(root + '/'))
        && (first.webkitRelativePath || input.some(file => file.path === root + '/index.html'))) {
      for (const file of input) file.path = file.path.slice(root.length + 1);
    }
  }
  if ((!partial || input.some(file => file.path === 'index.html')) && !input.some(file => file.path === 'index.html' && file.bytes.length)) throw new Error('The folder or ZIP needs a nonempty index.html entry.');
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
  const hashes = [...new Set([file].flat().map(item => item.hash))];
  return { kind: 24242, created_at: clock, content: 'Approve upload of ' + hashes.length + ' reviewed file(s)',
    tags: [['t', 'upload'], ...hashes.map(hash => ['x', hash]), ['expiration', String(clock + 300)], ['server', new URL(server).host]] };
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
export async function template(draft, files, urls, clock = now(), plan, usedServers = []) {
  if (draft.type === 'nsite') {
    const source = plan?.source;
    const paths = plan ? [...plan.paths.values()] : files;
    const preserved = source?.tags.filter(parts => !['d', 'path', 'title', 'description', 'server'].includes(parts[0])
      && !(parts[0] === 'x' && (parts[2] === 'aggregate' || parts.length === 2))) ?? [];
    return {
      kind: draft.site?.root ? kinds.root : kinds.site, created_at: clock, content: source?.content ?? '',
      tags: [...(draft.site?.root ? [] : [['d', draft.slug]]), ['title', draft.title], ['description', draft.body],
        ...paths.map(file => file.parts ?? ['path', file.path, file.hash]), ['x', await aggregate(paths), 'aggregate'],
        ...blobServers(draft, plan, usedServers).map(server => ['server', server]), ...preserved],
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
function uploadDestinations(draft) {
  const fallbacks = draft.fallbackServers ?? [];
  if (!Array.isArray(fallbacks) || fallbacks.length > 2 || !draft.server) throw new Error('Review one primary Blossom server and at most two fallbacks.');
  const requested = [draft.server, ...fallbacks];
  const normalized = siteServers(requested);
  if (normalized.length !== requested.length || normalized.some((url,i) => url !== requested[i])) throw new Error('Review distinct public HTTPS Blossom destinations.');
  return normalized;
}
export function verifyReview(draft, files) {
  if (!['note', 'article', 'track', 'nsite'].includes(draft.type)) throw new Error('Choose a publication type.');
  if (!draft.relays.length) throw new Error('Choose at least one reviewed relay.');
  if (draft.type !== 'note' && (!draft.title || (!draft.slug && !draft.site?.root))) throw new Error('Add a title and a stable identifier.');
  if (draft.type === 'nsite' && (!draft.site || draft.site.slug !== draft.slug)) {
    throw new Error('Review the exact nsite address before publishing.');
  }
  if (draft.type === 'track' && (!draft.artist || !files[0]?.type.startsWith('audio/'))) throw new Error('Add an artist and an audio file before reviewing this release.');
  if (['track', 'nsite'].includes(draft.type)) uploadDestinations(draft);
  if (['article', 'note'].includes(draft.type) && !draft.body) throw new Error('Write something before reviewing.');
  if (files.some(file => !hex.test(file.hash))) throw new Error('A file digest is missing.');
}
export function jobId(author, draft, files) {
  return digest(enc.encode(JSON.stringify({ author, draft, files: files.map(file => [file.path, file.hash]) })));
}
// Fingerprints identify reviewed inputs; operation IDs identify individual attempts.
export async function publicationHistory(author, draft, files, receipts) {
  const fingerprint = await jobId(author, draft, files);
  const matching = receipts.filter(row => row.account === author && (row.fingerprint ?? row.id) === fingerprint)
    .sort((a, b) => b.createdAt - a.createdAt || (b.event?.created_at ?? 0) - (a.event?.created_at ?? 0));
  const previous = matching[0];
  const kind = draft.type === 'article' ? kinds.article : draft.type === 'track' ? kinds.track : null;
  const related = kind === null ? [] : receipts.filter(row => row.event?.pubkey === author &&
    row.event.kind === kind && tag(row.event, 'd') === draft.slug);
  const latestTimestamp = [...related, ...matching].reduce((clock, row) => Math.max(clock, row.event?.created_at ?? 0), 0);
  const nextCreatedAt = receipts.reduce((clock, row) => Math.max(clock, (row.createdAt ?? 0) + 1), Date.now());
  const superseded = previous && related.some(row => row.id !== previous.id &&
    ((previous.event && row.event.created_at > previous.event.created_at) || row.createdAt > previous.createdAt));
  return { previous: previous?.status !== 'verified' && !superseded ? previous : undefined,
    completed: previous?.status === 'verified' ? previous : undefined, latestTimestamp, nextCreatedAt };
}
function blobServers(draft, plan, usedServers = []) {
  return siteServers([draft.server, ...usedServers, ...(draft.site?.servers ?? []), ...[plan?.source, plan?.current].filter(Boolean)
    .flatMap(event => tags(event, 'server').map(parts => parts[1]))]);
}

export async function execute({ draft, files, signer, transport, previous, checkpoint, upload = uploadVerified,
  known, backup, latestTimestamp = 0, nextCreatedAt = Date.now(), verifyFiles = verifySavedFiles, router }) {
  verifyReview(draft, files);
  const plan = draft.site ? planSite(draft.site, signer.pubkey, files, backup) : null;
  const fingerprint = await jobId(signer.pubkey, draft, files);
  const retry = previous && previous.status !== 'verified' && (previous.fingerprint ?? previous.id) === fingerprint;
  const job = retry ? structuredClone(previous) : {
    id: crypto.randomUUID(), fingerprint, account: signer.pubkey, type: draft.type, title: draft.title, createdAt: nextCreatedAt, status: 'reviewed', uploads: {}, attempts: [],
  };
  const sign = async value => checkSignature(value, await signer.sign(structuredClone(value)), signer.pubkey);
  const verifyHead = async () => assertHeads(
    await siteHeads(transport, [...draft.relays, ...draft.site.readRelays], draft.site, { authRelays: draft.relays, signAuth: sign }), draft.relays, plan.current, known, job.event,
  );
  if (plan) {
    await verifyHead();
    await verifyFiles([...plan.paths.values()].filter(file => !file.bytes || job.uploads[file.hash]), blobServers(draft, plan, Object.values(job.uploadServers ?? {})));
    job.address = [draft.site.root ? kinds.root : kinds.site, signer.pubkey, draft.slug].join(':');
    job.baseline = plan.current;
    job.action = draft.site.mode;
  }
  const pending = (plan?.uploads ?? files).filter(file => !job.uploads[file.hash]);
  const targets = pending.length ? uploadDestinations(draft) : [];
  job.uploadServers ??= {};
  job.uploadAttempts ??= [];
  job.blossomPreflight ??= [];
  for (let offset = 0; offset < pending.length; offset += 32) {
    const batch = pending.slice(offset, offset + 32);
    const authorized = new Map();
    const unavailable = new Set();
    for (const file of batch) {
      if (job.uploads[file.hash]) continue;
      if (router && job.blossomPreflight.length < 32) {
        job.blossomPreflight.push(await router.preflight(file,targets));
      }
      for (const server of targets) {
        if (unavailable.has(server)) continue;
        let signerFailed = false;
        const approve = async request => {
          try {
            if (batch.length === 1) return await sign(request);
            const token = authorized.get(server);
            if (token && now() + 25 < Number(tag(token, 'expiration'))) return token;
            const next = await sign(uploadAuth(batch, server));
            authorized.set(server, next);
            return next;
          } catch (error) { signerFailed = true; throw error; }
        };
        let url;
        try { url = await upload(file, server, approve); }
        catch (error) {
          if (signerFailed) throw error;
          unavailable.add(server);
          job.uploadAttempts.push({ hash: file.hash, server, status: 'failed' });
          await checkpoint(job);
          continue;
        }
        job.uploads[file.hash] = url;
        job.uploadServers[file.hash] = server;
        job.uploadAttempts.push({ hash: file.hash, server, status: 'verified' });
        job.status = 'uploading';
        await checkpoint(job);
        break;
      }
      if (!job.uploads[file.hash]) throw new Error('Reviewed Blossom destinations could not verify ' + file.path + '. No manifest was sent.');
    }
  }
  const unsigned = await template(draft, files, job.uploads,
    job.event?.created_at ?? Math.max(now(), latestTimestamp + 1, (plan?.current?.created_at ?? 0) + 1, (previous?.status === 'verified' ? previous.event?.created_at ?? 0 : 0) + 1), plan, Object.values(job.uploadServers));
  job.event = job.event ? checkSignature(unsigned, job.event, signer.pubkey) : await sign(unsigned);
  job.status = 'signed';
  await checkpoint(job);
  if (plan) await verifyHead();
  if (router) {
    job.relayPlan = await router.plan(job.event,sign);
    await checkpoint(job);
  }
  const excluded = new Map((job.relayPlan?.excluded??[]).filter(row=>row.group==='author').map(row=>[row.url,row.reasons]));
  const outcomes = await Promise.all(draft.relays.map(async url => {
    if (excluded.has(url)) return {url,accepted:false,verified:false,code:excluded.get(url).join(', ')};
    try {
      const entry = await transport.publish(url, job.event, { authPubkey: signer.pubkey, signAuth: sign });
      if (!plan || !entry.accepted) return { url, accepted: entry.accepted, verified: !plan && entry.verified === true, code: entry.code };
      const [head] = await siteHeads(transport, [url], draft.site, { authRelays: [url], signAuth: sign });
      const verified = head.complete && head.winner?.id === job.event.id;
      return { url, accepted: true, verified, code: verified ? entry.code : 'current-version-unverified' };
    } catch (error) { return { url, accepted: false, verified: false, code: error.code || 'unavailable' }; }
  }));
  job.attempts = outcomes;
  job.status = outcomes.every(item => item.verified) ? 'verified' : outcomes.some(item => item.verified)
    ? 'partially-verified' : outcomes.some(item => item.accepted) ? 'accepted-unverified' : 'not-delivered';
  job.url = plan ? siteURL(signer.pubkey, draft.slug, nip19.npubEncode(signer.pubkey)) : '';
  await checkpoint(job);
  return job;
}

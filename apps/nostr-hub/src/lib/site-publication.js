import { normalizeURL, signedEvent } from '../../../../tools/relay-router/validation.mjs';
import { digest, kinds, recent, safePath, tag, tags } from './model.js';

export const siteSlug = value => /^[a-z0-9-]{1,13}$/.test(value) && !value.endsWith('-');
const kind = root => root ? kinds.root : kinds.site;

export function manifest(event, owner, root, slug) {
  if (!event) throw new Error('Choose an existing nsite signed by your account.');
  const verified = signedEvent(event);
  const names = tags(verified, 'd');
  if (verified.pubkey !== owner || verified.kind !== kind(root)
      || (root ? names.length !== 0 : names.length !== 1 || names[0][1] !== slug)) {
    throw new Error('The signed manifest belongs to a different account or site.');
  }
  const paths = new Map();
  for (const parts of tags(verified, 'path')) {
    const [, path, hash] = parts;
    if ('/' + safePath(path) !== path || !/^[0-9a-f]{64}$/.test(hash) || paths.has(path)) {
      throw new Error('The signed manifest contains an invalid or duplicate file path.');
    }
    paths.set(path, { path, hash, parts });
  }
  if (!paths.has('/index.html')) throw new Error('The signed manifest has no index.html.');
  return { event: verified, paths };
}

export function planSite(site, author, files, backup) {
  const { owner, slug, root, mode, baseline, restore } = site;
  if (author !== owner) throw new Error('The signer does not match the reviewed nsite owner.');
  if (!['create', 'update', 'restore'].includes(mode) || (root ? slug !== '' : !siteSlug(slug))) {
    throw new Error('Use a root site or a lowercase identifier up to 13 characters.');
  }
  const current = mode === 'create' ? null : manifest(baseline, owner, root, slug);
  const saved = mode === 'restore' ? manifest(restore, owner, root, slug) : null;
  if (saved && (!backup || signedEvent(backup).id !== saved.event.id || files.length)) {
    throw new Error('Restore a previous signed version saved by this app.');
  }
  const staged = new Map(files.map(file => [file.path, file]));
  const paths = new Map(saved?.paths ?? current?.paths);
  for (const path of site.remove ?? []) {
    if (mode !== 'update' || path === '/index.html' || !paths.has(path) || staged.has(path)) {
      throw new Error('Check the selected removal or replacement.');
    }
    paths.delete(path);
  }
  for (const [path, file] of staged) {
    if ('/' + safePath(path) !== path || !/^[0-9a-f]{64}$/.test(file.hash)) throw new Error('A staged file is invalid.');
    if (paths.get(path)?.hash !== file.hash) paths.set(path, file);
  }
  if (!paths.has('/index.html') || paths.size > 256) throw new Error('A site needs index.html and at most 256 files.');
  const changes = [...new Set([...(current?.paths.keys() ?? []), ...paths.keys()])].sort().map(path => {
    const before = current?.paths.get(path);
    const after = paths.get(path);
    return { path, hash: after?.hash, action: !before ? 'Add' : !after ? 'Remove' : before.hash === after.hash ? 'Keep' : 'Change' };
  });
  return { paths, changes, current: current?.event, source: saved?.event ?? current?.event,
    uploads: [...paths.values()].filter(file => file.bytes) };
}

export async function siteHeads(client, urls, { owner, root, slug }) {
  const filter = { authors: [owner], kinds: [kind(root)], ...(!root && { '#d': [slug] }) };
  return Promise.all([...new Set(urls)].map(async url => {
    try {
      const { events, status } = await client.query(url, filter, 25);
      const winner = events.filter(event => event.pubkey === owner && event.kind === kind(root)
        && (root || tag(event, 'd') === slug)).map(signedEvent).sort(recent)[0];
      return { url, complete: status === 'complete', winner };
    } catch { return { url, complete: false }; }
  }));
}

export function assertHeads(rows, required, current, known, retry) {
  if (required.some(url => !rows.some(row => row.url === url && row.complete))) {
    throw new Error('A selected relay could not verify the site address. Recheck the connection or choose a readable relay.');
  }
  if (!current && rows.filter(row => row.complete).length < 2) {
    throw new Error('Two readable relays are needed to check the new address.');
  }
  const observed = [known, ...rows.map(row => row.winner)].filter(Boolean).sort(recent)[0];
  if (observed?.created_at > Math.floor(Date.now() / 1000) + 30) {
    throw new Error('The site is currently signed with a future timestamp. Verify the device clock and refresh.');
  }
  if (retry && observed?.id === retry.id) return;
  if ((observed?.id ?? '') !== (current?.id ?? '')) {
    throw new Error(current ? 'The live site changed. Refresh and review the current version before signing.'
      : 'This address has already been published. Choose Update existing nsite.');
  }
  if (current && !rows.some(row => row.complete && row.winner?.id === current.id)) {
    throw new Error('The previously signed version could not be confirmed on a relay.');
  }
}

export function siteServers(values) {
  return [...new Set(values.flatMap(value => {
    try { return [normalizeURL(value, { http: true })]; } catch { return []; }
  }))];
}

export async function verifySavedFiles(files, servers, fetcher = fetch) {
  const unique = [...new Map(files.map(file => [file.hash, file])).values()];
  async function fetchHash(server, hash) {
    try {
      const res = await fetcher(server.replace(/\/$/, '') + '/' + hash, {
        credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(9000),
      });
      if (!res.ok || !res.body) return false;
      const reader = res.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 48 * 1024 * 1024) return false;
          chunks.push(value);
        }
      } finally { await reader.cancel(); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return await digest(bytes) === hash;
    } catch { return false; }
  }
  for (let offset = 0; offset < unique.length; offset += 4) {
    await Promise.all(unique.slice(offset, offset + 4).map(async file => {
      for (const server of servers) if (await fetchHash(server, file.hash)) return;
      throw new Error('Blossom could not verify ' + file.path + '. The new manifest was not sent.');
    }));
  }
}

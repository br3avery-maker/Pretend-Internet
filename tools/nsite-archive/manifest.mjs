import { createHash } from 'node:crypto';
import { nip19 } from '../relay-router/node_modules/nostr-tools/lib/esm/index.js';
import { signedEvent, hex64 } from '../relay-router/validation.mjs';

export const sha = (value) => createHash('sha256').update(value).digest('hex');
export const KINDS = [15128, 35128, 5128, 34128];
export const tags = (event, name) => event.tags.filter((t) => t[0] === name);
export const first = (event, name) => tags(event, name)[0]?.[1] ?? '';
export function safePath(value) {
  if (
    typeof value !== 'string' ||
    value.length > 4096 ||
    !value.startsWith('/') ||
    value.endsWith('/') ||
    /[\\\x00-\x1f\x7f?#]/.test(value) ||
    value.includes('//')
  )
    throw Error('unsafe-path');
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw Error('unsafe-path');
  }
  if (/[\\\x00-\x1f\x7f]/.test(decoded) || decoded.split('/').some((p) => p === '..' || p === '.'))
    throw Error('unsafe-path');
  return value;
}
export function address(value) {
  const m = /^(15128|35128):([0-9a-f]{64}):(.*)$/.exec(value ?? '');
  if (
    !m ||
    (m[1] === '15128' ? m[3] !== '' : !/^[a-z0-9-]{1,13}$/.test(m[3]) || m[3].endsWith('-'))
  )
    throw Error('invalid-address');
  return { kind: Number(m[1]), pubkey: m[2], identifier: m[3] };
}
export function aggregate(files) {
  return sha(
    files
      .map((f) => `${f.hash} ${f.path}\n`)
      .sort()
      .join(''),
  );
}
export function parseManifest(input) {
  const event = signedEvent(input);
  if (!KINDS.includes(event.kind)) throw Error('not-nsite');
  const ds = tags(event, 'd');
  let site;
  if (event.kind === 15128) {
    if (ds.length) throw Error('root-with-identifier');
    site = `15128:${event.pubkey}:`;
  } else if (event.kind === 35128) {
    if (ds.length !== 1) throw Error('missing-identifier');
    site = `35128:${event.pubkey}:${ds[0][1]}`;
    address(site);
  } else if (event.kind === 5128) {
    const as = tags(event, 'a');
    if (as.length !== 1) throw Error('snapshot-parent-required');
    const parent = address(as[0][1]);
    if (parent.pubkey !== event.pubkey) throw Error('snapshot-author-mismatch');
    site = as[0][1];
  } else {
    // Legacy 34128 is one signed file per d/path, NOT a modern full manifest.
    if (ds.length !== 1 || !hex64(first(event, 'x'))) throw Error('invalid-legacy-file');
    site = `34128:${event.pubkey}:`;
  }
  const files =
    event.kind === 34128
      ? [{ path: safePath(ds[0][1]), hash: first(event, 'x') }]
      : tags(event, 'path').map((t) => {
          if (!hex64(t[2])) throw Error('invalid-file-hash');
          return { path: safePath(t[1]), hash: t[2] };
        });
  if (
    !files.length ||
    files.length > 4096 ||
    new Set(files.map((f) => f.path)).size !== files.length
  )
    throw Error('invalid-file-tree');
  const nativeHash = aggregate(files),
    xs = tags(event, 'x').filter((t) => t[2] === 'aggregate');
  if (
    xs.length > 1 ||
    (event.kind === 5128 && xs.length !== 1) ||
    (xs.length && xs[0][1] !== nativeHash)
  )
    throw Error('aggregate-mismatch');
  const relations = [];
  for (const [tag, type] of [
    ['a', 'declared-parent'],
    ['A', 'declared-origin'],
  ]) {
    for (const t of tags(event, tag)) {
      if (event.kind === 5128 && tag === 'a') continue;
      try {
        address(t[1]);
        relations.push({ type, target: t[1], evidence: event.id, verified: false });
      } catch {
        /* Original tag stays in signed event. */
      }
    }
  }
  return {
    event,
    site,
    files,
    nativeHash,
    relations,
    legacy: event.kind === 34128,
    published: {
      title: first(event, 'title'),
      description: first(event, 'description'),
      source: first(event, 'source'),
    },
  };
}
const base36 = (hex) => BigInt(`0x${hex}`).toString(36).padStart(50, '0');
export function gatewayURL(site, event, host = 'nsite.lol') {
  if (!/^[a-z0-9.-]+$/.test(host)) throw Error('invalid-gateway');
  if (event.kind === 5128) return `https://v${base36(event.id)}.${host}/`;
  if (event.kind === 34128 || event.kind === 15128)
    return `https://${nip19.npubEncode(event.pubkey)}.${host}/`;
  return `https://${base36(event.pubkey)}${address(site).identifier}.${host}/`;
}
export function resolveURL(value) {
  const u = new URL(value),
    label = u.hostname.split('.')[0];
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash)
    throw Error('invalid-site-url');
  if (label.startsWith('npub1')) {
    const n = nip19.decode(label);
    if (n.type !== 'npub') throw Error('invalid-site-url');
    return { authors: [n.data], kinds: [15128, 34128] };
  }
  const decode = (text) => {
    let n = 0n;
    for (const c of text) n = n * 36n + BigInt(parseInt(c, 36));
    const hex = n.toString(16).padStart(64, '0');
    if (!hex64(hex)) throw Error('invalid-base36');
    return hex;
  };
  if (/^v[0-9a-z]{50}$/.test(label)) return { ids: [decode(label.slice(1))], kinds: [5128] };
  if (/^[0-9a-z]{50}[a-z0-9-]{1,13}$/.test(label) && !label.endsWith('-'))
    return { authors: [decode(label.slice(0, 50))], kinds: [35128], '#d': [label.slice(50)] };
  throw Error('invalid-site-url');
}

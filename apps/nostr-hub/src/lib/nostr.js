import { nip19 } from 'nostr-tools';
import { RelayRouter } from '../../../../tools/relay-router/router.mjs';
import { RelayTransport } from '../../../../tools/relay-router/transport.mjs';
import { normalizeURL, signedEvent } from '../../../../tools/relay-router/validation.mjs';
import { cachedEvents, putMany, setting, setSetting } from './store.js';
import { kinds, profileFromEvent, recent, validPubkey } from './model.js';

export const bootstrap = ['wss://relay.ditto.pub', 'wss://relay.primal.net', 'wss://purplepag.es'];
export const transport = new RelayTransport({ timeout: 4800, maxBytes: 3500000 });
export const npub = key => nip19.npubEncode(key);
export function parseKey(input) {
  const raw = input.trim();
  if (validPubkey(raw)) return raw;
  try {
    const decoded = nip19.decode(raw.replace(/^nostr:/i, ''));
    if (decoded.type === 'npub') return decoded.data;
    if (decoded.type === 'nprofile') return decoded.data.pubkey;
  } catch { /* An invalid identity never becomes a saved account. */ }
  throw new Error('Enter an npub, nprofile, or a 64-character public key.');
}
export function endpoints(values, http = false) {
  return [...new Set(values.flatMap(value => {
    try { return [normalizeURL(value, { http })]; } catch { return []; }
  }))];
}
export async function cached(kindsList, author = '') {
  return (await cachedEvents(kindsList, author)).sort(recent);
}
export async function fetchEvents(filter, relays, limit = 24, client = transport) {
  const urls = endpoints(relays).slice(0, 8);
  const results = await Promise.all(urls.map(async url => {
    try {
      const { events, status } = await client.query(url, filter, limit);
      return { url, events, status };
    } catch (error) { return { url, events: [], status: error.code || 'unavailable' }; }
  }));
  const unique = new Map(results.flatMap(result => result.events.map(event => [event.id, event])));
  const events = [...unique.values()].filter(event => event.created_at < Date.now() / 1000 + 300).sort(recent);
  const saved = events.length ? await putMany('events', events) : { skipped: 0 };
  return { events, skipped: saved.skipped, relays: results.map(({ url, events, status }) => ({ url, count: events.length, status, oldest: events.length ? Math.min(...events.map(event => event.created_at)) : null })) };
}
export async function profileDirectory() {
  const profiles = new Map();
  for (const event of await cached([kinds.profile])) {
    if (!profiles.has(event.pubkey)) profiles.set(event.pubkey, profileFromEvent(event));
  }
  return profiles;
}
export async function preferences(author) {
  const events = await cached([kinds.relayList, kinds.blossom, kinds.profile], author);
  const [list, blossom, profile] = [kinds.relayList, kinds.blossom, kinds.profile].map(kind => events.find(event => event.kind === kind));
  const relayTags = list?.tags.filter(parts => parts[0] === 'r') ?? [];
  return {
    read: endpoints(relayTags.filter(parts => !parts[2] || parts[2] === 'read').map(parts => parts[1])),
    write: endpoints(relayTags.filter(parts => !parts[2] || parts[2] === 'write').map(parts => parts[1])),
    blossom: endpoints(blossom?.tags.filter(parts => parts[0] === 'server').map(parts => parts[1]) ?? [], true),
    profile: profileFromEvent(profile),
  };
}
export async function refreshIdentity(author) {
  const requested = endpoints([...setting('relays', []), ...bootstrap]);
  const results = await Promise.all([
    fetchEvents({ authors: [author], kinds: [kinds.profile, kinds.relayList, kinds.blossom] }, requested, 12),
    fetchEvents({ authors: [author], kinds: [kinds.muteList] }, requested, 12),
  ]);
  return { events: results.flatMap(row => row.events), relays: results.flatMap(row => row.relays) };
}
// An inclusive cursor preserves same-second events. If a relay saturates at
// the same timestamp, do not silently skip the boundary or claim completion.
export function advanceCoverage(previous, response, limit) {
  if (!['complete','limited'].includes(response.status)) return previous ?? {};
  if (response.status === 'complete' && response.count < limit) return { done: true, until: response.oldest ?? previous?.until ?? null };
  if (!Number.isSafeInteger(response.oldest)) return previous ?? {};
  if (previous?.until !== undefined && response.oldest >= previous.until) return { until: previous.until, blocked: true };
  return { until: response.oldest };
}
export async function reloadCatalog(kindsList, author = setting('account', ''), { older = false } = {}) {
  const router = new RelayRouter({ bootstrap, pinned: setting('relays', []), transport });
  if (author) for (const event of await cached([kinds.relayList, kinds.blossom], author)) router.ingestList(event);
  const list = router.list(author);
  const relays = endpoints([...router.pinned, bootstrap[0], ...router.listed(list,'write').slice(0,3), ...router.listed(list,'read').slice(0,2), ...bootstrap]).slice(0,8);
  const history = setting('catalog-coverage', {});
  const scope = (author || 'all') + ':' + [...kindsList].sort((a,b)=>a-b).join(',');
  const coverage = {...history[scope]};
  const queries = kindsList.flatMap(kind => relays.map(url => ({kind,url,key:kind+'|'+url})));
  const results = [];
  let reached = new Set();
  let skipped = 0;
  // Only one bounded page per relay/kind per action; four concurrent requests.
  for (let i=0; i<queries.length; i+=4) await Promise.all(queries.slice(i,i+4).map(async ({kind,url,key}) => {
    const cursor = coverage[key];
    if (older && (cursor?.done || cursor?.blocked)) return;
    const filter = {kinds:[kind], ...(author && {authors:[author]}), ...(older && Number.isSafeInteger(cursor?.until) && {until:cursor.until})};
    const result = await fetchEvents(filter,[url],36);
    const row = result.relays[0];
    if (!row) return;
    results.push(...result.events);
    skipped += result.skipped;
    if (['complete','limited'].includes(row.status)) {
      reached.add(url);
      if (!result.skipped && (older || !cursor)) coverage[key] = advanceCoverage(older ? cursor : undefined,row,36);
    }
  }));
  delete history[scope];
  history[scope] = coverage;
  const entries = Object.entries(history).slice(-64);
  setSetting('catalog-coverage',Object.fromEntries(entries));
  const done = queries.filter(row=>coverage[row.key]?.done).length;
  const blocked = queries.filter(row=>coverage[row.key]?.blocked).length;
  return { count:new Set(results.map(event=>event.id)).size, reached:reached.size, skipped,
    coverage: done + '/' + queries.length + ' relay/kind histories reached the end of a returned page; ' + blocked + ' timestamp boundaries saturated. ' +
      (skipped ? skipped + ' events not stored: local cache limit reached. ' : '') + 'Relay history is not proof of network-wide completeness.' };
}
export function publicationRouter(draft, signer, client = transport, fetcher = globalThis.fetch) {
  const allowed = endpoints(draft.relays);
  const servers = endpoints([draft.server,...(draft.fallbackServers??[])],true);
  const router = new RelayRouter({bootstrap:allowed.slice(0,4),pinned:allowed,transport:client,fetch:fetcher,
    allowDestination:url=>allowed.includes(url)||servers.includes(url),maxCandidates:Math.max(1,allowed.length),timeout:3000});
  return {
    async plan(event, signAuth) {
      return router.discover(event,{allowedRelays:allowed,authPubkey:signer.pubkey,signAuth,redundancy:Math.min(8,allowed.length)});
    },
    async preflight(file, targets) {
      return router.preflightBlob({sha256:file.hash,size:file.bytes.length,type:file.type},{servers:targets,author:signer.pubkey});
    }
  };
}
export const shortKey = key => key ? `${npub(key).slice(0, 12)}…${npub(key).slice(-5)}` : 'Guest';
export function checkSignature(unsigned, response, author) {
  const actual = signedEvent(response);
  if (actual.pubkey !== author || ['kind', 'created_at', 'content'].some(key => actual[key] !== unsigned[key])
      || JSON.stringify(actual.tags) !== JSON.stringify(unsigned.tags)) throw new Error('The signer returned a different account or event.');
  return actual;
}

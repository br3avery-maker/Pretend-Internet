import { nip19 } from 'nostr-tools';
import { RelayTransport } from '../../../../tools/relay-router/transport.mjs';
import { normalizeURL, signedEvent } from '../../../../tools/relay-router/validation.mjs';
import { all, putMany, setting } from './store.js';
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
  return (await all('events')).filter(event => kindsList.includes(event.kind) && (!author || event.pubkey === author)).sort(recent);
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
  if (events.length) await putMany('events', events);
  return { events, relays: results.map(({ url, events, status }) => ({ url, count: events.length, status })) };
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
  return fetchEvents({ authors: [author], kinds: [kinds.profile, kinds.relayList, kinds.blossom, kinds.muteList] }, requested, 12);
}
export async function reloadCatalog(kindsList, author = setting('account', '')) {
  const profiles = author ? await preferences(author) : { write: [], read: [] };
  const relays = endpoints([...setting('relays', []), bootstrap[0], ...profiles.write.slice(0, 3), ...profiles.read.slice(0, 2), ...bootstrap]);
  const results = await Promise.all(kindsList.map(kind => fetchEvents({ kinds: [kind], ...(author && { authors: [author] }) }, relays, 36)));
  return {
    count: new Set(results.flatMap(result => result.events.map(event => event.id))).size,
    reached: new Set(results.flatMap(result => result.relays.filter(row => ['complete', 'limited'].includes(row.status)).map(row => row.url))).size,
  };
}
export const shortKey = key => key ? `${npub(key).slice(0, 12)}…${npub(key).slice(-5)}` : 'Guest';
export function checkSignature(unsigned, response, author) {
  const actual = signedEvent(response);
  if (actual.pubkey !== author || ['kind', 'created_at', 'content'].some(key => actual[key] !== unsigned[key])
      || JSON.stringify(actual.tags) !== JSON.stringify(unsigned.tags)) throw new Error('The signer returned a different account or event.');
  return actual;
}

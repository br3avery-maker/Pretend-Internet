import { signedEvent } from '../../../../tools/relay-router/validation.mjs';
import { campaignMatch } from '../../../nsite-archive/campaign.js';
import { kinds, recent, tag, tags, validPubkey } from './model.js';
import { cached } from './nostr.js';
import { setting } from './store.js';

// Only verified, public NIP-51 p/e tags are used. Encrypted private lists
// remain opaque, and local exceptions never modify the signed event.
export function publicMutes(events, owner) {
  if (!validPubkey(owner)) return { publishers: new Set(), events: new Set() };
  const latest = events.flatMap(event => {
    try {
      const row = signedEvent(event);
      return row.kind === kinds.muteList && row.pubkey === owner ? [row] : [];
    } catch { return []; }
  }).sort(recent)[0];
  return {
    publishers: new Set(latest ? tags(latest, 'p').map(row => row[1]).filter(validPubkey) : []),
    events: new Set(latest ? tags(latest, 'e').map(row => row[1]).filter(validPubkey) : []),
  };
}
export function visibility(event, { hidden = [], safe = [], approved = [], mutes = {}, campaign = true } = {}) {
  const address = [event.kind, event.pubkey, event.kind === kinds.root ? '' : tag(event, 'd')].join(':');
  if (hidden.includes(event.pubkey)) return 'Locally hidden publisher';
  if (safe.includes(event.pubkey) || approved.includes(address)) return '';
  if (mutes.publishers?.has(event.pubkey) || mutes.events?.has(event.id)) return 'Public signed mute list';
  if (campaign && [kinds.root, kinds.site].includes(event.kind)
      && campaignMatch(tag(event, 'description') || tag(event, 'summary'))) return 'Confirmed campaign signature';
  return '';
}
export async function moderation(owner = setting('account', '')) {
  const mutes = publicMutes(owner ? await cached([kinds.muteList], owner) : [], owner);
  const policy = { hidden: setting('hidden-publishers', []), safe: setting('safe-publishers', []),
    approved: setting('approved-publications', []), mutes };
  return event => visibility(event, policy);
}

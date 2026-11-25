export const kinds = {
  profile: 0, note: 1, root: 15128, site: 35128, article: 30023, track: 36787,
  playlist: 34139, relayList: 10002, blossom: 10063, appData: 30078,
};
const idPattern = /^[0-9a-f]{64}$/;
export const validPubkey = value => typeof value === 'string' && idPattern.test(value);
export const tag = (event, key) => event.tags.find(parts => parts[0] === key)?.[1] ?? '';
export const tags = (event, key) => event.tags.filter(parts => parts[0] === key);
export const recent = (a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id);
export function webURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
export function siteURL(pubkey, key, npub) {
  if (!validPubkey(pubkey)) return '';
  if (!key) return /^npub1[a-z0-9]+$/.test(npub) ? `https://${npub}.nsite.lol/` : '';
  if (!/^[a-z0-9-]{1,13}$/.test(key) || key.endsWith('-')) return '';
  const label = BigInt('0x' + pubkey).toString(36).padStart(50, '0');
  const joined = label + key;
  return joined.length <= 63 ? `https://${joined}.nsite.lol/` : '';
}
export function groupSites(events) {
  const groups = new Map();
  for (const event of events.filter(e => [kinds.root, kinds.site].includes(e.kind)).sort(recent)) {
    const slug = event.kind === kinds.root ? '' : tag(event, 'd');
    if (event.kind === kinds.site && !slug) continue;
    const address = `${event.kind}:${event.pubkey}:${slug}`;
    if (groups.has(address)) { groups.get(address).versions.push(event); continue; }
    const title = tag(event, 'title') || tag(event, 'name') || slug || 'Root site';
    const description = tag(event, 'description') || tag(event, 'summary');
    const topics = tags(event, 't').map(parts => parts[1]).filter(Boolean);
    const category = /\b(game|games|arcade|puzzle|playable)\b/i.test([description, ...topics].join(' ')) ? 'Game' : 'Site';
    groups.set(address, { address, title, slug, description, category, topics, files: tags(event, 'path').length, event, versions: [event] });
  }
  return [...groups.values()];
}
export function profileFromEvent(event) {
  if (!event) return {};
  try {
    const body = JSON.parse(event.content);
    return {
      name: String(body.display_name || body.name || '').slice(0, 90),
      about: typeof body.about === 'string' ? body.about.slice(0, 1000) : '',
      picture: webURL(body.picture), banner: webURL(body.banner),
      website: webURL(String(body.website || '').replace(/^(?!https?:\/\/)(?=\S)/, 'https://')),
    };
  } catch { return {}; }
}
export function newestByAddress(events) {
  const result = new Map();
  for (const event of [...events].sort(recent)) {
    const key = `${event.kind}:${event.pubkey}:${tag(event, 'd')}`;
    if (!result.has(key)) result.set(key, event);
  }
  return [...result.values()];
}
export const matchesWords = (query, ...haystack) => {
  const text = haystack.flat(Infinity).filter(Boolean).join(' ').toLowerCase();
  return query.toLowerCase().trim().split(/\s+/).every(word => text.includes(word));
};
export function safePath(path) {
  if (typeof path !== 'string' || path.length > 4095 || /[?#]|%2e|%2f|%5c/i.test(path)) throw new Error('A file has an invalid path.');
  const parts = path.replace(/^\/+/, '').split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[\\\u0000-\u001f]/.test(part))) throw new Error('A file has an invalid path.');
  return parts.join('/');
}
export async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
}

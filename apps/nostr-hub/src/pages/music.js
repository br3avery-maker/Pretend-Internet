import { button, el, heading, label, link, muted, route, run, setStatus, status } from '../lib/dom.js';
import { kinds, matchesWords, newestByAddress, tag, tags, webURL } from '../lib/model.js';
import { bootstrap, cached, endpoints, fetchEvents, reloadCatalog, shortKey } from '../lib/nostr.js';
import { setting, setSetting } from '../lib/store.js';
import { moderation } from '../lib/moderation.js';
import { refreshIdentity } from '../lib/nostr.js';

const key = event => `${event.kind}:${event.pubkey}:${tag(event, 'd')}`;
const title = event => tag(event, 'title') || 'Untitled';
const source = event => webURL(tag(event, 'url') || tag(event, 'audio'));
const artist = event => tag(event, 'artist') || shortKey(event.pubkey);

export async function render(main) {
  const account = setting('account', '');
  const player = el('audio', { controls: true, preload: 'none', 'aria-label': 'Track player' });
  const trackTitle = el('h2', {}, 'Now playing');
  const artistLine = muted('');
  const cover = el('img', { class: 'media-art', hidden: true, alt: '', referrerpolicy: 'no-referrer' });
  cover.addEventListener('error', () => { cover.hidden = true; });
  const now = el('section', { class: 'stack-tight notice', hidden: true }, trackTitle, artistLine, cover, player);
  const notice = status();
  const search = el('input', { type: 'search', placeholder: 'Find a track or artist', 'aria-label': 'Find a track or artist' });
  const playlist = el('select', {}, el('option', { value: '' }, 'All tracks'));
  const list = el('section', { class: 'stack-tight', 'aria-label': 'Tracks' });
  let tracks = [];
  let playlists = [];
  let queue = [];
  let current;
  let lastSaved = -1;

  function open(event, resume = 0) {
    if (!source(event)) return;
    current = event;
    lastSaved = -1;
    trackTitle.textContent = title(event);
    artistLine.textContent = artist(event);
    const image = webURL(tag(event, 'image'));
    cover.hidden = !image;
    if (image) cover.src = image;
    now.hidden = false;
    player.src = source(event);
    if (resume) player.addEventListener('loadedmetadata', () => { player.currentTime = Math.min(resume, player.duration || resume); }, { once: true });
    player.play().catch(() => setStatus(notice, 'Playback could not start. Try the play control or another track.'));
  }
  function advance(step) {
    const address = current && key(current);
    const index = queue.findIndex(track => key(track) === address);
    const next = queue[index + step];
    if (next) open(next);
  }
  player.addEventListener('ended', () => advance(1));
  player.addEventListener('error', () => setStatus(notice, 'The media server could not play this track. You can try another track.'));
  player.addEventListener('timeupdate', () => {
    if (!current || Math.floor(player.currentTime / 3) === lastSaved) return;
    lastSaved = Math.floor(player.currentTime / 3);
    setSetting('music-position', { key: key(current), time: player.currentTime });
  });
  now.append(el('div', { class: 'row' }, button('Previous track', () => advance(-1)), button('Next track', () => advance(1))));
  const resumeUI = el('div', { class: 'row' });
  function draw() {
    const selected = playlists.find(event => key(event) === playlist.value);
    const refs = selected ? tags(selected, 'a').map(parts => parts[1]) : null;
    const ordered = refs ? refs.map(ref => tracks.find(event => key(event) === ref)).filter(Boolean) : tracks.filter(event => !account || event.pubkey === account);
    const wanted = ordered.filter(event => matchesWords(search.value, title(event), artist(event)));
    queue = ordered.filter(event => source(event));
    list.replaceChildren(...wanted.map(event => el('article', { class: 'entry split' },
      el('div', { class: 'stack-tight' }, el('h3', {}, title(event)), muted(artist(event))),
      source(event) ? button('Play', () => open(event), 'secondary') : muted('No playable URL declared'))));
    if (refs && refs.length > ordered.length) list.append(muted(`${refs.length - ordered.length} referenced tracks are unavailable or filtered.`));
    if (!wanted.length) list.append(muted('No tracks match this view. Use Refresh music to look up published tracks.'));
    const resume = setting('music-position', {});
    const last = tracks.find(event => key(event) === resume.key);
    resumeUI.replaceChildren(...(last && source(last) ? [button('Resume ' + title(last), () => open(last, resume.time || 0), 'primary')] : []));
  }
  async function load() {
    const selected = playlist.value;
    const excluded = await moderation(account);
    playlists = newestByAddress(await cached([kinds.playlist], account)).filter(event => !excluded(event));
    const references = new Set(playlists.flatMap(event => tags(event, 'a').map(parts => parts[1])));
    tracks = newestByAddress(await cached([kinds.track])).filter(event => !excluded(event) && (!account || event.pubkey === account || references.has(key(event))));
    playlist.replaceChildren(el('option', { value: '' }, 'All tracks'), ...playlists.map(event => el('option', { value: key(event) }, title(event))));
    if (playlists.some(event => key(event) === selected)) playlist.value = selected;
    draw();
  }
  const refresh = button('Refresh music', async () => {});
  refresh.addEventListener('click', run(refresh, notice, async () => {
    setStatus(notice, 'Reading signed tracks and playlists.');
    if (account) await refreshIdentity(account);
    const result = await reloadCatalog([kinds.track, kinds.playlist], account);
    const excluded = await moderation(account);
    const found = newestByAddress(await cached([kinds.playlist], account)).filter(event => !excluded(event));
    const referenced = new Map();
    for (const collection of found.slice(0, 4)) {
      for (const ref of tags(collection, 'a')) {
        const [,author,id] = /^36787:([0-9a-f]{64}):(.+)$/.exec(ref[1]) ?? [];
        if (author) {
          if (!referenced.has(author)) referenced.set(author, []);
          referenced.get(author).push(id);
        }
      }
    }
    await Promise.all([...referenced].sort(([a],[b]) => Number(a === account) - Number(b === account)).slice(0, 4).map(([author, ids]) => fetchEvents(
      { authors: [author], kinds: [kinds.track], '#d': [...new Set(ids)].slice(0, 36) },
      endpoints([...setting('relays', []), ...bootstrap]), 36)));
    await load();
    setStatus(notice, result.reached ? `${tracks.length} tracks and ${playlists.length} playlists available.` : 'No relays completed the query. Showing cached music.');
  }));
  search.addEventListener('input', draw);
  playlist.addEventListener('change', draw);
  main.replaceChildren(heading('Music', refresh), link('Switch browsing profile', route('profile')), resumeUI, now, notice, search, label('Playlist', playlist), list);
  await load();
}

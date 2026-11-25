import { button, el, heading, icon, label, link, modal, muted, query, route, run, setStatus, status } from '../lib/dom.js';
import { groupSites, kinds, matchesWords, siteURL, tag } from '../lib/model.js';
import { cached, npub, parseKey, preferences, profileDirectory, refreshIdentity, reloadCatalog, shortKey } from '../lib/nostr.js';
import { saveCollections, setting, toggleList } from '../lib/store.js';

const siteKinds = [kinds.root, kinds.site];
const siteLink = site => siteURL(site.event.pubkey, site.slug, npub(site.event.pubkey));
const localPath = site => route('project', { site: site.address });
const suggested = new Map([['mojisurvivor', 'MojiSurvivor'], ['2048-link', '2048 Link'], ['melody-2048', 'Melody’s 2048']]);
const isGame = site => site.category === 'Game' || suggested.get(site.slug)?.replace('’', "'") === site.title.replace('’', "'");
function siteRow(site, author, arcade, best) {
  return el('article', { class: 'entry stack-tight' },
    el('div', { class: 'split' }, el('h3', {}, link(site.title, localPath(site))),
      siteLink(site) && el('a', { class: arcade ? 'button primary' : 'button secondary', href: siteLink(site), target: '_blank', rel: 'noopener noreferrer' }, arcade ? 'Play' : 'Open site')),
    muted([author, site.files ? `${site.files} declared files` : '', site.versions.length > 1 ? `${site.versions.length} observed versions` : ''].filter(Boolean).join(' · ')),
    site.slug === 'mojisurvivor' && best && el('p', {}, 'Published high score: ' + best),
    site.description && el('p', {}, site.description.slice(0, 330)));
}
async function catalog(main, arcade) {
  let author = setting('account', '');
  const authorLine = muted(author ? (await preferences(author)).profile.name || shortKey(author) : 'All publishers');
  const notice = status();
  const publisher = el('input', { type: 'search', placeholder: 'npub1…', spellcheck: 'false', autocapitalize: 'none' });
  const find = el('button', { class: 'secondary' }, 'Find published nsites');
  const lookup = el('form', {}, label('Publisher npub', publisher), find);
  const filter = el('input', { type: 'search', placeholder: arcade ? 'Search games' : 'Search sites, publishers, tags', 'aria-label': arcade ? 'Search games' : 'Search sites' });
  const saved = el('input', { type: 'checkbox' });
  const results = el('section', { class: 'stack-tight', 'aria-label': 'Results' });
  const refresh = button('Refresh', async () => {});
  const showHidden = el('input', { type: 'checkbox' });
  let sites = [];
  let profiles = new Map();
  let best;
  function draw() {
    const hidden = setting('hidden-publishers', []);
    const favorites = setting('saved-sites', []);
    const filtered = sites.filter(site => (!arcade || isGame(site))
      && (showHidden.checked ? hidden.includes(site.event.pubkey) : !hidden.includes(site.event.pubkey))
      && (!saved.checked || favorites.includes(site.address))
      && matchesWords(filter.value, site.title, site.description, site.topics, profiles.get(site.event.pubkey)?.name, site.slug));
    results.replaceChildren(...filtered.map(site => siteRow(site, profiles.get(site.event.pubkey)?.name || shortKey(site.event.pubkey), arcade, best)));
    if (!filtered.length) results.append(muted(sites.length ? 'No matches for these filters.' : 'Refresh to look up public publications. Previously discovered results are available offline.'));
  }
  async function load() {
    sites = groupSites(await cached(siteKinds, author));
    profiles = await profileDirectory();
    if (arcade && author) {
      const save = (await cached([kinds.appData], author)).find(event => tag(event, 'd') === 'mojisurvivor:progress:v1');
      const score = save && Number(tag(save, 'high_score'));
      best = Number.isSafeInteger(score) && score > 0 ? score.toLocaleString() : '';
    }
    draw();
  }
  refresh.addEventListener('click', run(refresh, notice, async () => {
    setStatus(notice, 'Reading signed publication metadata.');
    const result = await reloadCatalog(arcade && author ? [...siteKinds, kinds.appData] : siteKinds, author);
    await load();
    setStatus(notice, result.reached ? `${result.count} signed events returned by ${result.reached} relays.` : 'No relays completed the query. Showing cached results.');
  }));
  lookup.addEventListener('submit', run(find, notice, async () => {
    author = parseKey(publisher.value);
    authorLine.textContent = shortKey(author);
    setStatus(notice, 'Looking up signed nsite manifests.');
    await load();
    await refreshIdentity(author);
    const result = await reloadCatalog(siteKinds, author);
    authorLine.textContent = (await preferences(author)).profile.name || shortKey(author);
    await load();
    setStatus(notice, result.reached ? (sites.length ? 'Found ' + sites.length + ' published ' + (sites.length === 1 ? 'nsite.' : 'nsites.')
      : 'The relays checked returned no nsites for this account.') : 'The relay lookup did not complete. Showing previously found sites.');
  }));
  filter.addEventListener('input', draw);
  for (const control of [saved, showHidden]) control.addEventListener('change', draw);
  main.replaceChildren(heading(arcade ? 'Arcade' : 'Discover', refresh), el('div', { class: 'split' }, authorLine, link('Switch profile', route('profile'))),
    !arcade && lookup, filter, el('div', { class: 'row' }, el('label', { class: 'check' }, saved, 'Saved'), el('label', { class: 'check' }, showHidden, 'Hidden publishers')),
    notice, results);
  await load();
  if (query.get('focus')) filter.focus();
}
async function project(main) {
  const site = groupSites(await cached(siteKinds)).find(row => row.address === query.get('site'));
  if (!site) {
    main.replaceChildren(heading('Site unavailable'), muted('This publication is missing from the local cache.'), link('Discover sites', route('discover'), 'button'));
    return;
  }
  const url = siteLink(site);
  const publisher = (await preferences(site.event.pubkey)).profile.name || shortKey(site.event.pubkey);
  const message = status();
  const favorite = button(setting('saved-sites', []).includes(site.address) ? 'Remove from saved' : 'Save site', () => {
    favorite.textContent = toggleList('saved-sites', site.address) ? 'Remove from saved' : 'Save site';
  });
  const hidden = button(setting('hidden-publishers', []).includes(site.event.pubkey) ? 'Show this publisher' : 'Hide all from this publisher', () => {
    const state = toggleList('hidden-publishers', site.event.pubkey);
    hidden.textContent = state ? 'Show this publisher' : 'Hide all from this publisher';
    setStatus(message, state ? 'Publisher hidden from Discover and Arcade.' : 'Publisher visible again.');
  });
  const collectionName = el('input', { list: 'collection-names', required: true, maxlength: 60 });
  const collectionForm = el('form', {},
    label('Collection name', collectionName),
    el('datalist', { id: 'collection-names' }, setting('collections', []).map(item => el('option', { value: item.name }))),
    el('button', { class: 'primary' }, 'Add'));
  const picker = modal('Add to collection', 'sheet', collectionForm);
  collectionForm.addEventListener('submit', event => {
    event.preventDefault();
    const name = collectionName.value.trim();
    if (!name) return;
    const collections = setting('collections', []);
    const existing = collections.find(item => item.name === name);
    const row = { name, items: [...new Set([...(existing?.items ?? []), 'site:' + site.address])] };
    saveCollections([...collections.filter(item => item.name !== name), row]);
    picker.close();
    setStatus(message, 'Site added to ' + name + '.');
  });
  main.replaceChildren(link('‹ Discover', route('discover')), heading(site.title),
    muted(`Published by ${publisher}`), site.description && el('p', {}, site.description),
    el('div', { class: 'row' }, url ? el('a', { class: 'button primary', href: url, target: '_blank', rel: 'noopener noreferrer' }, isGame(site) ? 'Play' : 'Open site') : muted('This site uses an address the configured gateway cannot open.'),
      setting('publishing-account')?.pubkey === site.event.pubkey && link('Update nsite', route('publish', { site: site.address }), 'button'),
      favorite, button('Add to collection', () => picker.showModal()), hidden),
    message, el('h2', {}, 'Observed versions'), el('ul', { class: 'stack-tight' },
      site.versions.map(event => el('li', {}, new Date(event.created_at * 1000).toLocaleDateString(), ' · ', el('code', {}, event.id)))),
    el('details', {}, el('summary', {}, 'Declared files'), el('ul', {}, site.event.tags.filter(parts => parts[0] === 'path').map(parts => el('li', {}, parts[1])))));
}
export function render(main, page) { return page === 'project' ? project(main) : catalog(main, page === 'arcade'); }

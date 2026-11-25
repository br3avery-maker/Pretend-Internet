import { el, label, query, run, setStatus, status } from '../lib/dom.js';
import { groupSites, kinds, siteURL, tag } from '../lib/model.js';
import { bootstrap, cached, endpoints, npub, preferences, reloadCatalog, transport } from '../lib/nostr.js';
import { jobId } from '../lib/publisher.js';
import { assertHeads, planSite, siteHeads } from '../lib/site-publication.js';
import { all, get, setting } from '../lib/store.js';

const siteKinds = [kinds.root, kinds.site];
const requested = query.get('site') || '';
const option = (value, title) => el('option', { value }, title);

export function siteEditor({ title, identifier, text, signer, onChange }) {
  const mode = el('select', {}, option('create', 'Create new nsite'), option('update', 'Update existing nsite'),
    option('restore', 'Restore a saved version'));
  mode.value = requested ? 'update' : 'create';
  const shape = el('select', {}, option('named', 'Named site'), option('root', 'Account root site'));
  const choice = el('select');
  const version = el('select');
  const find = el('button', { type: 'button' }, 'Find my published nsites');
  const feedback = status();
  const addressLine = el('code');
  const removals = el('div', { class: 'stack-tight' });
  const removePanel = el('details', {}, el('summary', {}, 'Remove existing files'), removals);
  const updateFields = el('div', { class: 'stack-tight' }, find, label('Published nsite', choice));
  const createFields = label('New nsite address type', shape);
  const restoreFields = label('Saved version to restore', version);
  const node = el('section', { class: 'stack-tight', hidden: true }, label('Nsite action', mode), createFields, updateFields,
    restoreFields, el('p', { class: 'muted' }, addressLine), removePanel, feedback);
  let sites = [];
  let backups = [];
  let loadedOwner;
  const creating = () => mode.value === 'create';
  const restoring = () => mode.value === 'restore';
  const selected = () => sites.find(site => site.address === choice.value);
  const restored = () => backups.find(event => event.id === version.value);
  const root = () => creating() ? shape.value === 'root' : selected()?.event.kind === kinds.root;
  const slug = () => root() ? '' : creating() ? identifier.value.trim() : selected()?.slug ?? '';
  const scope = () => creating() ? 'new:' + shape.value : selected()?.address || 'unselected';

  function drawAddress() {
    const owner = signer()?.pubkey;
    const url = owner && (root() || slug()) && siteURL(owner, slug(), npub(owner));
    addressLine.textContent = url || (owner ? npub(owner) : 'Connect the account that owns this site.');
  }
  function draw() {
    createFields.hidden = !creating();
    updateFields.hidden = creating();
    restoreFields.hidden = !restoring();
    removePanel.hidden = mode.value !== 'update' || !selected();
    identifier.closest('label').hidden = root();
    identifier.readOnly = !creating();
    title.readOnly = restoring();
    text.readOnly = restoring();
    removals.replaceChildren();
    if (!removePanel.hidden) {
      for (const [, path] of selected().event.tags.filter(parts => parts[0] === 'path' && parts[1] !== '/index.html')) {
        removals.append(el('label', { class: 'check' }, el('input', { type: 'checkbox', value: path }), path));
      }
    }
    drawAddress();
  }
  async function loadBackups() {
    const site = selected();
    const previous = version.value;
    const stored = site ? (await all('receipts')).filter(row => row.address === site.address && row.baseline?.id !== site.event.id)
      .map(row => row.baseline).filter(Boolean) : [];
    backups = [...new Map(stored.map(event => [event.id, event])).values()].sort((a,b) => b.created_at - a.created_at);
    version.replaceChildren(option('', backups.length ? 'Choose a saved version' : 'No saved versions for this site'),
      ...backups.map(event => option(event.id, new Date(event.created_at * 1000).toLocaleString() + ' · ' + event.id.slice(0, 12))));
    if (backups.some(event => event.id === previous)) version.value = previous;
  }
  async function load(refresh) {
    const owner = signer()?.pubkey;
    if (!owner) {
      if (refresh) throw new Error('Connect the account that owns this nsite first.');
      return;
    }
    if (refresh) {
      setStatus(feedback, 'Reading signed nsite manifests.');
      const result = await reloadCatalog(siteKinds, owner);
      if (signer()?.pubkey !== owner) return;
      setStatus(feedback, result.reached ? '' : 'The relays did not complete the lookup. Showing locally known sites.');
    }
    const found = groupSites(await cached(siteKinds, owner));
    if (signer()?.pubkey !== owner) return;
    const address = choice.value || requested;
    sites = found;
    loadedOwner = owner;
    choice.replaceChildren(option('', sites.length ? 'Choose the site' : 'No sites loaded'),
      ...sites.map(site => option(site.address, site.title + (site.slug ? ' · ' + site.slug : ' · root'))));
    if (sites.some(site => site.address === address)) choice.value = address;
  }
  async function transition(refresh = false) {
    if (!creating() && (refresh || signer()?.pubkey !== loadedOwner)) await load(refresh);
    if (restoring()) await loadBackups();
    await onChange();
  }
  for (const field of [mode, choice, shape, version]) field.addEventListener('change', run(field, feedback, () => transition()));
  find.addEventListener('click', run(find, feedback, () => transition(true)));
  identifier.addEventListener('input', drawAddress);

  return {
    node, mode, creating, restoring, root, slug, scope, draw, drawAddress,
    async reset() {
      sites = []; backups = []; loadedOwner = undefined;
      choice.replaceChildren(option('', 'Choose the site'));
      if (!creating()) await load(false);
      if (restoring()) await loadBackups();
    },
    defaults() {
      const source = restoring() ? restored() : !creating() && selected()?.event;
      return source ? { title: tag(source, 'title') || tag(source, 'name') || selected()?.title,
        body: tag(source, 'description') || tag(source, 'summary') } : {};
    },
    async prepare(draft, files, owner) {
      const previous = restored();
      const baseline = selected()?.event;
      const site = { owner, mode: mode.value, slug: slug(), root: Boolean(root()), baseline: creating() ? undefined : baseline,
        restore: restoring() ? previous : undefined,
        remove: mode.value === 'update' ? [...removals.querySelectorAll('input:checked')].map(input => input.value) : [] };
      if (site.slug !== draft.slug || owner !== signer()?.pubkey) throw new Error('The publishing account or address changed.');
      const plan = planSite(site, owner, files, site.restore);
      const { read, write, blossom } = await preferences(owner);
      site.servers = creating() ? [] : blossom;
      site.readRelays = endpoints([...setting('relays', []).slice(0, 3), ...write.slice(0, 3), ...read.slice(0, 3), ...bootstrap]);
      const known = (await cached([site.root ? kinds.root : kinds.site], owner)).find(event => site.root || tag(event, 'd') === site.slug);
      const retry = await get('receipts', await jobId(owner, { ...draft, site }, files));
      if (retry?.status === 'verified' && site.mode === 'create') throw new Error('This address has already been published. Choose Update existing nsite.');
      assertHeads(await siteHeads(transport, [...draft.relays, ...site.readRelays], site), draft.relays, plan.current, known, retry?.event);
      return { site, plan, known, backup: site.restore };
    },
  };
}

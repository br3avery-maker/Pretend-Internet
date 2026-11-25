import { button, el, heading, label, link, modal, muted, route, run, setStatus, status } from '../lib/dom.js';
import { bootstrap, endpoints, npub, parseKey, preferences, refreshIdentity, shortKey } from '../lib/nostr.js';
import { saveAccount, setting, setSetting } from '../lib/store.js';

function list(values, empty) {
  return values.length ? el('ul', { class: 'stack-tight' }, values.map(value => el('li', {}, el('code', {}, value)))) : muted(empty);
}
async function network(main) {
  const author = setting('account', '');
  const profile = author ? await preferences(author) : { read: [], write: [], blossom: [] };
  const form = el('form');
  const relays = el('textarea', { rows: 3, placeholder: 'wss://relay.example', spellcheck: 'false' }, setting('relays', []).join('\n'));
  const blossom = el('textarea', { rows: 3, placeholder: 'https://blossom.example', spellcheck: 'false' }, setting('blossom', []).join('\n'));
  const message = status();
  const save = el('button', { class: 'primary' }, 'Save overrides');
  form.append(label('Additional relays', relays), label('Preferred Blossom servers', blossom), save, message);
  form.addEventListener('submit', run(save, message, async () => {
    const candidates = [relays, blossom].map(input => input.value.trim().split(/\s+/).filter(Boolean));
    const normalized = [endpoints(candidates[0]), endpoints(candidates[1], true)];
    if (candidates.some((group, i) => [...new Set(group)].length !== normalized[i].length)) throw new Error('Use distinct public wss:// relay URLs and https:// Blossom URLs.');
    setSetting('relays', normalized[0]);
    setSetting('blossom', normalized[1]);
    setStatus(message, 'Network overrides saved on this device.');
  }));
  const refresh = button('Refresh account lists', async () => {
    refresh.disabled = true;
    setStatus(message, 'Reading signed lists.');
    try {
      const result = await refreshIdentity(author);
      if (!result.events.length) setStatus(message, 'The relays returned no account lists. Cached values are still available.');
      else await network(main);
    } catch (error) { setStatus(message, error.message); }
    finally { refresh.disabled = false; }
  });
  main.replaceChildren(heading('Network', author && refresh),
    el('section', { class: 'stack-tight' }, el('h2', {}, 'Read relays'), list(profile.read, 'Using the app’s discovery relays.')),
    el('section', { class: 'stack-tight' }, el('h2', {}, 'Write relays'), list(profile.write, 'Choose public destinations on the Publish screen.')),
    el('section', { class: 'stack-tight' }, el('h2', {}, 'Blossom servers'), list(profile.blossom, 'The active account has no saved server list.')),
    el('details', {}, el('summary', {}, 'Discovery relays'), list(bootstrap, '')), el('h2', {}, 'Overrides'), form);
}
async function profiles(main) {
  const active = setting('account', '');
  const message = status();
  const current = active ? await preferences(active) : null;
  const add = el('input', { required: true, placeholder: 'npub1…', autocapitalize: 'none', spellcheck: 'false' });
  const submit = el('button', { class: 'primary' }, 'Add profile');
  const form = el('form', {}, label('Public Nostr key', add), submit, message);
  form.addEventListener('submit', run(submit, message, async () => {
    const key = parseKey(add.value);
    setStatus(message, 'Reading profile and public network lists.');
    saveAccount(key);
    await refreshIdentity(key);
    await profiles(main);
  }));
  const entries = await Promise.all(setting('accounts', []).map(async key => {
    const { profile } = await preferences(key);
    const remove = button('Remove saved profile', () => {
      setSetting('accounts', setting('accounts', []).filter(value => value !== key));
      if (active === key) setSetting('account', '');
      location.reload();
    });
    const more = button('Details', () => modal(profile.name || shortKey(key), 'sheet',
      muted(npub(key)), profile.about && el('p', {}, profile.about),
      profile.website && link('Public website', profile.website, 'button'), remove).showModal());
    return el('article', { class: 'entry split' },
      el('div', { class: 'stack-tight' }, el('h3', {}, profile.name || shortKey(key)), muted(active === key ? 'Active browsing profile' : shortKey(key))),
      el('div', { class: 'row' }, more, active !== key && button('Use profile', () => { saveAccount(key); location.reload(); })));
  }));
  main.replaceChildren(heading('Profiles'), current?.profile.banner && el('img', { class: 'profile-banner', src: current.profile.banner, alt: '', referrerpolicy: 'no-referrer' }),
    entries, active && button('Browse without a profile', () => { setSetting('account', ''); location.reload(); }),
    form, link('Connect a signer in Publish', route('publish'), 'button'));
}
export function render(main, page) { return page === 'network' ? network(main) : profiles(main); }

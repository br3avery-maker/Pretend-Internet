import { button, el, icon, iconButton, link, modal, route } from './lib/dom.js';
import { setting } from './lib/store.js';
import { preferences, shortKey } from './lib/nostr.js';

const current = document.body.dataset.page;
const groups = { project: 'discover', book: 'library', reader: 'library', curate: 'library', writing: 'library' };
const pages = {
  index: () => import('./pages/home.js'),
  help: () => import('./pages/home.js'),
  discover: () => import('./pages/discover.js'),
  project: () => import('./pages/discover.js'),
  arcade: () => import('./pages/discover.js'),
  library: () => import('./pages/library.js'),
  writing: () => import('./pages/library.js'),
  book: () => import('./pages/library.js'),
  curate: () => import('./pages/library.js'),
  reader: () => import('./pages/reader.js'),
  music: () => import('./pages/music.js'),
  profile: () => import('./pages/account.js'),
  network: () => import('./pages/account.js'),
  publish: () => import('./pages/publish.js'),
};
const destinations = [
  ['index', 'Home', 'home'], ['discover', 'Discover', 'discover'], ['library', 'Library', 'book'],
  ['music', 'Music', 'music'], ['arcade', 'Arcade', 'game'], ['publish', 'Publish', 'bolt'],
  ['writing', 'Writing', 'book'], ['profile', 'Profiles', 'user'], ['network', 'Network', 'network'], ['help', 'Help', 'help'],
];

async function shell() {
  const account = setting('account', '');
  const accountData = account ? (await preferences(account)).profile : {};
  const nav = (page, title, symbol) => el('a', {
    href: route(page), class: 'nav-link', 'aria-current': (groups[current] ?? current) === page ? 'page' : null,
  }, icon(symbol), title);
  const settings = modal('Settings', 'sheet', el('nav', { class: 'menu' },
    link('Profiles and signer', route('profile')), link('Network and storage', route('network')), link('Help and data', route('help'))));
  const menu = modal(accountData.name || shortKey(account), 'drawer',
    el('nav', { class: 'menu', 'aria-label': 'App pages' },
      destinations.map(([page, title, symbol]) => el('a', { href: route(page) }, icon(symbol), title)),
      button([icon('settings'), 'Settings'], () => { menu.close(); settings.showModal(); })));
  const avatar = el('button', { class: 'avatar', 'aria-label': 'Open profile menu', onclick: () => menu.showModal() },
    accountData.picture ? el('img', { src: accountData.picture, alt: '', referrerpolicy: 'no-referrer' }) : icon('user'));
  avatar.querySelector('img')?.addEventListener('error', () => avatar.replaceChildren(icon('user')));
  document.querySelector('#shell').append(
    el('header', { class: 'topbar' }, el('div', { class: 'topbar-inner' }, avatar,
      link('Pretend Internet', route('index'), 'title'), el('span', { class: 'spacer' }),
      el('a', { class: 'button icon-button', href: route('discover', { focus: 'search' }), 'aria-label': 'Search' }, icon('search')))),
    el('nav', { class: 'bottom', 'aria-label': 'Main navigation' }, el('div', { class: 'bottom-inner' },
      nav(...destinations[0]), nav(...destinations[1]),
      el('a', { class: 'button center-action', href: (groups[current] ?? current) === 'library' ? route('curate', { import: '1' }) : route('publish'),
        'aria-label': (groups[current] ?? current) === 'library' ? 'Import or curate' : 'Publish' }, icon('add')),
      nav(...destinations[2]), nav(...destinations[4]))));
}

const main = document.querySelector('#main');
if (current !== 'reader') {
  main.classList.add('main', 'stack');
  try { await shell(); } catch { main.prepend('Local account settings are unavailable.'); }
}
try {
  const loaded = await pages[current]();
  await loaded.render(main, current);
} catch (error) {
  main.replaceChildren(el('p', { role: 'alert' }, 'Could not open this page. ' + error.message), link('Home', route('index')));
}
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

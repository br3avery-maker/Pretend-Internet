import { el, icon, link, route } from '../lib/dom.js';

const sections = [
  ['discover', 'Discover', 'discover', 'Find published sites and projects'],
  ['arcade', 'Arcade', 'game', 'Open games from their published homes'],
  ['library', 'Bookshelf', 'book', 'Read stories, articles, and your own books'],
  ['music', 'Music', 'music', 'Play tracks and browse releases'],
  ['writing', 'Writing', 'book', 'Find and read published articles'],
  ['publish', 'Publish', 'bolt', 'Review and sign a public release'],
  ['profile', 'Profiles', 'user', 'Browse a public Nostr account'],
];
export function render(main, page) {
  if (page === 'help') {
    main.replaceChildren(el('h1', {}, 'Help'),
      el('h2', {}, 'Start anywhere'),
      el('p', {}, 'Read the two bundled Loopy Library books offline. Add a public Nostr profile to browse releases from that account, or refresh Discover to see recent signed site metadata.'),
      el('h2', {}, 'Your local data'),
      el('p', {}, 'The browser keeps your saved profiles, collections, books, bookmarks, drafts, and relay cache. Clearing site data removes them from this browser. You can export a publish receipt from Publish.'),
      el('h2', {}, 'Going online'),
      el('p', {}, 'Discover looks up public nsites by npub. Open takes you to a published site. To change one of your sites, connect its signer in Publish and choose Update existing nsite. Review the account, address, and file changes before signing.'),
      link('Back to Home', route('index'), 'button'));
    return;
  }
  main.replaceChildren(
    el('header', { class: 'home-heading stack-tight' }, el('h1', { class: 'tape' }, 'Pretend Internet'),
      el('p', { class: 'muted' }, 'Find a place, play something, or pick up where you left off.')),
    el('nav', { class: 'home-nav', 'aria-label': 'Places' }, sections.map(([page, title, symbol, description]) =>
      el('a', { href: route(page), class: 'destination' }, icon(symbol), el('span', {}, el('strong', {}, title), el('small', {}, description)), icon('right')))));
}

import { button, el, iconButton, label, link, modal, muted, query, route } from '../lib/dom.js';
import { findBook, renderChapter } from '../lib/books.js';
import { setting, setSetting } from '../lib/store.js';

export async function render(main) {
  const book = await findBook(query.get('book'));
  if (!book) { main.className = 'main stack'; main.replaceChildren(el('h1', {}, 'Book unavailable'), link('Bookshelf', route('library'), 'button')); return; }
  main.className = 'reader-document stack';
  const page = el('article', { tabindex: 0, 'aria-label': 'Chapter text' });
  const title = el('h1', { tabindex: -1 });
  const progress = el('span', { 'aria-live': 'polite' });
  const restore = setting('positions', {})[book.id];
  const incoming = Number(query.get('chapter'));
  let current = Math.max(0, Math.min(book.chapters.length - 1, Number.isInteger(incoming) && incoming > 0 ? incoming - 1 : restore?.chapter ?? 0));
  let observedY = 0;
  let saveTimer;
  let ready = false;
  let start;
  let swallowClick = 0;
  const toc = el('nav', { class: 'menu', 'aria-label': 'Chapters' });
  const contents = modal('Chapters', 'drawer', toc);
  const appearance = setting('reader-display', { size: 20, spacing: 1.7, font: 'serif', light: false });
  const size = el('input', { type: 'range', min: 15, max: 34, value: appearance.size });
  const spacing = el('input', { type: 'range', min: 1.2, max: 2.2, step: 0.1, value: appearance.spacing });
  const font = el('select', {}, el('option', { value: 'serif' }, 'Serif'), el('option', { value: 'sans-serif' }, 'Sans serif'));
  const light = el('input', { type: 'checkbox', checked: appearance.light });
  font.value = appearance.font;
  const settings = modal('Reading settings', 'sheet', label('Text size', size), label('Line spacing', spacing), label('Typeface', font),
    el('label', { class: 'check' }, light, 'Light page'));
  function applySettings() {
    page.style.fontSize = size.value + 'px';
    page.style.lineHeight = spacing.value;
    page.style.fontFamily = font.value === 'serif' ? 'Georgia, serif' : 'system-ui, sans-serif';
    document.body.classList.toggle('reader-light', light.checked);
    setSetting('reader-display', { size: Number(size.value), spacing: Number(spacing.value), font: font.value, light: light.checked });
  }
  for (const control of [size, spacing, font, light]) control.addEventListener('input', applySettings);
  const mark = button('Bookmark', () => {
    const all = setting('bookmarks', {});
    const id = book.chapters[current].id;
    const saved = new Set(all[book.id] ?? []);
    if (!saved.delete(id)) saved.add(id);
    setSetting('bookmarks', { ...all, [book.id]: [...saved] });
    paintMark();
  });
  const previous = iconButton('back', 'Previous chapter', () => change(-1));
  const next = iconButton('right', 'Next chapter', () => change(1));
  const top = el('header', { class: 'reader-chrome topbar' }, el('div', { class: 'topbar-inner' },
    iconButton('list', 'Chapters', () => contents.showModal()), el('span', { class: 'title' }, book.title), el('span', { class: 'spacer' }),
    iconButton('settings', 'Reading settings', () => settings.showModal())));
  const bottom = el('nav', { class: 'reader-controls', 'aria-label': 'Reading controls' }, el('div', { class: 'split' },
    el('div', { class: 'row' }, link('Home', route('index'), 'button'), link('Library', route('library'), 'button')),
    el('div', { class: 'row' }, previous, mark, next)));
  document.querySelector('#shell').append(top, bottom);
  main.replaceChildren(muted(book.title), title, progress, page);

  function paintMark() {
    const saved = (setting('bookmarks', {})[book.id] ?? []).includes(book.chapters[current].id);
    mark.textContent = saved ? 'Saved' : 'Bookmark';
    mark.setAttribute('aria-pressed', String(saved));
  }
  function persist() {
    if (!ready) return;
    setSetting('positions', { ...setting('positions', {}), [book.id]: { chapter: current, y: window.scrollY, width: innerWidth } });
    setSetting('last-book', book.id);
  }
  function draw(y) {
    const chapter = book.chapters[current];
    const url = new URL(location.href);
    url.searchParams.set('chapter', String(current + 1));
    history.replaceState(null, '', url);
    title.textContent = chapter.title.replace(/^Chapter\s+[^:]+:\s*/i, '');
    progress.textContent = `${current + 1} of ${book.chapters.length}`;
    renderChapter(page, book, chapter);
    previous.disabled = current === 0;
    next.disabled = current === book.chapters.length - 1;
    toc.replaceChildren(...book.chapters.map((part, index) => el('button', {
      type: 'button', 'aria-current': index === current ? 'page' : null,
      onclick: () => { contents.close(); if (index !== current) change(index - current); }
    }, part.title)));
    paintMark();
    document.body.classList.remove('reader-hidden');
    window.scrollTo(0, y);
    observedY = window.scrollY;
    persist();
  }
  function change(diff) {
    const target = current + diff;
    if (target < 0 || target >= book.chapters.length) return;
    current = target;
    draw(0);
    title.focus({ preventScroll: true });
  }
  addEventListener('scroll', () => {
    const y = window.scrollY;
    const delta = y - observedY;
    if (Math.abs(delta) >= 4) {
      document.body.classList.toggle('reader-hidden', y > 50 && delta > 0 && !contents.open && !settings.open);
      observedY = y;
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 80);
  }, { passive: true });
  main.addEventListener('touchstart', event => {
    const { clientX, clientY } = event.changedTouches[0];
    start = { x: clientX, y: clientY };
  }, { passive: true });
  main.addEventListener('touchend', event => {
    if (!start || event.touches.length) return;
    const { clientX, clientY } = event.changedTouches[0];
    const dx = clientX - start.x;
    const dy = clientY - start.y;
    start = null;
    if (Math.abs(dx) >= 55 && Math.abs(dx) > 1.6 * Math.abs(dy)) {
      swallowClick = performance.now() + 350;
      change(dx < 0 ? 1 : -1);
    }
  }, { passive: true });
  main.addEventListener('click', event => {
    if (performance.now() > swallowClick && !event.target.closest('a,button,input,select')) document.body.classList.toggle('reader-hidden');
  });
  addEventListener('keydown', event => {
    if (contents.open || settings.open || event.target.closest('button,input,select,a')) return;
    if (event.key === 'ArrowLeft') change(-1);
    if (event.key === 'ArrowRight') change(1);
    if (event.key === 'Escape') document.body.classList.remove('reader-hidden');
  });
  addEventListener('pagehide', persist);
  applySettings();
  ready = true;
  draw(restore?.chapter === current ? restore.y || 0 : 0);
}

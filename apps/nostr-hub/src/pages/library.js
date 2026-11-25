import { button, el, heading, icon, label, link, muted, query, route, run, setStatus, status } from '../lib/dom.js';
import { books, findBook, importBook, renderChapter } from '../lib/books.js';
import { groupSites, kinds, matchesWords } from '../lib/model.js';
import { cached, preferences, reloadCatalog, shortKey } from '../lib/nostr.js';
import { saveCollections, setting, setSetting } from '../lib/store.js';

const localBook = id => route('book', { book: id });
const readBook = id => route('reader', { book: id });
const bookLabel = async book => book.author || (book.authorKey ? (await preferences(book.authorKey)).profile.name || shortKey(book.authorKey) : 'Local import');
const cover = book => book.cover
  ? el('img', { src: book.cover, alt: '', loading: 'lazy' })
  : el('span', { class: 'book-cover-placeholder' }, icon('book'));

async function bookshelf(main, writing) {
  const search = el('input', { type: 'search', placeholder: 'Search title, author, series, or tag', 'aria-label': 'Search the bookshelf' });
  const filter = el('select', { 'aria-label': 'Bookshelf category' },
    el('option', { value: 'all' }, 'All works'), el('option', { value: 'books' }, 'Books'), el('option', { value: 'articles' }, 'Writing'), el('option', { value: 'bookmarks' }, 'Bookmarks'));
  if (writing || query.get('view') === 'articles') filter.value = 'articles';
  const shelf = el('div', { class: 'shelf' });
  const message = status();
  const resume = el('div', { class: 'row' });
  let works = [];
  function draw() {
    const bookmarks = setting('bookmarks', {});
    const listed = works.filter(work => (filter.value === 'all' || filter.value === 'books' && !work.authorKey ||
      filter.value === 'articles' && work.authorKey || filter.value === 'bookmarks' && bookmarks[work.id]?.length) &&
      matchesWords(search.value, work.title, work.byline, work.series, work.topics));
    shelf.replaceChildren(...listed.map(work => el('a', { class: 'book-tile', href: localBook(work.id) },
      cover(work), el('strong', {}, work.title), el('small', {}, work.byline))));
    if (!listed.length) shelf.append(muted('No works match this view.'));
    const last = works.find(work => work.id === setting('last-book'));
    resume.replaceChildren(...(last ? [link('Continue ' + last.title, readBook(last.id), 'button primary')] : []));
  }
  async function load() {
    works = await Promise.all((await books()).map(async work => ({ ...work, byline: await bookLabel(work) })));
    draw();
  }
  const refresh = button('Find writing', async () => {});
  refresh.addEventListener('click', run(refresh, message, async () => {
    setStatus(message, 'Looking for signed long-form writing.');
    const result = await reloadCatalog([kinds.article]);
    await load();
    setStatus(message, result.reached ? `${result.count} signed article events returned.` : 'No relays completed the query. Your saved shelf is still available.');
  }));
  search.addEventListener('input', draw);
  filter.addEventListener('change', draw);
  main.replaceChildren(heading(writing ? 'Writing' : 'Bookshelf', link('Curate', route('curate'), 'button')),
    el('nav', { class: 'tabs', 'aria-label': 'Library pages' }, ...[['library','Bookshelf'],['writing','Writing']].map(([page,title]) =>
      el('a', { class: 'button', href: route(page), 'aria-current': (page === 'writing') === writing ? 'page' : null }, title))), resume,
    el('div', { class: 'row' }, search, filter), refresh, message, shelf);
  await load();
}
async function details(main) {
  const book = await findBook(query.get('book'));
  if (!book) { main.replaceChildren(heading('Book unavailable'), link('Bookshelf', route('library'), 'button')); return; }
  const marks = setting('bookmarks', {})[book.id] ?? [];
  const preview = el('div', { class: 'inline-preview stack-tight' });
  renderChapter(preview, book, book.chapters[0]);
  main.replaceChildren(link('‹ Bookshelf', route('library')), heading(book.title), muted(await bookLabel(book)),
    el('div', { class: 'content-columns stack' },
      el('div', { class: 'cover' }, cover(book)),
      el('div', { class: 'stack' }, book.series && muted(book.series), book.about && el('p', {}, book.about),
        preview, el('div', { class: 'row' }, link(setting('positions', {})[book.id] ? 'Continue reading' : 'Read', readBook(book.id), 'button primary'),
          link('Curate', route('curate', { book: book.id }), 'button')))),
    el('h2', {}, 'Chapters'), el('ol', { class: 'stack-tight' }, book.chapters.map((chapter, i) =>
      el('li', {}, link(chapter.title, route('reader', { book: book.id, chapter: i + 1, start: 1 })), marks.includes(chapter.id) && ' · Saved'))));
}
async function curate(main) {
  const works = await books();
  const upload = el('input', { type: 'file', accept: '.md,.markdown,.txt,text/plain,text/markdown', required: true });
  const importButton = el('button', { class: 'primary' }, 'Import document');
  const result = status();
  const uploadForm = el('form', {}, label('Markdown or text file', upload), importButton, result);
  uploadForm.addEventListener('submit', run(importButton, result, async () => {
    const saved = await importBook(upload.files[0]);
    location.href = route('curate', { book: saved.id });
  }));
  const selected = query.get('book') || works[0]?.id;
  const picker = el('select', { 'aria-label': 'Choose a work' }, works.map(work => el('option', { value: work.id }, work.title)));
  picker.value = selected || '';
  picker.addEventListener('change', () => { location.href = route('curate', { book: picker.value }); });
  const work = works.find(item => item.id === selected);
  const lists = setting('collections', []);
  const sites = groupSites(await cached([kinds.root, kinds.site]));
  const findItem = id => {
    if (id.startsWith('site:')) {
      const site = sites.find(row => row.address === id.slice(5));
      return site && link(site.title, route('project', { site: site.address }));
    }
    const book = works.find(item => item.id === id);
    return book && link(book.title, localBook(id));
  };
  const listsUI = el('section', { class: 'stack' });
  function drawLists() {
    listsUI.replaceChildren(el('h2', {}, 'Collections'), ...lists.map(collection => el('div', { class: 'stack-tight entry' },
      el('h3', {}, collection.name), collection.items.map(id => el('div', { class: 'split' }, findItem(id) || muted('Item unavailable'),
        button('Remove', () => { collection.items = collection.items.filter(value => value !== id); saveCollections(lists); drawLists(); }))))));
  }
  drawLists();
  const editor = el('section', { class: 'stack' });
  if (work) {
    const title = el('input', { value: work.title, required: true, maxlength: 160 });
    const author = el('input', { value: work.author || '', maxlength: 100 });
    const series = el('input', { value: work.series || '', maxlength: 100 });
    const keywords = el('input', { value: (work.topics || []).join(', '), maxlength: 300 });
    const collection = el('input', { list: 'shelves', maxlength: 60 });
    const editResult = status();
    const save = el('button', { class: 'primary' }, 'Save changes');
    const form = el('form', {}, label('Title', title), label('Author', author), label('Series', series), label('Tags (comma separated)', keywords),
      label('Add to collection', collection), el('datalist', { id: 'shelves' }, lists.map(value => el('option', { value: value.name }))), save, editResult);
    form.addEventListener('submit', run(save, editResult, async () => {
      if (!title.value.trim()) throw new Error('Enter a title.');
      setSetting('book-edits', { ...setting('book-edits', {}), [work.id]: { title: title.value.trim(), author: author.value.trim(), series: series.value.trim(), topics: keywords.value.split(',').map(value => value.trim()).filter(Boolean) } });
      const name = collection.value.trim();
      if (name) {
        let shelf = lists.find(item => item.name === name);
        if (!shelf) { shelf = { name, items: [] }; lists.push(shelf); }
        shelf.items = [...new Set([...shelf.items, work.id])];
        saveCollections(lists);
        drawLists();
      }
      setStatus(editResult, 'Changes saved locally.');
    }));
    const preview = el('div', { class: 'inline-preview stack-tight' });
    renderChapter(preview, work, work.chapters[0]);
    editor.append(el('h2', {}, 'Edit a work'), picker, preview, form);
  }
  main.replaceChildren(link('‹ Bookshelf', route('library')), heading('Curate'), el('h2', {}, 'Import'), uploadForm, editor, listsUI);
  if (query.get('import')) upload.focus();
}
export function render(main, page) {
  if (page === 'book') return details(main);
  if (page === 'curate') return curate(main);
  return bookshelf(main, page === 'writing');
}

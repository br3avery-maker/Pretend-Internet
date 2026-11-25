import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { all, get, put, setting } from './store.js';
import { cached } from './nostr.js';
import { chaptersFromMarkdown } from './text.js';
import { kinds, newestByAddress, tag, tags } from './model.js';

let bundled;
export async function books() {
  bundled ??= fetch('./books/loopy-library.json').then(response => {
    if (!response.ok) throw new Error('The bundled bookshelf could not be loaded.');
    return response.json();
  }).catch(() => []);
  const [stock, local, articles] = await Promise.all([bundled, all('books'), cached([kinds.article])]);
  const documents = new Map(stock.map(work => [work.id, work]));
  for (const event of newestByAddress(articles)) {
    const identifier = tag(event, 'd');
    if (!identifier) continue;
    const id = `article:${event.pubkey}:${identifier}`;
    const work = {
      id, format: 'markdown', title: tag(event, 'title') || identifier, about: tag(event, 'summary'),
      authorKey: event.pubkey, author: '', topics: tags(event, 't').map(parts => parts[1]),
      chapters: [{ id: 'article', title: 'Article', text: event.content }],
    };
    documents.set(id, work);
  }
  for (const work of local) documents.set(work.id, work);
  const edits = setting('book-edits', {});
  return [...documents.values()].map(work => ({ ...work, ...edits[work.id] }));
}
export const findBook = async id => (await books()).find(work => work.id === id);
export async function importBook(file) {
  if (!/\.(md|markdown|txt)$/i.test(file.name)) throw new Error('Choose a Markdown or plain text document.');
  if (file.size > 4 * 1024 * 1024) throw new Error('Choose a text file under 4 MiB.');
  const source = await file.text();
  if (!source.trim()) throw new Error('This file is empty.');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const id = 'local:' + hash;
  const existing = await get('books', id);
  if (existing) return existing;
  const work = { id, title: file.name.replace(/\.(md|markdown|txt)$/i, ''), author: '', format: 'markdown', chapters: chaptersFromMarkdown(source) };
  await put('books', work);
  return work;
}
export function renderChapter(node, book, chapter) {
  const html = book.format === 'html' ? chapter.html : marked.parse(chapter.text ?? '');
  node.innerHTML = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'iframe', 'img', 'audio', 'video', 'source', 'picture', 'meta', 'link'],
    FORBID_ATTR: ['style', 'target', 'srcset'],
  });
  for (const anchor of node.querySelectorAll('a[href]')) {
    if (anchor.getAttribute('href').startsWith('#')) continue;
    const href = anchor.getAttribute('href');
    if (!/^https:\/\//i.test(href)) anchor.removeAttribute('href');
    else { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
  }
}

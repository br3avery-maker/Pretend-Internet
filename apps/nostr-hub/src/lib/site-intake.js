import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { siteFiles } from './publisher.js';

const plain = value => value?.replace(/<[^>]*>/g, '').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim() || '';
const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const nameTitle = name => name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();

export async function siteIntake(selected, partial) {
  const input = selected[0];
  let files = selected;
  if (!partial && selected.length === 1 && /\.(md|txt)$/i.test(input.name)) {
    if (input.size > 4 * 1024 * 1024) throw new Error('Choose a document under 4 MB.');
    const raw = await input.text();
    if (!raw.trim()) throw new Error('The selected document is empty.');
    const markdown = /\.md$/i.test(input.name);
    const title = plain(raw.match(/^#\s+(.+)$/m)?.[1]) || nameTitle(input.name);
    const body = markdown ? DOMPurify.sanitize(marked.parse(raw)) : '<pre>' + escape(raw) + '</pre>';
    const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escape(title)
      + '</title><style>body{max-width:72ch;margin:2rem auto;padding:0 1rem;font:1rem/1.65 system-ui}'
      + 'pre{white-space:pre-wrap}img{max-width:100%;height:auto}</style></head><body><main>' + body + '</main></body></html>';
    files = [new File([html], 'index.html', { type: 'text/html' })];
  }
  files = await siteFiles(files, { partial });
  const html = new TextDecoder().decode(files.find(file => file.path === '/index.html')?.bytes?.slice(0, 96 * 1024));
  let description = '';
  for (const [element] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = Object.fromEntries([...element.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
      .map(([, key, double, single, bare]) => [key.toLowerCase(), double ?? single ?? bare]));
    if (['description', 'og:description'].includes((attrs.name ?? attrs.property)?.toLowerCase())) {
      description = plain(attrs.content).slice(0, 1000);
      if (attrs.name?.toLowerCase() === 'description') break;
    }
  }
  const title = (plain(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1])
    || plain(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1])
    || nameTitle(input.webkitRelativePath?.split('/')[0] || input.name)).slice(0, 140);
  const slug = title.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 13).replace(/-+$/, '');
  return { files, title, description, slug };
}

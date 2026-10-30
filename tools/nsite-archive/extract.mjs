import { parse } from 'parse5';
import path from 'node:path/posix';

export const EXTRACTOR = 'html-text-v1';
const clean = (s) => s.replace(/\s+/g, ' ').trim();
const ignored = new Set(['script', 'style', 'template', 'noscript', 'svg', 'head']);
const voids = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);
const escape = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
export function extractHTML(bytes, pagePath) {
  const doc = parse(bytes.toString('utf8')),
    output = {
      title: '',
      description: '',
      headings: [],
      text: '',
      metadata: {},
      links: [],
      language: null,
      subjects: [],
    };
  const text = (n) =>
    n.nodeName === '#text'
      ? n.value
      : ignored.has(n.tagName)
        ? ''
        : (n.childNodes ?? []).map(text).join(' ');
  const visit = (n) => {
    const a = Object.fromEntries((n.attrs ?? []).map((x) => [x.name, x.value]));
    if (n.tagName === 'title')
      output.title = clean((n.childNodes ?? []).map((x) => x.value ?? '').join(''));
    if (n.tagName === 'meta' && (a.name || a.property))
      output.metadata[a.name || a.property] = a.content ?? '';
    if (n.tagName === 'html' && a.lang)
      output.language = { value: a.lang, basis: 'html-lang', inferred: false };
    if (/^h[1-6]$/.test(n.tagName)) output.headings.push(clean(text(n)));
    if (n.tagName === 'a' && a.href && output.links.length < 4096) {
      try {
        const url = new URL(a.href, `https://archive.invalid${pagePath}`);
        if (['http:', 'https:', 'nostr:'].includes(url.protocol))
          output.links.push({
            href:
              url.hostname === 'archive.invalid' ? url.pathname + url.search + url.hash : url.href,
            text: clean(text(n)).slice(0, 300),
            outbound: url.hostname !== 'archive.invalid',
          });
      } catch {
        /* invalid link */
      }
    }
    for (const child of n.childNodes ?? []) visit(child);
  };
  visit(doc);
  output.text = clean(text(doc)).slice(0, 1048576);
  output.description = output.metadata.description || output.metadata['og:description'] || '';
  const terms = new Map();
  for (const word of output.text.toLowerCase().match(/[\p{L}]{4,}/gu) ?? [])
    if (!/^(this|that|with|from|have|your|about|will|more|http|https|www)$/.test(word))
      terms.set(word, (terms.get(word) ?? 0) + 1);
  output.subjects = [...terms]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([value, count]) => ({ value, count, inferred: true, basis: 'term-frequency' }));
  return output;
}
// Sanitized visual snapshot. No script execution, meta refresh, forms, frames,
// base URL overrides, event handlers or network URLs. CSP/route interception
// provide independent enforcement when a browser renders this output.
export function visualHTML(bytes) {
  const doc = parse(bytes.toString('utf8'));
  const render = (n) => {
    if (n.nodeName === '#text') return escape(n.value);
    if (
      [
        'script',
        'iframe',
        'frame',
        'object',
        'embed',
        'base',
        'form',
        'input',
        'button',
        'textarea',
        'select',
        'meta',
      ].includes(n.tagName)
    )
      return '';
    if (!n.tagName) return (n.childNodes ?? []).map(render).join('');
    const attrs = (n.attrs ?? [])
      .filter(
        (a) =>
          !a.name.startsWith('on') &&
          !['srcdoc', 'action', 'formaction', 'target', 'ping', 'download', 'srcset'].includes(
            a.name,
          ),
      )
      .filter((a) => {
        if (!['href', 'src', 'poster', 'xlink:href'].includes(a.name)) return true;
        return !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(a.value.trim());
      })
      .map((a) => ` ${a.name}="${escape(a.value)}"`)
      .join('');
    return `<${n.tagName}${attrs}>${voids.has(n.tagName) ? '' : (n.childNodes ?? []).map(render).join('') + `</${n.tagName}>`}`;
  };
  return '<!doctype html>' + render(doc);
}
export function mime(file) {
  return (
    {
      '.html': 'text/html',
      '.htm': 'text/html',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.txt': 'text/plain',
      '.md': 'text/plain',
      '.json': 'application/json',
    }[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
  );
}

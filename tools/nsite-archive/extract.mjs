import { parse } from 'parse5';
import path from 'node:path/posix';

export const EXTRACTOR = 'html-text-v2';
const clean = (s) => s.replace(/\s+/g, ' ').trim();
const ignored = new Set(['script', 'style', 'template', 'noscript', 'svg', 'head']);
const MAX_NODES = 100000;
function* walk(root, skip = new Set()) {
  const pending = [root];
  let visited = 0;
  while (pending.length) {
    const current = pending.pop();
    if (++visited > MAX_NODES) throw Error('html-node-limit');
    yield current;
    if (skip.has(current.tagName)) continue;
    const children = current.childNodes ?? [];
    for (let i = children.length - 1; i >= 0; i--) pending.push(children[i]);
  }
}
function text(root, limit = 1048576) {
  const parts = [];
  let length = 0;
  for (const node of walk(root, ignored)) {
    if (node.nodeName !== '#text') continue;
    const value = clean(node.value);
    if (!value) continue;
    parts.push(value.slice(0, limit - length));
    length += value.length + 1;
    if (length >= limit) break;
  }
  return parts.join(' ').slice(0, limit);
}
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
  for (const n of walk(doc)) {
    const a = Object.fromEntries((n.attrs ?? []).map((x) => [x.name, x.value]));
    if (n.tagName === 'title')
      output.title = clean((n.childNodes ?? []).map((x) => x.value ?? '').join(''));
    if (n.tagName === 'meta' && (a.name || a.property))
      output.metadata[a.name || a.property] = a.content ?? '';
    if (n.tagName === 'html' && a.lang)
      output.language = { value: a.lang, basis: 'html-lang', inferred: false };
    if (/^h[1-6]$/.test(n.tagName) && output.headings.length < 4096)
      output.headings.push(text(n, 8192));
    if (n.tagName === 'a' && a.href && output.links.length < 4096) {
      try {
        const url = new URL(a.href, `https://archive.invalid${pagePath}`);
        if (['http:', 'https:', 'nostr:'].includes(url.protocol))
          output.links.push({
            href:
              url.hostname === 'archive.invalid' ? url.pathname + url.search + url.hash : url.href,
            text: text(n, 300),
            outbound: url.hostname !== 'archive.invalid',
          });
      } catch {
        /* invalid link */
      }
    }
  }
  output.text = text(doc);
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
  const output = ['<!doctype html>'],
    pending = [doc];
  let visited = 0;
  while (pending.length) {
    const n = pending.pop();
    if (typeof n === 'string') {
      output.push(n);
      continue;
    }
    if (++visited > MAX_NODES) throw Error('html-node-limit');
    if (n.nodeName === '#text') {
      output.push(escape(n.value));
      continue;
    }
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
      continue;
    if (!n.tagName) {
      const children = n.childNodes ?? [];
      for (let i = children.length - 1; i >= 0; i--) pending.push(children[i]);
      continue;
    }
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
    output.push(`<${n.tagName}${attrs}>`);
    if (!voids.has(n.tagName)) {
      pending.push(`</${n.tagName}>`);
      const children = n.childNodes ?? [];
      for (let i = children.length - 1; i >= 0; i--) pending.push(children[i]);
    }
  }
  return output.join('');
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

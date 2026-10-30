// Source-extracted regression: imported SVG/CSS resources must keep URL fragments.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../web2app/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'Shipped launcher script exists');
const start = script.indexOf(' async function convert(');
const end = script.indexOf(' for(const elem of doc.querySelectorAll', start);
const safe = script.slice(script.indexOf('function safeZipPath('), script.indexOf('async function zipIndex('));
const local = script.slice(script.indexOf('function localResourcePath('), script.indexOf('async function makeHTML('));
assert.ok(start >= 0 && end > start && safe.includes('function safeZipPath') && local.includes('function localResourcePath'),
  'Resource conversion and path resolver come from shipped source');

function harness() {
  let next = 0;
  class FixtureURL extends URL {}
  FixtureURL.createObjectURL = () => 'blob:fixture-' + (++next);
  const urls = [];
  const context = vm.createContext({
    URL: FixtureURL, Blob, urls, base: '',
    index: {entries: new Map(['icons.svg', 'filters.svg', 'my#icon.svg'].map(name => [name, {name}]))},
    byName: new Map(),
    zipRead: async () => new Blob(['<svg/>'], {type: 'image/svg+xml'}),
    ext: name => (name.match(/\.([^.]+)$/) || [,''])[1].toLowerCase()
  });
  vm.runInContext(safe + '\n' + local + '\n' + script.slice(start, end), context);
  return {convert: context.convert, rewriteCSS: context.rewriteCSS, urls};
}

test('SVG symbol fragment survives ZIP asset rewriting', async () => {
  const h = harness();
  const url = await h.convert('icons.svg#check');
  assert.equal(url, 'blob:fixture-1#check');
  assert.deepEqual(h.urls, ['blob:fixture-1'], 'Revoke base Blob URL, not fragment URL');
});

test('CSS url() filter fragment survives rewriting', async () => {
  const h = harness();
  const css = await h.rewriteCSS('div{filter:url(filters.svg#blur)}', '');
  assert.equal(css, 'div{filter:url("blob:fixture-1#blur")}');
});

test('query is not confused with fragment, and encoded hash is a filename', async () => {
  const h = harness();
  assert.equal(await h.convert('icons.svg?version=2#check'), 'blob:fixture-1#check');
  assert.equal(await h.convert('my%23icon.svg'), 'blob:fixture-2');
  assert.equal(await h.convert('#local'), '#local');
  assert.equal(await h.convert('missing.svg#check'), 'missing.svg#check');
});

// Source-extracted regression: relative resource URLs must match imported file and ZIP names.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../web2app/index.html'), 'utf8');
const script = html.match(/<script>([\\s\\S]*?)<\\/script>/)?.[1];
assert.ok(script, 'Shipped launcher script exists');
const safePath = script.match(/function safeZipPath\\(path\\)\\{[^\\n]+\\}/)?.[0];
const start = script.indexOf('function localResourcePath(');
const end = script.indexOf('async function makeHTML(');
assert.ok(safePath && start >= 0 && end > start, 'Source path resolver exists');
const context = vm.createContext({ URL });
vm.runInContext(safePath + '\\n' + script.slice(start, end), context);
const resolve = (url, dir = '') => vm.runInContext(
  'localResourcePath(' + JSON.stringify(url) + ',' + JSON.stringify(dir) + ')',
  context
);

test('space and Unicode names resolve to actual imported file keys', () => {
  assert.equal(resolve('my image.svg'), 'my image.svg');
  assert.equal(resolve('café.png'), 'café.png');
  assert.equal(resolve('my%20image.svg'), 'my image.svg');
  assert.equal(resolve('my%23icon.svg'), 'my#icon.svg');
});
test('nested ZIP and CSS resources preserve relative directories', () => {
  assert.equal(resolve('images/brand%20icon.svg', 'site/'), 'site/images/brand icon.svg');
  assert.equal(resolve('cover.png', 'assets/'), 'assets/cover.png');
  assert.equal(resolve('x%2520y.png'), 'x%20y.png');
});
test('malformed and unsafe encoded paths are not rewritten', () => {
  assert.equal(resolve('bad%ZZ.svg'), null);
  assert.equal(resolve('bad%5Cname.svg'), null);
});

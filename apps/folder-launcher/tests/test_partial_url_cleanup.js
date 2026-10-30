// Source-extracted regression: partial HTML preparation must not leak Blob URLs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../web2app/index.html'), 'utf8');
const script = html.match(/<script>([\\s\\S]*?)<\\/script>/)?.[1];
assert.ok(script, 'Shipped launcher script exists');
const begin = script.indexOf('async function makeHTML(app){');
const end = script.indexOf('function releaseActiveUrls(', begin);
assert.ok(begin >= 0 && end > begin, 'Extract shipped makeHTML implementation');
const source = script.slice(begin, end);

function harness(failOn) {
  const created = [], revoked = [], reads = [];
  class FakeBlob {
    constructor(parts) { this.data = parts.join(''); }
    async text() { return this.data; }
  }
  class FakeURL {
    static createObjectURL() {
      const url = 'blob:fixture-' + (created.length + 1);
      created.push(url);
      return url;
    }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  class FakeDOMParser {
    parseFromString() {
      const elements = ['one.png', 'two.png'].map(src => ({
        attributes: {src},
        hasAttribute(key) { return key in this.attributes; },
        getAttribute(key) { return this.attributes[key]; },
        setAttribute(key, value) { this.attributes[key] = value; }
      }));
      return {
        documentElement: {outerHTML: '<html></html>'},
        querySelectorAll(selector) {
          return selector === '[src],[href],[poster]' ? elements : [];
        }
      };
    }
  }
  const makeHTML = new Function(
    'Blob', 'URL', 'DOMParser', 'localResourcePath', 'ext', 'zipRead', 'fileList',
    source + '; return makeHTML;'
  )(FakeBlob, FakeURL, FakeDOMParser, url => url, name => name.split('.').pop(),
    async (_index, filename) => {
      reads.push(filename);
      if (filename === failOn) throw Error('corrupt ZIP member');
      return new FakeBlob([filename]);
    },
    async () => []
  );
  return {
    created, revoked, reads,
    run: () => makeHTML({
      zip: true, entry: 'index.html',
      index: {entries: new Map([['one.png', {}], ['two.png', {}]])}
    })
  };
}

test('failed preparation revokes every previously created resource URL', async () => {
  const h = harness('two.png');
  await assert.rejects(h.run(), /corrupt ZIP member/);
  assert.deepEqual(h.reads, ['one.png', 'two.png']);
  assert.deepEqual(h.created, ['blob:fixture-1']);
  assert.deepEqual(h.revoked, h.created);
});

test('successful preparation retains URLs for the caller to release', async () => {
  const h = harness(null);
  const result = await h.run();
  assert.deepEqual(h.created, ['blob:fixture-1', 'blob:fixture-2']);
  assert.deepEqual(result.urls, h.created);
  assert.deepEqual(h.revoked, []);
});

test('failure before creating any resource does not revoke unrelated URLs', async () => {
  const h = harness('one.png');
  await assert.rejects(h.run(), /corrupt ZIP member/);
  assert.deepEqual(h.created, []);
  assert.deepEqual(h.revoked, []);
});

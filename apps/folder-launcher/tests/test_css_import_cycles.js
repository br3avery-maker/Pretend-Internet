// Source-extracted regression: cyclic CSS imports must not hang HTML/ZIP app opening.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../web2app/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'Shipped launcher script exists');
const start = script.indexOf('function localResourcePath(');
const end = script.indexOf('function releaseActiveUrls(', start);
assert.ok(start >= 0 && end > start, 'Extract the real HTML resource conversion functions');
const source = script.slice(start, end);

function harness(styles) {
  const reads = [], emitted = [];
  class FakeBlob {
    constructor(parts) {
      this.data = parts.map(p => typeof p === 'string' ? p : p.data).join('');
    }
    async text() { return this.data; }
  }
  class FakeURL {
    constructor(relative) { this.pathname = '/' + relative.replace(/^\.\//, ''); }
    static createObjectURL(blob) {
      emitted.push(blob.data);
      return 'blob:fixture-' + emitted.length;
    }
  }
  const link = {
    tagName: 'LINK',
    attributes: { href: 'a.css' },
    hasAttribute(key) { return key in this.attributes; },
    getAttribute(key) { return this.attributes[key]; },
    setAttribute(key, value) { this.attributes[key] = value; }
  };
  class FakeDOMParser {
    parseFromString() {
      return {
        documentElement: { outerHTML: '<html></html>' },
        querySelectorAll(selector) {
          return selector === '[src],[href],[poster]' ? [link] : [];
        }
      };
    }
  }
  const context = vm.createContext({
    Blob: FakeBlob, URL: FakeURL, DOMParser: FakeDOMParser,
    safeZipPath: () => true,
    ext: name => name.split('.').pop(),
    async zipRead(_index, filename) {
      reads.push(filename);
      if (reads.length > 10) throw new Error('Unbounded recursive CSS import');
      return new FakeBlob([styles[filename] || '']);
    }
  });
  vm.runInContext(source, context);
  return {
    reads, emitted,
    run: () => context.makeHTML({
      zip: true, entry: 'index.html',
      index: { entries: new Map(Object.keys(styles).map(name => [name, {}])) }
    })
  };
}

test('self-importing stylesheet terminates without repeatedly inflating ZIP members', async () => {
  const h = harness({ 'index.html': '<html/>', 'a.css': '@import url("a.css");' });
  await h.run();
  assert.deepEqual(h.reads, ['index.html', 'a.css']);
  assert.equal(h.emitted.length, 1);
  assert.match(h.emitted[0], /data:text\/css,/);
});

test('two-stylesheet import cycle terminates and preserves noncyclic CSS', async () => {
  const h = harness({
    'index.html': '<html/>',
    'a.css': '@import url("b.css");',
    'b.css': '@import url("a.css");'
  });
  await h.run();
  assert.deepEqual(h.reads, ['index.html', 'a.css', 'b.css']);
  assert.equal(h.emitted.length, 2);
  assert.match(h.emitted[0], /data:text\/css,/);
  assert.match(h.emitted[1], /blob:fixture-1/);
});

test('ordinary stylesheet imports still resolve into Blob URLs', async () => {
  const h = harness({
    'index.html': '<html/>',
    'a.css': '@import url("b.css");',
    'b.css': 'body { color: red; }'
  });
  await h.run();
  assert.deepEqual(h.reads, ['index.html', 'a.css', 'b.css']);
  assert.equal(h.emitted.length, 2);
  assert.match(h.emitted[0], /color: red/);
  assert.match(h.emitted[1], /blob:fixture-1/);
  assert.doesNotMatch(h.emitted[1], /data:text\/css,/);
});

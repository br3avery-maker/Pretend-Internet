import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Archive } from '../archive.mjs';
import { Collector } from '../collect.mjs';
import { Network } from '../network.mjs';
import { screenshot } from '../preview.mjs';
import { extractHTML, visualHTML } from '../extract.mjs';
import { sha } from '../manifest.mjs';
import { event, signed, temp, author } from './fixtures.mjs';
import { serve } from '../../relay-router/test/relay-server.mjs';
function archive(t) {
  const home = temp(),
    a = new Archive(home);
  t.after(() => {
    a.close();
    fs.rmSync(home, { recursive: true, force: true });
  });
  return a;
}
test('review: same-second legacy publications expose the final reconstructed tree', (t) => {
  const a = archive(t);
  for (let i = 0; i < 8; i++)
    a.ingest(
      signed({
        kind: 34128,
        tags: [
          ['d', `/page-${i}.html`],
          ['x', sha('page ' + i)],
        ],
      }),
    );
  const latest = a.export().sites[0].versions[0];
  assert.equal(latest.files.length, 8);
  // Lower signed event ID wins a same-path NIP-01 tie, independently of the
  // synthetic ID used to identify a reconstruction.
  const x = signed({
    kind: 34128,
    tags: [
      ['d', '/page-0.html'],
      ['x', sha('replacement')],
    ],
  });
  a.ingest(x);
  const expected = a
    .all('SELECT id,manifest FROM events WHERE kind=34128 ORDER BY id ASC')
    .map((r) => ({ id: r.id, m: JSON.parse(r.manifest) }))
    .find((r) => r.m.files[0].path === '/page-0.html');
  assert.equal(
    a.export().sites[0].versions[0].files.find((f) => f.path === '/page-0.html').hash,
    expected.m.files[0].hash,
  );
});
test('review: extracted pages pause at the disk budget and resume without omissions', (t) => {
  const a = archive(t),
    bytes = Buffer.from('observatory moonlight '.repeat(400));
  a.ingest(
    event({
      files: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`/page-${i}.txt`, bytes])),
    }),
  );
  a.store(bytes, sha(bytes));
  a.maxStorageBytes = 600 * 1024;
  assert.ok(a.diskBytes() < a.maxStorageBytes);
  const first = a.index();
  assert.equal(first.paused, true);
  assert.equal(first.reason, 'storage-budget');
  assert.ok(a.all('SELECT * FROM pages').length < 200);
  assert.ok(a.diskBytes() <= a.maxStorageBytes + 64 * 1024);
  a.maxStorageBytes = 32 * 1024 ** 2;
  const next = a.index();
  assert.equal(next.paused, false);
  assert.equal(a.all('SELECT * FROM pages').length, 200);
});
test('review: remaining Blossom metadata is scheduled after manifest scans complete', async (t) => {
  const manifest = event(),
    list = signed({ kind: 10063, tags: [['server', 'https://blossom.example']] });
  const one = await serve({ metadata: [manifest] }),
    two = await serve({ metadata: [manifest, list] });
  t.after(one.close);
  t.after(two.close);
  const a = archive(t),
    c = new Collector(a, new Network({ allowLocal: true }), { maxRelays: 1, maxQueries: 5 });
  for (let i = 0; i < 8; i++) await c.discover({ relays: [one.url, two.url] });
  const query = JSON.stringify({ kinds: [10063], authors: [author] });
  assert.equal(
    a.one('SELECT status FROM scans WHERE relay=? AND filter=?', two.url, query)?.status,
    'complete',
  );
  assert.ok(a.all('SELECT * FROM origins').some((o) => o.url === 'https://blossom.example'));
});
function mockBrowser(requests, fulfilled) {
  let routeHandler;
  return {
    launch: async () => ({
      close: async () => {},
      newContext: async () => ({
        route: async (_, handler) => {
          routeHandler = handler;
        },
        newPage: async () => ({
          setDefaultTimeout() {},
          goto: async (url) => {
            for (const requested of [url, ...requests])
              await routeHandler({
                request: () => ({ url: () => new URL(requested).href, method: () => 'GET' }),
                abort: () => {},
                fulfill: (reply) => {
                  fulfilled.push(new URL(requested).pathname);
                },
              });
          },
          screenshot: async () => Buffer.from('fixture-preview'),
        }),
      }),
    }),
  };
}
test('review: archived preview paths match browser encoding for spaces, Unicode and percent literals', async (t) => {
  const a = archive(t),
    files = {
      '/café page.html': '<h1>Unicode entry</h1>',
      '/my image.png': 'image',
      '/café.png': 'image',
      '/100%25.png': 'percent',
    };
  a.ingest(event({ files }));
  for (const text of Object.values(files)) a.store(Buffer.from(text), sha(text));
  const fulfilled = [],
    chromium = mockBrowser(
      [
        'https://archive.invalid/my%20image.png',
        'https://archive.invalid/caf%C3%A9.png',
        'https://archive.invalid/100%25.png',
      ],
      fulfilled,
    );
  assert.equal((await screenshot(a, a.snapshots()[0], { chromium })).status, 'complete');
  assert.equal(fulfilled.length, 4);
});
test('review: deeply nested HTML is indexed and sanitized without stack overflow', (t) => {
  const a = archive(t),
    deep = '<div>'.repeat(12000) + 'Deep observatory text' + '</div>'.repeat(12000);
  assert.ok(extractHTML(Buffer.from(deep), '/deep.html').text.includes('Deep observatory'));
  assert.ok(visualHTML(Buffer.from(deep)).includes('Deep observatory'));
  a.ingest(event({ files: { '/deep.html': deep, '/later.html': '<h1>Later page survives</h1>' } }));
  for (const bytes of [deep, '<h1>Later page survives</h1>'])
    a.store(Buffer.from(bytes), sha(bytes));
  assert.doesNotThrow(() => a.index());
  assert.equal(a.all('SELECT * FROM pages').length, 2);
});
test('review: an extraction failure is durable and cannot block later archived pages', (t) => {
  const a = archive(t);
  a.ingest(event({ files: { '/bad.html': 'bad', '/later.html': '<h1>Later page</h1>' } }));
  for (const text of ['bad', '<h1>Later page</h1>']) a.store(Buffer.from(text), sha(text));
  const read = a.read.bind(a);
  a.read = (hash) => {
    if (hash === sha('bad')) throw Error('corrupt-chunk');
    return read(hash);
  };
  let result;
  assert.doesNotThrow(() => {
    result = a.index();
  });
  assert.equal(result.failed, 1);
  assert.equal(a.all('SELECT * FROM pages').length, 1);
  assert.equal(a.all('SELECT * FROM index_failures').length, 1);
  a.read = read;
  assert.equal(a.index({ retry: true }).extracted, 1);
  assert.equal(a.all('SELECT * FROM index_failures').length, 0);
});

test('review: oversized DOM failures remain isolated, visible and skipped until retry', (t) => {
  const a = archive(t),
    wide = '<span>x</span>'.repeat(50001),
    later = '<h1>Unaffected document</h1>';
  a.ingest(event({ files: { '/wide.html': wide, '/later.html': later } }));
  for (const value of [wide, later]) a.store(Buffer.from(value), sha(value));
  const first = a.index();
  assert.equal(first.failed, 1);
  assert.equal(first.extracted, 1);
  assert.equal(a.export().indexing.failures[0].error, 'html-node-limit');
  assert.equal(a.index().skipped, 1);
  assert.equal(a.all('SELECT * FROM pages').length, 1);
});

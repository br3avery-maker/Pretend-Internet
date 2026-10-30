import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { Archive } from '../archive.mjs';
import { Collector } from '../collect.mjs';
import { Network, publicIP } from '../network.mjs';
import { serve } from '../../relay-router/test/relay-server.mjs';
import { event, signed, author, temp } from './fixtures.mjs';
import { sha } from '../manifest.mjs';
async function blobServer(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(
    () =>
      new Promise((r) => {
        server.closeAllConnections();
        server.close(r);
      }),
  );
  return 'http://127.0.0.1:' + server.address().port;
}
function archive(t) {
  const home = temp(),
    a = new Archive(home);
  t.after(() => {
    a.close();
    fs.rmSync(home, { recursive: true, force: true });
  });
  return a;
}
test('public network refuses private, CGNAT, mapped IPv6, and rebinding destinations', async () => {
  for (const ip of [
    '127.0.0.1',
    '10.0.0.2',
    '100.100.100.100',
    '169.254.169.254',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
  ])
    assert.equal(publicIP(ip), false);
  assert.equal(publicIP('8.8.8.8'), true);
  const net = new Network({ resolve: async () => [{ address: '127.0.0.1', family: 4 }] });
  await assert.rejects(() => net.destination('https://public.example'), /unsafe-dns/);
  let calls = 0;
  const good = new Network({
      resolve: async () => {
        calls++;
        return [{ address: '8.8.8.8', family: 4 }];
      },
    }),
    dest = await good.destination('https://public.example');
  dest.lookup('public.example', {}, (err, address) => assert.equal(address, '8.8.8.8'));
  assert.equal(calls, 1);
});
test('real loopback relay → BUD-03 discovery → verified download → text index', async (t) => {
  const bytes = Buffer.from(
      '<title>Hidden astronomy</title><h1>Untitled discovery</h1><p>Venus transits the sun.</p>',
    ),
    requests = [];
  const base = await blobServer(t, (req, res) => {
    requests.push(req.url);
    if (req.url !== '/' + sha(bytes)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.end(bytes);
  });
  const e = event({ files: { '/index.html': bytes } }),
    list = signed({ kind: 10063, tags: [['server', base]] });
  const relay = await serve({ metadata: [e, list] });
  t.after(relay.close);
  const a = archive(t),
    c = new Collector(a, new Network({ allowLocal: true }));
  const discovery = await c.discover({ relays: [relay.url] });
  assert.equal(discovery.errors.length, 0);
  const d = await c.download();
  assert.equal(d.downloaded, 1);
  a.index();
  assert.ok(a.export().sites[0].pages[0].text.includes('Venus'));
  a.ingest(event({ identifier: 'mirror', files: { '/index.html': bytes } }));
  assert.equal((await c.download()).downloaded, 0);
  assert.equal(requests.length, 1);
  assert.equal(a.export().stats.sites, 2);
  assert.equal(relay.published.length, 0);
  assert.equal(relay.authEvents.length, 0);
});
test('hash-mismatched server falls back without accepting corrupt bytes', async (t) => {
  const bytes = Buffer.from('verified bytes'),
    bad = await blobServer(t, (req, res) => res.end('corrupt')),
    good = await blobServer(t, (req, res) => res.end(bytes));
  const a = archive(t),
    e = event({
      files: { '/index.html': bytes },
      extra: [
        ['server', bad],
        ['server', good],
      ],
    });
  a.ingest(e);
  const d = await new Collector(a, new Network({ allowLocal: true })).download();
  assert.equal(d.downloaded, 1);
  assert.deepEqual(a.read(sha(bytes)), bytes);
});
test('byte-budget pause resumes using HTTP Range and survives a process boundary', async (t) => {
  const bytes = Buffer.alloc(10000, 0x61),
    ranges = [];
  const base = await blobServer(t, (req, res) => {
    const start = Number((req.headers.range ?? '').match(/bytes=(\d+)-/)?.[1] ?? 0);
    ranges.push(start);
    res.writeHead(start ? 206 : 200, {
      'Content-Length': bytes.length - start,
      ...(start ? { 'Content-Range': `bytes ${start}-${bytes.length - 1}/${bytes.length}` } : {}),
    });
    res.end(bytes.subarray(start));
  });
  const home = temp();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  let a = new Archive(home);
  a.ingest(event({ files: { '/index.html': bytes }, extra: [['server', base]] }));
  let c = new Collector(a, new Network({ allowLocal: true }), { maxBytes: 2000 });
  const first = await c.download();
  assert.equal(first.paused, true);
  assert.equal(first.bytes, 2000);
  assert.equal(a.one('SELECT state FROM jobs').state, 'paused');
  a.close();
  a = new Archive(home);
  try {
    c = new Collector(a, new Network({ allowLocal: true }));
    const done = await c.download();
    assert.equal(done.downloaded, 1);
    assert.deepEqual(ranges, [0, 2000]);
    assert.equal(sha(a.read(sha(bytes))), sha(bytes));
  } finally {
    a.close();
  }
});
test('HTTP failures remain retryable without losing manifests', async (t) => {
  const base = await blobServer(t, (req, res) => {
      res.writeHead(404);
      res.end();
    }),
    a = archive(t);
  a.ingest(event({ extra: [['server', base]] }));
  const c = new Collector(a, new Network({ allowLocal: true }));
  assert.equal((await c.download()).failures[0].code, 'http-404');
  assert.equal(a.one('SELECT count(*) n FROM events').n, 1);
  assert.equal((await c.download()).failures.length, 0);
  assert.equal((await c.download({ retry: true })).failures.length, 1);
  assert.equal(a.export().sites[0].versions[0].status, 'partial');
});
test('per-file limit retains a deferred job rather than omitting its site', async (t) => {
  const base = await blobServer(t, (req, res) => {
      res.writeHead(200, { 'Content-Length': 1000 });
      res.end(Buffer.alloc(1000));
    }),
    a = archive(t);
  a.ingest(event({ extra: [['server', base]] }));
  const r = await new Collector(a, new Network({ allowLocal: true }), {
    maxBlobBytes: 100,
  }).download();
  assert.equal(r.remaining, 1);
  assert.equal(r.failures[0].code, 'blob-budget');
  assert.equal(a.export().sites.length, 1);
});
test('timestamp saturation records coverage gap and continues older history', async (t) => {
  const a = archive(t),
    events = [
      event({ identifier: 'one', created: 100 }),
      event({ identifier: 'two', created: 100 }),
      event({ identifier: 'three', created: 100 }),
      event({ identifier: 'older', created: 99 }),
    ];
  const relay = await serve({ metadata: events });
  t.after(relay.close);
  const c = new Collector(a, new Network({ allowLocal: true }), { pageSize: 2, maxQueries: 20 });
  await c.discover({ relays: [relay.url] });
  const scan = a.all('SELECT * FROM scans').find((s) => JSON.parse(s.filter).kinds[0] === 35128);
  assert.deepEqual(JSON.parse(scan.gaps), [100]);
  assert.equal(scan.status, 'incomplete-gaps');
  assert.ok(a.export().sites.some((s) => s.identifier === 'older'));
});
test('query cap persists cursor and a subsequent pass completes', async (t) => {
  const a = archive(t),
    events = Array.from({ length: 5 }, (_, i) =>
      event({ identifier: 'site-' + i, created: 100 - i }),
    );
  const relay = await serve({ metadata: events });
  t.after(relay.close);
  const c = new Collector(a, new Network({ allowLocal: true }), { pageSize: 2, maxQueries: 3 });
  assert.equal((await c.discover({ relays: [relay.url] })).paused, true);
  const next = new Collector(a, new Network({ allowLocal: true }), { pageSize: 2, maxQueries: 50 });
  await next.discover({ relays: [relay.url] });
  assert.equal(a.export().stats.sites, 5);
});
test('server redirects retain the requested hash and revalidate each destination', async (t) => {
  const bytes = Buffer.from('redirected'),
    target = await blobServer(t, (req, res) => res.end(bytes)),
    good = await blobServer(t, (req, res) => {
      res.writeHead(307, { Location: target + '/' + sha(bytes) });
      res.end();
    });
  const net = new Network({ allowLocal: true });
  const res = await net.get(good + '/' + sha(bytes));
  const parts = [];
  for await (const b of res) parts.push(b);
  assert.deepEqual(Buffer.concat(parts), bytes);
  const bad = await blobServer(t, (req, res) => {
    res.writeHead(307, { Location: target + '/no-hash' });
    res.end();
  });
  await assert.rejects(() => net.get(bad + '/' + sha(bytes)), /unsafe-redirect/);
});

test('metadata discovery resumes across authors rather than repeating the first budgetful', async (t) => {
  const a = archive(t),
    events = Array.from({ length: 5 }, (_, i) =>
      event({ secret: Uint8Array.from({ length: 32 }, (_, j) => (j === 31 ? i + 10 : 0)) }),
    );
  const relay = await serve({ metadata: events });
  t.after(relay.close);
  const c = new Collector(a, new Network({ allowLocal: true }), { maxQueries: 6 });
  for (let i = 0; i < 4; i++) await c.discover({ relays: [relay.url] });
  const metadata = a.all('SELECT * FROM scans').filter((s) => JSON.parse(s.filter).authors);
  assert.equal(metadata.length, 10);
  assert.ok(metadata.every((s) => s.status === 'complete'));
});

test('relay limits defer discovered sources and later runs visit the remaining relays', async (t) => {
  const third = await serve({ metadata: [event({ identifier: 'third' })] });
  t.after(third.close);
  const second = await serve({ metadata: [event({ identifier: 'second' })] });
  t.after(second.close);
  const list = signed({
    kind: 10002,
    tags: [
      ['r', second.url, 'write'],
      ['r', third.url, 'write'],
    ],
  });
  const first = await serve({ metadata: [event({ identifier: 'first' }), list] });
  t.after(first.close);
  const a = archive(t),
    c = new Collector(a, new Network({ allowLocal: true }), { maxRelays: 1 });
  for (let i = 0; i < 3; i++) await c.discover({ relays: [first.url] });
  assert.equal(a.export().stats.sites, 3);
});

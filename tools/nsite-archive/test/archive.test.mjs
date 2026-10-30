import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { decodeTreeNode, LinkType } from '@hashtree/core';
import { Archive } from '../archive.mjs';
import { parseManifest, aggregate, sha, resolveURL, gatewayURL } from '../manifest.mjs';
import { extractHTML, visualHTML } from '../extract.mjs';
import { chunks } from '../chunks.mjs';
import { event, signed, key2, author, temp } from './fixtures.mjs';
function archive(t, options) {
  const home = temp(),
    a = new Archive(home, options);
  t.after(() => {
    a.close();
    fs.rmSync(home, { recursive: true, force: true });
  });
  return a;
}
test('native aggregate is independent of tag order and metadata', () => {
  const a = event({ files: { '/b.txt': 'B', '/a.txt': 'A' } }),
    b = event({ files: { '/a.txt': 'A', '/b.txt': 'B' }, extra: [['title', 'Different']] });
  assert.equal(parseManifest(a).nativeHash, parseManifest(b).nativeHash);
});
test('signatures, aggregate mismatches and unsafe paths are refused', () => {
  assert.throws(() => parseManifest({ ...event(), content: 'tampered' }), /signature/);
  assert.throws(
    () =>
      parseManifest(
        signed({
          kind: 15128,
          tags: [
            ['path', '/index.html', 'f'.repeat(64)],
            ['x', '0'.repeat(64), 'aggregate'],
          ],
        }),
      ),
    /aggregate/,
  );
  for (const p of ['/../x.html', '/%2e%2e/x.html', '/x\\y.html', '/x\ny.html'])
    assert.throws(() => parseManifest(event({ files: { [p]: 'bad' } })), /path/);
});
test('root, named and snapshot URLs round-trip to protocol filters', () => {
  for (const e of [
    event({ kind: 15128 }),
    event({ identifier: 'hello' }),
    event({ kind: 5128, extra: [['a', `35128:${author}:hello`]] }),
  ]) {
    const m = parseManifest(e),
      f = resolveURL(gatewayURL(m.site, e));
    if (e.kind === 5128) assert.equal(f.ids[0], e.id);
    else assert.equal(f.authors[0], e.pubkey);
  }
  assert.throws(() => parseManifest(event({ identifier: 'longer-than-thirteen' })), /address/);
  assert.throws(
    () =>
      parseManifest(event({ kind: 5128, extra: [['a', `35128:${author}:hello`]], secret: key2 })),
    /author/,
  );
});
test('signed malformed manifests are quarantined with original bytes and source', (t) => {
  const a = archive(t),
    e = event({ files: { '/../bad.html': 'bad' } }),
    r = a.ingest(e, 'wss://source.example', 'relay');
  assert.equal(r.status, 'preserved-unindexed');
  assert.equal(JSON.parse(a.one('SELECT raw FROM events').raw).sig, e.sig);
  assert.equal(a.export().unindexed.length, 1);
});
test('pre-dedup preserves separate authors, events, sources and namespaces', (t) => {
  const a = archive(t),
    e = event(),
    other = event({ secret: key2 });
  a.ingest(e, 'wss://one.example');
  a.ingest(e, 'wss://two.example');
  a.ingest(other);
  const bytes = Buffer.from(
    '<title>Quiet stars</title><h1>Astronomy without a name</h1><p>The observatory tracks Jupiter and moonlight.</p>',
  );
  a.store(bytes, sha(bytes));
  assert.equal(a.store(bytes, sha(bytes)).reused, true);
  a.index();
  const d = a.export();
  assert.equal(d.stats.sites, 2);
  assert.equal(d.stats.blobs, 1);
  assert.equal(d.groups[0].type, 'identical-content');
  assert.equal(d.groups[0].lineageVerified, false);
  assert.equal(d.sites.find((s) => s.publisher === e.pubkey).sources.length, 2);
});
test('content indexing finds an untitled page, ignores scripts and extracts evidence', (t) => {
  const a = archive(t),
    html =
      '<html lang="en"><head><title>Jupiter observatory</title><meta name="description" content="A night sky journal"></head><body><h1>Moonlight</h1><p>Telescopes document stars.</p><script>password secret not text</script><a href="/about.html">About</a><a href="https://example.org">Outside</a></body></html>';
  a.ingest(event({ files: { '/index.html': html } }));
  a.store(Buffer.from(html), sha(html));
  assert.equal(a.index().extracted, 1);
  assert.equal(a.index().reused, 1);
  const s = a.export().sites[0];
  assert.equal(s.published.title, '');
  assert.equal(s.derived.title, 'Jupiter observatory');
  assert.ok(s.pages[0].text.includes('Telescopes'));
  assert.ok(!s.pages[0].text.includes('password'));
  assert.equal(s.pages[0].links[0].outbound, false);
  assert.equal(s.pages[0].language.inferred, false);
  assert.equal(s.pages[0].evidence.fileHash, sha(html));
});
test('CDC reuses content after insertion and produces readable Hashtree nodes', (t) => {
  const a = archive(t),
    original = randomBytes(2 * 1024 ** 2),
    updated = Buffer.concat([Buffer.from('inserted preface'), original]);
  const x = a.store(original, sha(original)),
    y = a.store(updated, sha(updated));
  assert.notEqual(x.root, y.root);
  const b = a.one('SELECT * FROM blobs WHERE hash=?', sha(original)),
    c = a.one('SELECT * FROM blobs WHERE hash=?', sha(updated));
  const old = new Set(JSON.parse(b.parts).map((p) => p.hash)),
    reuse = JSON.parse(c.parts)
      .filter((p) => old.has(p.hash))
      .reduce((s, p) => s + p.size, 0);
  assert.ok(reuse > original.length * 0.8);
  assert.deepEqual(a.read(sha(updated)), updated);
  const node = decodeTreeNode(fs.readFileSync(a.objectPath(y.root)));
  assert.equal(node.type, LinkType.File);
});
test('diff reports add/remove/change and restoration reproduces exact native hashes', (t) => {
  const a = archive(t),
    old = event({ files: { '/index.html': 'old', '/removed.txt': 'gone' } }),
    next = event({ created: 1700000001, files: { '/index.html': 'new', '/added.txt': 'hi' } });
  for (const e of [old, next]) a.ingest(e);
  for (const value of ['old', 'gone', 'new', 'hi']) a.store(Buffer.from(value), sha(value));
  const diff = a.diff(old.id, next.id);
  assert.deepEqual(
    diff.changes.map((x) => x.type),
    ['added', 'changed', 'removed'],
  );
  const dest = path.join(a.home, 'restore');
  a.restore(next.id, dest);
  assert.equal(sha(fs.readFileSync(path.join(dest, 'index.html'))), sha('new'));
  assert.throws(() => a.restore(next.id, dest), /exists/);
  assert.equal(a.verify().status, 'verified');
});
test('partial histories survive close/reopen and never become complete snapshots', (t) => {
  const home = temp();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  let a = new Archive(home);
  a.ingest(event());
  a.close();
  a = new Archive(home);
  assert.equal(a.export().sites[0].versions[0].status, 'partial');
  assert.equal(a.all('SELECT * FROM jobs').length, 1);
  a.close();
});
test('legacy file events create explicitly reconstructed version trees', (t) => {
  const a = archive(t);
  a.ingest(
    signed({
      kind: 34128,
      tags: [
        ['d', '/index.html'],
        ['x', sha('one')],
      ],
    }),
  );
  a.ingest(
    signed({
      kind: 34128,
      created_at: 1700000001,
      tags: [
        ['d', '/style.css'],
        ['x', sha('css')],
      ],
    }),
  );
  const d = a.export();
  assert.equal(d.sites.length, 1);
  assert.equal(d.sites[0].versions.length, 2);
  assert.equal(d.sites[0].versions[0].files.length, 2);
  assert.equal(d.sites[0].versions[0].legacyReconstruction, true);
});
test('same timestamp follows the NIP-01 lower-ID tie break', (t) => {
  const a = archive(t),
    x = event({ files: { '/index.html': 'a' } }),
    y = event({ files: { '/index.html': 'b' } });
  a.ingest(x);
  a.ingest(y);
  assert.equal(a.export().sites[0].head, [x.id, y.id].sort()[0]);
});
test('snapshots are historical and cannot override an observed current manifest', (t) => {
  const a = archive(t),
    e = event(),
    snap = event({ kind: 5128, created: 1700000100, extra: [['a', `35128:${author}:test`]] });
  a.ingest(e);
  a.ingest(snap);
  assert.equal(a.export().sites[0].head, e.id);
});
test('explicit campaign filter is reversible and leaves ordinary prolific authors visible', (t) => {
  const a = archive(t);
  for (let i = 0; i < 20; i++)
    a.ingest(
      event({
        identifier: 'series-' + i,
        extra: [['description', 'Numbered creative series ' + i]],
      }),
    );
  const desc = 'Visit the new promotional campaign and claim a gambling bonus today';
  a.ingest(event({ identifier: 'campaign', extra: [['description', desc]] }));
  a.ingest(
    event({
      identifier: 'ambiguous',
      extra: [['description', 'Visit the new promotional campaign is a critical essay']],
    }),
  );
  a.setRule({
    id: 'campaign',
    type: 'description-template',
    prefix: 'Visit the new promotional campaign',
    requiredTerms: ['gambling', 'bonus'],
    reason: 'Promotional template and two promotional markers',
  });
  let d = a.export();
  assert.equal(d.stats.hidden, 1);
  assert.equal(d.stats.sites, 22);
  assert.equal(d.publishers[0].siteCount, 22);
  a.setRule({ ...d.rules[0], enabled: false });
  assert.equal(a.export().stats.hidden, 0);
  assert.throws(
    () => a.setRule({ id: 'weak', type: 'description-template', prefix: 'Buy', requiredTerms: [] }),
    /weak/,
  );
});
test('declared fork references remain claims and similarity is not lineage', (t) => {
  const a = archive(t),
    parent = event(),
    ref = `35128:${parent.pubkey}:test`;
  a.ingest(parent);
  a.ingest(
    event({
      secret: key2,
      identifier: 'copy',
      extra: [
        ['a', ref],
        ['A', ref],
      ],
    }),
  );
  const s = a.export().sites.find((s) => s.publisher !== parent.pubkey);
  assert.equal(s.relations[0].verified, false);
  assert.ok(a.export().groups.some((g) => g.type === 'declared-family'));
});
test('corrupt objects and native bytes are detected before restoration', (t) => {
  const a = archive(t),
    e = event({ files: { '/index.html': 'original' } });
  a.ingest(e);
  a.store(Buffer.from('original'), sha('original'));
  const part = JSON.parse(a.one('SELECT parts FROM blobs').parts)[0];
  fs.writeFileSync(a.objectPath(part.hash), 'tampered');
  assert.equal(a.verify().status, 'failed');
  assert.throws(() => a.restore(e.id, path.join(a.home, 'no-output')), /corrupt/);
  assert.ok(!fs.existsSync(path.join(a.home, 'no-output')));
});
test('single writer lock refuses concurrent mutation', (t) => {
  const a = archive(t);
  assert.throws(() => new Archive(a.home), /locked/);
});
test('static visual sanitizer removes active elements and network references', () => {
  const html = visualHTML(
    Buffer.from(
      '<html><head><base href="https://evil.org"><meta http-equiv="refresh" content="0;url=https://evil.org"></head><body onload="evil()"><script>evil()</script><iframe src="https://evil.org"></iframe><img src="https://evil.org/pixel"><img src="local.png"><p>Visible text</p></body></html>',
    ),
  );
  assert.ok(!html.includes('evil'));
  assert.ok(!html.includes('onload'));
  assert.ok(html.includes('local.png'));
  assert.ok(html.includes('Visible text'));
});

test('integrity audit binds blob descriptors to the canonical Merkle graph', (t) => {
  const a = archive(t),
    bytes = Buffer.from('Merkle descriptor integrity');
  a.store(bytes, sha(bytes));
  a.run('UPDATE blobs SET root=? WHERE hash=?', '0'.repeat(64), sha(bytes));
  const report = a.verify();
  assert.equal(report.status, 'failed');
  assert.ok(report.errors.some((e) => e.error === 'corrupt-merkle-root'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Archive } from '../archive.mjs';
import { exportTo } from '../cli.mjs';
import { sha } from '../manifest.mjs';
import { event, signed, temp } from './fixtures.mjs';
test('CLI independently imports, indexes, searches, exports, verifies and restores', (t) => {
  const root = temp();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'),
    e = event({
      files: { '/index.html': '<h1>Portable observatory</h1><p>Jupiter and Saturn</p>' },
    }),
    input = path.join(root, 'input.ndjson');
  fs.writeFileSync(input, JSON.stringify(e) + '\n');
  const run = (...args) =>
    JSON.parse(
      execFileSync(process.execPath, ['cli.mjs', ...args, '--home', home], {
        cwd: path.resolve(import.meta.dirname, '..'),
        encoding: 'utf8',
      }),
    );
  assert.equal(run('import', input).accepted, 1);
  let a = new Archive(home);
  a.store(
    Buffer.from('<h1>Portable observatory</h1><p>Jupiter and Saturn</p>'),
    sha('<h1>Portable observatory</h1><p>Jupiter and Saturn</p>'),
  );
  a.close();
  assert.equal(run('index').extracted, 1);
  assert.equal(run('search', 'Saturn').length, 1);
  assert.equal(run('verify').status, 'verified');
  const output = path.join(root, 'export');
  run('export', output);
  assert.ok(fs.existsSync(path.join(output, 'app.js')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'events.ndjson'), 'utf8')).sig, e.sig);
  const restored = path.join(root, 'restored');
  run('restore', e.id, restored);
  assert.equal(
    sha(fs.readFileSync(path.join(restored, 'index.html'))),
    sha('<h1>Portable observatory</h1><p>Jupiter and Saturn</p>'),
  );
});
test('disk budget pauses signed-event intake without claiming collection', (t) => {
  const root = temp(),
    a = new Archive(root);
  t.after(() => {
    a.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  a.maxStorageBytes = a.diskBytes();
  assert.throws(() => a.ingest(event()), /storage-budget/);
  assert.equal(a.all('SELECT * FROM events').length, 0);
});
test('server lists imported before manifests supply later download origins', (t) => {
  const root = temp(),
    a = new Archive(root);
  t.after(() => {
    a.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  a.addServerList(
    signed({ kind: 10063, tags: [['server', 'https://blossom.example']] }),
    'wss://source.example',
  );
  a.ingest(event());
  assert.equal(a.all('SELECT * FROM jobs').length, 1);
  assert.equal(a.one('SELECT url FROM origins').url, 'https://blossom.example');
});

// Strict real-browser acceptance. Run as a non-root user on a host supporting
// Chromium's OS sandbox. Failure is a blocker, never silently downgraded.
import fs from 'node:fs';
import http from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { Archive } from '../archive.mjs';
import { screenshot } from '../preview.mjs';
import { event, temp } from './fixtures.mjs';
import { sha } from '../manifest.mjs';
const home = temp(),
  archive = new Archive(home);
let requests = 0;
const canary = http.createServer((req, res) => {
  requests++;
  res.end('unreachable');
});
canary.listen(0, '127.0.0.1');
await once(canary, 'listening');
try {
  const remote = `http://127.0.0.1:${canary.address().port}/canary`,
    html = `<html><head><title>Archive sandbox check</title><style>body{background:#000;color:#ff1493}h1{background-image:url(${remote})}</style></head><body><h1>Archived observatory</h1><p>Static content remains visible.</p><img src="${remote}"><script>fetch('${remote}')</script></body></html>`;
  archive.ingest(event({ files: { '/index.html': html } }));
  archive.store(Buffer.from(html), sha(html));
  const result = await screenshot(archive, archive.snapshots()[0]);
  assert.equal(result.status, 'complete', JSON.stringify(result));
  assert.equal(requests, 0);
  const image = fs.readFileSync(home + '/previews/' + result.hash + '.png');
  assert.equal(image.subarray(1, 4).toString(), 'PNG');
  assert.equal((await screenshot(archive, archive.snapshots()[0])).status, 'cached');
  console.log(
    'PASS: actual OS-sandboxed Chromium PNG, scripts disabled, external network canary untouched, preview cache reused.',
  );
} finally {
  archive.close();
  canary.closeAllConnections();
  await new Promise((r) => canary.close(r));
  fs.rmSync(home, { recursive: true, force: true });
}

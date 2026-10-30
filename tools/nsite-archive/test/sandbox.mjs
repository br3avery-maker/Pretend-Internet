// Strict real-browser acceptance. Run as a non-root user on a host supporting
// Chromium's OS sandbox. Failure is a blocker, never silently downgraded.
import fs from 'node:fs';
import http from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
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
    html = `<html><head><title>Archive sandbox check</title><style>body{background:#000;color:#ff1493}h1{background-image:url(${remote})}</style></head><body><h1>Archived observatory</h1><p>Static content remains visible.</p><img src="${remote}"><img src="my image.png"><img src="café.png"><img src="100%25.png"><script>fetch('${remote}')</script></body></html>`;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOm8AAAAASUVORK5CYII=',
    'base64',
  );
  const files = {
    '/café page.html': html,
    '/my image.png': png,
    '/café.png': png,
    '/100%25.png': png,
  };
  archive.ingest(event({ files }));
  for (const value of Object.values(files))
    archive.store(Buffer.from(value), sha(Buffer.from(value)));
  const fulfilled = [];
  const inspectedChromium = {
    launch: async (options) => {
      const browser = await chromium.launch(options),
        newContext = browser.newContext.bind(browser);
      browser.newContext = async (options) => {
        const context = await newContext(options),
          route = context.route.bind(context);
        context.route = async (pattern, handler) =>
          route(pattern, (real) =>
            handler({
              request: () => real.request(),
              abort: (...args) => real.abort(...args),
              fulfill: (...args) => {
                fulfilled.push(new URL(real.request().url()).pathname);
                return real.fulfill(...args);
              },
            }),
          );
        return context;
      };
      return browser;
    },
  };
  const result = await screenshot(archive, archive.snapshots()[0], { chromium: inspectedChromium });
  assert.equal(result.status, 'complete', JSON.stringify(result));
  for (const pathname of [
    '/caf%C3%A9%20page.html',
    '/my%20image.png',
    '/caf%C3%A9.png',
    '/100%25.png',
  ])
    assert.ok(fulfilled.includes(pathname), `Archived resource not fulfilled: ${pathname}`);
  assert.ok(archive.export().sites[0].versions[0].preview);
  assert.equal(requests, 0);
  const image = fs.readFileSync(home + '/previews/' + result.hash + '.png');
  assert.equal(image.subarray(1, 4).toString(), 'PNG');
  assert.equal((await screenshot(archive, archive.snapshots()[0])).status, 'cached');
  console.log(
    'PASS: actual OS-sandboxed Chromium PNG, Unicode entry and archived image paths fulfilled, scripts disabled, external canary untouched, preview cache reused.',
  );
} finally {
  archive.close();
  canary.closeAllConnections();
  await new Promise((r) => canary.close(r));
  fs.rmSync(home, { recursive: true, force: true });
}

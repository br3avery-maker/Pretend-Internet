import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Archive } from '../archive.mjs';
import { screenshot, PREVIEW_CSP } from '../preview.mjs';
import { event, temp } from './fixtures.mjs';
import { sha } from '../manifest.mjs';
test('preview worker requires OS sandbox, isolated context, script blocking and offline-only routes', async (t) => {
  const home = temp(),
    a = new Archive(home);
  t.after(() => {
    a.close();
    fs.rmSync(home, { recursive: true, force: true });
  });
  const html = '<h1>Visible</h1><script>bad()</script>';
  a.ingest(event({ files: { '/index.html': html } }));
  a.store(Buffer.from(html), sha(html));
  let routeHandler,
    aborted = false,
    fulfilled = false,
    closed = false;
  const chromium = {
    launch: async (options) => {
      assert.equal(options.chromiumSandbox, true);
      assert.ok(!options.args.some((a) => a === '--no-sandbox'));
      assert.equal(options.env.OPENAI_API_KEY, undefined);
      return {
        close: async () => {
          closed = true;
        },
        newContext: async (config) => {
          assert.equal(config.javaScriptEnabled, false);
          assert.equal(config.serviceWorkers, 'block');
          assert.equal(config.acceptDownloads, false);
          assert.deepEqual(config.permissions, []);
          return {
            route: async (pattern, handler) => {
              routeHandler = handler;
            },
            newPage: async () => ({
              setDefaultTimeout() {},
              goto: async () => {
                await routeHandler({
                  request: () => ({ url: () => 'https://evil.example/pixel', method: () => 'GET' }),
                  abort: () => {
                    aborted = true;
                  },
                });
                await routeHandler({
                  request: () => ({
                    url: () => 'https://archive.invalid/index.html',
                    method: () => 'GET',
                  }),
                  abort: () => assert.fail('main aborted'),
                  fulfill: (reply) => {
                    assert.equal(reply.headers['content-type'], 'text/html; charset=utf-8');
                    assert.equal(reply.headers['content-security-policy'], PREVIEW_CSP);
                    assert.ok(!reply.body.toString().includes('bad()'));
                    fulfilled = true;
                  },
                });
              },
              screenshot: async () => Buffer.from('test-image'),
            }),
          };
        },
      };
    },
  };
  const result = await screenshot(a, a.snapshots()[0], { chromium });
  assert.equal(result.status, 'complete');
  assert.ok(aborted && fulfilled && closed);
  assert.equal((await screenshot(a, a.snapshots()[0], { chromium })).status, 'cached');
});
test('sandbox failure is stored honestly and never retried without a sandbox', async (t) => {
  const home = temp(),
    a = new Archive(home);
  t.after(() => {
    a.close();
    fs.rmSync(home, { recursive: true, force: true });
  });
  a.ingest(event({ files: { '/index.html': 'Hello' } }));
  a.store(Buffer.from('Hello'), sha('Hello'));
  let launches = 0;
  const result = await screenshot(a, a.snapshots()[0], {
    chromium: {
      launch: async () => {
        launches++;
        throw Error('sandbox unavailable');
      },
    },
  });
  assert.equal(result.code, 'browser-sandbox-unavailable');
  assert.equal(launches, 1);
  assert.equal(a.export().sites[0].versions[0].preview, null);
});

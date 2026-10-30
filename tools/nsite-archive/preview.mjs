import fs from 'node:fs';
import path from 'node:path';
import { sha } from './manifest.mjs';
import { mime, visualHTML } from './extract.mjs';

export const PREVIEW_CSP =
  "default-src 'none'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox";
export async function screenshot(archive, snapshot, { chromium, timeout = 15000 } = {}) {
  const key = sha(JSON.stringify([snapshot.aggregate, 'visual-v1', 390, 844]));
  const cached = archive.one('SELECT * FROM previews WHERE key=?', key);
  if (cached?.status === 'complete') return { key, status: 'cached', hash: cached.hash };
  const main =
    snapshot.files.find((f) => f.path === '/index.html') ??
    snapshot.files.find((f) => mime(f.path) === 'text/html');
  if (!main) return { key, status: 'not-renderable' };
  if (snapshot.files.some((f) => !archive.one('SELECT hash FROM blobs WHERE hash=?', f.hash)))
    return { key, status: 'partial-archive' };
  const files = new Map(snapshot.files.map((f) => [f.path, f]));
  let browser, timer;
  try {
    chromium ??= (await import('@playwright/test')).chromium;
    // Never fall back to --no-sandbox. Use a non-root host with OS sandbox
    // support. A missing sandbox is an explicit failed preview, not permission
    // to execute untrusted content in the archive worker's security context.
    browser = await chromium.launch({
      headless: true,
      chromiumSandbox: true,
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
      args: ['--disable-background-networking', '--disable-component-update', '--disable-sync'],
    });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      javaScriptEnabled: false,
      serviceWorkers: 'block',
      acceptDownloads: false,
      permissions: [],
    });
    let requests = 0,
      served = 0;
    await context.route('**/*', async (route) => {
      try {
        const url = new URL(route.request().url());
        if (
          ++requests > 128 ||
          url.origin !== 'https://archive.invalid' ||
          route.request().method() !== 'GET'
        )
          return route.abort();
        const file = files.get(url.pathname);
        if (!file) return route.abort();
        const type = mime(file.path);
        if (
          ![
            'text/html',
            'text/css',
            'image/png',
            'image/jpeg',
            'image/gif',
            'image/webp',
            'font/woff',
            'font/woff2',
          ].includes(type)
        )
          return route.abort();
        let body = archive.read(file.hash);
        served += body.length;
        if (served > 32 * 1024 ** 2) return route.abort();
        if (type === 'text/html') body = Buffer.from(visualHTML(body));
        return route.fulfill({
          status: 200,
          body,
          headers: {
            'content-type': type,
            'content-security-policy': PREVIEW_CSP,
            'x-content-type-options': 'nosniff',
          },
        });
      } catch {
        return route.abort();
      }
    });
    const task = (async () => {
      const page = await context.newPage();
      page.setDefaultTimeout(timeout);
      await page.goto('https://archive.invalid' + main.path, { waitUntil: 'load', timeout });
      return page.screenshot({ type: 'png', fullPage: false, timeout });
    })();
    const image = await Promise.race([
      task,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('preview-timeout')), timeout);
      }),
    ]);
    if (archive.diskBytes() + image.length > archive.maxStorageBytes) throw Error('storage-budget');
    const hash = sha(image),
      file = path.join(archive.home, 'previews', hash + '.png');
    if (!fs.existsSync(file)) fs.writeFileSync(file, image, { flag: 'wx', mode: 0o600 });
    archive.run(
      'INSERT OR REPLACE INTO previews VALUES (?,?,?,?,?)',
      key,
      hash,
      image.length,
      'complete',
      null,
    );
    return { key, status: 'complete', hash };
  } catch (e) {
    const code = /sandbox|root/.test(e.message)
      ? 'browser-sandbox-unavailable'
      : e.code === 'ERR_MODULE_NOT_FOUND'
        ? 'browser-not-installed'
        : e.message === 'storage-budget'
          ? 'storage-budget'
          : 'preview-failed';
    archive.run('INSERT OR REPLACE INTO previews VALUES (?,?,?,?,?)', key, null, 0, 'failed', code);
    return { key, status: 'failed', code };
  } finally {
    clearTimeout(timer);
    await browser?.close();
  }
}

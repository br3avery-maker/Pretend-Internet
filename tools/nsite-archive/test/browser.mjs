import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { Archive } from '../archive.mjs';
import { exportTo, serve } from '../cli.mjs';
import { event, key2, temp } from './fixtures.mjs';
import { sha } from '../manifest.mjs';
const home = temp(),
  a = new Archive(path.join(home, 'archive'));
let server, browser;
try {
  const html =
    '<html lang="en"><head><title>Jupiter field journal</title></head><body><h1>Observatory</h1><p>Telescopes, Jupiter and moonlight.</p></body></html>';
  const old = event({ files: { '/index.html': html } }),
    next = event({
      created: 1700000010,
      files: { '/index.html': html + '<p>Venus joins the sky.</p>' },
    }),
    copy = event({ secret: key2, files: { '/index.html': html + '<p>Venus joins the sky.</p>' } });
  for (const e of [old, next, copy]) a.ingest(e);
  for (const bytes of [html, html + '<p>Venus joins the sky.</p>'])
    a.store(Buffer.from(bytes), sha(bytes));
  a.index();
  exportTo(a, path.join(home, 'export'));
  server = serve(path.join(home, 'export'), 0);
  await new Promise((r) => (server.listening ? r() : server.once('listening', r)));
  // This test opens only our own directory viewer and locally generated trusted
  // fixtures. The untrusted-site screenshot worker separately requires sandbox.
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.locator('.site').first().waitFor();
  assert.equal(await page.locator('.site').count(), 2);
  await page.locator('#search').fill('Venus');
  assert.equal(await page.locator('.site').count(), 2);
  await page.locator('#search').fill('absent phrase');
  assert.equal(await page.locator('.site').count(), 0);
  assert.ok((await page.locator('#results').innerText()).includes('No matches'));
  await page.locator('#search').fill('');
  await page.getByRole('button', { name: 'Publishers', exact: true }).click();
  await page.locator('#tools summary').click();
  await page.locator('#sort').selectOption('publisher');
  await page.locator('#tools summary').click();
  await page.locator('#results summary').first().click();
  assert.ok((await page.locator('#results').innerText()).includes('sites in archive'));
  await page.getByRole('button', { name: 'Related', exact: true }).click();
  assert.ok((await page.locator('#results').innerText()).includes('Identical file trees'));
  await page.getByRole('button', { name: 'Sites', exact: true }).click();
  await page.locator('.site h2 a').first().click();
  await page.locator('#detail h1').waitFor();
  assert.ok((await page.locator('#detail').innerText()).includes('Published title'));
  const compare = page.getByRole('button', { name: 'Compare versions' });
  if (await compare.count()) {
    await compare.click();
    assert.ok((await page.locator('#detail').innerText()).includes('Changed /index.html'));
  }
  await page.getByRole('button', { name: '← Back to collection' }).click();
  await page.locator('#directory').waitFor();
  for (const width of [320, 390, 844]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
    document.getElementById('tools').open = true;
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#tools').evaluate((n) => (n.open = false));
  await page.evaluate(() => (document.documentElement.style.fontSize = ''));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(home, 'directory-phone.png'), fullPage: true });
  assert.deepEqual(errors, []);
  // Offline file import has no HTTP service dependency.
  await page.goto('file://' + path.join(home, 'export', 'index.html'));
  await page.locator('#import').setInputFiles(path.join(home, 'export', 'directory.json'));
  await page.locator('.site').first().waitFor();
  assert.equal(await page.locator('.site').count(), 2);
  console.log(
    'PASS: directory search, untitled content, publishers, related stacks, versions, Back, 320/390/844px, 200% text, offline import; no page errors.',
  );
  console.log('Browser evidence: ' + home);
} finally {
  await browser?.close();
  server?.closeAllConnections();
  await new Promise((r) => (server ? server.close(r) : r()));
  a.close();
}

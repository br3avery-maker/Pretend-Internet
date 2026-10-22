/** Cheap static smoke check, not a WebView/Android runtime test. */
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'dist');
const index = await readFile(join(out, 'index.html'), 'utf8');
const example = await readFile(join(out, 'templates', 'mini-app', 'index.html'), 'utf8');
const css = await readFile(join(out, 'templates', 'mini-app', 'skin.css'), 'utf8');
const manifest = JSON.parse(await readFile(join(out, 'templates', 'mini-app', 'app.json'), 'utf8'));
assert.match(index, /href="\.\/templates\/mini-app\/index\.html"/);
assert.match(index, /What is this app\?/);
assert.match(example, /id="help"/);
assert.match(example, /id="helpToggle"/);
assert.match(css, /data-skin="daylight"/);
assert.equal(manifest.status, 'wip');
await stat(join(out, 'index.html'));
console.log('PASS: generated static entry, linked example, skin and help assets (not Android verified)');

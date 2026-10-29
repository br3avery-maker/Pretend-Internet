// Regression tests for compressed ZIP entries that expand past the launcher limit.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { deflateRawSync } = require('node:zlib');

const html = fs.readFileSync(path.join(__dirname, '../web2app/index.html'), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, 'Launcher script exists');
const script = match[1];
const helpers = script.slice(script.indexOf('function fmtName('), script.indexOf('async function buildCatalog('));
const context = vm.createContext({
  TextDecoder, Blob, DecompressionStream,
  extensions: ['png', 'webp', 'jpg', 'jpeg', 'svg', 'gif', 'avif'],
});
vm.runInContext(helpers, context);

function makeZip(content, advertisedSize = content.length) {
  const name = Buffer.from('index.html');
  const compressed = deflateRawSync(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(advertisedSize, 24);
  central.writeUInt16LE(name.length, 28);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + name.length, 12);
  eocd.writeUInt32LE(local.length + name.length + compressed.length, 16);
  return new File([local, name, compressed, central, name, eocd], 'site.zip');
}

test('normal deflated HTML stays readable', async () => {
  const zip = await context.zipIndex(makeZip(Buffer.from('<h1>OK</h1>')));
  assert.equal(zip.entries.has('index.html'), true);
  const html = await context.zipRead(zip, 'index.html');
  assert.equal(await html.text(), '<h1>OK</h1>');
});

test('compressed ZIP entry advertising >32 MiB expansion is excluded', async () => {
  const zip = await context.zipIndex(makeZip(Buffer.alloc(32 * 1024 * 1024 + 1, 65)));
  assert.equal(zip.entries.has('index.html'), false);
});

test('forged small uncompressed size cannot bypass streaming expansion limit', async () => {
  const zip = await context.zipIndex(makeZip(Buffer.alloc(32 * 1024 * 1024 + 1, 65), 1));
  assert.equal(zip.entries.has('index.html'), true);
  await assert.rejects(context.zipRead(zip, 'index.html'), /ZIP entry exceeds 32 MiB limit/);
});

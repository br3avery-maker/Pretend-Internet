// Source-extracted regression: an import must not be replaced by an older connected folder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'launcher.js'), 'utf8');
const start = source.indexOf('async function getPermission(');
const end = source.indexOf('// A single-file HTML app works untouched.', start);
const fileListStart = source.indexOf('async function fileList(){');
const fileListEnd = source.indexOf('async function makeHTML(', fileListStart);
const bootStart = source.indexOf('(async()=>{if(!NATIVE)');
const bootEndMarker = '})().catch(e=>status(e.message));';
const bootEnd = source.indexOf(bootEndMarker, bootStart);
assert.ok(start >= 0 && end > start && fileListStart >= 0 && fileListEnd > fileListStart);
assert.ok(bootStart >= 0 && bootEnd > bootStart);
const fragment = source.slice(start, end) + '\n' + source.slice(fileListStart, fileListEnd);
const startup = source.slice(bootStart, bootEnd + bootEndMarker.length);

function harness(savedSource, preloaded = false) {
  const folderFile = {name: 'connected.html'};
  const importedFile = {name: 'imported.html'};
  const folderHandle = {
    name: 'Connected',
    queryPermission: async () => 'granted',
    async *entries() { yield ['connected.html', {kind: 'file', getFile: async () => folderFile}]; },
  };
  const settings = new Map([['folder', folderHandle]]);
  if (savedSource !== undefined) settings.set('activeSource', savedSource);
  const imports = new Map();
  if (preloaded) imports.set('imported.html', {name: 'imported.html', file: importedFile});
  const context = vm.createContext({
    NATIVE: false, folder: folderHandle, activeSource: 'folder',
    entries: [], recheckLock: false, refreshQueued: false,
    dbPut: async (store, key, value) => (store === 'settings' ? settings : imports).set(key, value),
    dbGet: async (store, key) => (store === 'settings' ? settings : imports).get(key),
    dbAll: async () => [...imports.values()],
    buildCatalog: async files => files,
    paint() {}, renderSource() {}, status() {}, closeSettings() {},
    window: {showDirectoryPicker: async () => folderHandle},
    $: () => ({click() {}}),
  });
  vm.runInContext(fragment, context);
  return {context, settings, importedFile, startup};
}

test('import remains visible on refresh and supplies the opened app resources', async () => {
  const h = harness();
  await h.context.storeFiles([h.importedFile]);
  await h.context.refresh();
  assert.equal(h.context.activeSource, 'imports');
  assert.equal(h.settings.get('activeSource'), 'imports');
  assert.deepEqual(Array.from(h.context.entries, f => f.name), ['imported.html']);
  assert.deepEqual(Array.from(await h.context.fileList(), f => f.name), ['imported.html']);
});

test('choosing a connected folder explicitly switches catalog and resource lookup', async () => {
  const h = harness();
  await h.context.storeFiles([h.importedFile]);
  await h.context.chooseFolder();
  assert.equal(h.settings.get('activeSource'), 'folder');
  assert.deepEqual(Array.from(h.context.entries, f => f.name), ['connected.html']);
  assert.deepEqual(Array.from(await h.context.fileList(), f => f.name), ['connected.html']);
});

test('reopen restores imported copies even when a folder handle is still permitted', async () => {
  const h = harness('imports', true);
  h.context.folder = null;
  await vm.runInContext(h.startup, h.context);
  assert.equal(h.context.activeSource, 'imports');
  assert.deepEqual(Array.from(h.context.entries, f => f.name), ['imported.html']);
  assert.deepEqual(Array.from(await h.context.fileList(), f => f.name), ['imported.html']);
});

test('existing installs without an active-source preference retain folder-first behavior', async () => {
  const h = harness(undefined, true);
  h.context.folder = null;
  await vm.runInContext(h.startup, h.context);
  assert.equal(h.context.activeSource, 'folder');
  assert.deepEqual(Array.from(h.context.entries, f => f.name), ['connected.html']);
});

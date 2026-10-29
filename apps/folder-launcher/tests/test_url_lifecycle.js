// Source-extracted regression for launcher Blob URL ownership and async Back navigation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'launcher.js'), 'utf8');
const begin = source.includes('function releaseActiveUrls(')
  ? source.indexOf('function releaseActiveUrls(')
  : source.indexOf('async function openApp(');
const end = source.indexOf("window.addEventListener('popstate'", begin);
assert.ok(begin >= 0 && end > begin, 'Expected original launcher open/return functions');
const fragment = source.slice(begin, end);

function harness(makeHTML) {
  const revoked = [];
  const frame = {srcdoc: '', src: '', removeAttribute(name) { delete this[name]; }};
  const nodes = {
    player: {classList: {add() {}, remove() {}}},
    gear: {style: {}},
    appframe: frame,
  };
  const context = vm.createContext({
    closeSettings() {},
    makeHTML,
    URL: {revokeObjectURL: value => revoked.push(value)},
    $: id => nodes[id],
    status() {},
    window: {AndroidLauncher: {launchApp() {}}},
    history: {pushState() {}, back() {}},
    location: {hash: '#/app/test'},
    objectUrls: ['blob:icon'],
    activeUrls: [],
    active: '',
    openToken: 0,
  });
  vm.runInContext(fragment, context);
  return {context, revoked, frame};
}

test('Back releases app resources but retains launcher icon URLs', async () => {
  const h = harness(async () => ({html: '<p>One</p>', urls: ['blob:app-css', 'blob:app-js']}));
  await h.context.openApp({name: 'test'});
  assert.equal(h.frame.srcdoc, '<p>One</p>');
  h.context.returnHome(false);
  assert.deepEqual(h.revoked, ['blob:app-css', 'blob:app-js']);
  assert.deepEqual(Array.from(h.context.objectUrls), ['blob:icon']);
});

test('repeated app visits do not accumulate unreleased Blob URLs', async () => {
  let visit = 0;
  const h = harness(async () => ({html: '<p>OK</p>', urls: ['blob:visit-' + (++visit)]}));
  for (let i = 0; i < 3; i++) {
    await h.context.openApp({name: 'test'});
    h.context.returnHome(false);
  }
  assert.deepEqual(h.revoked, ['blob:visit-1', 'blob:visit-2', 'blob:visit-3']);
});

test('late HTML preparation after Back cannot reopen hidden frame or leak URLs', async () => {
  let finish;
  const h = harness(() => new Promise(resolve => { finish = resolve; }));
  const pending = h.context.openApp({name: 'test'});
  h.context.returnHome(false);
  finish({html: '<p>stale</p>', urls: ['blob:late']});
  await pending;
  assert.equal(h.frame.srcdoc, undefined);
  assert.deepEqual(h.revoked, ['blob:late']);
});

test('late completion of prior app cannot overwrite a newer app', async () => {
  let finishOld;
  const h = harness(app => app.name === 'old'
    ? new Promise(resolve => { finishOld = resolve; })
    : Promise.resolve({html: '<p>new</p>', urls: ['blob:new']}));
  const old = h.context.openApp({name: 'old'});
  await h.context.openApp({name: 'new'});
  finishOld({html: '<p>old</p>', urls: ['blob:old']});
  await old;
  assert.equal(h.frame.srcdoc, '<p>new</p>');
  assert.deepEqual(h.revoked, ['blob:old']);
  h.context.returnHome(false);
  assert.deepEqual(h.revoked, ['blob:old', 'blob:new']);
});

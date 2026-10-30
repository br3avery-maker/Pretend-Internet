// Regression: a folder change/refresh during an in-flight scan must not be lost.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'launcher.js'), 'utf8');
const begin = source.indexOf('async function refresh(){');
const end = source.indexOf('async function chooseFolder(){', begin);
assert.ok(begin >= 0 && end > begin, 'Expected original launcher refresh function');
const fragment = source.slice(begin, end);

function harness() {
  let resolveFirst, rejectFirst;
  let calls = 0;
  const errors = [];
  const context = vm.createContext({
    NATIVE: false,
    scanDir() {
      calls++;
      return calls === 1
        ? new Promise((resolve, reject) => { resolveFirst = resolve; rejectFirst = reject; })
        : Promise.resolve(true);
    },
    scanCache() { throw Error('Unexpected cache scan'); },
    status(message) { errors.push(message); },
  });
  vm.runInContext('let recheckLock=false,refreshQueued=false;\n' + fragment, context);
  return {refresh: context.refresh, get calls() { return calls; }, errors,
    finish() { resolveFirst(true); }, fail() { rejectFirst(Error('scan failed')); }};
}

test('refresh requested during an in-flight scan runs after it completes', async () => {
  const h = harness();
  const first = h.refresh();
  await h.refresh();
  assert.equal(h.calls, 1, 'second refresh should wait for first scan');
  h.finish();
  await first;
  assert.equal(h.calls, 2, 'queued refresh must run');
});

test('multiple overlapping refresh requests coalesce into one follow-up scan', async () => {
  const h = harness();
  const first = h.refresh();
  await Promise.all([h.refresh(), h.refresh(), h.refresh()]);
  h.finish();
  await first;
  assert.equal(h.calls, 2);
});

test('queued refresh still runs when the initial scan fails', async () => {
  const h = harness();
  const first = h.refresh();
  await h.refresh();
  h.fail();
  await first;
  assert.equal(h.calls, 2);
  assert.match(h.errors[0], /scan failed/);
});

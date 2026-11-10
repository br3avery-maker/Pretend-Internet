import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This suite uses three packages that live outside this directory: nostr-tools
// for signing fixtures, the read-side router's own modules, and the shared
// local relay fixture. Each one is a declared dependency with its own install,
// so a move, a renamed entry point, or a stale install fails here with the
// command that repairs it instead of as an opaque resolution error later.

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(here, '..');
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const declared = readJSON(path.join(packageRoot, 'package.json'));

function packageRootOf(fileUrl) {
  let dir = path.dirname(fileURLToPath(fileUrl));
  for (let depth = 0; depth < 8; depth += 1) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  assert.fail(`no package.json found above ${fileUrl}`);
}

function resolveEntrypoint(specifier, repair) {
  try {
    return import.meta.resolve(specifier);
  } catch {
    assert.fail(`${specifier} does not resolve from tools/nsite-archive. ${repair}`);
  }
}

test('nostr-tools resolves to the pinned version inside this package', () => {
  const pinned = declared.devDependencies?.['nostr-tools'];
  assert.ok(
    pinned,
    'test/fixtures.mjs signs events with nostr-tools, so it must be declared in tools/nsite-archive devDependencies',
  );
  const root = packageRootOf(
    resolveEntrypoint('nostr-tools/pure', 'Run: npm ci --prefix tools/nsite-archive'),
  );
  assert.equal(
    path.dirname(path.dirname(root)),
    packageRoot,
    `nostr-tools resolved from ${root} instead of this package's own node_modules; ` +
      'the archive suite must not depend on another package install. Run: npm ci --prefix tools/nsite-archive',
  );
  const found = readJSON(path.join(root, 'package.json')).version;
  assert.equal(
    found,
    pinned,
    `resolved nostr-tools ${found} but package.json declares ${pinned}. Run: npm ci --prefix tools/nsite-archive`,
  );
});

test('relay-router stays a declared file dependency that resolves inside the repository', () => {
  assert.equal(
    declared.dependencies?.['@pretend-internet/relay-router'],
    'file:../relay-router',
    'archive.mjs, collect.mjs, manifest.mjs and network.mjs import the read-side router; ' +
      'keep it a declared file: dependency rather than reaching across directories',
  );
  const resolved = fs.realpathSync(
    fileURLToPath(
      resolveEntrypoint(
        '@pretend-internet/relay-router/validation.mjs',
        'Run: npm ci --prefix tools/relay-router',
      ),
    ),
  );
  const expected = fs.realpathSync(path.join(packageRoot, '..', 'relay-router'));
  assert.ok(
    resolved.startsWith(expected + path.sep),
    `relay-router resolved to ${resolved}, outside ${expected}; check the file: link. ` +
      'Run: npm ci --prefix tools/nsite-archive',
  );
});

test('the shared relay fixture loads its own declared dependencies', () => {
  assert.equal(
    declared.devDependencies?.['@pretend-internet/test-support'],
    'file:../test-support',
    'the local relay fixture used by network and review tests is a declared dev dependency of tools/test-support',
  );
  const fixtureRoot = fs.realpathSync(
    path.dirname(
      fileURLToPath(
        resolveEntrypoint(
          '@pretend-internet/test-support/relay-server.mjs',
          'Run: npm ci --prefix tools/test-support',
        ),
      ),
    ),
  );
  const expected = fs.realpathSync(path.join(packageRoot, '..', 'test-support'));
  assert.equal(
    fixtureRoot,
    expected,
    `the relay fixture resolved to ${fixtureRoot}, outside ${expected}; check the file: link. ` +
      'Run: npm ci --prefix tools/nsite-archive',
  );
  const fixturePins = readJSON(path.join(expected, 'package.json')).dependencies;
  for (const name of ['nostr-tools', 'ws']) {
    const installed = path.join(expected, 'node_modules', name, 'package.json');
    assert.ok(
      fs.existsSync(installed),
      `the relay fixture needs its own ${name} install at ${installed} because it loads ${name} ` +
        'from that directory. Run: npm ci --prefix tools/test-support',
    );
    assert.equal(
      readJSON(installed).version,
      fixturePins[name],
      `${name} installed for the relay fixture is a different version than tools/test-support declares. ` +
        'Run: npm ci --prefix tools/test-support',
    );
  }
});

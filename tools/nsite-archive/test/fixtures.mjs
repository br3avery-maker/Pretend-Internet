import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  finalizeEvent,
  getPublicKey,
} from '../../relay-router/node_modules/nostr-tools/lib/esm/pure.js';
import { sha, aggregate } from '../manifest.mjs';
export const key = Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 1 : 0));
export const key2 = Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 2 : 0));
export const author = getPublicKey(key);
export function event({
  kind = 35128,
  identifier = 'test',
  files = {
    '/index.html':
      '<title>Quiet stars</title><h1>Astronomy without a name</h1><p>The observatory tracks Jupiter and moonlight.</p>',
  },
  created = 1700000000,
  secret = key,
  extra = [],
  content = '',
} = {}) {
  const paths = Object.entries(files).map(([p, b]) => ({ path: p, hash: sha(Buffer.from(b)) }));
  const tags = [
    ...(kind === 35128 ? [['d', identifier]] : []),
    ...paths.map((f) => ['path', f.path, f.hash]),
    ['x', aggregate(paths), 'aggregate'],
    ...extra,
  ];
  return finalizeEvent({ kind, created_at: created, tags, content }, secret);
}
export function signed({ kind, tags = [], created_at = 1700000000, content = '', secret = key }) {
  return finalizeEvent({ kind, tags, created_at, content }, secret);
}
export function temp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nsite-archive-test-'));
}

import { createHash } from 'node:crypto';
import { encodeTreeNode, LinkType } from '@hashtree/core';
import { sha } from './manifest.mjs';

// Gear CDC. This is an internal, versioned chunking profile, not FastCDC's
// published vectors and not a change to Blossom's whole-file identifiers.
const gear = Array.from({ length: 256 }, (_, i) =>
  createHash('sha256').update(`nsite-gear-v1:${i}`).digest().readUInt32LE(),
);
export const PROFILE = { id: 'gear-v1-16k-64k-256k', min: 16384, avg: 65536, max: 262144 };
export function* chunks(data) {
  let start = 0,
    roll = 0;
  for (let i = 0; i < data.length; i++) {
    roll = ((roll << 1) + gear[data[i]]) >>> 0;
    const size = i - start + 1;
    if (size >= PROFILE.min && ((roll & (PROFILE.avg - 1)) === 0 || size >= PROFILE.max)) {
      yield data.subarray(start, i + 1);
      start = i + 1;
      roll = 0;
    }
  }
  if (start < data.length || data.length === 0) yield data.subarray(start);
}
// Reuse Hashtree's actual MIT codec. Unencrypted File/Dir nodes with fanout 174;
// these roots are separate from NIP-5A aggregates and native file SHA-256.
export function node(links, type) {
  const bytes = Buffer.from(encodeTreeNode({ links, type }));
  return { bytes, hash: sha(bytes) };
}
export function merkleFile(parts, put) {
  let links = parts.map((p) => ({
    hash: Buffer.from(p.hash, 'hex'),
    size: p.size,
    type: LinkType.Blob,
  }));
  do {
    const next = [];
    for (let i = 0; i < links.length; i += 174) {
      const batch = links.slice(i, i + 174),
        n = node(batch, LinkType.File);
      put(n.hash, n.bytes);
      next.push({
        hash: Buffer.from(n.hash, 'hex'),
        size: batch.reduce((s, l) => s + l.size, 0),
        type: LinkType.File,
      });
    }
    links = next;
  } while (links.length > 1);
  return Buffer.from(links[0].hash).toString('hex');
}
export function merkleDirectory(files, put) {
  const root = new Map();
  for (const file of files) {
    let dir = root;
    const path = file.path.slice(1).split('/');
    for (const part of path.slice(0, -1)) {
      if (!dir.has(part)) dir.set(part, new Map());
      if (!(dir.get(part) instanceof Map)) throw Error('file-directory-conflict');
      dir = dir.get(part);
    }
    if (dir.has(path.at(-1))) throw Error('file-directory-conflict');
    dir.set(path.at(-1), file);
  }
  const visit = (dir) => {
    const links = [...dir]
      .sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
      .map(([name, value]) => {
        const child =
          value instanceof Map
            ? visit(value)
            : { hash: value.root, size: value.size, type: LinkType.File };
        return { name, hash: Buffer.from(child.hash, 'hex'), size: child.size, type: child.type };
      });
    const n = node(links, LinkType.Dir);
    put(n.hash, n.bytes);
    return { hash: n.hash, size: links.reduce((s, l) => s + l.size, 0), type: LinkType.Dir };
  };
  return visit(root).hash;
}

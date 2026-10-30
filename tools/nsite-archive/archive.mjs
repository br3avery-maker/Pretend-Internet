import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { signedEvent, hex64 } from '../relay-router/validation.mjs';
import { chunks, merkleFile, merkleDirectory, PROFILE } from './chunks.mjs';
import { parseManifest, tags, first, sha, aggregate, gatewayURL, safePath } from './manifest.mjs';
import { extractHTML, EXTRACTOR, mime } from './extract.mjs';

export const SCHEMA = 'nsite-archive.v1';
const json = JSON.stringify;
const parse = JSON.parse;
export class Archive {
  constructor(directory, { maxStorageBytes = 1024 ** 3 } = {}) {
    this.home = path.resolve(directory);
    this.maxStorageBytes = maxStorageBytes;
    fs.mkdirSync(this.home, { recursive: true, mode: 0o700 });
    this.lockPath = path.join(this.home, 'writer.lock');
    try {
      this.lock = fs.openSync(this.lockPath, 'wx', 0o600);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const pid = Number(fs.readFileSync(this.lockPath, 'utf8'));
      if (!Number.isInteger(pid) || pid <= 0) throw Error('archive-locked');
      try {
        process.kill(pid, 0);
        throw Error('archive-locked');
      } catch (err) {
        if (err.code !== 'ESRCH') throw err;
      }
      fs.unlinkSync(this.lockPath);
      this.lock = fs.openSync(this.lockPath, 'wx', 0o600);
    }
    fs.writeFileSync(this.lock, String(process.pid));
    for (const dir of ['objects', 'staging', 'previews'])
      fs.mkdirSync(path.join(this.home, dir), { recursive: true });
    this.db = new DatabaseSync(path.join(this.home, 'archive.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,kind INTEGER,pubkey TEXT,site TEXT,created INTEGER,raw TEXT NOT NULL,manifest TEXT,error TEXT);
      CREATE INDEX IF NOT EXISTS event_site ON events(site,created);
      CREATE TABLE IF NOT EXISTS sources(event TEXT,url TEXT,type TEXT,PRIMARY KEY(event,url,type));
      CREATE TABLE IF NOT EXISTS jobs(hash TEXT PRIMARY KEY,state TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,error TEXT,next_retry INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS origins(hash TEXT,url TEXT,event TEXT,PRIMARY KEY(hash,url,event));
      CREATE TABLE IF NOT EXISTS objects(hash TEXT PRIMARY KEY,size INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS blobs(hash TEXT PRIMARY KEY,size INTEGER,root TEXT,parts TEXT,mime TEXT);
      CREATE TABLE IF NOT EXISTS pages(hash TEXT,path TEXT,version TEXT,data TEXT,PRIMARY KEY(hash,path,version));
      CREATE TABLE IF NOT EXISTS scans(relay TEXT,filter TEXT,cursor INTEGER,status TEXT,gaps TEXT NOT NULL DEFAULT '[]',PRIMARY KEY(relay,filter));
      CREATE TABLE IF NOT EXISTS previews(key TEXT PRIMARY KEY,hash TEXT,size INTEGER,status TEXT,error TEXT);
      CREATE TABLE IF NOT EXISTS rules(id TEXT PRIMARY KEY,rule TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS decisions(site TEXT PRIMARY KEY,visible INTEGER NOT NULL);
    `);
    const version = this.one('SELECT value FROM metadata WHERE key=?', 'schema');
    if (version && version.value !== SCHEMA) {
      this.close();
      throw Error('unsupported-archive-schema');
    }
    this.run('INSERT OR IGNORE INTO metadata VALUES (?,?)', 'schema', SCHEMA);
    this.objectBytes = this.one('SELECT COALESCE(SUM(size),0) n FROM objects').n;
  }
  run(sql, ...args) {
    return this.db.prepare(sql).run(...args);
  }
  one(sql, ...args) {
    return this.db.prepare(sql).get(...args);
  }
  all(sql, ...args) {
    return this.db.prepare(sql).all(...args);
  }
  close() {
    this.db?.close();
    this.db = null;
    if (this.lock !== undefined) {
      fs.closeSync(this.lock);
      fs.unlinkSync(this.lockPath);
      this.lock = undefined;
    }
  }
  ingest(input, source = 'local-import', type = 'import') {
    const event = signedEvent(input);
    let manifest,
      error = null;
    try {
      manifest = parseManifest(event);
    } catch (e) {
      error = e.message;
    }
    if (
      !this.one('SELECT id FROM events WHERE id=?', event.id) &&
      this.diskBytes() + Buffer.byteLength(json(event)) * 3 + (manifest?.files.length ?? 0) * 512 >
        this.maxStorageBytes
    )
      throw Error('storage-budget');
    this.db.exec('BEGIN');
    try {
      this.run(
        'INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?,?,?)',
        event.id,
        event.kind,
        event.pubkey,
        manifest?.site ?? null,
        event.created_at,
        json(event),
        manifest ? json(manifest) : null,
        error,
      );
      this.run('INSERT OR IGNORE INTO sources VALUES (?,?,?)', event.id, source, type);
      if (manifest)
        for (const file of manifest.files) {
          this.run('INSERT OR IGNORE INTO jobs(hash) VALUES (?)', file.hash);
          for (const t of tags(event, 'server')) this.addOrigin(file.hash, t[1], event.id);
          const list = this.one(
            'SELECT raw,id FROM events WHERE kind=10063 AND pubkey=? ORDER BY created DESC,id ASC LIMIT 1',
            event.pubkey,
          );
          if (list)
            for (const t of tags(parse(list.raw), 'server'))
              this.addOrigin(file.hash, t[1], list.id);
        }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return { id: event.id, status: manifest ? 'queued' : 'preserved-unindexed', error };
  }
  addOrigin(hash, url, event) {
    const inserted = this.run('INSERT OR IGNORE INTO origins VALUES (?,?,?)', hash, url, event);
    if (inserted.changes)
      this.run("UPDATE jobs SET state='queued',next_retry=0 WHERE hash=? AND state='failed'", hash);
  }
  addServerList(input, source) {
    const event = signedEvent(input);
    if (event.kind !== 10063) throw Error('not-server-list');
    this.ingest(event, source, 'server-list');
    const latest = this.one(
      'SELECT id FROM events WHERE kind=10063 AND pubkey=? ORDER BY created DESC,id ASC LIMIT 1',
      event.pubkey,
    );
    if (latest.id !== event.id) return;
    for (const row of this.all(
      'SELECT manifest FROM events WHERE pubkey=? AND manifest IS NOT NULL',
      event.pubkey,
    )) {
      for (const file of parse(row.manifest).files)
        for (const t of tags(event, 'server')) this.addOrigin(file.hash, t[1], event.id);
    }
  }
  objectPath(hash) {
    if (!hex64(hash)) throw Error('invalid-hash');
    return path.join(this.home, 'objects', hash.slice(0, 2), hash);
  }
  diskBytes() {
    let total = this.objectBytes;
    for (const dir of ['staging', 'previews'])
      for (const entry of fs.readdirSync(path.join(this.home, dir), { withFileTypes: true }))
        if (entry.isFile()) total += fs.statSync(path.join(this.home, dir, entry.name)).size;
    for (const name of ['archive.sqlite', 'archive.sqlite-wal', 'archive.sqlite-shm'])
      try {
        total += fs.statSync(path.join(this.home, name)).size;
      } catch {}
    return total;
  }
  putObject(hash, bytes) {
    if (sha(bytes) !== hash) throw Error('object-hash-mismatch');
    const file = this.objectPath(hash);
    if (fs.existsSync(file)) {
      if (sha(fs.readFileSync(file)) !== hash) throw Error('corrupt-object');
      if (!this.one('SELECT hash FROM objects WHERE hash=?', hash)) {
        this.run('INSERT INTO objects VALUES (?,?)', hash, bytes.length);
        this.objectBytes += bytes.length;
      }
      return;
    }
    if (this.diskBytes() + bytes.length > this.maxStorageBytes) throw Error('storage-budget');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
    this.run('INSERT OR IGNORE INTO objects VALUES (?,?)', hash, bytes.length);
    this.objectBytes += bytes.length;
  }
  store(bytes, expected, type = 'application/octet-stream') {
    if (sha(bytes) !== expected) throw Error('blob-hash-mismatch');
    if (this.one('SELECT hash FROM blobs WHERE hash=?', expected)) {
      this.read(expected);
      return { reused: true };
    }
    const parts = [];
    for (const part of chunks(bytes)) {
      const hash = sha(part);
      this.putObject(hash, part);
      parts.push({ hash, size: part.length });
    }
    const root = merkleFile(parts, (hash, data) => this.putObject(hash, data));
    this.run(
      'INSERT INTO blobs VALUES (?,?,?,?,?)',
      expected,
      bytes.length,
      root,
      json(parts),
      type,
    );
    this.run("UPDATE jobs SET state='complete',error=NULL,next_retry=0 WHERE hash=?", expected);
    return { reused: false, root, chunks: parts.length };
  }
  read(hash) {
    const blob = this.one('SELECT * FROM blobs WHERE hash=?', hash);
    if (!blob) throw Error('blob-not-stored');
    const data = Buffer.concat(
      parse(blob.parts).map((p) => {
        const b = fs.readFileSync(this.objectPath(p.hash));
        if (b.length !== p.size || sha(b) !== p.hash) throw Error('corrupt-chunk');
        return b;
      }),
    );
    if (data.length !== blob.size || sha(data) !== hash) throw Error('corrupt-blob');
    return data;
  }
  snapshots() {
    const result = [];
    for (const row of this.all(
      'SELECT * FROM events WHERE manifest IS NOT NULL ORDER BY created ASC,id DESC',
    )) {
      const m = parse(row.manifest);
      if (!m.legacy)
        result.push({
          id: row.id,
          site: row.site,
          publisher: row.pubkey,
          created: row.created,
          files: m.files,
          aggregate: m.nativeHash,
          event: m.event,
          published: m.published,
          relations: m.relations,
          eventIds: [row.id],
          legacy: false,
        });
    }
    // Legacy file events reconstruct observed trees by time; synthetic trees are
    // explicitly marked and never masquerade as a signed modern manifest.
    const legacy = new Map();
    for (const row of this.all(
      'SELECT * FROM events WHERE kind=34128 AND manifest IS NOT NULL ORDER BY created ASC,id DESC',
    )) {
      const m = parse(row.manifest);
      if (!legacy.has(row.site)) legacy.set(row.site, new Map());
      const tree = legacy.get(row.site);
      tree.set(m.files[0].path, { ...m.files[0], event: row.id });
      const files = [...tree.values()].sort((a, b) => a.path.localeCompare(b.path)),
        eventIds = [...new Set(files.map((f) => f.event))].sort();
      result.push({
        id: 'legacy-' + sha(json(eventIds)),
        site: row.site,
        publisher: row.pubkey,
        created: row.created,
        files,
        aggregate: aggregate(files),
        event: m.event,
        published: m.published,
        relations: [],
        eventIds,
        legacy: true,
      });
    }
    return result.sort((a, b) => b.created - a.created || a.id.localeCompare(b.id));
  }
  index() {
    let extracted = 0,
      reused = 0;
    for (const snapshot of this.snapshots())
      for (const file of snapshot.files) {
        if (
          !['text/html', 'text/plain'].includes(mime(file.path)) ||
          !this.one('SELECT hash FROM blobs WHERE hash=?', file.hash)
        )
          continue;
        if (
          this.one(
            'SELECT hash FROM pages WHERE hash=? AND path=? AND version=?',
            file.hash,
            file.path,
            EXTRACTOR,
          )
        ) {
          reused++;
          continue;
        }
        const bytes = this.read(file.hash);
        const data =
          mime(file.path) === 'text/html'
            ? extractHTML(bytes, file.path)
            : {
                title: '',
                description: '',
                headings: [],
                text: bytes.toString('utf8').slice(0, 1048576),
                metadata: {},
                links: [],
                language: null,
                subjects: [],
              };
        this.run(
          'INSERT OR REPLACE INTO pages VALUES (?,?,?,?)',
          file.hash,
          file.path,
          EXTRACTOR,
          json(data),
        );
        extracted++;
      }
    return { extracted, reused };
  }
  diff(beforeId, afterId) {
    const all = this.snapshots(),
      before = all.find((x) => x.id === beforeId),
      after = all.find((x) => x.id === afterId);
    if (!before || !after) throw Error('snapshot-not-found');
    const old = new Map(before.files.map((f) => [f.path, f])),
      next = new Map(after.files.map((f) => [f.path, f]));
    const changes = [];
    for (const p of [...new Set([...old.keys(), ...next.keys()])].sort()) {
      const a = old.get(p),
        b = next.get(p);
      if (a?.hash === b?.hash) continue;
      const previous = a && this.one('SELECT * FROM blobs WHERE hash=?', a.hash),
        current = b && this.one('SELECT * FROM blobs WHERE hash=?', b.hash);
      let chunkReuse = null;
      if (previous && current) {
        const hashes = new Set(parse(previous.parts).map((x) => x.hash)),
          parts = parse(current.parts);
        chunkReuse = {
          reusedBytes: parts.filter((x) => hashes.has(x.hash)).reduce((s, x) => s + x.size, 0),
          totalBytes: current.size,
          newChunks: parts.filter((x) => !hashes.has(x.hash)).length,
        };
      }
      changes.push({
        path: p,
        type: !a ? 'added' : !b ? 'removed' : 'changed',
        before: a?.hash ?? null,
        after: b?.hash ?? null,
        chunkReuse,
      });
    }
    return {
      before: beforeId,
      after: afterId,
      identical: before.aggregate === after.aggregate,
      changes,
    };
  }
  restore(id, destination) {
    const snapshot = this.snapshots().find((x) => x.id === id);
    if (!snapshot) throw Error('snapshot-not-found');
    if (fs.existsSync(destination)) throw Error('restore-destination-exists');
    // Verify every byte before creating the restoration directory.
    for (const f of snapshot.files) {
      safePath(f.path);
      this.read(f.hash);
    }
    fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
    for (const f of snapshot.files) {
      const file = path.join(destination, ...f.path.slice(1).split('/'));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, this.read(f.hash), { flag: 'wx', mode: 0o600 });
    }
    return { snapshot: id, files: snapshot.files.length, destination: path.resolve(destination) };
  }
  setRule(rule) {
    if (
      !rule ||
      typeof rule.id !== 'string' ||
      !rule.id ||
      !['description-template', 'exact-content'].includes(rule.type)
    )
      throw Error('invalid-rule');
    if (
      rule.type === 'description-template' &&
      (typeof rule.prefix !== 'string' ||
        rule.prefix.length < 24 ||
        !Array.isArray(rule.requiredTerms) ||
        rule.requiredTerms.length < 2 ||
        rule.requiredTerms.some((x) => typeof x !== 'string' || !x))
    )
      throw Error('weak-template-rule');
    if (rule.type === 'exact-content' && !hex64(rule.aggregate)) throw Error('invalid-rule-hash');
    this.run(
      'INSERT OR REPLACE INTO rules VALUES (?,?)',
      rule.id,
      json({ ...rule, enabled: rule.enabled !== false }),
    );
  }
  export() {
    const snapshots = this.snapshots(),
      grouped = new Map(),
      rules = this.all('SELECT rule FROM rules').map((x) => parse(x.rule));
    for (const s of snapshots) {
      if (!grouped.has(s.site)) grouped.set(s.site, []);
      grouped.get(s.site).push(s);
    }
    const sites = [...grouped].map(([site, versions]) => {
      const head = versions.find((v) => v.event.kind !== 5128) ?? versions[0];
      const pages = head.files.flatMap((f) => {
        const row = this.one(
          'SELECT data FROM pages WHERE hash=? AND path=? AND version=?',
          f.hash,
          f.path,
          EXTRACTOR,
        );
        return row
          ? [
              {
                path: f.path,
                hash: f.hash,
                ...parse(row.data),
                evidence: { fileHash: f.hash, extractor: EXTRACTOR },
              },
            ]
          : [];
      });
      const main = pages.find((p) => p.path === '/index.html') ?? pages[0];
      const reasons = rules
        .filter(
          (r) =>
            r.enabled &&
            (r.type === 'exact-content'
              ? r.aggregate === head.aggregate
              : head.published.description.toLowerCase().startsWith(r.prefix.toLowerCase()) &&
                r.requiredTerms.every((t) =>
                  head.published.description.toLowerCase().includes(t.toLowerCase()),
                )),
        )
        .map((r) => ({
          rule: r.id,
          type: r.type,
          reason: r.reason || 'Matches explicit local filter',
          evidence: head.id,
        }));
      const decision = this.one('SELECT visible FROM decisions WHERE site=?', site);
      const versionsOut = [head, ...versions.filter((v) => v.id !== head.id)].map((v) => {
        const available = v.files.filter((f) =>
          this.one('SELECT hash FROM blobs WHERE hash=?', f.hash),
        );
        let root = null;
        if (available.length === v.files.length)
          try {
            root = merkleDirectory(
              v.files.map((f) => ({
                ...f,
                ...this.one('SELECT size,root FROM blobs WHERE hash=?', f.hash),
              })),
              (hash, bytes) => this.putObject(hash, bytes),
            );
          } catch (e) {
            if (e.message !== 'storage-budget' && e.message !== 'file-directory-conflict') throw e;
          }
        const previewKey = sha(json([v.aggregate, 'visual-v1', 390, 844]));
        const preview = this.one('SELECT * FROM previews WHERE key=?', previewKey);
        return {
          id: v.id,
          created: v.created,
          aggregate: v.aggregate,
          merkleRoot: root,
          files: v.files.map((f) => {
            const blob = this.one('SELECT size,root,parts FROM blobs WHERE hash=?', f.hash);
            return {
              ...f,
              size: blob?.size ?? null,
              merkleRoot: blob?.root ?? null,
              chunks: blob ? parse(blob.parts) : null,
            };
          }),
          eventIds: v.eventIds,
          legacyReconstruction: v.legacy,
          available: available.length,
          total: v.files.length,
          status: available.length === v.files.length ? 'complete' : 'partial',
          preview: preview?.status === 'complete' ? `previews/${preview.hash}.png` : null,
        };
      });
      return {
        site,
        publisher: head.publisher,
        identifier: site.split(':').slice(2).join(':'),
        head: head.id,
        aggregate: head.aggregate,
        url: gatewayURL(site, head.event),
        published: head.published,
        derived: {
          title: main?.title || main?.headings[0] || '',
          description: main?.description || main?.text?.slice(0, 220) || '',
          evidence: main?.evidence ?? null,
        },
        pages,
        versions: versionsOut,
        relations: head.relations,
        hidden: decision ? !decision.visible : reasons.length > 0,
        filterReasons: reasons,
        observation:
          head.event.kind === 5128
            ? 'snapshots-only'
            : head.legacy
              ? 'legacy-observed-tree'
              : 'signed-manifest',
        sources: [
          ...new Set(
            versions.flatMap((v) =>
              v.eventIds.flatMap((id) =>
                this.all('SELECT url FROM sources WHERE event=?', id).map((x) => x.url),
              ),
            ),
          ),
        ],
      };
    });
    const publishers = [...new Set(sites.map((s) => s.publisher))].map((pubkey) => ({
      pubkey,
      siteCount: sites.filter((s) => s.publisher === pubkey).length,
    }));
    const byAggregate = new Map();
    for (const site of sites) {
      if (!byAggregate.has(site.aggregate)) byAggregate.set(site.aggregate, []);
      byAggregate.get(site.aggregate).push(site.site);
    }
    const identical = [...byAggregate]
      .filter(([, v]) => v.length > 1)
      .map(([hash, members]) => ({
        type: 'identical-content',
        aggregate: hash,
        members,
        verified: true,
        lineageVerified: false,
      }));
    // Candidate generation by shared hashes, bounded separately from full ingest.
    const buckets = new Map(),
      candidates = new Map(),
      seenPairs = new Set();
    let similarityLimited = false;
    for (const site of sites)
      for (const hash of new Set(site.versions[0].files.map((f) => f.hash))) {
        const bucket = buckets.get(hash) ?? [];
        if (bucket.length < 128) bucket.push(site);
        else similarityLimited = true;
        buckets.set(hash, bucket);
      }
    comparisons: for (const bucket of buckets.values())
      for (let i = 0; i < bucket.length; i++)
        for (let j = i + 1; j < bucket.length; j++) {
          const a = bucket[i],
            b = bucket[j];
          if (a.aggregate === b.aggregate) continue;
          const key = [a.site, b.site].sort().join('|');
          if (seenPairs.has(key)) continue;
          if (seenPairs.size >= 10000) {
            similarityLimited = true;
            break comparisons;
          }
          seenPairs.add(key);
          const af = new Set(a.versions[0].files.map((f) => f.hash)),
            bf = new Set(b.versions[0].files.map((f) => f.hash));
          const shared = [...af].filter((h) => bf.has(h)).length,
            score = shared / new Set([...af, ...bf]).size;
          if (score >= 0.7)
            candidates.set(key, {
              type: 'probable-clone',
              members: [a.site, b.site],
              score,
              sharedFiles: shared,
              verified: false,
              basis: 'file-hash-jaccard',
              lineageVerified: false,
            });
        }
    const families = new Map();
    for (const s of sites)
      for (const r of s.relations.filter((r) => r.type === 'declared-origin')) {
        if (!families.has(r.target)) families.set(r.target, new Set());
        families.get(r.target).add(s.site);
        if (grouped.has(r.target)) families.get(r.target).add(r.target);
      }
    const declared = [...families].map(([origin, members]) => ({
      type: 'declared-family',
      origin,
      members: [...members],
      verified: false,
      lineageVerified: false,
    }));
    const jobs = this.all('SELECT state,count(*) count FROM jobs GROUP BY state');
    return {
      schema: SCHEMA,
      generatedAt: Math.floor(Date.now() / 1000),
      chunkProfile: PROFILE,
      sites,
      publishers,
      groups: [...identical, ...candidates.values(), ...declared],
      stats: {
        sites: sites.length,
        publishers: publishers.length,
        uniqueContent: byAggregate.size,
        snapshots: snapshots.length,
        signedEvents: this.one('SELECT count(*) n FROM events').n,
        blobs: this.one('SELECT count(*) n FROM blobs').n,
        storedBytes: this.objectBytes,
        hidden: sites.filter((s) => s.hidden).length,
        jobs,
      },
      discovery: this.all('SELECT * FROM scans').map((r) => ({
        ...r,
        filter: parse(r.filter),
        gaps: parse(r.gaps),
      })),
      similarityLimited,
      unindexed: this.all(
        'SELECT id,kind,error FROM events WHERE manifest IS NULL AND kind NOT IN (10063,10002)',
      ),
      rules,
    };
  }
  verify() {
    let objects = 0,
      blobs = 0,
      events = 0;
    const errors = [];
    for (const row of this.all('SELECT * FROM objects'))
      try {
        const bytes = fs.readFileSync(this.objectPath(row.hash));
        if (bytes.length !== row.size || sha(bytes) !== row.hash) throw Error('corrupt-object');
        objects++;
      } catch (e) {
        errors.push({ hash: row.hash, error: e.message });
      }
    for (const row of this.all('SELECT hash FROM blobs'))
      try {
        this.read(row.hash);
        blobs++;
      } catch (e) {
        errors.push({ hash: row.hash, error: e.message });
      }
    for (const row of this.all('SELECT raw FROM events'))
      try {
        signedEvent(parse(row.raw));
        events++;
      } catch (e) {
        errors.push({ error: e.message });
      }
    return { status: errors.length ? 'failed' : 'verified', objects, blobs, events, errors };
  }
}

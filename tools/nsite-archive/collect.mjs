import fs from 'node:fs';
import path from 'node:path';
import { KINDS, first, tags, sha, resolveURL } from './manifest.mjs';
import { signedEvent } from '../relay-router/validation.mjs';

export const DEFAULTS = {
  maxBytes: 64 * 1024 ** 2,
  maxBlobBytes: 32 * 1024 ** 2,
  maxFiles: 128,
  maxSeconds: 120,
  maxQueries: 64,
  pageSize: 64,
  maxRelays: 32,
  maxServers: 32,
};
export class Collector {
  constructor(archive, network, options = {}) {
    this.archive = archive;
    this.network = network;
    this.options = { ...DEFAULTS, ...options };
    for (const [k, v] of Object.entries(this.options))
      if (k in DEFAULTS && (!Number.isSafeInteger(v) || v < 1)) throw Error(`invalid-limit:${k}`);
  }
  async discover({
    relays = ['wss://relay.nsite.lol', 'wss://relay.damus.io', 'wss://nos.lol'],
    urls = [],
    refresh = false,
  } = {}) {
    const a = this.archive,
      o = this.options,
      start = Date.now(),
      report = { queries: 0, events: 0, invalid: 0, relays: [], errors: [], paused: false };
    const pending = [...new Set(relays.map((r) => this.network.url(r, false)))],
      visited = new Set();
    // Reuse persisted signed source hints even if the previous bounded run
    // stopped before it could visit them.
    for (const row of a.all(
      'SELECT raw FROM events WHERE kind=10002 ORDER BY created DESC,id ASC',
    )) {
      for (const t of tags(JSON.parse(row.raw), 'r'))
        if (!t[2] || t[2] === 'write') {
          try {
            const next = this.network.url(t[1], false);
            if (!pending.includes(next)) pending.push(next);
          } catch {}
        }
    }
    const filters = urls.length ? urls.map(resolveURL) : KINDS.map((kind) => ({ kinds: [kind] }));
    const scanKeys = filters.map((f) => JSON.stringify(f));
    const priority = (relay) =>
      scanKeys.some(
        (key) =>
          !['complete', 'incomplete-gaps'].includes(
            a.one('SELECT status FROM scans WHERE relay=? AND filter=?', relay, key)?.status,
          ),
      )
        ? 0
        : 1;
    pending.sort((x, y) => priority(x) - priority(y));
    const seenAuthors = new Set();
    const query = async (relay, filter, limit = o.pageSize) => {
      if (report.queries >= o.maxQueries || Date.now() - start >= o.maxSeconds * 1000) {
        report.paused = true;
        return null;
      }
      report.queries++;
      return this.network.query(relay, filter, limit);
    };
    while (pending.length && visited.size < o.maxRelays && !report.paused) {
      const relay = pending.shift();
      if (visited.has(relay)) continue;
      visited.add(relay);
      report.relays.push(relay);
      for (const filter of filters) {
        const key = JSON.stringify(filter),
          prior = a.one('SELECT * FROM scans WHERE relay=? AND filter=?', relay, key);
        if (prior?.status === 'complete' && !refresh) continue;
        let cursor = refresh
          ? Math.floor(Date.now() / 1000)
          : (prior?.cursor ?? Math.floor(Date.now() / 1000));
        let gaps = prior ? JSON.parse(prior.gaps) : [],
          status = 'paused';
        while (cursor >= 0 && !report.paused) {
          let result;
          try {
            result = await query(relay, { ...filter, until: cursor });
          } catch (e) {
            report.errors.push({ relay, code: e.code ?? e.message });
            status = 'failed';
            break;
          }
          if (!result) break;
          const valid = [];
          for (const input of result.events) {
            try {
              const e = signedEvent(input);
              if (
                e.created_at > cursor ||
                !filter.kinds.includes(e.kind) ||
                (filter.authors && !filter.authors.includes(e.pubkey))
              )
                continue;
              valid.push(e);
              a.ingest(e, relay, 'relay');
              report.events++;
              seenAuthors.add(e.pubkey);
            } catch (e) {
              if (e.message === 'storage-budget') {
                report.paused = true;
                status = 'storage-budget';
                break;
              }
              report.invalid++;
            }
          }
          if (report.paused) break;
          if (result.status !== 'complete' && result.status !== 'limited') {
            status = result.status;
            break;
          }
          if (valid.length < o.pageSize && result.status === 'complete') {
            status = gaps.length ? 'incomplete-gaps' : 'complete';
            break;
          }
          if (!valid.length) {
            status = 'no-progress';
            break;
          }
          const oldest = Math.min(...valid.map((e) => e.created_at));
          // NIP-01 cannot page by event-id. Probe the boundary second rather
          // than silently dropping events sharing its timestamp.
          let boundary;
          try {
            boundary = await query(relay, { ...filter, since: oldest, until: oldest });
          } catch (e) {
            report.errors.push({ relay, code: e.code ?? e.message });
            status = 'failed';
            break;
          }
          if (!boundary) break;
          for (const e of boundary.events) {
            try {
              a.ingest(e, relay, 'relay');
              seenAuthors.add(e.pubkey);
            } catch (e) {
              if (e.message === 'storage-budget') {
                report.paused = true;
                status = 'storage-budget';
                break;
              }
              report.invalid++;
            }
          }
          if (report.paused) break;
          if (boundary.status !== 'complete' || boundary.events.length >= o.pageSize) {
            if (!gaps.includes(oldest)) gaps.push(oldest);
          }
          cursor = oldest - 1;
          a.run(
            'INSERT OR REPLACE INTO scans VALUES (?,?,?,?,?)',
            relay,
            key,
            cursor,
            'paused',
            JSON.stringify(gaps),
          );
        }
        a.run(
          'INSERT OR REPLACE INTO scans VALUES (?,?,?,?,?)',
          relay,
          key,
          Math.max(0, cursor),
          status,
          JSON.stringify(gaps),
        );
      }
      for (const row of a.all('SELECT DISTINCT pubkey FROM events WHERE manifest IS NOT NULL'))
        seenAuthors.add(row.pubkey);
      for (const pubkey of seenAuthors) {
        for (const kind of [10002, 10063]) {
          const metadataFilter = { kinds: [kind], authors: [pubkey] };
          const metadataKey = JSON.stringify(metadataFilter);
          const cached = a.one(
            'SELECT * FROM scans WHERE relay=? AND filter=?',
            relay,
            metadataKey,
          );
          if (cached?.status === 'complete' && !refresh) continue;
          let result;
          try {
            result = await query(relay, metadataFilter, 1);
          } catch (e) {
            report.errors.push({ relay, code: e.code ?? e.message });
            continue;
          }
          if (!result) break;
          let metadataStored = true;
          for (const input of result.events) {
            try {
              const e = signedEvent(input);
              if (e.kind !== kind || e.pubkey !== pubkey) continue;
              if (kind === 10063) a.addServerList(e, relay);
              else {
                a.ingest(e, relay, 'relay-list');
                for (const t of tags(e, 'r'))
                  if (!t[2] || t[2] === 'write') {
                    try {
                      const next = this.network.url(t[1], false);
                      if (!visited.has(next) && !pending.includes(next)) pending.push(next);
                    } catch {}
                  }
              }
            } catch (error) {
              if (error.message === 'storage-budget') {
                metadataStored = false;
                report.paused = true;
                break;
              }
              report.invalid++;
            }
          }
          // Metadata queries request only the latest event, so a single valid
          // result may legitimately have the transport status `limited`.
          if (metadataStored && ['complete', 'limited'].includes(result.status))
            a.run(
              'INSERT OR REPLACE INTO scans VALUES (?,?,?,?,?)',
              relay,
              metadataKey,
              Math.floor(Date.now() / 1000),
              'complete',
              '[]',
            );
          if (report.paused) break;
        }
        if (report.paused) break;
      }
    }
    report.remainingRelays = pending.length;
    return report;
  }
  async download({ retry = false } = {}) {
    const a = this.archive,
      o = this.options,
      start = Date.now(),
      report = { downloaded: 0, reused: 0, bytes: 0, failures: [], paused: false };
    const jobs = a.all("SELECT * FROM jobs WHERE state!='complete' ORDER BY next_retry,hash");
    let attempts = 0;
    outer: for (const job of jobs) {
      if (a.one('SELECT hash FROM blobs WHERE hash=?', job.hash)) {
        a.read(job.hash);
        a.run("UPDATE jobs SET state='complete',error=NULL WHERE hash=?", job.hash);
        report.reused++;
        continue;
      }
      if (!retry && job.next_retry > Math.floor(Date.now() / 1000)) continue;
      if (
        attempts >= o.maxFiles ||
        report.bytes >= o.maxBytes ||
        Date.now() - start >= o.maxSeconds * 1000
      ) {
        report.paused = true;
        break;
      }
      attempts++;
      let success = false,
        last = 'no-server-hints';
      const origins = a.all(
        'SELECT DISTINCT url FROM origins WHERE hash=? ORDER BY rowid',
        job.hash,
      );
      for (const origin of origins.slice(0, o.maxServers)) {
        if (report.bytes >= o.maxBytes || Date.now() - start >= o.maxSeconds * 1000) {
          report.paused = true;
          break outer;
        }
        let res, part;
        try {
          const base = new URL(this.network.url(origin.url));
          // BUD-01 retrieval is at the server root, never a manifest-supplied path.
          const url = new URL('/' + job.hash, base).href;
          part = path.join(a.home, 'staging', sha(url) + '.part');
          let offset = fs.existsSync(part) ? fs.statSync(part).size : 0;
          if (offset > o.maxBlobBytes) {
            last = 'blob-budget';
            continue;
          }
          res = await this.network.get(url, { start: offset });
          if (res.statusCode === 416 && offset) {
            a.store(fs.readFileSync(part), job.hash);
            fs.unlinkSync(part);
            report.downloaded++;
            success = true;
            break;
          }
          if (![200, 206].includes(res.statusCode)) throw Error(`http-${res.statusCode}`);
          if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')
            throw Error('encoded-response-refused');
          if (res.statusCode === 206) {
            const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers['content-range'] ?? '');
            if (
              !range ||
              Number(range[1]) !== offset ||
              Number(range[2]) < offset ||
              Number(range[3]) > o.maxBlobBytes
            )
              throw Error('invalid-range');
          } else offset = 0;
          const length = Number(res.headers['content-length']);
          if (Number.isFinite(length) && length + offset > o.maxBlobBytes)
            throw Error('blob-budget');
          if (a.diskBytes() + (Number.isFinite(length) ? length : 0) > a.maxStorageBytes)
            throw Error('storage-budget');
          const fd = fs.openSync(part, offset ? 'a' : 'w', 0o600);
          let total = offset;
          try {
            for await (const data of res) {
              if (total + data.length > o.maxBlobBytes) throw Error('blob-budget');
              if (Date.now() - start >= o.maxSeconds * 1000) throw Error('run-budget');
              if (a.diskBytes() + data.length > a.maxStorageBytes) throw Error('storage-budget');
              const allowed = Math.min(data.length, o.maxBytes - report.bytes);
              if (allowed > 0) {
                fs.writeSync(fd, data.subarray(0, allowed));
                total += allowed;
                report.bytes += allowed;
              }
              if (allowed < data.length) throw Error('run-budget');
            }
          } finally {
            fs.closeSync(fd);
          }
          const bytes = fs.readFileSync(part);
          a.store(
            bytes,
            job.hash,
            String(res.headers['content-type'] ?? 'application/octet-stream'),
          );
          fs.unlinkSync(part);
          report.downloaded++;
          success = true;
          break;
        } catch (e) {
          last = e.message;
          res?.destroy();
          if (last === 'blob-hash-mismatch' && part && fs.existsSync(part)) fs.unlinkSync(part);
          if (['run-budget', 'storage-budget'].includes(last)) {
            a.run("UPDATE jobs SET state='paused',error=? WHERE hash=?", last, job.hash);
            report.paused = true;
            break outer;
          }
        } finally {
          res?.destroy();
        }
      }
      if (!success) {
        a.run(
          "UPDATE jobs SET state='failed',attempts=attempts+1,error=?,next_retry=? WHERE hash=?",
          last,
          Math.floor(Date.now() / 1000) + Math.min(3600, 30 * 2 ** Math.min(job.attempts, 7)),
          job.hash,
        );
        report.failures.push({ hash: job.hash, code: last });
      }
    }
    report.remaining = a.one("SELECT count(*) n FROM jobs WHERE state!='complete'").n;
    return report;
  }
}

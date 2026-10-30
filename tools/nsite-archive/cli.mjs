#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { Archive } from './archive.mjs';
import { Network } from './network.mjs';
import { Collector, DEFAULTS } from './collect.mjs';
import { screenshot } from './preview.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const help = `Nsite Archive — complete collection, shared bytes, separate signed history.

node cli.mjs <command> [arguments] [--home DIRECTORY] [--config FILE]

  import EVENTS.json[ l ]   Import signed manifests/metadata (array or NDJSON)
  discover                 Read manifests, author relays and Blossom lists
  download                 Resume queued asset downloads; --retry bypasses backoff
  index                    Extract archived HTML/text, without network or scripts
  sync                     Discover → download → index (bounded; repeat to resume)
  screenshots              Sandbox previews of complete unique revisions
  export DIRECTORY         Write portable JSON, signed NDJSON and offline viewer
  search WORDS             Search page content and published/derived metadata
  diff BEFORE AFTER        Compare snapshots and report changed-chunk reuse
  restore SNAPSHOT DIR     Restore original bytes into a new directory
  verify                   Check all signatures, stored objects and whole files
  filters-import FILE      Explicit reversible filter rules/visibility decisions
  status                   Show counts and remaining work
  serve DIRECTORY          Open an exported directory on localhost (default 8765)

Configuration: {"relays":["wss://…"],"urls":[],"maxBytes":67108864,
"maxBlobBytes":33554432,"maxFiles":128,"maxSeconds":120,"maxStorageBytes":1073741824}
Use --refresh to rescan new relay publications. Completed scans otherwise resume
without repeating. No signer, uploads, public serving or scheduler. Help: README.md
`;
function argsOf(argv) {
  const options = {},
    args = [];
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x.startsWith('--')) {
      const key = x.slice(2);
      if (['retry', 'refresh', 'help'].includes(key)) options[key] = true;
      else {
        if (!argv[i + 1] || argv[i + 1].startsWith('--'))
          throw Error('missing-option-value:' + key);
        options[key] = argv[++i];
      }
    } else args.push(x);
  }
  return { options, args };
}
export function exportTo(archive, destination) {
  if (fs.existsSync(destination)) throw Error('export-destination-exists');
  const payload = archive.export();
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(path.join(here, 'web'), destination, { recursive: true });
  fs.writeFileSync(path.join(destination, 'directory.json'), JSON.stringify(payload));
  fs.writeFileSync(
    path.join(destination, 'events.ndjson'),
    archive
      .all('SELECT raw FROM events ORDER BY created,id')
      .map((r) => r.raw)
      .join('\n') + '\n',
  );
  fs.mkdirSync(path.join(destination, 'previews'));
  for (const row of archive.all("SELECT hash FROM previews WHERE status='complete'")) {
    const source = path.join(archive.home, 'previews', row.hash + '.png');
    if (fs.existsSync(source))
      fs.copyFileSync(source, path.join(destination, 'previews', row.hash + '.png'));
  }
  return { directory: path.resolve(destination), stats: payload.stats };
}
export function serve(directory, port = 8765) {
  const root = path.resolve(directory);
  if (!fs.existsSync(path.join(root, 'index.html'))) throw Error('export-directory-required');
  const server = http.createServer((req, res) => {
    const host = req.headers.host;
    if (
      !['127.0.0.1:' + server.address().port, 'localhost:' + server.address().port].includes(
        host,
      ) ||
      req.method !== 'GET'
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    let target;
    try {
      const url = new URL(req.url, 'http://' + host),
        p = decodeURIComponent(url.pathname);
      if (p.includes('..') || p.includes('\\')) throw Error();
      target = path.join(root, p === '/' ? 'index.html' : p);
      if (
        !['index.html', 'app.js', 'style.css', 'directory.json', 'events.ndjson'].includes(
          path.relative(root, target),
        ) &&
        !/^previews\/[0-9a-f]{64}\.png$/.test(path.relative(root, target))
      )
        throw Error();
    } catch {
      res.writeHead(404);
      res.end();
      return;
    }
    if (!fs.existsSync(target)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type':
        {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.ndjson': 'application/x-ndjson',
          '.png': 'image/png',
        }[path.extname(target)] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'",
      'Referrer-Policy': 'no-referrer',
    });
    fs.createReadStream(target).pipe(res);
  });
  server.listen(port, '127.0.0.1', () =>
    console.log(`Open http://127.0.0.1:${server.address().port}`),
  );
  return server;
}
async function previews(archive, config, print) {
  let count = 0;
  const seen = new Set();
  for (const snapshot of archive.snapshots()) {
    if (seen.has(snapshot.aggregate)) continue;
    seen.add(snapshot.aggregate);
    const result = await screenshot(archive, snapshot);
    if (result.status === 'cached') continue;
    print({ snapshot: snapshot.id, ...result });
    if (
      [
        'browser-not-installed',
        'browser-sandbox-unavailable',
        'preview-failed',
        'storage-budget',
      ].includes(result.code)
    )
      break;
    if (result.status === 'complete' && ++count >= (config.maxPreviews ?? 16)) break;
  }
}
async function main() {
  const { options, args } = argsOf(process.argv.slice(2)),
    [cmd, ...rest] = args;
  if (!cmd || options.help || cmd === 'help') {
    console.log(help);
    return;
  }
  const config = options.config ? JSON.parse(fs.readFileSync(options.config, 'utf8')) : {};
  if (cmd === 'serve') {
    serve(rest[0] ?? '', Number(options.port ?? 8765));
    return;
  }
  const home =
    options.home ??
    config.home ??
    path.join(os.homedir(), '.local', 'share', 'pretend-internet', 'nsite-archive');
  const archive = new Archive(home, { maxStorageBytes: config.maxStorageBytes });
  const print = (x) => console.log(JSON.stringify(x, null, 2));
  try {
    const collector = new Collector(
      archive,
      new Network({ timeout: config.timeout ?? 10000 }),
      Object.fromEntries(Object.entries(config).filter(([k]) => k in DEFAULTS)),
    );
    if (cmd === 'import') {
      if (!rest[0]) throw Error('events-file-required');
      const content = fs.readFileSync(rest[0], 'utf8').trim();
      const events = content.startsWith('[')
        ? JSON.parse(content)
        : content.split(/\r?\n/).filter(Boolean).map(JSON.parse);
      let accepted = 0,
        rejected = 0;
      for (const event of events)
        try {
          if (event.kind === 10063) archive.addServerList(event, 'local-import');
          else archive.ingest(event);
          accepted++;
        } catch {
          rejected++;
        }
      print({ accepted, rejected });
    } else if (cmd === 'discover')
      print(await collector.discover({ ...config, refresh: options.refresh }));
    else if (cmd === 'download') print(await collector.download({ retry: options.retry }));
    else if (cmd === 'index') print(archive.index());
    else if (cmd === 'sync') {
      print({ discovery: await collector.discover({ ...config, refresh: options.refresh }) });
      print({ download: await collector.download({ retry: options.retry }) });
      print({ index: archive.index() });
      if (config.previews !== false) await previews(archive, config, print);
    } else if (cmd === 'screenshots') await previews(archive, config, print);
    else if (cmd === 'export') {
      if (!rest[0]) throw Error('export-directory-required');
      print(exportTo(archive, rest[0]));
    } else if (cmd === 'status') print(archive.export().stats);
    else if (cmd === 'search') {
      const query = rest.join(' ').toLowerCase();
      if (!query) throw Error('query-required');
      const data = archive.export();
      print(
        data.sites
          .filter((s) => !s.hidden)
          .flatMap((s) => {
            const pages = s.pages.filter((p) =>
              (p.title + ' ' + p.text + ' ' + p.path).toLowerCase().includes(query),
            );
            return pages.length ||
              JSON.stringify([s.published, s.derived]).toLowerCase().includes(query)
              ? [
                  {
                    site: s.site,
                    title: s.published.title || s.derived.title,
                    url: s.url,
                    pages: pages.map((p) => ({
                      path: p.path,
                      title: p.title,
                      excerpt: p.text.slice(
                        Math.max(0, p.text.toLowerCase().indexOf(query) - 80),
                        p.text.toLowerCase().indexOf(query) + query.length + 180,
                      ),
                    })),
                  },
                ]
              : [];
          }),
      );
    } else if (cmd === 'diff') print(archive.diff(rest[0], rest[1]));
    else if (cmd === 'restore') {
      if (!rest[1]) throw Error('restore-destination-required');
      print(archive.restore(rest[0], rest[1]));
    } else if (cmd === 'verify') {
      const result = archive.verify();
      print(result);
      if (result.status !== 'verified') process.exitCode = 1;
    } else if (cmd === 'filters-import') {
      const data = JSON.parse(fs.readFileSync(rest[0], 'utf8'));
      for (const rule of data.rules ?? []) archive.setRule(rule);
      for (const d of data.decisions ?? []) {
        if (typeof d.site !== 'string' || typeof d.visible !== 'boolean')
          throw Error('invalid-filter-decision');
        archive.run('INSERT OR REPLACE INTO decisions VALUES (?,?)', d.site, Number(d.visible));
      }
      print({ rules: data.rules?.length ?? 0, decisions: data.decisions?.length ?? 0 });
    } else throw Error('unknown-command:' + cmd);
  } finally {
    archive.close();
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });

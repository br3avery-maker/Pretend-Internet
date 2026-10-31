# Nsite Archive — browser repair 0.2.1

Repair for [issue #17](https://github.com/br3avery-maker/Pretend-Internet/issues/17). A standalone, buildless browser application recovered from the supplied Android APK. The existing Node archive under `tools/nsite-archive` is preserved.

The Library opens publications; each publication has its own files, reading screen, version history and comparison screen. Publishers groups useful sites by author and site count. Collection, resource settings, backup and Help are separate routes. Mobile navigation uses a drawer. Browser Back and explicit parent links retain route/search state. Confirmed campaign signatures are excluded from ordinary browsing, search, publisher counts, related content and lightweight exports; full backups preserve existing raw records.

## Run and package

Serve this directory with a static HTTP server, for example `python3 -m http.server 8000`. Open `http://localhost:8000`. No npm install, external CDN, account, paid service or framework is needed. ES modules, workers and IndexedDB require a supported browser/WebView origin; do not open the entry directly as a `file:` URL.

`sh build.sh` copies only runtime files into `dist/`. WebToApp GitHub frontend import can use sub-path `apps/nsite-archive`, command `npm run build`, output `dist`. The ready-to-import ZIP has `index.html` at its root and all relative assets. No prepopulated archive or test harness is shipped in it.

The original supplied APK is unchanged. This source repair is **not an installed APK release**. Updating that APK requires its original Android project/signing key (or the existing WebToApp project's normal rebuild/export path); do not uninstall a data-bearing app to bypass a signature mismatch. Preserve a full backup before changing origins or package identity.

## Data and recovery

The existing `nsite-archive-v1` IndexedDB database, schema version 5, original signed records and full archive format `pretend-internet.browser-archive.v1` are retained. Existing relay/server/proxy preferences are carried forward. No migration deletes data. The updated service-worker shell cache has a new version; archive storage is separate from that cache.

Long operations run in workers. Collection Pause terminates the collection worker; IndexedDB aborts an in-flight transaction, while committed files/staging and pending jobs survive. Resume retries pending work. A Cancel operation control can stop other expensive tasks. Imports validate signatures and native hashes; full-backup import merges records transactionally. Retention, origin quotas and CORS limitations remain visible in Help.

The lightweight directory export uses `nsite-archive.browser-directory.v2`: filtered site summaries, latest files/pages, compact history descriptors, original allowed events and source associations. It does not contain archive bytes and does not claim v1 static-viewer compatibility. The full v1 backup is the lossless restoration format.

## Source and tests

- `app.js`: independently navigable application screens and state.
- `model.js`: indexed, bounded catalog and selected-site legacy reconstruction.
- `archive-worker.js`: storage, verification, imports, exports, search and restoration.
- `collect-worker.js`: bounded discovery and resumable collection supervisor.
- `vendor/`: recovered engines with readable exported API names; see [RECOVERY.md](RECOVERY.md).
- `test/`: deterministic fixtures, model regressions and executable browser integrity tests.

Run `node --test test/model.test.mjs`. For browser checks, run `node test/prepare-browser.mjs`, serve the directory and open `test/browser.html` and `test/ui-regression.html` **on a disposable test origin**. It deliberately seeds that origin's archive and checks real IndexedDB, signature/hash rejection, version comparison, ZIP generation, full-backup restoration into a fresh database and local pending-job collection. Test fixtures are excluded from runtime packaging.

See [VERIFICATION.md](VERIFICATION.md) for tested boundaries. No public crawl, deployment, publication, recurring job or new hosted dependency was introduced.

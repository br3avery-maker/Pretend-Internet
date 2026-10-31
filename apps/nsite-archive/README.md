# Nsite Archive — archive workflow repair 0.3.0

Repair for [issue #17](https://github.com/br3avery-maker/Pretend-Internet/issues/17). A standalone, buildless browser application recovered from the supplied Android APK. The existing Node archive under `tools/nsite-archive` is preserved.

The Directory shows complete declared-file publications and stacks exact-content deployments across publishers; each publication has its own files, reading screen, version history and comparison screen. Publishers groups useful sites by author and site count. Library, Publishers, publication details, reading, history, comparison, collection, backup and Help and the saved visual viewer are ten separate HTML documents with ordinary links and individual page controllers. The prior hash router and shared screen renderer have been removed. Mobile navigation uses a drawer. Browser Back and explicit parent links retain route/search state. Confirmed campaign signatures are excluded from ordinary browsing, search, publisher counts, related content and lightweight exports; full backups preserve existing raw records.

## Run and package

Serve this directory with a static HTTP server, for example `python3 -m http.server 8000`. Open `http://localhost:8000`. No npm install, external CDN, account, paid service or framework is needed. ES modules, workers and IndexedDB require a supported browser/WebView origin; do not open the entry directly as a `file:` URL.

`sh build.sh` copies only runtime files into `dist/`. WebToApp GitHub frontend import can use sub-path `apps/nsite-archive`, command `npm run build`, output `dist`. The ready-to-import ZIP has `index.html` at its root and all relative assets. No prepopulated archive or test harness is shipped in it.

The original supplied APK is unchanged. This source repair is **not an installed APK release**. Updating that APK requires its original Android project/signing key (or the existing WebToApp project's normal rebuild/export path); do not uninstall a data-bearing app to bypass a signature mismatch. Preserve a full backup before changing origins or package identity.

## Data and recovery

The existing `nsite-archive-v1` IndexedDB database, schema version 5, original signed records and full archive format `pretend-internet.browser-archive.v1` are retained. Existing relay/server/proxy preferences are carried forward. No migration deletes data. The updated service-worker shell cache has a new version; archive storage is separate from that cache.

Long operations run in workers. Collection intent, retry times and partial responses are durable in the existing phone-local database. Each document automatically resumes a dedicated worker from durable intent and partial-file checkpoints; page navigation never requires another manual Start. The service worker caches the application shell only. Worker lifetime is not a promise of mobile OS background execution. There is no automatic browser permission or remote storage account requirement. User-selected total byte/file limits pause collection; normal batch boundaries do not require manual restarts. HTTP Range, whole-file verification, timeouts and backoff preserve useful progress. Readable pages are indexed before choosing more assets, so content-based campaign exclusions apply early.

Indexing reads the page body, headings and metadata, derives missing titles and descriptions, and retains keyword/language evidence. Existing indexed pages are upgraded without deleting original bytes. Indexing failures are durable and retryable per item; files above 4 MiB are retained but not parsed automatically on a phone. Previews render sanitized archived HTML and verified local CSS/images into cached PNG screenshots; they are not Open Graph substitutes. Rendering disables scripts, credentials and outside requests and has an 8 MiB resource budget. The saved-site viewer uses an opaque sandbox. JavaScript-only sites may need the restored ZIP/original host to execute; the stored scripts remain in the full archive. Previews and derived text do not establish preservation of undeclared external dependencies.

Directory entries carry previews, descriptions, publishers, versions and inferred topics. Downloads contains incomplete items, current path/server/byte progress and per-site Download/Retry/Index actions. Publication details also offer per-file download and indexing controls, readable errors, version history and verified restoration. Backup reports local capacity, requests browser persistence and exports full portable bytes. No archived data or old signed history is removed. Application, navigation and action icons are included. The supplied app icon artwork was generated previously in this task and reused, not regenerated.

Imports validate signatures and native hashes; full-backup import merges records transactionally and pauses imported collection intent. A Cancel operation control stops its page worker; committed records remain. Browser Back and explicit parent links retain query and scroll state.

The lightweight directory export uses `nsite-archive.browser-directory.v2`: filtered site summaries, latest files/pages, compact history descriptors, original allowed events and source associations. It does not contain archive bytes and does not claim v1 static-viewer compatibility. The full v1 backup is the lossless restoration format.

## Source and tests

- Ten root HTML files and `pages/*.js`: one document/controller per application page.
- `ui.js`: shared navigation, links, error display and scroll restoration; no screen router.
- `archive-client.js`: worker requests, progress/cancellation and file operations.
- `collection.js`: collection controls and durable pause/resume lifecycle.
- `model.js`: indexed, bounded catalog and selected-site legacy reconstruction.
- `archive-worker.js`: storage, verification, imports, exports, search and restoration.
- `collector.js`, `collect-worker.js`, `sw.js`: durable download scheduler, checkpointed transfer and worker transports.
- `indexer.js`: content-derived metadata and campaign evidence.
- `safe-page.js`, `screenshot.js`, `previews.js`: sandboxed static rendering and cached PNG captures.
- `vendor/`: recovered engines with readable exported API names; see [RECOVERY.md](RECOVERY.md).
- `test/`: deterministic fixtures, model regressions and executable browser integrity tests.

Run `npm test` (13 regressions). For browser checks, run `node test/prepare-browser.mjs`, serve the directory and open `test/browser.html` and `test/pipeline.html` **on a disposable test origin**. It deliberately seeds that origin's archive and checks real IndexedDB, signature/hash rejection, version comparison, ZIP generation, full-backup restoration into a fresh database and local pending-job collection. Test fixtures are excluded from runtime packaging.

See [VERIFICATION.md](VERIFICATION.md) for tested boundaries. No public crawl, deployment, publication, recurring job or new hosted dependency was introduced.

## Application documents

| File | Purpose |
| --- | --- |
| `index.html` | Complete-site directory, stacks, search and sorting |
| `publishers.html` | Publisher groups and counts |
| `site.html` | Selected publication, files and restoration |
| `page.html` | Read archived page text |
| `history.html` | Selected publication's versions |
| `compare.html` | Compare selected versions |
| `collect.html` | Current download, incomplete queue, retry/index actions and secondary settings |
| `view.html` | Isolated visual view of saved HTML/CSS/images |
| `backup.html` | Full export/import and storage controls |
| `help.html` | Static, independently readable Help |

Every link loads its target document. Site/version/path/query state travels in ordinary URL query parameters. The package contains all ten documents and their controllers; the previous `app.js` is excluded.

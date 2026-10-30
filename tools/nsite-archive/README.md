# Nsite Archive

Complete nsite collection with content deduplication, signed publication history, content search and version diffs. Implements the build requested for [Pretend Internet #14](https://github.com/br3avery-maker/Pretend-Internet/issues/14). Independently runnable local worker and static directory viewer; the repository launcher and existing apps are unchanged.

**Status: testing.** See [verification](VERIFICATION.md) for executed checks and remaining environment limitations. No public crawler, hosted backend, signer, upload, recurring job or deployment is started by installing this tool.

## Run

Node **22.13 or later** (SQLite is built in), npm, and a writable local directory. Install the existing read-side relay component and this worker from the repository root:

```sh
npm ci --prefix tools/relay-router --ignore-scripts
npm ci --prefix tools/nsite-archive --ignore-scripts
cd tools/nsite-archive
node cli.mjs help
node cli.mjs sync
node cli.mjs status
node cli.mjs export ./collection-001
node cli.mjs serve ./collection-001
```

Open **http://127.0.0.1:8765**. Search actual page text, expand publishers to browse their namespaces, open site details and compare versions, or browse exact-content groups, declared families and probable clones. Sort and filters are secondary controls. The default interface is black `#000000`, deep pink `#FF1493`, white and pale pink.

Export directories must be new so an older export remains recoverable. For offline viewing, open the exported `index.html` and import its `directory.json`; keep `previews/`, `app.js` and `style.css` alongside it. The viewer has no runtime dependency on the worker, a server, a framework, an account or a signer. An export is suitable for hosting as a static nsite, but no publishing is performed here.

The archive defaults to `~/.local/share/pretend-internet/nsite-archive`. Set `--home /path/to/archive` on any command to keep it on an external drive or another writable volume. The viewer holds imported data in memory and never uploads it.

### What a sync does

1. Query complete manifests from configured bootstrap relays, discover author publication relays from signed NIP-65 lists, and find Blossom hints from manifests and signed BUD-03 server lists. Supports root **15128**, named **35128**, immutable **5128**, and legacy per-file **34128** events. Input URLs may resolve a particular root, namespace or snapshot.
2. Preserve each original signed event and its discovery sources. Modern manifests become immutable path/hash snapshots. Legacy file events become **explicitly reconstructed** observed trees, retaining individual signatures and events. Signed malformed manifests remain quarantined with their errors.
3. Queue **every referenced hash**. Reuse verified whole files before network transfer. Retrieve missing files from ordered hints, fall back after failures, hash-verify complete bytes, split them at Gear content-defined boundaries and store only unique chunks and Hashtree nodes. Temporary partial files resume through HTTP Range when supported.
4. Extract HTML/text **after archival**. Cache per file hash/path/extractor version. Keep author metadata separate from derived titles/descriptions, headings, text, declared language, subject candidates, metadata and links.
5. Attempt cached, sandboxed screenshots of complete revisions (set `previews: false` to opt out); missing browser/sandbox is reported without stopping text indexing.
6. Produce a directory retaining all namespaces, identities, snapshots, partial failures and relationships. Nothing is pruned from ingest because a site has missing metadata, is prolific, is filtered, or resembles another site.

Run `sync` again to resume. After a scan completes, use `sync --refresh` to discover later publications. Default bootstraps are replaceable discovery starting points; they do not establish exhaustive ecosystem coverage or current reachability.

### Configuration and resource controls

```json
{
  "relays": ["wss://relay.nsite.lol", "wss://relay.damus.io", "wss://nos.lol"],
  "urls": [],
  "maxBytes": 67108864,
  "maxBlobBytes": 33554432,
  "maxFiles": 128,
  "maxStorageBytes": 1073741824,
  "maxSeconds": 120,
  "maxQueries": 64,
  "pageSize": 64,
  "maxRelays": 32,
  "maxServers": 32,
  "maxPreviews": 16
}
```

Save as a local config file and append `--config config.json` to commands. Limits pause collection or retain failed jobs; they are **not site-selection rules**. Increase limits for oversized files or larger collections. Failed downloads back off up to an hour; `download --retry` bypasses backoff. Transfers are sequential for predictable resource use. Byte budgets cap bytes written during that run; at most one received HTTP frame can be discarded at the boundary. Disk limits include indexed object bytes, partial downloads, previews and SQLite/WAL files; SQLite bookkeeping may briefly exceed a budget by its page allocation overhead.

Relay queries are bounded by deadlines, response bytes, frame counts and signature/filter checks in the existing relay transport. NIP-01 pagination cannot enumerate an arbitrarily large same-timestamp set on a relay that caps responses. Such seconds remain explicit **coverage gaps**, while collection continues into older history. Re-run `--refresh` against other sources or a relay permitting larger queries; never interpret a scan cursor as proof that unavailable history was collected.

The worker accepts HTTPS/WSS public destinations, checks **all DNS answers**, and pins a checked address to each connection. Local/private/CGNAT/metadata destinations are rejected; redirect targets are rechecked, bounded to three hops, and must retain the blob hash. HTTP content encoding is refused for verifiable byte-range resumption. Test-only local access is available programmatically, not as a CLI toggle. No auth-required destination is signed into or paid automatically. Local worker operation uses direct Node HTTP/WebSocket sockets; proxy-only hosts must provide compatible network access rather than assuming the browser's proxy settings apply.

### Import, diff and restore

```sh
node cli.mjs import signed-events.ndjson
node cli.mjs download
node cli.mjs index
node cli.mjs search observatory
node cli.mjs diff BEFORE_SNAPSHOT_ID AFTER_SNAPSHOT_ID
node cli.mjs restore SNAPSHOT_ID ./restored-site
node cli.mjs verify
```

Import accepts a JSON array or one signed event per line. No signature bypass. `diff` reports added/removed/changed paths and byte reuse from identical chunks. Restore verifies native whole-file hashes before creating a **new** directory; it refuses existing destinations. Restored site code remains ordinary untrusted site code; the tool does not execute it. For a complete portable archive, stop the worker and copy its entire home directory (database, objects, previews and staging); the static export contains the searchable index and signed events, **not all site bytes**.

### Screenshots

```sh
npx playwright install chromium
node cli.mjs screenshots
node cli.mjs export ./collection-with-previews
```

Requires Playwright's browser and a **non-root host supporting Chromium's OS sandbox**. The worker never disables that sandbox. Each preview uses a fresh context with JavaScript disabled, service workers blocked, no permissions/credentials/signer, downloads disabled, strict CSP, sanitized HTML, archived-only request fulfillment, 128-request/32-MiB/15-second limits and a fixed 390×844 viewport. Missing assets, browser, or sandbox produce explicit unavailable/failed previews. CSS, raster images and fonts can load only from the same archived revision. Dynamic-only apps may therefore have little useful visible content; they are still archived, and source text extraction remains separate. Preview SVG resources are refused.

Screenshots are cached by aggregate hash plus renderer profile and dimensions, across authors. They represent the **safe static rendering**, not proof that a site's scripts function. The archive worker does not ask your everyday signed-in browser to execute archived applications.

### Filtering and relationships

No universal spam blacklist is shipped from a directory-snapshot anecdote. Import explicit explainable campaign rules when their full evidence is available:

```json
{
  "rules": [{
    "id": "reviewed-campaign",
    "type": "description-template",
    "prefix": "A reviewed promotional description prefix",
    "requiredTerms": ["gambling", "bonus"],
    "reason": "Reviewed promotional template plus both required markers",
    "enabled": true
  }],
  "decisions": []
}
```

Apply with `filters-import rules.json`. A rule requires a substantial literal prefix and at least two markers; exact-content aggregate rules are also supported. Disable a rule with `enabled: false`, or explicitly override a site with `{ "site": "35128:HEX:NAME", "visible": true }`. Re-export to update the static viewer. “Show filtered” always reveals hidden rows. No filter deletes archived bytes or unsignedly reassigns identity.

Exact equality groups use the native NIP-5A aggregate. Declared parent/origin links are authenticated **claims**, never independently verified lineage. Probable clones require high file-hash Jaccard similarity and stay labelled uncertain. Candidate comparison is capped independently of ingest and reports saturation. Distinct sites remain individually browsable in every group. Publisher counts are namespace counts, with snapshots and unique content counted separately.

### Portability and schemas

- `archive.sqlite`: events, sources, origins, resumable jobs, scan cursors/gaps, native blob descriptors, extraction cache and reversible rules.
- `objects/<prefix>/<sha256>`: unique plaintext chunks and canonical Hashtree MessagePack nodes. Native file hash → ordered chunk descriptor; no second full-file copy after ingest.
- `staging/`: resumable public transfer fragments; not counted as verified files.
- `previews/`: sanitized PNG previews, separate from native site assets.
- `directory.json`: versioned **`nsite-archive.v1`** portable index, with `sites`, `publishers`, `groups`, `stats`, `discovery`, `rules`, and `unindexed` records. Per-page evidence includes native file hash and extractor. Per-version files include native hashes, availability, internal roots and ordered chunk descriptors.
- `events.ndjson`: original protocol fields, IDs and signatures, with no rewritten manifestations. Importable back into this worker or another verifier.

Other clients can consume JSON/NDJSON without adopting this runtime. Crawlstr/SIP-01 publication is **not** inferred from an archive observation; a protocol-specific adapter would need its own explicit publication operation. No automatic adapter publishing, gateway rewriting, or existing-directory redesign is included.

## Tests and dependencies

```sh
npm test
npm run test:browser
npm run test:sandbox
```

Unit and real loopback network tests cover signature/hash failures, pre-dedup/provenance, modern/legacy/snapshot histories, same-second coverage gaps, resume, fallback, untitled indexing, CDC insertion reuse, Hashtree decoding, corruption, exact restoration, filters and screenshot isolation. Browser tests exercise the actual directory at 320/390/844px and 200% text, version comparisons, Back and file import. The strict sandbox test must run on a supported host and requires a real PNG with an untouched external-request canary.

Reuse: existing `tools/relay-router` signature validation and finite relay query transport (it does not publish here); **@hashtree/core 0.3.2** (MIT), **parse5 8.0.0** (MIT), **ws 8.22.0** (MIT), and development-only **@playwright/test 1.56.1** (Apache-2.0). Router dependency **nostr-tools 2.25.2** is Unlicense. Exact dependency trees and integrity hashes are committed in the lockfiles. No donor application or private Library content is bundled. See [research and design](RESEARCH.md).

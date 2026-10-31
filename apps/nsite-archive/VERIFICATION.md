# Verification — archive workflow repair 0.3.0

## Current executed evidence (2026-10-31)

- Node 24: 13 browser-model/document/content/sanitization regressions pass, including directory readiness gating and exact-content stacking across separate signed publishers. All runtime JS syntax checks and the POSIX build pass.
- Existing untouched Node archive and relay-router suites: 68/68 tests pass after installing their pinned lockfile dependencies locally. The application itself remains buildless and dependency-free at runtime.
- Actual cloud Chrome on the managed HTTP preview: browser pipeline checks pass for content-derived untitled search, confirmed campaign exclusion, path/byte/verification progress, interrupted stream staging, Range resume and native hash parity, real PNG capture of sanitized archived HTML, full backup import into an independently named fresh database, and manual download/index controls in separate documents.
- Actual collector HTTP fixture on the disposable origin: leave Downloads for Publishers while a durable selected queue is active; the next document resumes collection automatically, verifies the real HTTP bytes, and finishes without another manual Start. Directory reflow passes at 320/390/844 CSS pixels and 16/32px text.
- Bounded live read-side verification: relay.nsite.lol returned current signed root manifests. A five-file publication `15128:7055f2f217d2e59c02bce810a727ee902c21df2ca28d642ba09735f28f30f2c2:` was retrieved directly from `https://nostr.download`, streamed, verified and indexed. All 5/5 declared files completed: `/.well-known/nostr.json`, `/404.html`, `/index.html`, `/ledger/index.html`, `/scorecard/index.html`. The genuine page was searchable in the curated directory, its archived HTML was captured as a PNG, and a full archive was imported into a new database; every restored file reproduced its native SHA-256. No proxy, account, signer or publication was used.
- A separate Hoardstr manifest was correctly rejected for an aggregate mismatch. Its claimed aggregate was `6cbf340b8a11eba70a320475fe63da346ced280e03ed1e71fd1d840bdb8a2768`; the required sorted hash/path line calculation produced `43dad69cfd0e57725900c81226cbd32119d148240d0325b816932ae44bed1ee8`. Checked against current NIP-5A: https://github.com/nostr-protocol/nips/blob/master/5A.md#aggregate-hash . Validation was not weakened to make a live test pass.
- Insecure-origin compatibility: relay subscription IDs no longer require secure-context-only `crypto.randomUUID`; cryptographic random bytes produce the subscription identifier. The native signature/hash/chunk/Merkle algorithms are unchanged.

## Remaining target boundaries

The managed preview is HTTP and not a secure context: actual cross-document **dedicated-worker fallback** was verified; service-worker offline startup needs a secure-origin runtime test. Collection uses the verified automatic dedicated-worker resume path on all origins. No installed Android runtime/signing project is attached, and the supplied APK is unchanged. Android picker/download bridge/system Back, OS suspension, real quota exhaustion and multi-tab fault injection remain separate field checks. Do not infer them from the passing browser checks. Static previews disable source scripts and external dependencies; they do not promise arbitrary JavaScript applications run offline.

The delivered ZIP must contain all ten HTML documents, ten controllers, worker/index/render modules, icon/manifest and vendored engines; exclude fixtures, development harnesses and old app.js. Keep issue #17 open for target verification and user acceptance. No public deployment, publishing or recurring job was performed.

---

## Historical 0.2.2 evidence — does not establish product acceptance



## Executed

- Node 24.22.1: ten model/crypto/ZIP/document regressions pass. A 10,000-event legacy catalog built in approximately 28–33 ms in this executor; listing returns bounded rows rather than every reconstructed tree. This is an isolated catalog measurement, not a phone benchmark.
- JavaScript syntax checks pass; dependency-free POSIX build produces a complete relative-asset tree.
- Actual cloud Chrome against the local Sites preview service: real IndexedDB/worker imports of nine deterministic signed publications; all six confirmed campaign fixtures excluded from ordinary results; untitled text search; two-version history; native path comparison; verified ZIP bytes; full backup imported into an independently named fresh IndexedDB database; every restored file's native SHA-256 matches; corrupt backup rejected before commit with prior events intact; altered signed event rejected; a single pretty-printed signed event imports; bounded collection worker processes local pending jobs without external requests.
- Ordinary interface walkthrough in a 390px iframe: search Saturn -> open publication -> read archived page text -> Back -> history -> compare changed/added files -> drawer -> separate Collect screen. Search terms remain in the return route; no collector/backup/help sections occupy the reading/library screen.
- Reflow inspected at 320, 390 and 844 CSS px with 16px and 32px root text. Initial overflow at 320/844px with enlarged text was corrected; all six final checks pass. Actual phone-width interface was visually inspected.

- Review regressions executed against the actual application: a local signed-event collector fixture completes while the user stays on Collect; Library then shows its new publication without reloading. A 512-event file import emits progress while Cancel remains available; cancelling terminates the worker and restores controls. ZIP central-directory and decompressed-byte checks preserve `__proto__`, `constructor`, `toString`, nested prototype names and Unicode filenames.

## Limits

- The fixture import handler and backup engine were exercised with browser `File` objects. The cloud browser could not access the executor's local file-picker path; OS file selection/Android download bridge remains unverified.
- Live relay discovery, live Blossom/CORS/proxy behavior, gateway hosting, secure-origin service-worker offline startup, real quota exhaustion, suspension and multi-tab recovery were not field-tested in this repair. Existing mechanisms are preserved; local deterministic checks do not establish those claims.
- No installed Android runtime is attached, no original Android project/signing key was provided, and the supplied APK is not modified. No installed APK, user approval, public deployment or publication is claimed. Issue #17 remains open for installed-device verification and remaining field evidence.
- Browser history Back/Escape semantics are implemented; Android system Back requires the existing wrapper to forward WebView history. This repair has not inspected or changed that native wrapper.

Runtime packaging excludes all test fixtures. Source provenance and source-asset hashes are recorded separately in `recovery.json`.

## Multi-page correction — executed on 0.2.2

- Nine independently loadable HTML files and nine dedicated controller modules. Build tests check each document, its entry module, normal links and absence of the old renderer.
- Actual browser walkthrough at 390 CSS px loads `index.html?q=Saturn` → `site.html?site=…` → `page.html?site=…&version=…&path=…` → Back → `history.html` → `compare.html`. The drawer then loads `publishers.html`; browser Back restores the comparison document and its query state.
- Browser document-navigation regression observes distinct `Document` objects when leaving Collect for Library, confirms newly collected signed publications appear, verifies progress/Cancel during a 512-event file import, opens static Help as another document and confirms selected collection URLs survive leaving and returning. Local deterministic collection transport is used; no public crawl is started.
- Archive engine, database schema/name, original event/hash handling, signature validation, confirmed campaign exclusion and prototype-safe ZIP logic are preserved from the verified prior repair. Native APK and live-network verification limits above still apply.

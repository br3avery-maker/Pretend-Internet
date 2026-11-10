# Verification — archive workflow repair 0.3.0

## Current executed evidence — port onto current `main` (2026-11-10)

This 0.3.0 workflow was originally opened as PR #20 against `c7e787a` and was unmergeable for weeks. It is now re-derived on current `main` (keeping main's clean-`dist` build and its build regression). Evidence below is from re-running the ported code on that base, not carried over from the stale branch.

- Node 26.13.0: **14/14 regressions pass** (`npm test`): model/crypto/ZIP, ten-document/build membership, content-derived indexing, directory readiness gating and exact-content stacking, and static-render sanitization. All runtime JS passes `node --check`; the POSIX build produces exactly the declared runtime asset set.
- Actual cloud Chrome against this app's HTTPS preview origin, `test/pipeline.html` "Run archive pipeline checks": **13 PASS and `ALL PIPELINE CHECKS PASSED`** — atomic progress counters, untitled-publication text search, confirmed-campaign exclusion, verification progress, interrupted-stream staging, Range resume with native-hash parity, real PNG capture, full-backup restore into a new database, directory previews with recovered names, the separate Downloads queue with current-file progress, per-site download/index controls, and `view.html` opening archived HTML in an opaque, script-free sandbox.
- `view.html` initially failed with `Cannot read properties of null (reading 'sites')`. Cause: read handlers used the worker's shared, write-invalidated catalog after `await`. Fixed by taking one catalog snapshot per handler and never touching the shared value after an await (`archive-worker.js`). The pipeline check above is the regression evidence; it now passes from a clean database.
- Automatic cross-document resume, measured directly: with a durable collection intent armed and the harness page untouched, opening `collect.html` raised the pending fixture jobs' attempts from 0 to 1, and opening `publishers.html` (a different document) raised them again from 1 to 2 with no Start press; the UI reported automatic retry. The transfer itself returned `http-403` **because this preview origin requires the owner's sign-in cookie and the collector deliberately fetches with `credentials:'omit'`**; the byte-level HTTP resume leg is therefore unverified on this origin and is not claimed as passing here.
- Reflow inspected in-page at 320/390/844 CSS px with 16px and 32px root text: no horizontal overflow in any of the six combinations.
- Bounded live read-side verification from this build: `wss://relay.nsite.lol` returned 32 signed events; publication `15128:aadb2623419a00d50b1b6ce3bf5e944fa6616591463bdc785bf332668959207c:` (30 declared files) was downloaded from `https://blossom.ditto.pub`, every file verified against its native hash, indexed, captured as a PNG, and restored byte-identically after a full backup import (`ALL LIVE END-TO-END CHECKS PASSED`). No proxy, account, signer or publication was used.

The app icon shipped with this change is the previously generated artwork, downscaled to 512x512 (163 KB) with the same proportions and palette to avoid committing an 873 KB binary; `manifest.webmanifest` and the document test read the real PNG dimensions.

## Campaign-signature precision (2026-11-10)

The merged port excluded any description that merely opened with one of the five confirmed role phrases — the same false-positive behaviour the APK inspection recorded (2,008 prefix matches vs 2,004 template matches on the supplied corpus, with four `prefix_only` entries deliberately retained). The issue's blocking correction requires the confirmed promotional fingerprint to be the exclusion condition and undecided near misses to stay visible.

`campaign.js` now requires all three documented signals before a site is excluded: the role-phrase opener, a generic resource promise, and an unrelated external link. The catalog keeps the matched signature (prefix plus match reasons) so a filtering decision stays explainable; the indexer records only full-signature evidence, and `model.test.mjs`, `test/campaign.test.mjs` and the browser fixtures all model the complete pattern. `npm test` covers opener-only, opener-plus-domain and opener-plus-promise descriptions staying visible in lists, text search and publisher counts, while `|` titles, one-page sites, prolific publishers and version-like strings are never classifiers.

Evidence: 16/16 Node regressions (`npm test`), clean build membership including `campaign.js`, and the browser pipeline's campaign assertions after the fixture change. The supplied `all-sites.csv`, `curated-seed.csv` and `nsite-index-preview-v0.1.html` are not in this repository, so the 2,004/2,895 corpus figures were **not** re-derived here and are not claimed as reproduced.

## Remaining target boundaries

No installed Android APK, secure-origin service-worker offline startup, Android picker/download bridge, OS suspension, real quota exhaustion or multi-tab fault injection was exercised here. The HTTP-fixture collection leg is blocked by the authenticated preview origin described above, not by an app failure. Static previews disable source scripts and external dependencies; they do not promise arbitrary JavaScript applications run offline.

---

## Historical 0.2.2 evidence — does not establish product acceptance



## Executed

- Node 24.22.1: ten model/crypto/ZIP/document regressions pass. Node 26.13.0: eleven including the new build regression; CI runs Node 24. A 10,000-event legacy catalog built in approximately 28–33 ms in this executor; listing returns bounded rows rather than every reconstructed tree. This is an isolated catalog measurement, not a phone benchmark.
- JavaScript syntax checks pass; dependency-free POSIX build produces a complete relative-asset tree. The build regression seeds `dist/` with an obsolete sentinel and asserts both a first and a repeated build remove it while producing exactly the expected runtime asset set.
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

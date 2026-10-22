# Library App-Shapes — Intake Scan v0.1

**Date:** 2026-10-21 (user's current project context)  
**Purpose:** Find candidates for independent Pretend Internet mini-apps; **not** adopt, publish or retire them yet.  
**Scope:** ChatGPT Library metadata listing **3,387 visible files**. Recursive Google Drive Library listing was unavailable. This is a first-pass intake, not a complete audit of content within every archive.

## What was actually examined

- **3,387** visible Library file metadata records reviewed for file type, name and plausible application role.
- **92 HTML/HTM files**, **671 ZIP files**, and **13 APK files** were present in that listing. These are **file counts, not app counts**; there are duplicate names, variants, reference APKs, HTML reports, and non-app ZIPs.
- **13 selected standalone HTML files** inspected for page titles, controls, scripts, local persistence, import/export and dependencies (static source inspection).
- **28 selected ZIP occurrences** inspected **without executing included source**, by member names, entry points and bounded README previews. Some are different manifestations of the same project; some are test-only bundles.
- Browser runtime smoke test was attempted, but the inspection environment rejected `file://` navigation. **No new runtime-verification claim is made.**
- This report intentionally omits raw Library IDs, private contents, and any sensitive material because the GitHub repository is public. Exact source resolution remains in the private Library.

**Evidence codes:** `HTML-inspected` = actual standalone HTML structure inspected; `ZIP-inspected` = archive entry points/readme inspected; `filename-only` = candidate from Library listing; `APK-listed` = installable-format file, **not** proof of a working app. None of these alone means `live`.

## Shortlist A — low-friction, standalone HTML

| Candidate | Evidence | What it appears to do | Next verification |
| --- | --- | --- | --- |
| **BUTTERFLY Word Magnets** (`BUTTERFLY-word-magnets.html`) | HTML-inspected; ~19 KB | Touch-based word-magnet creative toy; inline script, local state and export affordances | Test actual drag/touch and export, check help, default skin |
| **Melody's Number Links — Engagement Lab** (`Melodys-Number-Links-Engagement-Lab.html`) | HTML-inspected; ~39 KB | Offline number-merge/chain game with controls and state; different from the Game Studio archive | Compare intended game rules and test touch on Android |
| **Melody's 2048** (`melodys-2048-fixed.html`) | HTML-inspected; ~14 KB | Small self-contained number-merge game | Test moves/state/restart; distinguish similarly named variants |
| **Chaos Circuit** (`chaos-circuit-prototype.html`) | HTML-inspected; ~12 KB | Small arena/game prototype | Test actual loop and controls; classify as prototype |
| **Codex Rate Log** (`codex-rate-log.html`) | HTML-inspected; ~15 KB | Local rate/usage logging form with storage and export | Verify data ownership, storage behavior and saved export |
| **BiograBr3 Artifact Desk** (`BiograBr3-artifact-desk-v0.2.html`) | HTML-inspected; ~8 KB | Small artifact interface; fewer active controls | Verify whether it is functional or mainly a viewer |
| **Dollz Fit Desk** (`Dollz-Fit-Desk.html`) | HTML-inspected; ~157 KB | Local vintage sprite-fitting/calibration desk with import/export | Test on actual sprites and check recovery/copy rules |
| **Pocket Reader** (`pocket-reader-standalone.html`) | HTML-inspected; ~160 KB | Offline reader/shelf with import/export and fixture material | Distinguish fixtures from real user content; verify saved behavior |
| **Vintage** (`Vintage.html`) | HTML-inspected; ~132 KB | Local artifact/workbench interface | Verify feature completeness and local storage needs |
| **Napplet Design Intake** (`napplet-design-intake.html`) | HTML-inspected; ~22 KB | Local app-reference/intake form with save/export | Check whether it helps the actual adoption workflow |
| **Lost Dollz Lab** (`Lost-Dollz-Lab.html`) | HTML-inspected; ~2.36 MB | Single-file visual Dollz experience with embedded assets | Validate image loading, touch, performance and provenance |
| **SIDE B Arcade** (`SIDE-B-ARCADE.html`) | HTML-inspected; ~7.09 MB | Larger single-file arcade/media experience | Check size and startup cost; avoid putting huge art into shared shell |
| **The Cat Ate the Internet** (`THE-CAT-ATE-THE-INTERNET.html`) | HTML-inspected; ~3.43 MB | Interactive, local-state creative experience | Check whether app entry and flows stand alone; avoid rewriting its aesthetic |

These are **individual source candidates**, not thirteen validated releases. A single HTML file is an eligible mini-app—**no mandatory React/Vite/Node transformation**.

## Shortlist B — packaged app/source projects

| Candidate source | Evidence | Shape / reservation |
| --- | --- | --- |
| `melody-number-links-game-studio.zip` | ZIP-inspected; 2 files | Offline `index.html` + README, explicit game rules. Very cheap candidate for isolated WebToApp HTML import. |
| `Melody-Engagement-Lab-v0.1.zip` | ZIP-inspected; 2 files | Self-contained `index.html` and README; compare to standalone lab before adopting both. |
| `Drop-Point-Shasta-County-Web2App-v2.1-Compact.zip` | ZIP-inspected; 13 files | Genuine multi-page HTML/CSS/JS WebToApp package: index, maps, notes, stops, favorites and settings. Do not presume network/map behavior without test. |
| `pixel-workbench-web2app-v0.3.zip` | ZIP-inspected; 7 files | Small HTML WebToApp import surface; verify actual useful operations. |
| `pixel-gif-workbench-extraction-v0.3.zip` | ZIP-inspected; 120 files | Frontend project with built assets; its own README reports browser progress but **physical-phone verification blocked**. Not live. |
| `Dollz-Fit-Desk-v0.1.zip` | ZIP-inspected; 10 files | Original HTML plus reproducible build, test receipts, and previews; prefer this provenance package when evaluating its matching standalone HTML. |
| `pretend-pocket-reader-webtoapp-v0.1.zip` | ZIP-inspected; 7 files | Local WebToApp reader package. Verify differences from standalone reader. |
| `pretend-internet-pocket-library-foundry-kit-v1.1.1.zip` | ZIP-inspected; 12 files | WebToApp HTML snapshot of selected Library artifacts; **not** a live data service or proof of all content. |
| `puters-living-nightmare-v0.2-webtoapp-preflight-fixed.zip` | ZIP-inspected; 163 files | Real JS/HTML game source + local assets and package metadata; upstream-derived; verify license, modifications, and Android behavior. |
| `Scrapebackmachine-WebToApp-SELECT-FOLDER-v0.2.2.zip` | ZIP-inspected; 24 files | Python WebToApp folder project with `app.py`, local UI and tests; needs Python runtime, not a standalone HTML conversion. |
| `Scrapebackmachine-WebToApp-v0.2.2-TOKEN-FIX.zip` | ZIP-inspected; 27 files | Related Python version; compare functionally before choosing a maintained variant. |
| `webtoapp-html-compat-local-napplet-v0.1.zip` | ZIP-inspected; 1 HTML | Tiny WebToApp HTML-runtime scout; closer to a diagnostic utility than an end-user app. |
| `webtoapp-zip-intake-local-napplet-v0.1.zip` | ZIP-inspected; 1 HTML | Small ZIP-inspection demo; inspect security boundaries and utility first. |
| `puter-web2app-mcp-probe-v0.1.0.zip` | ZIP-inspected; plugin HTML and manifest | HCJ plugin candidate, **not** normal standalone app; network/permission testing required. |

## C — Bigger shells, workbenches and packages not ready for the drawer

- `BreBre-Shell-Consolidated-2026-10-21.zip` — ZIP-inspected: contains frontend plus Android host source; README explicitly says **host not compiled/tested as an APK**. This is *reference/source*, not a replacement architecture.
- `Pretend-Internet-Gaming-Wallet-Codex-Handoff.zip` — ZIP-inspected: 420 members, multiple separate components and built assets. Its README says **WIP handoff, not released integrated app**. Do not import it wholesale or mix its mining/wallet components into unrelated mini-apps.
- `Data-System-Workbench-v0.1.zip` — ZIP-inspected: mostly Python tools and design/README, not an HTML mini-app.
- `IC-Lyricist-Studio-v0.4.2-2026-10-20.zip` — ZIP-inspected: Python/agent-side source/benchmark tools; local IC sandbox verified per its own README, **not** an Android app. Treat content/provenance as private.
- `nostr-kinds-reader-1.zip` — ZIP-inspected: standalone **protocol data reader/tool**, no HTML entry in archive.
- `pixel-doll-fixed-frame-lab-v0.1.zip` — ZIP-inspected: image assets and `LayerDesk.html`, plus lab evidence; validate useful workflow before app adoption.
- `webtoapp-napplet-extraction-foundry-v0.1.zip` — ZIP-inspected: developer donor/test package, not two production WebToApp apps.
- `Vintage-Dollz-Asset-Tests-v0.1.zip` — ZIP-inspected: tests/fixtures only, not an app.
- `skill-miner-v0.2.1-cds-adapter.zip` — ZIP-inspected: an agent/CLI skill, not a visual app.
- `Br3Apps_v1.0.0.APK`, `Pretend_Internet_Library_v1.0.0.APK`, `nDOGE-debug (1).apk`, and `NostrVault-0.2.0-dev.apk` — **APK-listed** user-project candidates. Need explicit package/source correlation and real build inspection; do not extract APK code and assume it's maintained source.

Other filenames that may warrant a later look: `Pocket-Theater-Source.zip`, `BUTTERFLY-pocket-fixture-shelf.html`, `THE-OTHER-SIDE-OF-TRUE.html`, `arcade-wallet-lab-v0.1.zip`, `animated-emoji-bunbun-workbench-v0.2.zip`, `nostr-artist-directory-naplet-0.1.0.zip`. These are **filename-only or partial structural leads**; do not mark functional.

## Important duplicate/version leads — not yet proven redundant

- `melodys-2048.html` / `melodys-2048-fixed.html` and numbered copies.
- `Dollz-Fit-Desk.html` and `Dollz-Fit-Desk-v0.1.zip` (different representations, may each add context).
- `Lost-Dollz-Lab.html` in multiple Library folders.
- `Melodys-Number-Links-Engagement-Lab.html` and `(1)`.
- `IC-Lyricist-Studio-v0.4.2-2026-10-20.zip` in two Library locations.
- Multiple Puter game/WebToApp variants, Drop Point versions and Scratchbackmachine packages.

**Same name or byte size is not proof of same bytes.** Compare hashes and meaningful version differences before retiring any copy.

## Proposed first two-app drawer proof

1. **BUTTERFLY Word Magnets** — a tiny creative interaction, direct HTML.
2. **Melody's Number Links Game Studio** — separate tiny game, direct HTML inside ZIP.

They exercise **different interaction patterns** and can each be tested independently before trying a launcher drawer. The drawer must not be required to run them; add in-app Help only after verifying actual behavior. This pair is only a **test suggestion**, not approval to transfer, replace UI, or declare `live`.

## Next intake pass (focused, one item at a time)

- [ ] Resolve exact Library source occurrence and relevant versions for the first selected app.
- [ ] Identify entry point, necessary assets, external calls, storage, licensing and known failure notes.
- [ ] Run a repeatable browser/device interaction test; check actual controls and app-independent entry.
- [ ] Compare relevant variations before selecting a version; do not silently import the old interface as a shared design.
- [ ] Write a small migration receipt referencing original identity and commit **in an appropriate private store**. Public repo records only non-sensitive provenance.
- [ ] Admit useful source to `apps/<id>/`, not the whole historical archive.
- [ ] Verify the exported WebToApp APK on device and honest self-explanation before marking `live`.
- [ ] Classify redundant Library occurrences for retirement **without deleting**. User approves actual deletion separately.

**No source bytes or app packages from the Library were committed in this inventory step.**

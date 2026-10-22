# Reusable Capability Trials — Test Plan v0.1

**State:** Comparative builds prepared for user device testing; **not adopted as shared components**.  
**Scope:** Browser/WebToApp HTML trials. **No private content in the public GitHub repository.**

## Why this exists

We are comparing *independent implementations of useful capabilities* rather than collecting entire historical applications or normalizing their UIs before user testing. Build each trial, test on-device, gather Bre's notes, and only then select/compose a retained mechanism.

## Trial set (7, initial batch)

| Trial | Capability | Implementation lineage | Locally loaded content | Target test |
| --- | --- | --- | --- | --- |
| Reader A — Pocket Reader | E-book reader | Previous standalone Pocket Reader v0.1 | EPUB/HTML/MD/TXT | Import, shelf, chapter swipe, typography, storage |
| Reader B — Pocket Library Shelf | Chapter/card reader | Previous Pocket Library v1.1.1 reading interface | TXT/MD/HTML; session-only | Chapter UI, selection, navigation, readability |
| Viewer C — Vintage Desk | Mixed artifact/media viewer | Previous Vintage workbench, **private seed removed** | Images/audio/text/JSON | Inspection, evaluation workflow, device-local persistence |
| Media D — Pocket Media | Audio/video playback | New minimal HTML5 baseline | Audio/video, session-only | Queue, next/previous, speed, loop, Android background behavior |
| Gallery E — Gallery Light | Image/GIF viewer | New minimal viewer baseline | Image/GIF, session-only | Thumbnails, animation, swipe and scaling |
| ZIP Intake F | Archive inspection | Existing WebToApp ZIP-intake napplet | Selected ZIP, session-only | Metadata reporting, invalid archive handling |
| HTML Scout G | HTML compatibility diagnostics | Existing WebToApp HTML-scout napplet | Selected local HTML files | Useful host warnings; no code execution |

**Build artifacts:** A combined WebToApp HTML ZIP and seven individual HTML ZIPs were generated in the current working conversation for device testing. They are **not** APKs, GitHub releases, or verified live builds. Do not claim the public repo contains these files until a separate checked source transfer is performed.

## Hard public/private boundary

- Source and generic interface code can be public after license/privacy review.
- **Never bundle** user-authored articles, stories, lyrics, MP3s, images, personal notes, private registry entries, test credentials or Library dumps.
- Reader A's prior embedded books were removed. Reader B's prior Library registry/readers were cleared and replaced with on-device file selection. Vintage C's embedded personal archive/profile seed was removed.
- User content is selected **locally** through device file pickers. Content is neither uploaded to the repository nor automatically synchronized.
- For comparison, any sample content should be deliberately synthetic and held on-device; do not commit actual readables.
- IndexedDB/state may persist on-device only where explicitly stated. Others are session-only. Each trial should disclose this.

## Build and review flow

- [x] Locate multiple reader/viewer/host-probe implementations and separate duplicate packaging from distinct behaviors.
- [x] Create privacy-clean trial variants for the first batch; no original Library files modified.
- [x] Verify JavaScript parses, ZIP entries are safe, and initial browser DOM interaction checks pass in a restricted headless environment.
- [ ] **User test in WebToApp on Android.** Check import, navigation, actual playback/decoding, storage, device Back, touch and failure behavior.
- [ ] Collect one notes export identifying **what works / what fails / what other apps should borrow** for each variant.
- [ ] Compare by behavior and evidence, not aesthetics or naming; track deliberate differences.
- [ ] Select one or more bounded reusable functions *after* notes; keep alternatives if different tasks benefit.
- [ ] Admit only reviewed source, a small manifest, and necessary licenses into the public app collection. Re-run secret/privacy scans before any GitHub source publication.
- [ ] After verified source adoption, record Library migration receipts and retirement candidates. No deletion without separate approval.

## Verification so far

A restricted headless DOM smoke test covered local TXT import into Reader A, local Markdown import + chapter opening in Reader B, audio queue selection in Media D, image thumbnail display in Gallery E, Vintage C's empty state and Help, and rendering of ZIP Intake F and HTML Scout G. A drawer with seven entries and notes JSON export was also exercised. Browser navigation to a local test URL was blocked in the tool environment; **physical Android, exported APK, genuine media playback, IndexedDB persistence and comprehensive format tests remain unverified**.

## Interpretation of “all”

This is **all seven in the initial reusable-capability comparison set**, not a claim that every historical Library app has been built or vetted. Large creative/game projects, framework-dependent servers, copyrighted art packages, wallets and privacy-sensitive source need their own targeted intake checks, not bulk publication.

Next decision should be grounded in actual user notes, not another speculative shared framework.

# Verification — nsite archive

Date: 2026-10-30. Source base: Pretend Internet `daf13b8`. Implementation: `feature/nsite-archive-indexer`, with exact committed revisions and current-head CI recorded in its linked pull request. No production release or installed APK is claimed.

## Executed in Work

Host: Linux, Node 24.22.1, Playwright 1.56.1 / Chromium 141.0.7390.37. Fresh temporary archives and deterministic disposable signing keys; real loopback HTTP and WebSocket servers. No public events, signer, public site mirror or live public relay test.

| Check | Observed result |
| --- | --- |
| `npm test` in `tools/nsite-archive` | **34 passed**. Includes signature and aggregate validation, unsafe paths, raw signed quarantine, cross-author provenance/dedup, root/named/snapshot URL resolution, untitled content extraction, CDC insertion reuse and Hashtree decoding, exact restoration/corruption, close/reopen state, legacy reconstruction and timestamp tie-breaks, historical snapshots, reversible campaign filtering, declared ancestry, single writer lock, DNS pinning/private IP denial, real read-side discovery and BUD-03 lookup, hash fallback, range resumption, backoff, per-blob limits, same-timestamp gaps, query-cap continuation, redirect verification, screenshot isolation/fail-closed behavior, actual CLI subprocess workflow and metadata storage budget. |
| `npm run test:browser` | **Passed**: actual static directory searches page content without publisher titles; publisher and related views; version compare and Back; 320/390/844 CSS px; 200% text with filters expanded; `file://` JSON import. No browser page errors. Screenshot inspected visually. Uses our trusted viewer/test fixtures; not the untrusted-site renderer. |
| `npm test` in `tools/relay-router` | **27 passed**, unchanged existing component. |
| Root `npm ci`, `npm run build`, `npm run check`, template metadata validator | **Passed**; launcher/Pocket Counter build remains unchanged. |
| Strict Chromium OS sandbox in this cloud runtime | **Unavailable**: Chromium refuses this root runtime. Worker stores `browser-sandbox-unavailable`, never retries without sandbox or fabricates a preview. |

## CI acceptance

`.github/workflows/nsite-archive.yml` installs pinned dependencies and Chromium on Ubuntu 22.04 / Node 22. It runs archive tests, the actual browser directory flow, and **`npm run test:sandbox`**. The latter requires a real sandboxed PNG, no requests to an external HTTP canary, and a cached second capture. It fails if the OS sandbox is unavailable; it cannot silently fall back to the trusted-viewer test's browser settings.

[GitHub Actions run 41078197558](https://github.com/br3avery-maker/Pretend-Internet/actions/runs/41078197558) on commit `ca430b66132a89c602d2940403a550c17205c800` **passed every step**, including the actual OS-sandboxed PNG capture, untouched external canary and preview cache. The root-runtime limitation above therefore does not block the supported-host implementation. Later current-head CI results and merge readback belong in PR #15.

## Remaining real-world limits

- The issue's ngit, Advent.cash, numbered-series and untitled-publisher examples have not been downloaded or verified here. Their signed manifests/native hashes are not fabricated from screenshots.
- Default public bootstrap reachability, public historical coverage, live gateway behavior, real campaign precision and completeness of any public mirror remain unverified. Relay timestamp caps are reported as gaps.
- No end-user app integration, WebToApp APK export/install, live nsite publication, Crawlstr/SIP-01 publication, deployment, new account or recurring job was executed.
- The static viewer is an archive directory, not a whole-corpus autonomous crawler running inside a phone webpage. The local worker needs a supported Node host; previews additionally require its OS sandbox.
- Back up the stopped worker's entire archive home for full byte restoration. Exported viewer JSON/NDJSON preserves index and signed history but is not a second full content archive.


## Follow-up to automated review 5714404504

The [five findings](https://github.com/br3avery-maker/Pretend-Internet/pull/15#pullrequestreview-5714404504) were reproduced against merged base `77ddcaf`. All six initial reproduction tests failed: an eight-file same-second legacy publication exposed only three files; repeated-path indexing ignored its disk cap; the second relay never received its Blossom metadata query; three encoded preview resources were aborted; nested HTML exhausted the stack; and a per-file read failure stopped the indexing queue.

The follow-up preserves reconstruction order for legacy ties, reserves SQLite/WAL capacity before extraction writes and pauses resumably, schedules unfinished metadata ahead of completed relays, normalizes preview URL paths and invalidates the prior renderer cache, and uses iterative bounded HTML walks with durable per-file failures and explicit retry. Existing signed events, native hashes and downloaded bytes remain unchanged.

Local validation: **41 tests passed**, including seven review regressions, and the mobile/offline browser flow passed. The existing CI sandbox test now additionally requires a real Unicode/space-named HTML entry and all three archived image URL forms to be fulfilled. Current-head CI and automated re-review results belong in the follow-up PR record; successful local mocks are not substituted for that real browser gate.

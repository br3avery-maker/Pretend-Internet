# Source investigation and implementation contract

Owner: Pretend Internet #14. The issue originally captured investigation only. The user's later **“can you make this?”** supplies implementation authorization for the described pipeline. It does not start a public crawl, recurring job, production service or publication.

## Inspected sources

| Source | Observation and decision |
| --- | --- |
| Pretend Internet base `daf13b8` / PR #13 | Existing event-kind router is implemented and merged. Reuse its signature verifier and finite read transport; no second relay transport or publisher is invented. NIP-65 author-write discovery supplies additional publication sources. Existing apps and launcher remain unchanged. Open PR #10 concerns Folder Launcher and does not duplicate this work. |
| Existing Pretend Index `pretend.py` | Inspected all 585 lines of the actual earlier source. It indexes local paths and ZIP members, stores whole immutable blobs, makes filename relationship proposals and serves local search. It has no nsite relay discovery, manifest/signature model, CDC, version graph or offline nsite screenshot boundary. Reuse its separation of observed vs inferred relationships, immutable bytes and restoration constraints as design precedent; do not import its unrelated ZIP UI or private collection. Archive Lantern is a ZIP recovery candidate rather than an nsite collector and is not required by this pipeline. |
| [NIP-5A](https://github.com/nostr-protocol/nips/blob/master/5A.md), file SHA `690d67a59b0d9de2d4152864c802318c5f9ec5c8` | Current root 15128, named 35128, snapshots 5128; path/hash manifest, native aggregate, canonical gateway labels and declared a/A ancestry. Preserve every signature and namespace. Aggregate is SHA-256 of sorted `<hash> <path>\n` lines; no internal chunk/Merkle identifier replaces it. Legacy 34128 requires reconstruction from separately signed file events. |
| [BUD-01](https://github.com/hzrd149/blossom/blob/master/buds/01.md), file SHA `396b97399e96bf5031dcb067cd5fb07a19a1814b` | Whole-blob SHA addressing, optional ranges, hash-bearing redirects. Resume ranges if supported, but always verify the entire native blob before trusting bytes. Do not presume a server knows our internal chunks or can supply changed chunks remotely. |
| [BUD-03](https://github.com/hzrd149/blossom/blob/master/buds/03.md), file SHA `cebc0fbab4636cbbcec1034764ad924673987d29` | Signed kind-10063 ordered server hints. Retain hint provenance; combine manifest servers with author hints. No signer or upload path is needed for public retrieval. |
| [Hashtree HTS-01](https://github.com/mmalmi/hashtree/blob/master/docs/HTS-01.md), file SHA `94867da656bbe40ec44a6370cc9eb29d1f4315aa`; current SDK exports and MIT license | Existing canonical MessagePack node encoder, file/dir Merkle graph, SHA storage, optional CHK encryption. The inspected API exposes fixed/video chunkers, not a required CDC implementation. Reuse the actual pinned `@hashtree/core` codec with plaintext public-file chunks; do not deploy Iris, introduce encrypted CIDs into NIP-5A, or claim our CDC profile reproduces Hashtree's default 2-MiB chunk layout. |
| [FastCDC research](https://www.usenix.org/conference/atc16/technical-sessions/presentation/xia), `fastcdc` npm 1.0.1 readme | Existing Node binding needs Rust/native installation. Avoid imposing a compiler toolchain on a local utility. Implement a small deterministic Gear CDC profile with established rolling-hash boundaries; explicitly label it **Gear**, not a binary-compatible implementation of the paper's FastCDC profiles. Native hashes remain authoritative. |

Inspection date: 2026-10-30. Upstream NIPs and HTS-01 are drafts. These are source observations and protocol checks, not public ecosystem demonstrations.

## Data and trust model

Signed event → publisher + namespace + observed version + native path/hash tree. Exact events and source provenance are immutable records. Root/named versions are signed manifests; snapshots must bind to their own author's source namespace, include a self-consistent aggregate and preserve raw a/A claims. A missing historical source manifest does not prove a snapshot's claimed source state was independently observed. Legacy observed trees are synthetic and marked as such.

Native blob SHA-256 → ordered Gear chunk descriptors → canonical unencrypted Hashtree file node. Snapshot paths → canonical Hashtree directory nodes. Distinct author publications may share every stored object without merging their identities or ancestry. File and directory conflict means the original manifest remains preserved but cannot acquire a restorable internal directory root.

Raw signed metadata, observed HTML metadata, term-frequency subject candidates and probable similarity have separate evidence/classification fields. HTML `lang` is a declaration, not a language-model inference. No title string, identical screenshot, site count, or shared file alone becomes a verified fork relationship.

Downloading precedes indexing. All observed referenced assets enter the same queue. A bounded run may leave partial sites but cannot silently make them invisible. Missing server hints, auth, timeouts, oversized blobs, hash mismatches and budgets remain recoverable states. Pre-dedup avoids fetching locally verified hashes; CDC saves local bytes after a changed file is fetched, **not network transfer bytes that Blossom never exposed as chunks**.

## Accepted implementation boundaries

- Local worker is appropriate for full archives and OS-sandboxed screenshots. A static nsite cannot safely promise persistent full-corpus crawling or private filesystem access by itself. The exported directory is static and can be used independently.
- No new accounts, cloud services, mandatory app framework, web signer, private relay or game layer.
- No automatic rendering of scripts, externally linked pages, credentials, or user-selected browser sessions. The full downloaded original remains available for restore; previews intentionally render a static restricted version.
- Existing nsite directory, Crawlstr, and other clients receive portable data. No universal SIP-01 writer, AI-inferred lineage, OCR, dynamic script execution or remote chunk protocol is falsely advertised.
- The particular ngit, Advent.cash, untitled publisher and numbered-series examples in the issue remain **unverified real-world fixtures** until their actual signed manifests/assets are captured. Tests use new deterministic synthetic public test identities and never publish them. No private screenshot/chat/Library payload is copied into Git.

## Executable acceptance map

| Invariant | Check |
| --- | --- |
| Complete ingest with pauses, no selection by search metadata | Real relay/BUD-03 integration, max-query cursor, byte/file/storage budget and retry tests |
| Storage dedup preserves identities and provenance | Cross-author identical files, separate events/sources/namespaces, snapshot and legacy tests |
| Native hashes and Merkle/CDC both survive | Aggregate invariance, Hashtree decode, insertion reuse, whole-file restore and corruption tests |
| Untitled sites are searchable by content | Extraction + browser search fixtures with no published title/description |
| Relationships and high-volume works stay distinct | Explicit signed-claim status, exact equality groups, reversible campaign filter vs prolific series |
| Safe screenshots | CSP/sanitizer/route/context contract tests plus a strict real OS-sandboxed Chromium canary test |
| Usable portable directory | Actual browser flow, publisher counts, related groups, version diff, Back, narrow screens, enlarged text, offline import |

Successful local synthetic tests do not establish full relay-history availability, live gateway correctness, real spam-classifier precision, a complete public mirror, Android APK behavior or publication.

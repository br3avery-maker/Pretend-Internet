# Nsite Directory (Metadata-Only)

A standalone, offline-first Nsite metadata directory and NIP-01 event inspector built to strictly enforce the **PI-04 discovery boundary** (`AGENTS.md` / `PROJECT.md` / issue #41).

## PI-04 boundary compliance

- Makes **zero outbound network requests**.
- Never downloads remote HTML, CSS, JavaScript, images, ZIPs, screenshots, or site trees to classify or enrich publications.
- Groups publications, version chains, and exact-content stacks strictly from declared Nostr event tags (`d`, `path`, `x`, `title`, `description`, `t`) and timestamps.
- Explicitly leaves sparse or ambiguous metadata classified as **`unknown`**.

## What works

- Import local Nostr event JSON/NDJSON files, paste event JSON, or load deterministic synthetic fixture events.
- Canonical NIP-01 SHA-256 event ID computation over compact UTF-8 JSON `[0, pubkey, created_at, kind, tags, content]`.
- Strict NIP-01 structural checks (hex lengths, integer ranges, UTF-8 lone-surrogate checks) with `signatureVerified: false` reported explicitly.
- NIP-65 (kind 10002) relay-list parsing with strict WebSocket scheme, credential, fragment, and role-marker validation.
- PI-06 Dark skin and Daylight alternate skin.

## Run and validate

Serve the repository root (for example `npm run dev` on port 3000) and open `/apps/nsite-directory/index.html`.

```sh
python3 scripts/validate-mini-app.py apps/nsite-directory
```

## Status and limitations

- **Status:** `testing` (browser-tested; not an installed Android APK release).
- Structural and canonical ID verification only—BIP-340 signature verification requires a dedicated cryptographic library.

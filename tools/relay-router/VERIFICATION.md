# Verification — 2026-10-29

Implemented source: `tools/relay-router/`, Pretend Internet #12. No consumer app or rejected donor source was imported.

Executed on Node 24.22.1:

- `npm test`: **27 tests passed**, 0 failures. Includes exhaustive classification of all 65,536 kind numbers; actual signed events of arbitrary/unregistered kinds; event-specific selection; Unicode vs wire limits; auth/payment/PoW policy; conflicting/stale/tampered monitors; NIP-65 author and recipient groups; private/giftwrap/protected boundaries; cooldown and cache sanitization; credential-option rejection; recipient bounds and fail-closed destination policy.
- Real loopback HTTP + WebSocket integration: signed NIP-66 discovery introduces a previously unknown relay; direct NIP-11 inspection; first destination refuses the kind; identical signed event falls back to another relay and is retrieved with its exact signed ID. No mocked WebSocket transport in these integration checks.
- Readback tests: corrupted stored event remains unverified; ephemeral acceptance is not represented as persistent storage; missing recipient delivery cannot be hidden by author success.
- NIP-42 tests: challenge-bound external AUTH; same-event retry; authenticated readback when initial writing was public; signer mutation refusal. No live personal signer session was exercised.
- Malformed truthy OK is rejected. A silent subscription terminates on deadline.
- `node test/mutation.mjs`: forcing readback verification to true makes the corrupted-readback regression fail (mutant exit 1); mutation rejected. Mutation is made in a temporary copy, leaving the tested implementation intact.
- `node demo.mjs`: full loopback discovery → kind refusal → automatic fallback → verified readback, overall `verified`.
- `node --check` on router, transport and CLI: passed.
- `npm audit --omit=dev --json`: 0 reported runtime dependency vulnerabilities at execution time. This is a dated registry check, not a guarantee about future advisories.

Public **read-only** diagnostics used a locally signed arbitrary kind-65535 envelope as planning input; it was not sent as an EVENT. NIP-11 HTTP retrieval completed for relay.damus.io, nos.lol and relay.nostr.net. Metadata list queries were unavailable in this runtime; two monitor queries completed without usable current kind evidence. The plan correctly retained configured candidates as **unverified**, with per-stage warnings. This does not prove public write access, relay-kind acceptance or global discovery coverage.

No public event publication, spending, DNS modification, relay provisioning or deployment was performed. Browser bundling, an installed WebToApp APK and integration into existing apps remain untested. CI runs the component tests, mutation and local demonstration on Node 22, alongside the repository's existing independent checks. PR/current-head results are recorded in GitHub.

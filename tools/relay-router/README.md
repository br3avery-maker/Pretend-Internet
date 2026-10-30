# Event-kind relay router

A standalone JavaScript module and CLI for **Pretend Internet #12**. Discovers destinations, evaluates the actual signed event, automatically selects relays and tries bounded fallbacks. No app/workload whitelist, hosted service, UI framework or private-key custody.

## What works

- Every NIP-01 kind number (0–65535), including unknown/future kinds. Classifies persistence convention and measures exact UTF-8 EVENT frame bytes, Unicode content characters, tag count and PoW.
- Signed NIP-65 author-write and mentioned-user read-relay discovery, plus signed NIP-66 reports from multiple sources. Monitor claims are advisory; missing, stale or contradictory claims do not remove otherwise viable relays.
- Direct NIP-11 policy inspection. Auth, payment, restricted-write, size, PoW and actual rejection outcomes are distinct. An omitted NIP or positive kind report is not a kind whitelist.
- Event-specific planning, configurable redundancy, preferred destinations, private boundaries and bounded automatic fallback. Rejection cooldown is scoped to the authenticated principal and exact event; an explicit machine-readable unsupported-kind refusal also suppresses that author/kind for five minutes. Generic policy text never becomes a permanent kind or user ban.
- Explicit publication of an already-signed event, identical on every attempt. Optional external NIP-42 signer capability, including authenticated readback. Signer results are checked against the exact challenge/relay/identity/template.
- Signed exact-ID readback for stored/unspecified-persistence events. Ephemeral events report **accepted-ephemeral**, never durable verification. Per-recipient delivery failure cannot be hidden by author-relay success.
- Sibling Blossom BUD-03 server-list discovery and BUD-06 metadata-only upload preflight for arbitrary MIME types and sizes. Preflight classification includes authorization, payment, media, size and quota. It does not upload or claim blob verification.
- Sanitized local registry snapshot/restore and machine-readable plans/receipts. No event bodies, AUTH events, raw relay error text or signer/session secrets in those outputs.

This routes protocol envelopes; it does not invent or implement every application NIP. Custom kind semantics/privacy remain the caller's contract. Unknown kinds are attemptable without being falsely labelled verified compatible. Auth tokens (22242, 24242, 27235) belong to dedicated transports. NIP-17 gift wraps require a signed recipient kind-10050 inbox list; private publication requires explicit approved destinations and never uses public fallback or discovery queries. Protected events require author authentication.

## Run

Node 22+; runtime dependency `nostr-tools` 2.25.2 (Unlicense). `ws` 8.22.0 (MIT) is used only by the local test servers. Exact versions/integrities are in `package-lock.json`. Browser bundlers may import `router.mjs`; the runtime uses standard fetch, WebSocket, TextEncoder and crypto APIs.

```sh
cd tools/relay-router
npm ci --ignore-scripts
npm test
node demo.mjs
node test/mutation.mjs
```

`demo.mjs` discovers a second loopback relay from a signed NIP-66 report, receives a kind rejection from the first, publishes an arbitrary generated kind to the second and verifies readback. All test signing identities are publicly reproducible fixture identities; no public events are emitted.

The CLI defaults to read-only discovery/planning:

```sh
node cli.mjs signed-event.json
node cli.mjs signed-event.json --config config.json --state local-cache.json
```

Publication is a separate explicit action:

```sh
node cli.mjs signed-event.json --config config.json --state local-cache.json --publish
```

Example configuration (all optional):

```json
{
  "bootstrap": ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.net"],
  "pinned": [],
  "redundancy": 2,
  "visibility": "public"
}
```

The defaults are replaceable bootstrap points, not a hardcoded answer to every event. The router discovers author/recipient lists and monitored destinations before selection. A future private node can be pinned. For private delivery set `visibility: "private"` and `allowedRelays`; pins alone never override that boundary. `entitledRelays` declares an existing entitlement; it never pays. The CLI has no signer/key flag: authenticated publication uses the module with a separately authorized external signer.

## Integrate without rebuilding a consumer

```js
import { RelayRouter } from './tools/relay-router/router.mjs';

const router = new RelayRouter();
const plan = await router.discover(alreadySignedEvent); // reads only
// Call only from the consumer's existing explicit Publish action:
const receipt = await router.publish(alreadySignedEvent, {
  redundancy: 2,
  authPubkey: connectedSignerPublicKey,
  signAuth: template => connectedSigner.signEvent(template)
});
```

`plan(event, options)` is offline after registry/list ingestion. `discover` does bounded metadata reads and NIP-11 HTTP requests; it never publishes a probe or asks a signer. `publish` performs discovery, chooses per delivery group, then tries each eligible URL at most once (plus one same-connection AUTH retry). Check the receipt's overall status and individual groups; do not turn an acceptance-only result into a published/verified-site message. Gateway checks and blob hash verification remain with the consumer's existing publication pipeline.

`registry.snapshot()` / `registry.restore(snapshot)` retain normalized evidence in caller-owned local storage. A restored cache is trusted local state, not an authenticated remote registry. Network lists/reports always require fresh signature verification. AUTH/signing capabilities and content are never serialized. The registry has finite destination/report/observation caps and configurable TTLs.

## Bounds and verification

Default discovery: at most 4 bootstrap connections per stage, 64 events per query, 32 candidate NIP-11 endpoints, concurrency 4, 5-second network operations, 64 KiB NIP-11 responses, 2 MiB total WebSocket response data and 1,024 frames per session. Publication redundancy is 1–8 and total attempts at most 64. Query-bearing/credential URLs, insecure/public ws/http and discovered local address literals are rejected by default. Explicit `allowLocal` is for local test registries. Server use must also apply `allowDestination` plus host egress/DNS restrictions; this browser-compatible module cannot prove DNS resolution safety or relay operator independence.

[Research and routing contract](RESEARCH.md) explains standards/reuse decisions. [Verification receipt](VERIFICATION.md) records executed results and limits. Real loopback HTTP/WebSocket integration is tested; no actual app/WebToApp/APK integration or public publication is claimed. Public read-only checks are recorded separately from local publication proof.

Placement is `tools/relay-router/`: an independently usable capability, not a mandatory shared application runtime. No existing app is rewritten and no rejected donor architecture is imported. Shared packaging can follow real consumer reuse later.

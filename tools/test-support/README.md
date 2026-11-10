# Test support

Shared fixtures for the operator tools' test suites. This is not application code, it is not published, and nothing installed here is imported by a shipped tool at runtime.

## What lives here

- `relay-server.mjs` — a loopback NIP-01 relay (WebSocket publish/query, optional AUTH, NIP-11 metadata) used by the router's protocol-boundary tests and by the archive's network and review-regression tests.

## Install

```sh
npm ci --prefix tools/test-support --ignore-scripts
```

Install this before the packages that use it. `relay-server.mjs` loads `nostr-tools` and `ws` from **this** directory's `node_modules`, so an install elsewhere does not satisfy it — that is the point: the fixture owns its dependencies instead of borrowing whichever copy happens to sit next to a consumer.

## Consumers

| Package | How it depends | What it imports |
| --- | --- | --- |
| `tools/relay-router` | devDependency `file:../test-support` | `@pretend-internet/test-support/relay-server.mjs` |
| `tools/nsite-archive` | devDependency `file:../test-support` | `@pretend-internet/test-support/relay-server.mjs` |

`tools/nsite-archive` also declares the router itself (`@pretend-internet/relay-router`, `file:../relay-router`) because its worker modules import the router's validation and transport. Its `test/dependencies.test.mjs` fails with the exact `npm ci` command when a fixture or router entry point moves, and when an installed version differs from the declared pin.

## Verified

- `npm test` in both consumers passes with this fixture after a clean install (router 27 passed; archive 45 passed, 2026-11-10, Node 26.13.0 locally and Node 22 in CI).
- Fixture pins: `nostr-tools` 2.25.2 (Unlicense), `ws` 8.22.0 (MIT). Exact integrity hashes are in `package-lock.json`.

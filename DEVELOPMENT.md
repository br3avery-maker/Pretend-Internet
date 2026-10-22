# Pretend Internet — Development Standards (Draft v0.1)

Status: **Draft for review**. These are proposed standards, not a claim that existing apps comply.

## Purpose
Build small, independently runnable, understandable, testable, skinnable mini-apps. Prefer existing WebToApp capabilities to new infrastructure. Do not import legacy builds automatically.

## Repository structure
- `apps/<app-id>/`: individual app source, assets, tests, manifest, README.
- `packages/`: reusable code **only after** at least two working consumers need it.
- `skins/`: optional theme token sets.
- `docs/`: cross-project documentation as needed.
- `scripts/`: narrow reproducible maintenance utilities.
- `.github/workflows/`: small automated checks.

An app must remain independently buildable. External GitHub repositories may comply without moving into this monorepo. Keep generated outputs, dependencies, APKs and temporary extraction trees out of source Git; use releases or dedicated asset storage with checksums.

## UI contract
- Mobile-first: phone-fit, safe areas, no horizontal overflow, usable touch targets.
- Accessibility: readable contrast, visible focus, keyboard support where applicable, reduced motion.
- Use semantic theme tokens for colors, typography, spacing and radius. Skins change appearance, not behavior. Default skin always works.
- Show useful loading, empty, offline, error and success states. No decorative nonfunctional buttons.
- **Mini-apps explain themselves:** purpose, first action, capabilities, limitations, local/network/public data behavior, accessible in-app help.
- Puter may present help but must never be required for basic understanding.

## App contract
Each app documents its ID/name, version, lifecycle status, purpose, entry point, build/run commands, permissions, dependencies, storage, offline behavior, user help and known limitations. A small `app.json` may hold machine-readable metadata; this is *our* schema, not a native WebToApp schema. A README documents how to run, build, test and recover it.

## Integration/API
No mandatory backend. Use direct local modules when possible. Document versioned HTTP or event contracts if actually needed. Use established standards such as Nostr NIPs when applicable. Explicitly declare Android/WebToApp bridge dependencies and permission scope. Never embed secrets. Errors need both stable codes and understandable user messages.

## Status and verification
- `idea`: concept and intended outcome.
- `wip`: source and run instructions exist, not promised functional.
- `testing`: buildable candidate with validation underway.
- `live`: **verified installed/deployed** artifact, not merely preview or compile success.
- `archived`: preserved inactive work with reason and recovery pointer.

A broken release is documented as broken, not silently described as live. Preserve prior validated releases.

## Adoption, library hygiene, retirement
GitHub becomes the development home of selectively **adopted** projects. The Library remains intake/history while being progressively curated.
1. Inventory candidate: original path/ID, size, hash, provenance, license, dependencies, status and unique assets.
2. Classify: adopt / superseded / broken / exact duplicate / unknown / unique historical / disposable.
3. Admit selected **source**, not automatic bulk imports or duplicate build trees.
4. Verify transfer and intended unchanged hashes, build/test behavior, licenses and recovery before retiring redundant Library copies.
5. Record a migration receipt: source identity, destination GitHub path and commit, verification results, retirement rationale and recovery location.
6. Keep a separate deduplicated **Retirement-Dump** with a manifest for broken, superseded or historical work; do not fill active repository source with archives.
7. Mark deletion candidates separately. **Never delete on migration alone. Deletion requires explicit approval.** Preserve unknown or unique historical evidence.
8. Close each adoption with a documented Library disposition to reduce clutter, not merely relocate it.

An index/CodeGraph describes source; it must not silently become another full copy.

## Release gate
- [ ] Actual runnable source and accurate help/README/manifest
- [ ] Clean-environment build and reproducible test of advertised functions
- [ ] Default and alternate skin checked, mobile UI and system states checked
- [ ] Permissions/storage/offline behavior documented
- [ ] No secrets, inadvertent binaries or duplicate dependency trees
- [ ] Correct lifecycle status and known limitations
- [ ] Installed APK/deployment tested on its intended target (especially for WebToApp)
- [ ] Recovery instructions and release notes
- [ ] Any Library adoption has a migration receipt and retirement disposition

## First milestone — standards only
- [ ] Approve/refine this draft.
- [ ] Define minimal default token CSS and manifest validation.
- [ ] Build **one** tiny self-explaining reference app.
- [ ] Verify export through WebToApp.
- [ ] Evaluate old Library projects selectively, one at a time.

No application migrations, bulk deletions, framework build-out or repository bloat are authorized by this draft.

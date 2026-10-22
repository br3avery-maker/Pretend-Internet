# Pretend Internet — Next Steps Checklist

**Status:** proposed work queue, not a record of completed work  
**Source of standards:** [DEVELOPMENT.md](DEVELOPMENT.md) (draft v0.1)  
**Last reviewed:** 2026-10-21

## Goal

Turn Pretend Internet into a **small, verifiable home for independent mini-apps** while progressively retiring redundant or broken Library artifacts. Do not turn this planning checklist into another framework, bulk code dump, or automatic deletion pipeline.

> Check a task only after its named evidence exists. A checked planning task is not proof that an APK works.

## Stage 0 — Decide the minimum standards (do this first)

- [ ] Review [DEVELOPMENT.md](DEVELOPMENT.md) and identify any rules to change before treating it as binding.
- [ ] Decide the **smallest app manifest**: ID, name, version, status, purpose, entry point, build/run, storage/network/permissions, help, limitations. Keep WebToApp-specific settings separate; `app.json` is our contract, not a WebToApp-native format.
- [ ] Decide which requirements are **mandatory** versus optional or platform-specific. Do **not** force a server, API, package manager or framework on a static mini-app.
- [ ] Define semantic CSS tokens and the **minimum accessibility/mobile behavior**; skins modify presentation, not function.
- [ ] Specify the in-app **self-explanation gate**: what it is, first action, what works, what does not, where data goes, and persistent access to Help.
- [ ] Record build targets separately: web preview, WebToApp APK, other deployments. `live` requires verification on the declared target.

**Exit evidence:** approved small contract and explicit release criteria; no source migration required.

## Stage 1 — Prove one vertical slice before extracting packages

- [ ] Choose **one very small, independently runnable reference mini-app** (suggestion: offline Pocket Notes or an app-help demonstrator). New clean source; do not adopt an old build by default.
- [ ] Make its UI work on a phone with a **default** skin; then switch to one **alternate** skin without modifying app logic.
- [ ] Write the app's README and manifest. Display purpose, how to use it, operational status, and storage/permissions **inside the app**.
- [ ] Include meaningful empty/loading/error/offline states where applicable; remove fake or nonfunctional controls.
- [ ] Add only the **minimum** automated validation justified by this app (manifest fields, build command, obvious broken links). Record test commands.
- [ ] Build/import using **WebToApp's supported workflow**; inspect current official docs or installed capabilities before creating adapters or wrappers.
- [ ] Install the **exported APK**, exercise the advertised functions, test restart and offline behavior, and record actual results. Mark unverified behavior as unverified.
- [ ] Record basic artifact size, dependencies, and unexpected duplication.

**Exit evidence:** source + manifest + README + reproducible commands + verified result from installed APK (or documented blocker). No shared UI package until duplication across *working* apps proves a need.

## Stage 2 — Optional Puter help, after normal help works

- [ ] Find and identify the **actual existing Puter artwork/animations** and their source/usage rights; no invented replacement art.
- [ ] Prototype a tiny contextual Help affordance using the existing app-help data, without an AI or network dependency.
- [ ] Confirm how WebToApp handles injectors/plugins and whether the helper survives **installed APK** export before claiming shared cross-app behavior.
- [ ] Preserve the ordinary Help entry point when Puter is absent or disabled.

**Exit evidence:** proof-of-behavior on-device, or a documented incompatibility. Do not create a cross-app framework prematurely.

## Stage 3 — Controlled Library adoption, one project at a time

- [x] Create a **small candidate list** from existing Library files; see [Library app-shapes intake v0.1](docs/library-app-shapes-v0.1.md). Metadata scanned and representative sources inspected; no apps adopted or imported.
- [ ] For each candidate, establish original **Library ID/path**, file size, SHA-256 hash when bytes are available, source provenance, license, state (working/broken/unknown), dependencies and unique assets.
- [ ] Classify candidates: **adopt / broken / superseded / exact duplicate / unknown / unique historical / disposable**. Distinguish *physical file occurrence* from *logical project/version*.
- [ ] Pick the first candidate based on **small footprint + standalone usefulness + low dependencies + recoverable source**, not nostalgia or size alone.
- [ ] Recover only the needed source and assets; do not transplant an old app's UI or architecture as the default.
- [ ] Ensure it meets the mini-app explanation, skin, build, and test gates before marking `live`.
- [ ] Record a **migration receipt**: original Library identity/path + hash, chosen source/version, destination path/commit, files transferred, validation results, what remains unique, archive location, and disposition.
- [ ] After *verified adoption*, classify related Library copies for **retirement**. Keep active Git clean of retirement bundles.

**Exit evidence for each adoption:** working or accurately classified repo project; traceable migration receipt; an explicit disposition for source occurrences.

## Stage 4 — Retirement-Dump, separate from the working repo

- [ ] Agree the **destination and retention** for a compressed/content-deduplicated Retirement-Dump outside active repo source.
- [ ] Define a simple manifest with source Library ID/path, occurrence hash, archive identifier/path, retirement reason, replacement commit (if any), verification and restoration status.
- [ ] Test **one non-destructive archive-and-restore** with a small disposable *test copy* before handling originals.
- [ ] Archive broken/superseded projects only when recovery, uniqueness, and provenance have been assessed.
- [ ] Identify **exact duplicates by content hash**; matching names, similar UI, or matching project titles are insufficient.
- [ ] Prepare a separate deletion-candidate review list. **Do not auto-delete** after transfer, duplicate detection, or archiving. Actual deletion requires Bre's separate explicit approval.

**Exit evidence:** verified archive manifest and restore test; no loss of original material and no silent deletion.

## Stage 5 — Maintain only what proves useful

- [ ] Add lightweight CI **only for checks that have already proved useful locally**; stop accidental binary/dependency commits.
- [ ] Track per-app `idea → wip → testing → live → archived` and note if a previously released build becomes broken.
- [ ] Evaluate whether two working apps actually need shared UI components, event conventions, API clients, or Puter help before creating a `packages/` subsystem.
- [ ] Maintain a **small app index** containing each app's purpose, current status, repository location, target, last verified build, and known problems; index metadata, **not duplicate code**.
- [ ] Review the Library intake and retirement receipts after each real adoption. Measure fewer active redundant occurrences, not volume of files moved.

## WebToApp checkpoint — observed UI (2026-10-21)

- User reports the WebToApp frontend is working, and supplied screenshots showing the root development shelf and the opened Pocket Counter (count showing 3, controls and skin selector visible, local-storage availability message).
- This supports **successful on-device rendering and interactive use in the WebToApp interface**. It does **not** yet establish an installed exported APK, save-and-reopen persistence, alternate-skin verification, or full release readiness. Keep those checks open.

### Candidate shell navigation — mini-app drawer (suggested, not yet implemented)

User suggestion: if the shell/mini-app launcher becomes a permanent part of the app, use a **drawer** instead of a whole launcher page.

- [ ] Keep the active mini-app as the main screen; open a compact navigation drawer on demand.
- [ ] Drawer shows app **name, short purpose, and honest status**; allow returning to the current app without resetting its state.
- [ ] Provide a persistent, accessible way to open/close the drawer; respect Android Back and keyboard Escape where applicable.
- [ ] Keep each mini-app independently runnable, with its **own Help**; the shared shell must not be a prerequisite for normal app operation.
- [ ] Confirm WebToApp's existing multi-app navigation/toolbar capabilities before adding or duplicating custom controls.
- [ ] Test navigation and state preservation with **at least two working apps** before treating a shell drawer as adopted architecture.

**Scope:** exploration only. Do not refactor the currently working launcher/counter based on this note alone.

## Ideas to park (not approved implementation)

- Br3Apps multi-app launcher with standardized in-app Help and Puter, only after package/runtime capabilities are validated.
- Pocket library explorer or small CodeGraph viewer **only if** existing mechanisms can't satisfy the use case without bloat.
- Nostr-flavored mini-apps with published NIP compliance and honest offline/network claims.
- One-click GitHub → WebToApp build receipt after manual workflow is repeatable; no new build service.

## What we are **not** doing yet

- **No** bulk Library import, mass archive extraction, or multi-gigabyte generated indexes.
- **No** replacing useful working interfaces with a shared design framework.
- **No** mandatory backend, local server, token system, wallet or Nostr stack for unrelated apps.
- **No** calling a browser preview a shipped Android app.
- **No** moving archives or binaries into Git source just to empty Library.
- **No** deleting Library originals without separate, informed approval.

These are guardrails, not checklist items. The roadmap records proposed work; it does not authorize bulk imports or deletion.

---

### Recommended next concrete action

**Stage 0, task 1:** Review the draft standards and settle the minimum app manifest + self-explanation gate. Then create one tiny working example to prove the rules rather than writing additional architecture documents.

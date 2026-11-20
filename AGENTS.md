# Working rules for coding agents

> **Repository-import orientation:** Read [PROJECT.md](PROJECT.md) before treating the launcher, Pocket Counter, mini-app standards, or nsite archive as the whole Pretend Internet. It distinguishes product intent from implemented components, current corrections from exploratory ideas, and existing workstream owners. Do not upload private historical conversations to this public repository.

## Portfolio-first cold import

This repository is the **umbrella portfolio home**, not proof that the root counter, any nsite archive, any one Android shell or Studio constitutes the whole product. After [PROJECT.md](PROJECT.md), read [Origins](docs/ORIGINS.md), [Workstreams](docs/WORKSTREAMS.md), [MVP gate](docs/MVP.md) and [ROADMAP.md](ROADMAP.md) before selecting a scope. **Melody's public contribution is documented without releasing private transcript or personal identity details.** Do not infer seven release versions or a seven-step mandatory build order from the workstream labels.

For a new task, identify the actual owning app/repository/issue and current user correction. First recover and verify real working behavior, then connect pieces if it helps an actual user. Use [portfolio issue #27](https://github.com/br3avery-maker/Pretend-Internet/issues/27) for the whole-project direction and [issue #3](https://github.com/br3avery-maker/Pretend-Internet/issues/3) for recovery. Keep build/runtime observations and release status distinct. This documentation change **does not authorize** any implementation, remote crawler, migration or publication.

## Nsite discovery boundary — current owner requirement (2026-11-14)

**A nsite directory is not an nsite downloader.** Discover, inventory, group, search and classify publications from bounded Nostr event metadata, declared file paths and hashes, publisher/namespace/version relationships, and available provenance. **Do not automatically fetch nsite HTML, assets, ZIPs, pages, or entire site trees to identify, classify, enrich, preview, screenshot, or index them.** Neither "fetch a representative page" nor "metadata first, download later" is an acceptable default. Leave unknown classifications unknown when metadata is insufficient. Do not silently initiate network site retrieval through a background queue or a directory/browse action.

Downloading remote site content is **outside the current directory workflow**. Its possible future use requires the owner's separate, explicit direction; do not treat it as an implementation prerequisite or infer permission from legacy archive code. Reading relay publication metadata is not permission to retrieve the referenced site bytes. Do not change or disable historical archival implementations merely because they exist; treat them as distinct existing tools pending an explicit product decision.

See [original directory/curation clarification](https://github.com/br3avery-maker/Pretend-Internet/issues/41) and [generated Android scope clarification](https://github.com/br3avery-maker/piShell-/issues/1). This documents requirements; it does not authorize an implementation change.

Read [DEVELOPMENT.md](DEVELOPMENT.md) and [ROADMAP.md](ROADMAP.md) before changing an app. The broader standards remain draft; do not promote older proposals or prototypes into policy.

1. Preserve the current task, proven working behavior, and protected scope. A repair does not authorize unrelated redesign.
2. Inspect real source and WebToApp's actual capabilities before introducing wrappers, services, or dependencies.
3. Prefer one small standalone app; no mandatory React, Node, Nostr, wallet, API, or shared UI framework.
4. Every app explains **inside the interface** what it is, how to begin, what is functional, limitations, and where its data goes. An ordinary Help control must work without Puter.
5. Mobile-first. Use semantic CSS variables for skins; skins change appearance, not function. Check accessibility, touch targets, focus, and reduced motion.
6. No fake functional controls, imaginary integrations, or false `live` labels. Distinguish source inspection, build, browser preview, installed APK, and real external-service tests.
7. Keep Git lean: no large archives, dependency trees, exported APKs, caches, or generated duplicates. Shared packages only after proven reuse by working apps.
8. Record source licenses, relevant dependencies, test results, and what has **not** been tested.
9. Do not bulk-import old Library projects. Transfer a selected project only after checking source, provenance, and status. Retirement needs a migration receipt; deletion needs separate explicit approval.
10. If the user rejects a direction, stop following that frame and re-evaluate the task.

`templates/mini-app/` is an example, not a shipped app. `apps/<id>/` holds adopted independent apps. Add `packages/` or `skins/` only for actual consumers; do not make empty directories to satisfy a diagram.

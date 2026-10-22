# Working rules for coding agents

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

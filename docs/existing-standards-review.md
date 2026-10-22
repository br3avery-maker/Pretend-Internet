# Existing UI and Development Standards — Library Source Review

**Reviewed:** 2026-10-21  
**Status:** Research and recommendations only — **not** new adopted standards  
**Related:** [DEVELOPMENT.md](../DEVELOPMENT.md) · [ROADMAP.md](../ROADMAP.md)

## Purpose and method

Before inventing a new mini-app contract, look for standards we already drafted or user decisions already recorded. Sources below were **read from the ChatGPT Library**, not merely inferred from filenames. The Library search was targeted, not a full audit of every archived bundle or Google Drive. Distinguish **direct user-confirmed decisions**, **assistant-proposed standards**, **contextual implementation notes**, and **historical brainstorming**.

## Strong matches

| Existing source (Library ID) | What it actually contains | Authority / how to use it |
| --- | --- | --- |
| `company-engineering-standards-notebook-2026-10-09.md` (`libfile_fc2d32a651808191b99114ac10c435fa`) | **ENG-01…ENG-09** and **UI-01…UI-04**. Behavioral acceptance, preserving scope, boundaries, reversible edits, exact-level verification, traceable builds, small design system, touch/keyboard accessibility, visible UI states, measured performance. References WCAG 2.2 and Android guidance. | Explicitly **proposed, not adopted company policy**. Strongest general development baseline. The separate `PIX-*` rules belong to creative-media software, not every mini-app. |
| `DEVELOPER-DECISIONS-QUIZ(1).md` (`libfile_cf8376f8a1d881919891bd7c570a4eac`) | Living 240-question register with **confirmed / recovered / lead / open / proposed / conflict / superseded** state and scope. Useful UI, navigation, accessibility, API, coding, testing, docs and packaging sections. | Directly confirmed **Nostr Shell** decisions include deep pink/black/pale pink/silver palette, Material Design-like interactions, a phone-launcher home, avatar menu, swipe/drawer/page behavior. **Do not globalize project-specific preferences**. Many API/theme questions remain open. |
| `⭐PUTERS' LIVING NIGHTMARE.md` (`libfile_8dbef1e848208191a4fd5f00db1d322c`) | Prior explicit *webpage standards brainstorm*: accessibility, visual coherence, HTML/URLs/metadata, portability/offline/export, trust/provenance. “A tiny webpage shouldn't need an entire application framework” and pages should explain their contents and dependencies. | Historical conversation/assistant proposals; not a finalized spec. Conceptually aligns with lightweight mini-apps and in-app help. |
| `Library-Hygiene-Standards-Draft.md` (`libfile_ebaea553953c8191876a913a42229ef1`) | Retention, verified duplicate decisions, provenance, preservation of meaningful source/creative work, source-first Git stewardship, no redundant bundles, verifiable reconstruction, bounded cleanup. | Explicit draft, not cleanup authorization. Use to refine **adoption / retirement** process, not as a UI template. |
| `Pretend-Internet-Library-Crawl-2026-10-21.md` (`libfile_f367407e13c0819190ffa0c9e37e1378`) | Source map of design references: studio-shell drafts, UX notes, illustrations/style sheets, WebToApp experiments, shell archives. Flags missing content verification and sensitive raw archives. | **Locator / recovery index**, not authoritative design. Many named files were only indexed, not reread or executable. **Do not import its recovered shell as baseline**. |
| `napplet-design-pilot.md` (`libfile_81e5f08b67808191a480dc6ad65e7880`) | Proposed task anatomy: inputs, operations, policy, interaction, persistence and host requirements; APK references were static evidence, not verified runtime behavior. | Design-research notes, useful for describing an app's job, not a mandate to adopt another shell or adapter. |

## Reuse, rather than rewrite

1. **Development baseline**: Candidate ENG-01/02/07/08/09 — visible acceptance criteria, scope protection, source/lock/license provenance, build-versus-device evidence, meaningful tests. ENG-03–06 apply **when** data mutation, long operations, or host boundaries exist; do not require extra architecture for a static single HTML page.
2. **UI baseline**: Candidate UI-01/02/03 — semantic theme tokens and consistent state/control behavior; accessible labels, focus and touch targets; clear empty/busy/error/saved states. UI-04 says **measure** performance, not invent a universal budget.
3. **Skins**: Treat the deep pink/black/pale pink/silver **Nostr Shell** palette as a *candidate skin*, not a forced global theme; other mini-apps may need distinct palettes. Material interaction references can inform consistent behavior without requiring a Material component dependency.
4. **Self-explanation**: The earlier webpage discussion provides precedent; the **current explicit user rule** is stronger: each mini-app explains what it is, what it does, how to start, limitations and data behavior inside the UI. Help should remain accessible without Puter.
5. **Interface contract**: The Developer Decisions register's API-01–API-05 are **open**, so don't pretend a universal API standard exists. No mandatory HTTP service, framework, JSON event bus or adapter; document actual external boundaries per app.
6. **Project proof**: A compiler pass or preview is not proof of the installed WebToApp APK. Test on the intended target and report exactly what was executed.
7. **Library lifecycle**: The hygiene draft already captures nuanced `keep/merge/deduplicate/discard/review` judgments, recoverable source and retention exceptions. Align adoption receipts and retirement with it. No deletion without a separate explicit user instruction.

## Gaps to settle for Stage 0 (small, not a new framework)

- [ ] Confirm which ENG/UI candidate rules should be **adopted as general mini-app standards** and keep project-specific guidance scoped.
- [ ] Specify an intentionally tiny **`app.json` metadata contract** for purpose, entry, version/status, offline/data behavior and accessible help; do not assume WebToApp parses it.
- [ ] Choose minimal semantic CSS names and **one example default skin**; theme tokens should support alternatives without changing logic.
- [ ] Define **one visible Help entry** that works even when Puter is disabled and can get its text from the app manifest or a companion content file.
- [ ] Validate all three on one independently buildable mini-app and then on its **installed WebToApp APK**. Keep the result pending until observed.

## Explicit non-adoptions

- No React, Flutter, MUI dependency, Node server or universal API required simply to comply.
- No blanket adoption of Nostr Shell home screen, navbar, avatar menu, textures, or palette for unrelated apps.
- No transplanting old broken UI code or giant Library archives into this repository.
- No promotion of an assistant brainstorm, an index, a mockup, or a historic PASS note into a user-approved engineering decision.

**Bottom line:** Enough reusable rules already exist to draft the mini-app contract. The next artifact should be the **small contract and its runnable proof**, not another broad standards exercise.

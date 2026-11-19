# Pretend Internet — product intent and operating boundaries

**Status:** source-recovered product orientation, 2026-11-18. This is guidance for interpreting the repository, **not** a claim that the whole product is implemented or that every historical idea is approved. Read [AGENTS.md](AGENTS.md) for current working rules and [issue #27](https://github.com/br3avery-maker/Pretend-Internet/issues/27) for the portfolio-level delivery scope.

## What the project actually is

Pretend Internet is intended to feel like a **browsable, local-first world** made of *real, reachable things*: websites and pages, apps, media, books, galleries, games, personal files, documentation and useful tools. It should be interesting and usable to explore, not just an inventory, developer dashboard, component demo, or static list of proposed features.

**Delivery boundary:** It is also an **umbrella of independent, useful applications**. Existing readers, media apps, launchers, archive tools, publishers and other projects may remain independent; no new compulsory host, framework, account, wallet, Nostr layer or shared backend is authorized merely to make the world legible. Navigation between experiences is valuable, but no single shell is the required runtime for every app. See [#27](https://github.com/br3avery-maker/Pretend-Internet/issues/27).

**The root `index.html` is currently a development shelf.** The Pocket Counter demonstrates a tiny standalone mini-app; **it is not the product definition, complete app portfolio, or a satisfactory destination experience**. The October 21 [ROADMAP.md](ROADMAP.md) is a dated, narrower mini-app standards plan. [DEVELOPMENT.md](DEVELOPMENT.md) explicitly labels its standards draft. Do not infer the full product scope from either document.

## What an imported coding agent should do first

1. Read this file, [AGENTS.md](AGENTS.md), [README.md](README.md), and the relevant open/closed issue and current source before making design or implementation choices.
2. Identify the **specific existing workstream** the request refers to, and distinguish working source, prototypes, user-observed behavior, verified release and proposals. The nsite directory is only one component.
3. Recover original intended behavior and current user corrections **before** using existing implementation as the specification. Compare the existing artifact to the requested user workflow.
4. Prefer repairing or integrating **selected existing working components** over introducing a second version, new universal framework, additional dashboard or renamed demonstration.
5. State exactly what has been **source-inspected, built, browser-tested, installed on a target device, or externally verified**. Never equate a passing CI check with a working Android APK.
6. Treat private conversations and Library artifacts as **private evidence**, not material to commit to this public repository. GitHub documents should summarize non-sensitive requirements and link public issues; preserve private source references in a user-controlled location.
7. Honor current no/deletion/publication/signer/credential boundaries. An investigation or documentation change grants no public publishing, automated scraping, app installation, or destructive storage changes.

## Recovered product requirements (status-labelled)

| ID | Requirement / correction | Status | Primary public source |
| --- | --- | --- | --- |
| PI-01 | Actual usable, linked, browsable experiences; local/private use works without making accounts/network a prerequisite. | Confirmed product intent; complete experience **not verified** | [#3](https://github.com/br3avery-maker/Pretend-Internet/issues/3), [#27](https://github.com/br3avery-maker/Pretend-Internet/issues/27) |
| PI-02 | Recover existing projects and compare real behavior with original asks; preserve source identity, provenance, versions and what actually works. | Confirmed; ongoing work, not completed | [#3](https://github.com/br3avery-maker/Pretend-Internet/issues/3) |
| PI-03 | Independent useful applications, not one giant mandatory launcher, and not solely the nsite archive. | Explicit scope correction | [#27](https://github.com/br3avery-maker/Pretend-Internet/issues/27) |
| PI-04 | No automatic remote nsite HTML, assets, ZIPs, screenshots, pages or full-site trees for **directory discovery, browsing, classification or enrichment**. Bounded relay/event metadata is allowed; unknown stays unknown. | **Current mandatory prohibition** | [#41](https://github.com/br3avery-maker/Pretend-Internet/issues/41), [AGENTS.md](AGENTS.md) |
| PI-05 | No unnecessary repeated import/setup; practical reader, player, file-open, publisher and navigation workflows with persistence, understandable Help and honest status. | Confirmed; verify per individual app | [#4–#9](https://github.com/br3avery-maker/Pretend-Internet/issues/4), [trial feedback](docs/trial-feedback-2026-10-22.md) |
| PI-06 | Personal UI uses black or near-black, **#ff1493** deeppink, white and silver/neutral gray. **No purple, violet, plum, lavender, including dark chrome backgrounds.** | Current acceptance constraint; current root demo CSS **does not comply** | AgentOps interface/palette policy (private), owner correction |
| PI-07 | Nostr, nsites, signer, publisher, agent curation, mirrored storage, cross-device sync and local-network ideas may be useful per workstream. | Exploratory/optional **unless separately adopted** | [#12](https://github.com/br3avery-maker/Pretend-Internet/issues/12), [#21](https://github.com/br3avery-maker/Pretend-Internet/issues/21), [#22](https://github.com/br3avery-maker/Pretend-Internet/issues/22) |

### Directory discovery is not an archive-download request

The existing [Nsite Archive](apps/nsite-archive/README.md) and [Node archive tools](tools/nsite-archive/README.md) contain distinct historical download-oriented implementation. Their existence is **not** permission to fetch remote site content when the actual task is directory discovery or classification. Follow the November 14 correction in [#41](https://github.com/br3avery-maker/Pretend-Internet/issues/41). Do not delete or disable older archive source under cover of documenting that boundary.

## Existing entry points — not an inferred system architecture

- Root `index.html`, `templates/mini-app/`: development mini-app shelf and Pocket Counter example. Source present. **Not the full Pretend Internet.**
- `apps/folder-launcher/`: an independently packaged local HTML/ZIP launcher. See its own README and [#11](https://github.com/br3avery-maker/Pretend-Internet/issues/11) for exact release/device evidence.
- `apps/nsite-archive/`, `tools/nsite-archive/`: browser and Node archival implementations, governed by their own source, known behavior and restricted purpose.
- `tools/relay-router/`: independent event-kind-aware Nostr routing code. Use only when relevant; do not turn it into mandatory infrastructure.
- Other proposed or tested readers, media and creative apps may be in **Library, WebToApp or separate repositories**, not necessarily in this working tree. Inspect provenance before claiming or importing them.

Do not claim `main` already assembles all those experiences into a usable phone Internet. An on-device, end-to-end visit/search/open/persist/revisit test has not been established for the complete experience.

## Cold-import comprehension checks

Before coding after a repository-only import, answer all of these from cited source:
- **What is the intended experience?** The answer must not be “a counter” or “an nsite archive.”
- **What does this checkout actually deliver?** Distinguish source trees, current root UI and target-tested apps.
- **What is explicitly prohibited?** Especially automatic remote content retrieval for nsite discovery.

If any cannot be answered reliably, inspect original issue/source evidence before proposing changes.

## Sources and traceability

Public sources: [#3 recovery](https://github.com/br3avery-maker/Pretend-Internet/issues/3), [#27 portfolio](https://github.com/br3avery-maker/Pretend-Internet/issues/27), [#41 current discovery boundary](https://github.com/br3avery-maker/Pretend-Internet/issues/41), [#28 release evidence](https://github.com/br3avery-maker/Pretend-Internet/issues/28), and [trial feedback](docs/trial-feedback-2026-10-22.md). This document was also compared with original September–November 2026 conversation records. **The full private archive and exact message evidence are deliberately not committed.** See [the pilot audit](docs/HISTORY-TO-REPO-PILOT-2026-11-18.md) for which claims are source-grounded and what remains to test.

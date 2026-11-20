# Pretend Internet

*A small Internet made of real things. The pretending is where we start.*

What if you could make your own little corner of the Internet: a place to explore handmade sites, run little applications, read stories, play games, listen to music, keep your work, and come back later? What if it worked on an ordinary phone, could be private or offline when useful, and could grow without depending on one company, account, runtime or protocol?

**Pretend Internet is a growing world of independent, useful places—not a fake Internet screenshot, a single launcher, or one more developer dashboard.** The ambition is expansive; the current implementations are varied and incomplete. We want the real behavior of each place to be as convincing as the idea behind it.

## Where it began

The name came out of experiments in making complicated, scattered projects visible and usable. In September 2026, **Melody** helped turn a recovered-artifact catalog into a more recognizable little store: pictures, categories, honest status lights, links that lead somewhere, and room for a human to correct the machine.

When another experiment was blocked by the lack of a public host, the suggestion was to make a *baby server* and a *pretend Internet* locally, so real interactions could be tested before the final environment existed. What began as an imaginative answer to a technical blockage grew into a question: **what if we made an actual place for things that do not have one yet?**

The earlier catalog, programming and Nostr experiments had their own histories. This is one part of the origin, not a claim that one person or a single conversation invented everything. The personal details and original private transcripts are intentionally not published.

Read [the fuller origin](docs/ORIGINS.md).

## What belongs here

The main repository is the **portfolio's home for the vision, scope, acceptance criteria, source map, and shared documentation**. Individual applications can live here or in their own repos; they should remain independently usable. There is **no mandatory universal shell, wallet, Nostr layer, backend, agent, or monorepo migration**.

The project's recovered threads are organized as **seven planning workstreams, not historical releases**:

| Thread | The question it tries to answer |
| --- | --- |
| **HERE YOU GO** | How do we make scattered and uncertain artifacts understandable and correctable? |
| **Baby Internet** | How do we test real multi-client behavior in a small local environment? |
| **Real App Store** | How do recovered artifacts become applications that truly work? |
| **Linked Little Web** | How do small, independently hosted places become a connected world? |
| **Melody's Room** | How can a personal, portable workspace become somewhere to inhabit and return to? |
| **Pretend Internet Studio** | How do people and agents inspect, repair, package and maintain the things they've made? |
| **Connected World** | What is the smallest genuinely usable experience that demonstrates the whole idea? |

Each is a candidate product, experiment or delivery layer with its own evidence and decisions. **They are not a compulsory seven-step build plan.** See [workstreams and existing issue owners](docs/WORKSTREAMS.md) and [the portfolio roadmap](ROADMAP.md).

## The first real milestone

**Find → Open → Use → Keep → Return.**

A person should be able to find a real application or place, open its actual content, do something useful, save or export what matters, and return without unnecessary re-import or setup. The **portfolio-level** demonstration calls for two independently useful experiences accessible from one understandable entry point. It does not require all seven workstreams to be complete.

See [MVP acceptance and evidence](docs/MVP.md) and [the main portfolio issue #27](https://github.com/br3avery-maker/Pretend-Internet/issues/27).

## What exists today

| Source | Evidence / limits |
| --- | --- |
| [Root development shelf](index.html) and [Pocket Counter template](templates/mini-app/) | Source and small demonstration are present. **Not** the Pretend Internet as an experience; no complete root APK has been established from this README. |
| [Folder Launcher v0.2](apps/folder-launcher/README.md) | Independently useful Android HTML/ZIP launcher, with clean build evidence and **owner-attested** device verification. It is a candidate entry point, **not** proof two independent applications have passed the portfolio milestone. |
| [Browser Nsite Archive](apps/nsite-archive/README.md) and [Node archive tool](tools/nsite-archive/README.md) | Separate historical archive implementations with their own tests and limitations. **Not** the entire Internet and **not** permission to download remote sites during discovery. |
| [Relay Router](tools/relay-router/) | Independent Nostr routing component; optional for applications that need it. |
| Other readers, media players, creative tools, publishing experiments and shells | Some source may be in separate repos, Library archives or WebToApp. Current provenance, functionality and host suitability must be recovered and verified individually. |

**The connected portfolio is not yet verified end to end.** A working component, a build, a preview, an owner observation and an installed/published release have different evidence standards.

## Start here

- **Understand the vision:** [Origins](docs/ORIGINS.md) → [PROJECT.md](PROJECT.md) → [workstreams](docs/WORKSTREAMS.md).
- **Choose the actual next user workflow:** [Roadmap](ROADMAP.md) → [MVP gate](docs/MVP.md) → [recovery issue #3](https://github.com/br3avery-maker/Pretend-Internet/issues/3) and [portfolio issue #27](https://github.com/br3avery-maker/Pretend-Internet/issues/27).
- **Build or maintain an existing app:** follow its own README, [DEVELOPMENT.md](DEVELOPMENT.md) (still a draft), [AGENTS.md](AGENTS.md), and [cross-app verification #28](https://github.com/br3avery-maker/Pretend-Internet/issues/28).

**Current directory boundary:** finding/classifying nsites may use bounded Nostr event metadata and existing records, **not automatically fetched remote HTML, screenshots, assets, pages or ZIPs**, including representative pages or later/background downloads. Unknown classifications remain unknown. Intentional local-file import and separately authorized archival are different actions. See [owner correction #41](https://github.com/br3avery-maker/Pretend-Internet/issues/41).

---

## Root developer shelf and archived build guidance

The sections below document existing small developer entry points and independent archival components. They are retained for continuity; **none of them defines the scope of the Pretend Internet**.

## Build from the GitHub repository root (WebToApp Frontend)

The root has a real static entry (`index.html`) and `package.json`. The build script copies the launcher and its existing Pocket Counter example into `dist/`.

**Important WebToApp compatibility:** Its on-device npm environment can run a build script while `node` is not exposed as a shell command. The current build therefore uses **POSIX `sh`, `mkdir`, and `cp` only**. It does not call `node` and downloads no JavaScript build dependencies.

In WebToApp → **Frontend → Import from GitHub**:

1. Enter `https://github.com/br3avery-maker/Pretend-Internet`.
2. Branch: `main`. **Sub-path: blank** to build the full repository launcher.
3. Tap **Fetch & Analyze** again to refresh the local copy (remove/reselect an older downloaded workspace if necessary).
4. Run the `build` script; WebToApp should use `npm run build` and package output directory **`dist`**.
5. Test WebToApp's preview **and** the exported, installed APK. Report the actual device result before setting any app to `live`.

WebToApp may label this minimal static project **Framework: Unknown**. That alone is not an error: there is no React/Vue/Vite framework. If you'd rather skip npm entirely, choose its **HTML** app type and import the static files instead; HTML is the intended type for unbuilt static websites.

**This is a small development launcher, not the finished Pretend Internet or the 16 apps previously packed in Br3Apps.** Only one explicitly WIP example is included. No private services, keys, or Library sources are bundled.

To validate on a regular computer with npm: `npm ci && npm run build && npm run check`. To run without any `node` command: `sh scripts/build-frontend.sh && sh scripts/check-frontend.sh`.

Open `templates/mini-app/index.html` directly for the standalone example. No backend or network is needed.

To make a new app, copy the template into `apps/<app-id>/`, set `app.json.id` to the same directory name, replace its actual functionality and visible Help, and validate metadata with `python3 scripts/validate-mini-app.py apps/<app-id>`. This only checks metadata and file paths, not runtime or APK operation.

Nothing in this repository automatically imports, archives, or deletes ChatGPT Library files.

## Local nsite archive and content search

[Nsite Archive](tools/nsite-archive/) is an independent local worker and portable static directory for issue #14: relay discovery, complete bounded asset collection, native hash verification, shared CDC chunks/Hashtree nodes, signed version history, actual page-text search, safe screenshot capture, publisher counts and reversible filtering. It reuses the existing [relay router](tools/relay-router/) read transport. It is not part of the launcher/APK build and starts no public crawler, publisher or recurring job. See its [run instructions](tools/nsite-archive/README.md) and [verification evidence](tools/nsite-archive/VERIFICATION.md).

## Browser nsite archive repair

The independently runnable [Nsite Archive browser app](apps/nsite-archive/) repairs the APK interface reported in #17. It preserves the existing archive database/backup format, moves expensive work to workers, provides nine separate HTML application documents, and applies the manually confirmed campaign exclusions. [Verification](apps/nsite-archive/VERIFICATION.md) separates browser fixture/runtime evidence from live network and installed APK testing. It is not included in the older root launcher build; use its own `build.sh` or WebToApp sub-path `apps/nsite-archive`.

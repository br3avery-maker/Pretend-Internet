# Pretend Internet — independent workstreams and proposed editions

**Status: planning map, November 2026.** The labels A–G describe distinct threads of the project's evolution. They are **not version numbers, releases, prerequisites, promises, or blanket implementation approval**. The main repository is the *portfolio's documentation and coordination home*; an independent app may have its own repo, tests and releases.

| Track | Why it exists | Smallest useful demonstration | Canonical existing work |
| --- | --- | --- | --- |
| **A · HERE YOU GO / honest catalog** | Make scattered real artifacts understandable, status-labeled and correctable | Browse a small source-grounded set; open its evidence; change a wrong claim without losing provenance | [Recovery #3](https://github.com/br3avery-maker/Pretend-Internet/issues/3), historical Library/concordance artifacts; verify current source before reuse |
| **B · Baby Internet / local testnet** | Test networked behavior without claiming a public launch | Two independent clients exchange one persisted change through an isolated, disposable server; restart/conflict results recorded | Historical local-network experiments; no verified current deployment assumed |
| **C · Real App Store / useful apps** | Distinguish a catalog of artifacts from finished applications people can actually run | Recover existing source, complete one genuine primary user task, and publish an accurate run/test receipt | [Recovery #3](https://github.com/br3avery-maker/Pretend-Internet/issues/3), [cross-app verification #28](https://github.com/br3avery-maker/Pretend-Internet/issues/28) |
| **D · Linked Little Web** | Explore independent sites and portable publishing that can link together | Two independently openable sites with working navigation and known content/provenance | [Nsite lifecycle #21](https://github.com/br3avery-maker/Pretend-Internet/issues/21); [optional host investigation #22](https://github.com/br3avery-maker/Pretend-Internet/issues/22) |
| **E · Melody's Room / portable pretend computer** | Give a personal workspace a recognizable, persistent place | Open a real document or toy in an existing host; save its state and reopen it after interruption | Personal-room and shell proposals; no universal host or shared runtime selected |
| **F · Pretend Internet Studio / operator workbench** | Make existing work inspectable, repairable and maintainable without creating duplicates | Select one real project, inspect provenance, perform one bounded maintenance action, save a verifiable receipt and recover | October Studio proposal; [portfolio #27](https://github.com/br3avery-maker/Pretend-Internet/issues/27); existing project tools remain canonical |
| **G · Connected World / portfolio milestone** | Demonstrate that independent useful places form a navigable experience | **Two independent working experiences** discoverable from an understandable entry point, with Find → Open → Use → Keep → Return verified | [Portfolio #27](https://github.com/br3avery-maker/Pretend-Internet/issues/27); [Folder Launcher #11](https://github.com/br3avery-maker/Pretend-Internet/issues/11); [verification #28](https://github.com/br3avery-maker/Pretend-Internet/issues/28) |

## Delivery approach for every track

1. **Recover.** Locate existing user requests, project owners, source, versions, licenses and open **and closed** issues. Separate original goals from later corrections and from existing code.
2. **Prove one useful behavior.** Define a human task, choose the strongest existing implementation, and test that behavior in its intended environment. Mark untested results as untested.
3. **Make it continuable.** Record a build/run path, user-facing help, provenance, state persistence and failure/recovery behavior. Link a verified artifact or an explicit blocker.
4. **Connect only if useful.** Reuse well-defined capabilities between real consumers; standalone tools do not have to join an application shell or become Nostr-dependent.

These steps are *evaluation criteria*, not an instruction to run seven implementations. Each track needs separate scoped implementation authority.

## Relationships, not a dependency chain

- **A** indexes *what exists*; **C** delivers *what works*. Do not rebrand A as C by changing its icons or status text.
- **B** tests a local topology. It does not establish a public Internet, and **D** does not require B to be continuously hosted.
- **E** is a personal experience inside an available workbench, **not** the universal runtime for all apps.
- **F** manages or repairs projects. It must not absorb their source or override their owners.
- **G** is the smallest **portfolio-level** demonstration. It can reuse the independently implemented [Folder Launcher](../apps/folder-launcher/README.md); building another shell is not a prerequisite.

## Current state and hard boundaries

The root [index.html](../index.html) is a development shelf with Pocket Counter; it is not the portfolio. [Folder Launcher v0.2](../apps/folder-launcher/README.md) has build/source evidence and an **owner-attested** installed Android workflow, with limitations recorded in its own README. The cross-app connected world has **not** been independently established end to end.

**Directory discovery is metadata-only:** it does not automatically download remote nsite HTML, images, ZIPs, page trees or representative pages, even to classify them. See [correction #41](https://github.com/br3avery-maker/Pretend-Internet/issues/41). Historical archival/download tools are a separate workstream, not permission to expand the directory.

Local-first/private use remains meaningful without accounts or a server when the experience permits it; Nostr, relays, Blossom, agents, content addressing, wallets and Android hosts are **optional, selected per application**. No silent publishing, bulk network scraping, deletion, secrets handling, or migration follows from this map. For the owner's personal UI, the source requirements specify **black, #FF1493 deeppink, white, silver/neutral gray, and no purple**.

See [PROJECT.md](../PROJECT.md), [the roadmap](../ROADMAP.md), [MVP gate](MVP.md), and [AGENTS.md](../AGENTS.md).

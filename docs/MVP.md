# Pretend Internet — minimum real experience and verification

**Status:** reconstructed **portfolio acceptance criterion**, not a declaration that a specific shipped version exists. Source of portfolio authority: [issue #27](https://github.com/br3avery-maker/Pretend-Internet/issues/27). Specific apps retain their own requirements, owners and release decisions.

## The user task: Find → Open → Use → Keep → Return

1. **Find:** A person using an ordinary supported device can discover an actual place or app from a meaningful, accessible entry point. The name and functional status are honest.
2. **Open:** The entry opens its real content, including required local assets, rather than a mockup, dead card or setup loop.
3. **Use:** A normal primary action succeeds. Define this per application: read a chapter, play local media, complete a game action, edit a file, inspect a site, or perform a genuine publishing step in a separately authorized test environment.
4. **Keep:** The person's intended data or progress persists, or an explicit export/backup path works. State what is private, offline, stored locally, or sent over a network.
5. **Return:** Reopening after leaving/restarting resumes at a sensible state without unnecessary re-import or account creation.

The application must explain itself, handle empty/error/offline states, respect accessibility and Android navigation where applicable, and identify its actual permissions and limitations. These are measurable behaviors, not decorative screen requirements.

## Two milestones, not one giant application

**M1: One usable experience.** Take a recovered or existing independent application to a reproducible, target-specific primary-task pass. A launcher that displays an icon does **not** by itself pass this gate for the launched application.

**M2: First connected-world portfolio demonstration.** Make **two independently useful applications/places** findable from one understandable entry point, with working transitions and separately verified M1 behavior for each. The entry point could be an existing launcher or link page; a new universal runtime is **not required**.

Candidate donor: [Folder Launcher v0.2](../apps/folder-launcher/README.md), whose Android source, build results and owner-attested testing are documented under [issue #11](https://github.com/br3avery-maker/Pretend-Internet/issues/11). Do not treat its attestations as independent instrumentation or infer that two target apps are already verified.

## Proof required before calling the milestone delivered

| Check | Evidence to retain |
| --- | --- |
| Existing source and project identity | Canonical repo/path, commit/version, license/provenance |
| Clean build or direct-run method | Exact command/environment, input revision, artifact path and hash when applicable |
| Actual task | Steps, expected/observed outcome, failures and screenshots/logs if available |
| State | Save/export, restart/reopen, offline behavior, error and recovery tests |
| Device and accessibility | Identified browser/WebToApp/APK/Android target, Back/navigation, touch and focus checks |
| Release | Installed/published artifact and signer/permissions, *only if separately verified and authorized* |

Track **PASS / FAIL / UNTESTED / N/A** for each check and each *specific target*. A green CI test, HTML preview, owner report, installed APK and publicly deployed site are different evidence classes. See [verification workstream #28](https://github.com/br3avery-maker/Pretend-Internet/issues/28).

## What this criterion does not require

A server, universal wallet, Nostr account, Blossom storage, mandatory shell, single monorepo, automated downloader, shared AI agent or one prescribed visual template. Those technologies can solve a real app's problem only after their value and boundaries are established.

**Current portfolio state:** the complete M2 demonstration is **not verified**. The root Pocket Counter shelf is not the product; existing Folder Launcher and independent applications are distinct evidence-bearing pieces, not a blanket release claim.

Go to [the full project definition](../PROJECT.md), [all proposed workstreams](WORKSTREAMS.md), or [the portfolio roadmap](../ROADMAP.md).

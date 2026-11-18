# Pretend Internet — history-to-repository pilot, 2026-11-18

**Purpose:** Check whether original project intent can be recovered from historical evidence and made visible to a coding agent importing only the repository. This is an **analysis and documentation** experiment, not software implementation or an APK test.

## Inputs and evidence classes

- **PRIVATE historical source inspected:** November 16 ChatGPT export in the owner's Library; 11 JSON conversation shards, 1,085 conversation containers, updates through November 15. Searched user-authored messages directly and examined selected messages from September 24–November 15. The original private text, message identifiers and archive **are not reproduced in GitHub**.
- **PUBLIC source inspected:** current `README.md`, `AGENTS.md`, `ROADMAP.md`, `DEVELOPMENT.md`, `index.html`, `package.json`, app/tool READMEs, issue [#3](https://github.com/br3avery-maker/Pretend-Internet/issues/3), [#27](https://github.com/br3avery-maker/Pretend-Internet/issues/27) and [#41](https://github.com/br3avery-maker/Pretend-Internet/issues/41), and the root repository tree.
- **Classification:** historical user-stated intent, current correction, source-inspected implementation, planned/proposed work, unknown target behavior. Historical proposals are not automatically current implementation authority.

## Results

| Finding | Expectation from recovered intent | Current repo evidence | Assessment |
| --- | --- | --- | --- |
| First-run product identity | A browsable, local-first place containing actual reachable/useful experiences | Root [`index.html`](../index.html) shows only a development shelf and Pocket Counter | **Confirmed scope/presentation mismatch**, not a runtime failure diagnosis |
| Portfolio scope | Multiple useful independent apps; nsite index is one component | [#27](https://github.com/br3avery-maker/Pretend-Internet/issues/27) says this, but [ROADMAP](../ROADMAP.md) still foregrounds a miniature app demo | **Already documented in issues; insufficiently prominent on first import** |
| Recovery-first methodology | Identify original request, actual source, working status and smallest useful repair | [#3](https://github.com/br3avery-maker/Pretend-Internet/issues/3) documents appropriate recovery and evaluation; root README does not lead with it | **Established policy, fragmented entry** |
| Nsite discovery | No unsolicited remote HTML/assets/ZIP/page retrieval for finding/classifying sites | [#41](https://github.com/br3avery-maker/Pretend-Internet/issues/41) and [AGENTS](../AGENTS.md) correctly prohibit it; separate archival code remains | **Documented correction; runtime behavior not tested** |
| Visual identity | Zero purple; black, #ff1493, white, neutral gray | Root CSS defines #181017, #271d28, #342532, #644355 and #f0589c | **Direct source mismatch; no UI edit performed** |
| Real workflow/verification | Open real content, retain state, function on target device | Source trees and test suites exist; different release evidence by app | **No holistic Android runtime proof from this audit** |

## Documentation intervention

- Add [`PROJECT.md`](../PROJECT.md) as a concise product and authority entry point, distinguishing experience, umbrella delivery, workstreams, prohibited actions, current implementation and exploratory ideas.
- Add an early link in `README.md` and `AGENTS.md` so a cold repository import encounters the actual product intent before interpreting the Pocket Counter.
- Preserve `ROADMAP.md` as a dated narrow plan rather than rewriting it to appear approved for a broader scope.
- Do not add the private conversations, attachment details or historical data into the public repo.

## Evaluation protocol (not yet executed in Google AI Studio)

**Cold-read only:** give the branch/repository to an otherwise unbriefed coding agent; do not supply narrative hints. Require source-linked answers.

1. **Product comprehension:** distinguish a browsable local-first world and portfolio of independent apps from the current Pocket Counter development shelf.
2. **Discovery safety:** propose metadata-only nsite classification and use `unknown` when event metadata is insufficient; prohibit automatic `index.html`, asset, ZIP, page or screenshot retrieval.
3. **Truthful maturity:** label code-exists, CI/build-only, browser-tested, owner-observed, APK/device-tested, externally verified and proposed separately.
4. **Actionable recovery:** name an existing app source and issue; choose a small user-facing workflow to inspect/repair without inventing a new universal shell, downloader or app catalog.
5. **Visual correctness:** locate the current root CSS noncompliance instead of treating its dark plum palette as approved project styling.

**Result threshold:** all five answer correctly with current, relevant evidence. A reading/comprehension pass does **not** prove the app is usable, and a documentation PR does **not** fix any UI or runtime defect.

## Outstanding work and explicit limitations

The history screening is not exhaustive over every conversation or attachment. The private evidence has richer source locators for traceability and Gemini Notebook review. No actual Google AI Studio import, APK install, browser interaction, network retrieval, Nostr signing, publish action or external workflow was executed in this pilot. No app code, tests, schemas, site content, release state or user data were modified.

The user retains control of implementing, retiring, deleting or publishing any separate application. This test changes how the existing repository describes itself; it does not reinterpret exploratory ideas as approved tasks.

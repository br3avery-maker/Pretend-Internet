# Evidence-driven nsite curation — research scaffold

**Status:** research / investigation only (2026-11-09). **Issue:** [#41](https://github.com/br3avery-maker/Pretend-Internet/issues/41). **Branch:** `research/nsite-evidence-curation`.

This is **not** a new application, an approved architecture, a release, a working implementation, or a replacement for the existing Nsite Directory Editor. It preserves an independently discussable capability direction and enables evidence-first investigation before design/build decisions.

## User-origin invariant

An index should use the evidence it gathers to organize what it knows, identify what remains uncertain, and reduce the amount of manual curation needed. Work that can be safely derived from data should happen in ingestion/enrichment; human review should target ambiguity, attribution, quality judgments, or consequential rules.

**Representative situations, not a closed boundary:**
- A metadata-empty, untitled nsite should be routed to progressively cheaper discovery/preview/screenshot steps and, only if needed, a `capture → next` review queue.
- Many identical screenshots should trigger a cluster investigation rather than repeated individual review; matching previews do not establish matching source content or authorship, and a common error screen is a possible explanation.
- A publisher's many manifest occurrences should render as a useful portfolio of distinct projects, versions, mirrors/forks and unresolved cases without double counting or losing provenance.
- Categories such as developer tool / CLI / forum / blog / documentation can be inferred as **multiple facets**, not manually added to every object.
- Patterns in page structure, OCR/full text, language, assets and publication metadata should yield **reviewable, reusable classification/filter hypotheses**.
- Automatically generated collections, queues, publisher views and review scopes should stay synchronized with the underlying index; manual collections remain independently editable.

## Existing evidence and boundaries

| Source | Evidence level / reuse boundary |
|---|---|
| *Session Export — nsite agent-skill catalogue*, 2026-09-25 (ChatGPT Library) | Original discussion of curator/groundskeeper; clone/version/lineage, spam patterns, transferable maintenance. **Conceptual source, not implementation.** |
| *Pretend Internet — Discovery Triage Napplet v0*, 2026-10-07 (ChatGPT Library) | NON-CANON proposal for background scout, sandbox previews, automated screenshots, missing metadata, local/source/suggested tags, deterministic evidence packs and round-trip proposals. **Not verified as shipped.** |
| Nsite Directory Editor audit, 2026-11-09 (deployed version 5, source `5435b2156b3736d08895f2dd1a5bb1dba7d30ee6`) | Preview-observed interactions and reported source analysis. Two-tab snapshot overwrite was reproduced; potential losses of other user edits remain source-inferred. Source is **not assumed present in this repo**. |
| [Pretend-Internet archive/indexer #14](https://github.com/br3avery-maker/Pretend-Internet/issues/14) | Existing code/evidence candidate for archive ingestion, signed provenance, hash verification, content search, deduplication and versions. Inspect actual current modules/tests before reusing. |
| [Pretend-Internet portfolio boundary #27](https://github.com/br3avery-maker/Pretend-Internet/issues/27) | The directory is one independent component within the portfolio; no mandatory global shell or monolithic dependency. |

## Behavioral pipeline under investigation

```text
sources / manifests / assets / screenshots / HTML / publisher records
      → verified observations + claimed source metadata
      → feature extraction (hashes, structure, text, language, OCR)
      → entity/relationship candidates (occurrences, projects, releases, publishers)
      → multi-label classification + pattern discovery
      → derived views / generated queues / candidate rules
      → targeted human resolution, corrections and provenance
      → incremental reevaluation of affected records
```

Distinct states: **observed** (reproducible evidence), **inferred** (hypothesis with evidence), **reviewed/approved** (explicit human decision). A subsequent correction changes a derived result without falsifying the source record.

### Boundaries to preserve

- Separate source metadata, extracted/derived fields, human corrections, visibility rules and publisher attribution.
- Exact file equality, screenshot equality, perceptual similarity and declared version/parent relations mean different things; do not collapse them.
- Proposed mass suppression requires evidence, preview of affected items, reversibility and an explicit policy/approval boundary. Raw occurrences remain recoverable.
- The unknown-site preview sandbox must not have ambient signer, secret, local-file or device privileges. Budget CPU/network/storage on phone; never claim suspended web pages continue background indexing.
- Preserve separately local indexing, public catalogue preparation, Nostr signing, relay acceptance, and verified retrieval.
- Do not invent source/project data, performance figures, a new Nostr protocol, a canonical external server, or ongoing background automation.

## Investigation tasks — no runtime changes authorized

1. **Inventory** authoritative Nsite Directory Editor source and actual active/deployed revision; inspect current archive/relay indexer modules and locate matching behaviors before declaring missing/new work.
2. **Map identities and existing storage:** Nostr event/occurrence, NIP-5A site identity, snapshot/root, content hash, project, publisher, mirrored location, fork, declared/inferred lineage, review state. Prefer existing schema/standards rather than duplicate tables.
3. **Map extraction:** claimed metadata versus HTML title/h1/meta, fetched text, language detection, translation, screenshot capture, OCR, file/content/perceptual/structural hashes; identify supported runtime and safe fallback.
4. **Trace workflows:** discovery → classify → group → queue → review → generate collection → publish/export; mark implementation state at every edge (verified/current, source-only, prototype, candidate, blocked).
5. **Define validation fixtures:** no metadata; unrelated sites with matching error screenshots; 300 repeated captures (synthetic count); identical content across publishers; distinct versions/forks; multilingual generated template; low-confidence tags; concurrent indexing/review modifications; unexpected class rule matches; reversible hiding.
6. **Establish measurements:** unique logical objects vs manifest occurrences; auto-resolved vs review-needed; classification accuracy by class/language; false merges and false suppressions; human decisions per distinct work; queue durability; device costs.
7. **Present options and scope boundaries** for discussion, including minimal integration into the current editor versus independent portable index/enrichment utility. Do not silently select or implement a new app.

## Acceptance for this scaffold

- [x] Separate GitHub issue and branch for research (not implementation).
- [x] Preserve prior concepts and current audit without treating proposals as deployed behavior.
- [x] Keep the existing archive issue, project ownership and authorization boundaries visible.
- [ ] Inspect authoritative source and produce a source-verified integration map.
- [ ] Compare evidence methods and a small deterministic fixture suite.
- [ ] Present implementation choices for explicit user discussion/authorization.

**No tests, production changes, crawler, schedule, APK, nsite publication or deployment were performed as part of this documentation scaffold.**

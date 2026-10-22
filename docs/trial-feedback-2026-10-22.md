# First hands-on comparison feedback — 2026-10-22

**Status:** User-observed feedback from a locally exported trial-notes JSON. **No screenshots, private document contents, or source files published.** The original notes are in the private ChatGPT Library; this is a sanitized implementation backlog.

## What was actually tested

| Trial | Reported behavior | Improvement requested | Priority |
| --- | --- | --- | --- |
| Reader A — Pocket Reader | Imported content successfully, across tested materials | Swipe between chapters, hide UI chrome on scroll, remove excess border/padding, avoid unrequested purple | High |
| Reader B — Chapter Shelf | Requires uploading the same readable separately | **Share a local import/library across reader variants**, reduce oversized header | High |
| Viewer C — Vintage Desk | Preferred interface of the tested options; marked useful | Make interaction smoother; explain publishing controls; prefill sensible form defaults | High |
| Player D — Plain Media | Local music playback worked | More qualitative testing needed before normalizing | Pending |
| HTML Scout G | No concrete observation in notes | More testing needed | Pending |
| Gallery E / ZIP Intake F | No notes in this export | More testing needed | Pending |

## Design implications

1. **Separate content from code**. Public builds remain empty by default. User imports local readables, music, or images on-device; never commit personal content.
2. **One intake, multiple tools.** Research a shared device-local content shelf with explicit permission and user-controlled import/export. Readers must not each demand re-upload. For WebToApp, test origin/storage boundaries and SAF file access before promising a shared store across independently packaged apps.
3. **Reader immersion.** Test swipe chapter navigation and collapse reader chrome while scrolling, with an always-accessible path back to controls. Mobile touch and accessibility required.
4. **Visual defaults.** Avoid arbitrary colors and bulky card frames in reader chrome; skins should be intentional and the reading surface spacious.
5. **Vintage desk direction.** Preserve its useful interactions; improve smoothness, explanatory controls, and sensible defaults. Publishing action must tell users where content goes, whether it is public, and whether it can be undone.
6. **Do not normalize yet.** Trial A and B remain competing implementations until the on-device UX problems above are compared and resolved.

## Build handoff failure

The earlier ZIP downloads were generated only in a temporary conversation workspace. In a later workspace they were no longer accessible. This is **not equivalent to saying the user-tested apps did not run**.

- [ ] Commit/publicly publish only **privacy-reviewed source code**, not private Library readables.
- [ ] Make each trial reproducible from a durable source revision.
- [ ] Add a stable GitHub directory or tagged release for tested batches.
- [ ] Verify download links and built ZIPs from a fresh workspace.
- [ ] Record exact version/build identity inside each app Help/About screen.

## Immediate proposed experiment

Implement a single local content-import shelf shared **within one packaged trial lab**, and compare Reader A and B against the same device-imported sample. Only afterward investigate a cross-APK storage strategy if it is actually needed.

**Do not publish private trial files or user documents; this feedback document contains only summarized UI findings.**

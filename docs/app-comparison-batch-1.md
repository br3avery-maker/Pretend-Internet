# Public-Safe App Comparison Trials — Batch 1

**Status:** TESTING / user review, not `live`  
**Prepared:** October 22, 2026  
**Delivery:** seven standalone WebToApp HTML bundles, plus one local multi-app comparison launcher ZIP, delivered in the chat. **Trial source and ZIP builds have not yet been committed to this public repository.**

## Why this exists

Compare *different implementations* of reusable capabilities before normalizing interfaces or extracting code. Let the user try original behaviors on Android, record what works and what fails, then decide which components should be made reusable. Do not treat a collection of old programs as one approved architecture.

| Trial | Capability | Source lineage | Import behavior |
|---|---|---|---|
| Reader A — Pocket Reader | EPUB, HTML, Markdown, plain text | Earlier Pocket Reader | Local file picker; optional IndexedDB |
| Reader B — Pocket Library | Shelf/chapter reading | Earlier Pocket Library interface | Local TXT/Markdown/HTML; session-only; inert HTML conversion |
| Vintage Desk | Asset inspection and previews | Earlier Vintage viewer, seed data removed | Local file input |
| Pocket Media | Audio/video player baseline | New narrow comparison baseline | Local media selection, session-only |
| Gallery Light | Image/GIF viewing baseline | New narrow comparison baseline | Local images, session-only |
| ZIP Intake | Inspect ZIP/archive contents | WebToApp napplet experiment | Local ZIP selection |
| HTML Scout | Browser/WebToApp compatibility | WebToApp HTML scout experiment | Browser capability checks |

The combined lab has an app navigation drawer, per-app Notes, and JSON export of user feedback.

## Privacy boundary

Public app code must be **content-empty**. Exclude personal articles, books, poetry, lyrics, MP3s, original art collections, credentials, local file paths, signing material, private Library manifests and other personal content. The Reader A bundled-books list, Reader B registry/readings, and Vintage seed archive were removed or replaced with empty values in the comparison copies. This must be reviewed again before any source publication.

End-user readables enter **separately via device-local file pickers**. Some apps persist imported material in browser-local storage; others deliberately keep only temporary in-memory session content. No content is auto-synchronized or uploaded.

## Evidence / limitations

- Source structure and package integrity checked; browser interaction smoke tested with synthetic files.
- **Not verified:** installed exported WebToApp APK, Android storage permissions, restart persistence, full-format coverage, large files, battery/performance or complete accessibility.
- No public GitHub source publish, Library migration, or retirement/deletion has been authorized or executed by preparing the test bundles.
- Not all Library app candidates have been inspected or built; this is **Batch 1**, covering reusable reader/media/inspection capabilities.

## User-review checklist

- [ ] Import combined ZIP as a WebToApp **HTML** app and test its drawer and Notes/Export.
- [ ] Load your own EPUB/TXT/Markdown into Reader A and Reader B; compare chapters, scroll, gestures, type options, and storage.
- [ ] Compare image, GIF, audio and video handling in Vintage, Media, and Gallery.
- [ ] Test ZIP Intake and HTML Scout with disposable/sample files.
- [ ] Mark what to keep, discard, fix, or make shared; send notes as an exported JSON file.
- [ ] Only after actual-device review, select source for small, traceable repo adoption.

**Do not turn missing test evidence into passing status.**

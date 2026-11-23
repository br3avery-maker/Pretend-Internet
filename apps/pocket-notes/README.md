# Pocket Notes

A standalone, offline-first notebook for Pretend Internet. Runs directly in any modern browser with zero external dependencies, accounts, or servers.

## What works

- Create, edit, pin, archive, search, and tag-filter notes locally in `localStorage`.
- Safe Markdown preview (headings, bullet lists, checklists, blockquotes, code blocks rendered via DOM nodes without raw HTML injection).
- Undo delete banner for accidental deletions.
- Portable JSON backup/restore and Markdown export.
- PI-06 Dark skin (black, `#ff1493`, white, neutral silver) and Daylight alternate skin.

## Run and validate

Serve the repository root (for example `npm run dev` on port 3000) and open `/apps/pocket-notes/index.html`.

Validate metadata:

```sh
python3 scripts/validate-mini-app.py apps/pocket-notes
```

## Status and limitations

- **Status:** `testing` (browser-tested; not an installed Android APK release).
- Plain text and Markdown only; no binary attachments or remote sync.

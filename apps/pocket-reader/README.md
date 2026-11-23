# Pocket Reader

A standalone, offline-first chapter reader for Pretend Internet. Built with plain HTML, CSS, and ES modules—no framework, account, or network service required.

## What works

- Content-empty default shelf (no personal readables bundled), with an optional synthetic sample reading for immediate testing.
- Local `.md`, `.txt`, and `.html` file import plus direct text entry.
- Automatic chapter splitting on Markdown headings (`#`, `##`) or `---` separators, with safe HTML-to-text conversion.
- Previous/Next chapter navigation, keyboard arrows (`ArrowLeft` / `ArrowRight`), and touch swipe left/right.
- Focus Mode that hides chrome while preserving a single `Show controls` restore button.
- Adjustable font size (`15px`–`26px`), Serif/Sans toggle, per-chapter bookmarks, and persistent chapter + scroll position in `localStorage`.
- Portable JSON shelf export and restore.
- PI-06 Dark skin (black, `#ff1493`, white, neutral silver) and Daylight alternate skin.

## Run and validate

Serve the repository root (for example `npm run dev` on port 3000) and open `/apps/pocket-reader/index.html`.

Validate metadata:

```sh
python3 scripts/validate-mini-app.py apps/pocket-reader
```

## Status and limitations

- **Status:** `testing` (browser-tested; not an installed Android APK release).
- Imported HTML is converted to plain text and headings; embedded scripts and external assets are not executed.
- Binary EPUB and PDF parsing are not implemented.

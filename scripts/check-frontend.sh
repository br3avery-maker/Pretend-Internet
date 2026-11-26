#!/bin/sh
# Static smoke check only: no browser or Android behavior is verified here.
set -eu
cd "$(dirname "$0")/.."
for asset in \
  dist/index.html \
  dist/portal-core.mjs \
  dist/templates/mini-app/index.html \
  dist/templates/mini-app/skin.css \
  dist/templates/mini-app/app.json \
  dist/apps/pocket-reader/index.html \
  dist/apps/pocket-reader/skin.css \
  dist/apps/pocket-reader/reader-core.mjs \
  dist/apps/pocket-reader/app.json \
  dist/apps/pocket-notes/index.html \
  dist/apps/pocket-notes/skin.css \
  dist/apps/pocket-notes/notes-core.mjs \
  dist/apps/pocket-notes/app.json \
  dist/apps/nsite-directory/index.html \
  dist/apps/nsite-directory/skin.css \
  dist/apps/nsite-directory/directory-core.mjs \
  dist/apps/nsite-directory/app.json \
  dist/apps/folder-launcher/web2app/index.html; do
  if [ ! -s "$asset" ]; then
    printf 'FAIL: missing or empty output: %s\n' "$asset" >&2
    exit 1
  fi
done
grep -Fq 'href="./templates/mini-app/index.html"' dist/index.html
grep -Fq 'id="help"' dist/templates/mini-app/index.html
grep -Fq '[data-skin="daylight"]' dist/templates/mini-app/skin.css
grep -Fq '"status": "wip"' dist/templates/mini-app/app.json
grep -Fq '#ff1493' dist/index.html
grep -Fq 'id="helpModal"' dist/apps/pocket-reader/index.html
grep -Fq 'id="helpModal"' dist/apps/pocket-notes/index.html
grep -Fq 'id="helpModal"' dist/apps/nsite-directory/index.html
printf '%s\n' 'PASS: static frontend files, entry links, Help, skins and PI-06 palette (not an Android test)'

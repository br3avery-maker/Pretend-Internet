#!/bin/sh
# Static smoke check only: no browser or Android behavior is verified here.
set -eu
cd "$(dirname "$0")/.."
for asset in dist/index.html dist/templates/mini-app/index.html dist/templates/mini-app/skin.css dist/templates/mini-app/app.json; do
  if [ ! -s "$asset" ]; then
    printf 'FAIL: missing or empty output: %s\n' "$asset" >&2
    exit 1
  fi
done
grep -Fq 'href="./templates/mini-app/index.html"' dist/index.html
grep -Fq 'id="help"' dist/templates/mini-app/index.html
grep -Fq '[data-skin="daylight"]' dist/templates/mini-app/skin.css
grep -Fq '"status": "wip"' dist/templates/mini-app/app.json
printf '%s\n' 'PASS: static frontend files, entry link, Help and skin (not an Android test)'

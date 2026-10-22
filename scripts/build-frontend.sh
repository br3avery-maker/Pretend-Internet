#!/bin/sh
# Portable static frontend build for WebToApp: needs a shell, not the node command.
set -eu
cd "$(dirname "$0")/.."
for asset in index.html templates/mini-app/index.html templates/mini-app/skin.css templates/mini-app/app.json; do
  if [ ! -f "$asset" ]; then
    printf 'ERROR: required frontend asset missing: %s\n' "$asset" >&2
    exit 1
  fi
done
rm -rf dist
mkdir -p dist/templates/mini-app
cp index.html dist/index.html
cp templates/mini-app/index.html templates/mini-app/skin.css templates/mini-app/app.json dist/templates/mini-app/
printf '%s\n' 'Frontend build ready: dist/index.html and dist/templates/mini-app/'

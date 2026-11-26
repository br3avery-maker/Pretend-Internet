#!/bin/sh
# Portable static frontend build for WebToApp: needs a shell, not the node command.
set -eu
cd "$(dirname "$0")/.."
for asset in \
  index.html \
  portal-core.mjs \
  templates/mini-app/index.html \
  templates/mini-app/skin.css \
  templates/mini-app/app.json \
  apps/pocket-reader/index.html \
  apps/pocket-reader/skin.css \
  apps/pocket-reader/reader-core.mjs \
  apps/pocket-reader/app.json \
  apps/pocket-notes/index.html \
  apps/pocket-notes/skin.css \
  apps/pocket-notes/notes-core.mjs \
  apps/pocket-notes/app.json \
  apps/nsite-directory/index.html \
  apps/nsite-directory/skin.css \
  apps/nsite-directory/directory-core.mjs \
  apps/nsite-directory/app.json \
  apps/folder-launcher/web2app/index.html; do
  if [ ! -f "$asset" ]; then
    printf 'ERROR: required frontend asset missing: %s\n' "$asset" >&2
    exit 1
  fi
done
sh apps/nsite-archive/build.sh
rm -rf dist
mkdir -p \
  dist/templates/mini-app \
  dist/apps/pocket-reader \
  dist/apps/pocket-notes \
  dist/apps/nsite-directory \
  dist/apps/folder-launcher/web2app
cp index.html portal-core.mjs dist/
cp templates/mini-app/index.html templates/mini-app/skin.css templates/mini-app/app.json dist/templates/mini-app/
cp apps/pocket-reader/index.html apps/pocket-reader/skin.css apps/pocket-reader/reader-core.mjs apps/pocket-reader/app.json dist/apps/pocket-reader/
cp apps/pocket-notes/index.html apps/pocket-notes/skin.css apps/pocket-notes/notes-core.mjs apps/pocket-notes/app.json dist/apps/pocket-notes/
cp apps/nsite-directory/index.html apps/nsite-directory/skin.css apps/nsite-directory/directory-core.mjs apps/nsite-directory/app.json dist/apps/nsite-directory/
cp apps/folder-launcher/web2app/index.html dist/apps/folder-launcher/web2app/
cp -R apps/nsite-archive/dist dist/apps/nsite-archive
printf '%s\n' 'Frontend build ready: dist/index.html, templates/mini-app/, and standalone apps/'

#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p dist/vendor dist/pages
# Remove only the superseded generated renderer; archives live in IndexedDB.
rm -f dist/app.js
cp index.html publishers.html site.html history.html compare.html page.html collect.html backup.html help.html dist/
cp ui.js archive-client.js collection.js storage.js style.css model.js archive-worker.js collect-worker.js sw.js dist/
cp pages/*.js dist/pages/
cp vendor/archive-engine.js vendor/collector-engine.js dist/vendor/

#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p dist/vendor
cp index.html app.js style.css model.js archive-worker.js collect-worker.js sw.js dist/
cp vendor/archive-engine.js vendor/collector-engine.js dist/vendor/

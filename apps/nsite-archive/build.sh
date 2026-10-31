#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p dist/vendor dist/pages dist/assets
rm -f dist/app.js
cp ./*.html ./*.js style.css manifest.webmanifest dist/
cp pages/*.js dist/pages/
cp vendor/archive-engine.js vendor/collector-engine.js dist/vendor/
cp assets/app-icon.png dist/assets/

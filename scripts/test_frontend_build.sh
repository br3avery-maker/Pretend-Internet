#!/bin/sh
# Regression guard for the static frontend build (see #23 pattern, #28 clean-build fixture).
# Seeds dist/ with a stale sentinel, rebuilds, and asserts the build replaces
# only its dedicated output tree with exactly the current runtime asset set.
set -eu
cd "$(dirname "$0")/.."

# Seed a stale file from a prior build.
mkdir -p dist
printf 'obsolete\n' > dist/old-build-only.txt

# First build must remove the sentinel.
sh scripts/build-frontend.sh
if [ -e dist/old-build-only.txt ]; then
  printf 'FAIL: stale dist/old-build-only.txt survived first build\n' >&2
  exit 1
fi

# Second build must be stable and still clean.
printf 'obsolete\n' > dist/old-build-only.txt
sh scripts/build-frontend.sh
if [ -e dist/old-build-only.txt ]; then
  printf 'FAIL: stale dist/old-build-only.txt survived second build\n' >&2
  exit 1
fi

# Exact expected runtime asset set; no more, no fewer.
expected='dist/index.html
dist/templates/mini-app/app.json
dist/templates/mini-app/index.html
dist/templates/mini-app/skin.css'
actual="$(cd dist && find . -type f | sed 's|^\./|dist/|' | sort)"
if [ "$actual" != "$expected" ]; then
  printf 'FAIL: unexpected dist membership\n--- expected ---\n%s\n--- actual ---\n%s\n' "$expected" "$actual" >&2
  exit 1
fi

# Existing static smoke check still passes (not an Android test).
sh scripts/check-frontend.sh
printf 'PASS: frontend build cleanly replaces dist with the exact asset set\n'

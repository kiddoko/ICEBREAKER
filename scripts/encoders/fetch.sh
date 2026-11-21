#!/usr/bin/env bash
# Download the encoder pack's sources (sources.txt) into build/src, each checked
# against its SHA-256: a file that differs is deleted and the build stops.
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p build/src
sha() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -c1-64; else shasum -a 256 "$1" | cut -c1-64; fi; }
grep -v '^#' scripts/encoders/sources.txt | while read -r name url sum; do
  [ -n "${name:-}" ] || continue
  file="build/src/$(basename "$url")"
  if [ ! -f "$file" ] || [ "$(sha "$file")" != "$sum" ]; then
    curl -sSLf --retry 5 --retry-delay 5 --max-time 600 --proto '=https' --proto-redir '=https' -o "$file" -- "$url"
  fi
  got="$(sha "$file")"
  if [ "$got" != "$sum" ]; then
    rm -f "$file"
    echo "fetch: $name is not the file we expect (got $got): deleted" >&2
    exit 1
  fi
  echo "fetch: $name ok"
done

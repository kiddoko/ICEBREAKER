#!/usr/bin/env bash
# Pack a built target into build/dist: ffmpeg + LICENSES/ + README.txt + BUILD.txt.
#   scripts/encoders/package.sh <dir with the build> <name>   (e.g. build/out/linux-x64 linux-x64)
set -euo pipefail
cd "$(dirname "$0")/../.."
DIR=${1:?dir}
NAME=${2:?name}
mkdir -p build/dist
STAGE=build/stage/icebreaker-encoders-$NAME
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R "$DIR"/. "$STAGE"/
if [ -f "$STAGE/ffmpeg.exe" ]; then
  (cd build/stage && rm -f "../dist/icebreaker-encoders-$NAME.zip" && zip -qr "../dist/icebreaker-encoders-$NAME.zip" "icebreaker-encoders-$NAME")
else
  chmod 755 "$STAGE/ffmpeg"
  tar -C build/stage -czf "build/dist/icebreaker-encoders-$NAME.tar.gz" "icebreaker-encoders-$NAME"
fi
ls -l build/dist

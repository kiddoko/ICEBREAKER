#!/usr/bin/env bash
# The encoder pack: a small ffmpeg, LGPL only, that turns sound into AAC (.m4a),
# MP3, Vorbis (.ogg) and Opus — nothing else. No network, no devices, no video.
#
#   scripts/encoders/fetch.sh             the sources, checked (build/src)
#   scripts/encoders/build.sh <target>    linux-x64 | windows-x64 | macos-arm64 | macos-x64
#                                         → build/out/<target>/ffmpeg[.exe] + LICENSES/ + BUILD.txt
#
# Run by .github/workflows/encoders.yml (never on a developer's machine: it builds
# downloaded code). Windows is cross-built on Linux with mingw-w64, fully static.
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT=$PWD
T=${1:?usage: build.sh linux-x64|windows-x64|macos-arm64|macos-x64}
W=$ROOT/build/$T
DEPS=$W/deps
OUT=$ROOT/build/out/$T
rm -rf "$W" "$OUT"
mkdir -p "$W" "$DEPS" "$OUT/LICENSES"
JOBS=$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)

HOST=""
CFLAGS_T="-O2"
LDFLAGS_T=""
EXE=""
STRIP=strip
FF=()
case "$T" in
  linux-x64)
    CFLAGS_T="-O2 -fPIC"
    FF=(--enable-pthreads --disable-x86asm)
    ;;
  windows-x64)
    HOST=x86_64-w64-mingw32
    EXE=.exe
    STRIP=$HOST-strip
    LDFLAGS_T="-static"
    FF=(--target-os=mingw32 --arch=x86_64 --cross-prefix=$HOST- --enable-cross-compile --enable-w32threads --disable-x86asm --extra-ldexeflags=-static)
    ;;
  macos-arm64 | macos-x64)
    A=${T#macos-}
    [ "$A" = x64 ] && A=x86_64
    export MACOSX_DEPLOYMENT_TARGET=11.0
    CFLAGS_T="-O2 -arch $A -mmacosx-version-min=11.0"
    LDFLAGS_T="-arch $A -mmacosx-version-min=11.0"
    if [ "$(uname -m)" != "$A" ]; then
      HOST=$([ "$A" = x86_64 ] && echo x86_64-apple-darwin || echo aarch64-apple-darwin)
      FF=(--enable-cross-compile --arch=$A --target-os=darwin)
    fi
    FF+=(--enable-pthreads)
    [ "$A" = x86_64 ] && FF+=(--disable-x86asm)
    ;;
  *)
    echo "build: unknown target $T" >&2
    exit 2
    ;;
esac

# only our own libraries: never the build machine's
export PKG_CONFIG_LIBDIR=$DEPS/lib/pkgconfig
unset PKG_CONFIG_PATH

unpack() { tar xf "$ROOT/build/src/$1" -C "$W"; }
autotools() {
  local dir=$1
  shift
  (
    cd "$W/$dir"
    ./configure --prefix="$DEPS" --disable-shared --enable-static ${HOST:+--host=$HOST} CFLAGS="$CFLAGS_T" LDFLAGS="$LDFLAGS_T" "$@"
    make -j"$JOBS"
    make install
  )
}

# ── the libraries (static) ───────────────────────────────────────────────
unpack libogg-1.3.5.tar.xz
autotools libogg-1.3.5

unpack libvorbis-1.3.7.tar.xz
# its configure adds a flag today's macOS linker refuses
sed -i.bak 's/-force_cpusubtype_ALL//g' "$W/libvorbis-1.3.7/configure"
autotools libvorbis-1.3.7 --with-ogg="$DEPS" --disable-docs --disable-examples --disable-oggtest

unpack opus-1.5.2.tar.gz
OPUS=(--disable-doc --disable-extra-programs)
# mingw has no __memcpy_chk / stack protector runtime to link statically: opus would ask for both
[ "$T" = windows-x64 ] && OPUS+=(--disable-stack-protector CPPFLAGS=-D_FORTIFY_SOURCE=0)
autotools opus-1.5.2 "${OPUS[@]}"

unpack lame-3.100.tar.gz
autotools lame-3.100 --disable-frontend --disable-decoder --disable-gtktest

# ── ffmpeg: only what turns PCM into these four formats ─────────────────
unpack ffmpeg-7.1.2.tar.xz
CONF=(
  --pkg-config=pkg-config --pkg-config-flags=--static
  --disable-everything --disable-autodetect --disable-network --disable-doc --disable-debug
  --disable-ffplay --disable-ffprobe --enable-ffmpeg --enable-small --disable-avdevice
  --enable-protocol=pipe,file
  --enable-demuxer=wav,pcm_f32le
  --enable-decoder=pcm_s16le,pcm_s24le,pcm_f32le
  --enable-encoder=aac,libmp3lame,libvorbis,libopus
  --enable-muxer=mp3,ipod,mp4,ogg,opus
  --enable-parser=aac,mpegaudio,vorbis,opus
  --enable-filter=aresample,aformat,anull,abuffer,abuffersink,atrim
  --enable-libmp3lame --enable-libvorbis --enable-libopus
  "${FF[@]}"
)
(
  cd "$W/ffmpeg-7.1.2"
  ./configure --prefix="$W/prefix" "${CONF[@]}" --extra-cflags="-I$DEPS/include $CFLAGS_T" --extra-ldflags="-L$DEPS/lib $LDFLAGS_T" || {
    tail -60 ffbuild/config.log
    exit 1
  }
  make -j"$JOBS"
)

cp "$W/ffmpeg-7.1.2/ffmpeg$EXE" "$OUT/ffmpeg$EXE"
$STRIP "$OUT/ffmpeg$EXE"
cp "$W/ffmpeg-7.1.2/COPYING.LGPLv2.1" "$OUT/LICENSES/FFmpeg-COPYING.LGPLv2.1"
cp "$W/lame-3.100/COPYING" "$OUT/LICENSES/LAME-COPYING"
cp "$W/libogg-1.3.5/COPYING" "$OUT/LICENSES/libogg-COPYING"
cp "$W/libvorbis-1.3.7/COPYING" "$OUT/LICENSES/libvorbis-COPYING"
cp "$W/opus-1.5.2/COPYING" "$OUT/LICENSES/libopus-COPYING"
cp "$ROOT/scripts/encoders/README.txt" "$OUT/README.txt"
{
  echo "ICEBREAKER encoder pack — $T"
  echo "FFmpeg 7.1.2 (LGPL-2.1-or-later), LAME 3.100, libogg 1.3.5, libvorbis 1.3.7, libopus 1.5.2"
  echo
  echo "ffmpeg configure:"
  printf '  %s\n' "${CONF[@]}"
} > "$OUT/BUILD.txt"
echo "build: $OUT/ffmpeg$EXE ($(wc -c < "$OUT/ffmpeg$EXE") bytes)"

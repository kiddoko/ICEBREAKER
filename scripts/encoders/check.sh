#!/usr/bin/env bash
# Check a built encoder pack: LGPL only, exactly our four encoders, and each one
# turns a second of sound (through pipes, the way ICEBREAKER runs it) into a real file.
#   scripts/encoders/check.sh <path to ffmpeg[.exe]>
set -euo pipefail
BIN=${1:?usage: check.sh <ffmpeg>}
fail() {
  echo "check: $*" >&2
  exit 1
}
PY=${PY:-$(command -v python3 || command -v python)}

# (read whole, then searched: a grep that stops early would break the pipe)
licence=$("$BIN" -hide_banner -L)
grep -q "Lesser General Public" <<<"$licence" || fail "not LGPL"
conf=$("$BIN" -hide_banner -buildconf)
if grep -Eq -- "--enable-(gpl|nonfree|version3)" <<<"$conf"; then fail "a GPL / nonfree option is on"; fi
encoders=$("$BIN" -hide_banner -encoders | sed -n '/------/,$p' | tail -n +2 | awk '{print $2}' | sort | tr '\n' ' ')
[ "$encoders" = "aac libmp3lame libopus libvorbis " ] || fail "encoders: $encoders"

D=$(mktemp -d)
"$PY" - "$D/tone.f32" <<'EOF'
import math, struct, sys
with open(sys.argv[1], "wb") as f:
    f.write(b"".join(struct.pack("<ff", 0.5 * math.sin(2 * math.pi * 440 * i / 48000), 0.5 * math.sin(2 * math.pi * 660 * i / 48000)) for i in range(48000)))
EOF
enc() { # name, magic offset, magic, args…
  local name=$1 off=$2 magic=$3
  shift 3
  "$BIN" -hide_banner -nostdin -loglevel error -f f32le -ar 48000 -ac 2 -i pipe:0 "$@" pipe:1 < "$D/tone.f32" > "$D/$name"
  "$PY" - "$D/$name" "$off" "$magic" <<'EOF' || fail "$name isn't what it should be"
import sys
data = open(sys.argv[1], "rb").read()
off, magic = int(sys.argv[2]), sys.argv[3].encode()
ok = len(data) > 1000 and (data[off:off + len(magic)] == magic or (magic == b"ID3" and data[:2] in (b"\xff\xfb", b"\xff\xf3")))
print(f"check: {sys.argv[1].split('/')[-1]} {len(data)} bytes {'ok' if ok else 'BAD'}")
sys.exit(0 if ok else 1)
EOF
}
enc out.mp3 0 ID3 -c:a libmp3lame -q:a 0 -f mp3
enc out.m4a 4 ftyp -c:a aac -b:a 256k -f ipod
enc out.ogg 0 OggS -c:a libvorbis -q:a 6 -f ogg
enc out.opus 0 OggS -c:a libopus -b:a 128k -f opus
rm -rf "$D"
echo "check: all good"

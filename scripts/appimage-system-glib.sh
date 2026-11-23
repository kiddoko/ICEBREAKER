#!/usr/bin/env bash
# The Linux AppImage uses the system's GLib, not the one it was built with.
#
# The AppImage is built on Ubuntu 22.04 (so it runs on older distributions too) and
# linuxdeploy copies that Ubuntu's GLib (2.72) into it. On a newer system (Arch, Fedora…)
# a system library loaded later — libaccountsservice, a GTK module — needs a newer GLib,
# finds the bundled old one first and the app dies at launch:
#   symbol lookup error: /usr/lib/libaccountsservice.so.1: undefined symbol: g_once_init_leave_pointer
# GLib keeps its old symbols, so the opposite (everything bundled using the system's newer
# GLib) works. Every Linux desktop has GLib.
#
# Usage: scripts/appimage-system-glib.sh path/to/ICEBREAKER.AppImage
# Rewrites the AppImage in place (the updater's .sig must be made again afterwards).
set -euo pipefail

img="$(realpath "$1")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"

# --appimage-extract needs no FUSE (CI runners have none)
"$img" --appimage-extract >/dev/null
root="$work/squashfs-root"

removed=0
for lib in libglib-2.0 libgobject-2.0 libgio-2.0 libgmodule-2.0 libgthread-2.0; do
  while IFS= read -r -d '' f; do
    echo "  removed ${f#"$root"/}"
    rm -f "$f"
    removed=$((removed + 1))
  done < <(find "$root" -name "${lib}.so*" -print0)
done
if [ "$removed" -eq 0 ]; then
  echo "no bundled GLib found: nothing to do"
  exit 0
fi

# appimagetool: the one inside Tauri's own linuxdeploy-plugin-appimage when it's cached,
# else the AppImage project's release
tool=""
plugin="$(find "$HOME/.cache/tauri" -iname '*plugin-appimage*.AppImage' 2>/dev/null | head -n 1 || true)"
if [ -n "$plugin" ]; then
  mkdir plugin && (cd plugin && "$plugin" --appimage-extract >/dev/null)
  tool="$(find "$work/plugin/squashfs-root" -type f -name appimagetool -perm -u+x | head -n 1 || true)"
fi
if [ -z "$tool" ]; then
  curl -fsSL -o appimagetool.AppImage "https://github.com/AppImage/appimagetool/releases/download/1.9.0/appimagetool-x86_64.AppImage"
  chmod +x appimagetool.AppImage
  tool="$work/appimagetool.AppImage"
  export APPIMAGE_EXTRACT_AND_RUN=1
fi

ARCH=x86_64 "$tool" --no-appstream "$root" "$work/out.AppImage" >/dev/null
mv -f "$work/out.AppImage" "$img"
chmod +x "$img"
echo "$(basename "$img"): $removed GLib file(s) left out — it uses the system's"

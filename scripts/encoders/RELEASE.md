**Not an ICEBREAKER release.** This is the encoder pack ICEBREAKER downloads when you ask for it
(`encoders install`), to export songs as MP3, M4A (AAC), OGG (Vorbis) and Opus. You don't need to
download anything here by hand.

A small build of FFmpeg 7.1.2, **LGPL-2.1-or-later only**, with LAME 3.100 (LGPL), libogg 1.3.5,
libvorbis 1.3.7 and libopus 1.5.2 (BSD). It has no network access, no devices and no video: it reads
sound from a pipe and writes the encoded file to a pipe. ICEBREAKER checks the SHA-256 of what it
downloads against the value built into the app before using it.

- `icebreaker-encoders-macos-universal.tar.gz` (Apple Silicon and Intel, macOS 11+)
- `icebreaker-encoders-windows-x64.zip` (Windows 10+, x64)
- `icebreaker-encoders-linux-x64.tar.gz` (x86_64, glibc 2.35+)

Each archive holds the program, `LICENSES/`, `README.txt` and `BUILD.txt` (the configure options).
The exact source files it was built from are attached here (`ffmpeg-7.1.2.tar.xz`, `lame-3.100.tar.gz`,
`libogg-1.3.5.tar.xz`, `libvorbis-1.3.7.tar.xz`, `opus-1.5.2.tar.gz`), with the build scripts
(`icebreaker-encoders-build-scripts.tar.gz`) and `SHA256SUMS`. Built by
[`.github/workflows/encoders.yml`](https://github.com/kiddoko/ICEBREAKER/blob/encoders-ci/.github/workflows/encoders.yml).

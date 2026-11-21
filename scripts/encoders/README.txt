ICEBREAKER encoder pack
=======================

A small build of FFmpeg that only turns sound into AAC (.m4a), MP3, Vorbis (.ogg)
and Opus. ICEBREAKER downloads it when you ask (`encoders install`), checks that it
is byte for byte the file it expects (SHA-256), and runs it as a separate program
to export songs (breakerMED's `med export song.mp3`). It has no network access,
no devices, no video: only pipes and files.

What's inside, and their licences (in LICENSES/):
  FFmpeg 7.1.2     LGPL-2.1-or-later   https://ffmpeg.org
  LAME 3.100       LGPL-2.0-or-later   https://lame.sourceforge.io
  libogg 1.3.5     BSD-3-Clause        https://xiph.org
  libvorbis 1.3.7  BSD-3-Clause        https://xiph.org
  libopus 1.5.2    BSD-3-Clause        https://opus-codec.org

Built by ICEBREAKER's GitHub Actions workflow (.github/workflows/encoders.yml and
scripts/encoders/ in https://github.com/kiddoko/ICEBREAKER). The exact source files
it was built from, and the build scripts, are attached to the same release as this
archive. BUILD.txt lists the configure options.

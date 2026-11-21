import { fmt } from "../../core/ansi";
import type { Command } from "../types";

/** `encoders` — the encoder pack (encoders.rs): MP3, M4A, OGG and Opus for modules that export sound. */
export const encodersCommand: Command = {
  name: "encoders",
  summary: "the encoder pack: MP3, M4A, OGG and Opus exports (download once)",
  usage: ["encoders                 installed or not, and the formats", "encoders install         download it (once, ~3 MB)", "encoders remove          delete it"].join("\n"),
  examples: [
    ["encoders install", "then a tracker can export .mp3, .m4a, .ogg, .opus"],
    ["encoders", "is it there?"],
  ],
  man: "A small ffmpeg built by ICEBREAKER's own CI under the LGPL, that only encodes MP3 (LAME), AAC (.m4a), Vorbis (.ogg) and Opus — no network code inside. It's downloaded only when you ask, from ICEBREAKER's GitHub release encoders-v1 (the sources and licences are there too), checked against the SHA-256 written in ICEBREAKER (a different file is deleted, never run), and run as a separate program. Modules with the audio permission use it through ib.audio.encode. Stealth mode refuses the download.",
  complete: () => ["install", "remove"],
  async run(ctx) {
    const enc = ctx.deck.platform.encoders;
    if (!enc) return ctx.err("encoders: needs the desktop app\n"), 1;
    const [a] = ctx.args;
    try {
      switch (a) {
        case undefined:
        case "status": {
          const i = await enc.info();
          if (i.installed) ctx.out(`${fmt.green("● installed")} · ${i.version ?? "?"} · ${i.formats.join(", ")}\n`);
          else ctx.out(i.supported ? `${fmt.dim("○ not installed")} — encoders install (once, ~3 MB)\n` : fmt.dim("○ no encoder pack for this computer yet (macOS, Windows, Linux x64)\n"));
          return 0;
        }
        case "install": {
          ctx.out(fmt.dim("downloading the encoder pack (~3 MB, once) from ICEBREAKER's GitHub release, then checking it…\n"));
          const v = await enc.install();
          ctx.out(`${fmt.green("✓")} encoder pack ${v} · mp3, m4a, ogg, opus · licences: LGPL (FFmpeg, LAME), BSD (Vorbis, Opus)\n`);
          return 0;
        }
        case "remove":
        case "uninstall": {
          const had = await enc.remove();
          ctx.out(had ? "encoder pack removed\n" : fmt.dim("there was no encoder pack\n"));
          return 0;
        }
        default:
          ctx.err(`encoders: "${a}"? try encoders -h\n`);
          return 1;
      }
    } catch (e) {
      ctx.err(`encoders: ${e instanceof Error ? e.message : String(e)}\n`);
      return 1;
    }
  },
};

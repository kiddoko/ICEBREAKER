import { fmt } from "../../core/ansi";
import { SOUND_NAMES, SOUND_PACKS, type SoundName } from "../../core/sound";
import type { Command } from "../types";
import { describe, ERROR_CODES, ERRORS_DOC } from "../../core/errors";

/** The error log (the shell's LOG tab). */
export const errorsCommand: Command = {
  name: "errors",
  summary: "what went wrong, with codes (E101…) explained — the shell's log tab",
  usage: "errors            the list, newest first\nerrors <code>     what that code means and what to do (E102…)\nerrors codes      every code\nerrors clear      empty the list",
  complete: () => ["clear", "codes", ...ERROR_CODES.map((e) => e.code)],
  run(ctx) {
    const log = ctx.deck.errors;
    const a = (ctx.args[0] ?? "").toUpperCase();
    if (a === "CLEAR") return log.clear(), ctx.out(fmt.dim("error log emptied\n")), 0;
    if (a === "CODES") {
      for (const e of ERROR_CODES) ctx.out(`${fmt.red(e.code)}  ${e.title}\n`);
      return 0;
    }
    if (/^E\d{3}$/.test(a)) {
      const e = describe(a);
      ctx.out(`${fmt.red(fmt.bold(e.code))}  ${fmt.bold(e.title)}\n${e.hint}\n${fmt.dim(`${ERRORS_DOC}#${e.code.toLowerCase()}`)}\n`);
      return 0;
    }
    if (!log.list.length) return ctx.out(fmt.dim("no errors · errors codes lists what they could be\n")), 0;
    for (const e of [...log.list].reverse()) ctx.out(`${fmt.red(e.code)} ${fmt.dim(new Date(e.at).toLocaleTimeString())} ${e.title}\n   ${e.detail}\n`);
    log.unseen = 0;
    return 0;
  },
};

/** Everything silent at once (the ♪ button bottom-right). */
export const mute: Command = {
  name: "mute",
  summary: "silence everything: ui sounds, the voice, alerts (again: sound back)",
  usage: "mute         toggle\nmute on|off",
  complete: () => ["on", "off"],
  run(ctx) {
    const s = ctx.deck.settings;
    const a = ctx.args[0];
    const next = a === "on" ? true : a === "off" ? false : !s.data.sound.muted;
    s.set("sound.muted", next);
    ctx.deck.applySettings("sound.muted");
    ctx.out(next ? "♪ off — muted (mute again to hear things)\n" : "♪ on — sound back\n");
    return 0;
  },
};

/** The modules' own sound (ib.audio, core/mixer.ts): who plays, and silencing them (the ♪ <module> button bottom-right). */
export const audioCommand: Command = {
  name: "audio",
  summary: "the sound modules play themselves: who is playing, stop them",
  usage: "audio              the modules playing now\naudio stop [id]    silence one module (or all of them)",
  examples: [["audio stop", "silence every module"], ["audio stop drums", "silence one module (its id)"]],
  complete: () => ["stop"],
  run(ctx) {
    const m = ctx.deck.mixer;
    const [sub, id] = ctx.args;
    if (sub === "stop") {
      const ids = id ? [id] : m.playing();
      for (const x of ids) m.stop(x);
      ctx.out(ids.length ? `♪ ${ids.join(", ")}: silenced\n` : fmt.dim("no module is playing\n"));
      return 0;
    }
    if (sub) return ctx.err(`audio: unknown "${sub}" (audio stop [id])\n`), 1;
    const ids = m.playing();
    ctx.out(ids.length ? `♪ ${ids.join(", ")}\n` : fmt.dim(`no module is playing${m.available() ? "" : " (no sound output here)"}\n`));
    return 0;
  },
};

export const sound: Command = {
  name: "sound",
  examples: [
    ["sound 30", "volume 30 %"],
    ["sound test error", "hear one"],
    "sound off",
  ],
  summary: "UI sounds: on / off / volume / test / reload custom files",
  usage: "sound              status\nsound on|off\nsound 0-100        volume\nsound pack [name|default]   the packs; pick one for this theme\nsound test [name]  play one (or all)\nsound reload       re-read .icebreaker/sounds/*.wav|ogg|mp3",
  man: `Sounds are synthesized on the fly. Replace any of them with a file named after it in .icebreaker/sounds/:\n${SOUND_NAMES.join(", ")}`,
  complete: () => ["on", "off", "pack", "test", "reload", ...SOUND_NAMES, ...Object.keys(SOUND_PACKS), "default"],
  async run(ctx) {
    const { deck } = ctx;
    const [a, b] = ctx.args;
    const set = (k: string, v: unknown) => deck.settings.set(k, v);
    if (!a) {
      const s = deck.settings.data.sound;
      ctx.out(`sound ${s.enabled ? fmt.green("on") : fmt.dim("off")} · volume ${s.volume}%\n`);
      return 0;
    }
    if (a === "on" || a === "off") return set("sound.enabled", a === "on"), 0;
    if (/^\d+$/.test(a)) return set("sound.volume", Math.max(0, Math.min(100, Number(a)))), 0;
    if (a === "pack" || a === "packs") {
      const own = deck.theme.sound.pack;
      const cur = deck.soundPack();
      if (!b) {
        for (const [name, p] of Object.entries(SOUND_PACKS)) ctx.out(`${name === cur ? fmt.green("●") : " "} ${fmt.bold(name)}${name === own ? fmt.dim(" (default)") : ""}  ${fmt.dim(p.description)}\n`);
        for (const name of deck.soundFolderPacks) ctx.out(`${name === cur ? fmt.green("●") : " "} ${fmt.bold(name)}  ${fmt.dim("files · .icebreaker/sounds/packs/" + name)}\n`);
        ctx.out(fmt.dim(`for the theme ${deck.theme.name} · sound pack <name> · sound pack default\n`));
        return 0;
      }
      if (b !== "default" && !SOUND_PACKS[b] && !deck.soundFolderPacks.includes(b)) return ctx.err(`sound: no pack ${b} (${[...Object.keys(SOUND_PACKS), ...deck.soundFolderPacks].join(", ")})\n`), 1;
      deck.setSoundPack(b);
      deck.sound.play("confirm");
      ctx.out(`${deck.theme.name}: ${deck.soundPack()}${deck.soundPack() === own ? " (default)" : ""}\n`);
      return 0;
    }
    if (a === "reload") {
      const n = await deck.reloadSounds();
      ctx.out(`${n} custom sound${n === 1 ? "" : "s"} loaded\n`);
      return 0;
    }
    if (a === "test") {
      const names = b ? [b as SoundName] : [...SOUND_NAMES];
      for (const n of names) {
        if (!SOUND_NAMES.includes(n)) return ctx.err(`sound: unknown sound ${n}\n`), 1;
        ctx.out(`${n}\n`);
        deck.sound.play(n);
        await new Promise((r) => setTimeout(r, 700));
        if (ctx.signal.aborted) break;
      }
      return 0;
    }
    ctx.err("usage: sound [on|off|0-100|test [name]|reload]\n");
    return 1;
  },
};

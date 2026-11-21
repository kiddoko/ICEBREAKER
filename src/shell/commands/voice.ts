import { fmt } from "../../core/ansi";
import { phrase } from "../../core/voice";
import type { Command } from "../types";

const onOff = (v: string | undefined, cur: boolean) => (v === "on" ? true : v === "off" ? false : !cur);

/** `voice` — the deck's voice (core/voice.ts, voice.rs). */
export const voiceCommand: Command = {
  name: "voice",
  summary: "the deck's voice: local text-to-speech with a robot filter",
  usage: [
    "voice                    how it's set up",
    "voice on | off           the voice itself",
    "voice say <text>         say something · voice stop",
    "voice read on | off      read LINK's answers aloud",
    "voice greet on | off     \"welcome, netrunner\" at start-up",
    "voice robot <0-100>      how robotic it sounds",
    "voice rate <0.5-2>       how fast",
    "voice volume <0-100>",
    "voice engine auto | piper | system",
    "voice list · voice use <name>",
    "voice language en | fr | ja   what it speaks (ja: Japanese, always)",
    "voice install [en | en-us | fr]   download an open-source neural voice (once)",
  ].join("\n"),
  examples: [
    ["voice install fr", "the neural engine and a French voice (~85 MB, once)"],
    ["voice on", "then: voice say bonjour"],
    ["voice read on", "LINK reads its answers"],
    ["voice robot 80", "more machine"],
  ],
  man: "Everything is synthesized on this computer: open-source neural voices (piper voices run by sherpa-onnx) once installed, else the system voice (macOS say, espeak-ng on Linux, Windows SAPI). The sound then goes through a ring modulator, a bit crusher and a chorus: clearly a machine, still smooth. Nothing is sent anywhere.",
  complete: () => ["on", "off", "say", "stop", "read", "greet", "robot", "rate", "volume", "language", "engine", "list", "use", "install", "test"],
  async run(ctx) {
    const { deck } = ctx;
    const v = deck.settings.data.voice;
    if (!deck.voice.available) return ctx.err("voice: needs the desktop app\n"), 1;
    const [a, b] = ctx.args;
    const rest = ctx.args.slice(1).join(" ");
    try {
      switch (a) {
        case undefined: {
          const info = await deck.platform.voice!.info();
          ctx.out(`${v.enabled ? fmt.green("● on") : fmt.dim("○ off")} · engine ${v.engine} · robot ${v.robot} · rate ${v.rate} · volume ${v.volume}\n`);
          ctx.out(`read LINK: ${v.readAI ? "yes" : "no"} · greeting: ${v.greet ? "yes" : "no"}${v.name ? ` · voice ${v.name}` : ""}\n`);
          ctx.out(`language: ${v.language}\n`);
          ctx.out(fmt.dim(`neural voices: ${info.piper ? info.piper_voices.join(", ") || "none" : "not installed — voice install"} · system: ${info.system ?? "none"}\n`));
          return 0;
        }
        case "on": case "off": deck.settings.set("voice.enabled", a === "on"); if (a === "off") deck.voice.stop(); ctx.out(`voice ${a}\n`); return 0;
        case "say": case "test":
          if (!v.enabled) deck.settings.set("voice.enabled", true);
          deck.voice.say(a === "test" ? phrase(v.language, "test", deck.settings.data.user.handle) : rest || ctx.stdin);
          return 0;
        case "stop": deck.voice.stop(); return 0;
        case "read": deck.settings.set("voice.readAI", onOff(b, v.readAI)); ctx.out(`read LINK's answers: ${deck.settings.data.voice.readAI ? "on" : "off"}\n`); return 0;
        case "greet": deck.settings.set("voice.greet", onOff(b, v.greet)); ctx.out(`greeting: ${deck.settings.data.voice.greet ? "on" : "off"}\n`); return 0;
        case "robot": case "rate": case "volume": {
          const n = Number(b);
          const [lo, hi] = a === "rate" ? [0.5, 2] : [0, 100];
          if (!(n >= lo && n <= hi)) return ctx.err(`usage: voice ${a} <${lo}-${hi}>\n`), 1;
          deck.settings.set(`voice.${a}`, n);
          ctx.out(`${a} ${n}\n`);
          return 0;
        }
        case "engine":
          if (!["auto", "piper", "system"].includes(b ?? "")) return ctx.err("usage: voice engine auto | piper | system\n"), 1;
          deck.settings.set("voice.engine", b);
          return 0;
        case "list": {
          const { engine } = await deck.voice.resolve();
          const list = await deck.platform.voice!.list(engine);
          for (const x of list) ctx.out(`${x.id.padEnd(28)} ${fmt.dim(x.lang)}\n`);
          if (!list.length) ctx.out(fmt.dim("no voices\n"));
          return 0;
        }
        case "use": deck.settings.set("voice.name", rest); ctx.out(`voice: ${rest || "default"}\n`); return 0;
        case "language": case "lang":
          if (b !== "en" && b !== "fr" && b !== "ja") return ctx.err("usage: voice language en | fr | ja\n"), 1;
          deck.settings.set("voice.language", b);
          deck.settings.set("voice.name", "");
          ctx.out(`the voice speaks ${b === "fr" ? "French" : b === "ja" ? "Japanese (the system voice; AI answers are translated before they're read)" : "English"}${b === "ja" || (await deck.platform.voice!.info()).piper_voices.some((x) => x.includes(`-${b}_`)) ? "" : ` · neural voice: voice install ${b}`}\n`);
          return 0;
        case "install": {
          const lang = b ?? v.language;
          if (!["en", "en-us", "fr"].includes(lang)) return ctx.err(lang === "ja" ? "voice: Japanese uses the system voice (Kyoko on macOS) — nothing to download\n" : "voice install en | en-us | fr\n"), 1;
          ctx.out(fmt.dim(`downloading the neural engine and the "${lang}" voice (once, ~85 MB)…\n`));
          const name = await deck.platform.voice!.install(lang);
          deck.settings.set("voice.engine", "auto");
          deck.settings.set("voice.language", lang.slice(0, 2));
          deck.settings.set("voice.name", name);
          ctx.out(`${fmt.green("✓")} ${name} · try: voice test\n`);
          return 0;
        }
        default:
          ctx.err(`voice: "${a}"? try voice -h\n`);
          return 1;
      }
    } catch (e) {
      ctx.err(`voice: ${e instanceof Error ? e.message : String(e)}\n`);
      return 1;
    }
  },
};

/** `stealth` — 100 % local mode (core/stealth.ts). */
export const stealthCommand: Command = {
  name: "stealth",
  summary: "stealth mode: 100 % local, no internet (on | off)",
  usage: "stealth            on or off?\nstealth on | off",
  man: "Stealth mode cuts every internet connection: no cloud AI (a local model through Ollama still works, on this machine or your local network), no weather, news, Google, module installs, voice or encoder pack downloads. Your vault can still live on your own server (a network drive or a synced folder).",
  run(ctx) {
    const on = ctx.deck.settings.data.privacy.stealth;
    const [a] = ctx.args;
    if (!a) return ctx.out(on ? `${fmt.green("◉ stealth on")} — nothing leaves this machine and your local network\n` : "stealth off\n"), 0;
    if (a !== "on" && a !== "off") return ctx.err("usage: stealth on | off\n"), 1;
    ctx.deck.settings.set("privacy.stealth", a === "on");
    ctx.out(a === "on" ? `${fmt.green("◉ stealth on")} · cloud AI, weather, news, Google and installs are off\n` : "stealth off · network features are back (each still opt-in)\n");
    return 0;
  },
};

/**
 * `say <text>` — the deck's voice says it (core/voice.ts: the voice UPLINK and the
 * notifications use). Like the rest of the voice: nothing when the sound is muted or
 * the voice is off, and everything stays on this computer (stealth mode changes nothing).
 */
export const sayCommand: Command = {
  name: "say",
  summary: "the deck's voice says the text",
  usage: "say <text>         say it (queued after what's being said)\nsay -t <text>      in Japanese mode, translated by your AI first\necho text | say    say what's piped in\nvoice stop         stop talking",
  examples: [
    ["say hello netrunner", "the voice says it"],
    ["journal ls -n 1 | say", "says the last journal day"],
  ],
  man: "The same voice as UPLINK's answers and the notifications (Settings → VOICE: the voice, the language, the robot filter). It says the text as it is, at once — in Japanese mode too (the Japanese voice reads it); say -t has your AI translate it into Japanese first, like UPLINK's answers (slower: a round trip to the AI). Muted sound (mute) or the voice off (voice off): it says nothing and tells you why. Synthesized on this computer (the translation aside, by the AI you chose).\nIn your real terminal too, say is the deck's voice (command say runs macOS's own).",
  run(ctx) {
    const { deck } = ctx;
    const translate = ctx.args[0] === "-t" || ctx.args[0] === "--translate";
    const text = ((translate ? ctx.args.slice(1) : ctx.args).join(" ") || ctx.stdin).trim();
    if (!text) return ctx.err("say: what should I say? (say <text>)\n"), 1;
    if (!deck.voice.available) return ctx.err("say: the voice needs the desktop app\n"), 1;
    if (deck.settings.data.sound.muted) return ctx.err("say: the sound is muted (mute off)\n"), 1;
    if (!deck.settings.data.voice.enabled) return ctx.err("say: the voice is off (voice on)\n"), 1;
    // said as it is, at once (a round trip to the AI made `say test` wait seconds in Japanese mode);
    // -t: translated into Japanese first, like UPLINK's answers
    if (translate && deck.settings.data.voice.language === "ja" && !/[\u3040-\u30ff\u4e00-\u9fff]/.test(text) && deck.ai.ready) void deck.voice.speak(text);
    else deck.voice.say(text);
    return 0;
  },
};

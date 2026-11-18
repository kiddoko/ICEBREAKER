import type { Deck } from "../deck";

/**
 * The deck's voice. Text is synthesized on this computer (voice.rs: piper, the
 * open-source neural TTS, or the system voice), then played through a small
 * "robot" chain so it sounds like a machine without being choppy:
 *
 *   source → high-pass ─┬─ dry ──────────────────────┐
 *                       ├─ ring modulator (≈60 Hz) ──┤
 *                       ├─ bit crusher ──────────────┼→ low-pass → compressor → volume
 *                       └─ chorus (12 ms, wobbling) ─┘
 *
 * `voice.robot` (0–100) sets how much of the wet paths you hear. Long text is
 * spoken sentence by sentence; the next one is synthesized while one plays.
 */
export class DeckVoice {
  private ctx: AudioContext | null = null;
  private queue: { text: string; lang: string }[] = [];
  private busy = false;
  private source: AudioBufferSourceNode | null = null;
  private gen = 0;

  constructor(private readonly deck: Deck) {}

  get available(): boolean {
    return !!this.deck.platform.voice;
  }

  get speaking(): boolean {
    return this.busy;
  }

  /** Which engine and voice to use now (auto: a neural voice in that language when installed, else the system's). */
  async resolve(langOverride?: string): Promise<{ engine: "piper" | "system"; voice: string }> {
    const v = this.deck.settings.data.voice;
    const info = await this.deck.platform.voice!.info();
    const lang = langOverride ?? v.language;
    // a neural voice in the voice's language (vits-piper-fr_FR-siwis-medium…)
    const piperVoice = info.piper_voices.find((x) => x === v.name && x.includes(`-${lang}_`)) ?? info.piper_voices.find((x) => x.includes(`-${lang}_`));
    if (lang !== "ja" && (v.engine === "piper" || (v.engine === "auto" && info.piper && piperVoice))) {
      if (!info.piper || !piperVoice) throw new Error(`no neural ${lang === "fr" ? "French" : "English"} voice yet — voice install ${lang}`);
      return { engine: "piper", voice: piperVoice };
    }
    if (!info.system) throw new Error("no voice on this system — voice install");
    if (v.name && !info.piper_voices.includes(v.name)) return { engine: "system", voice: v.name };
    this.systemVoice[lang] ??= pickSystemVoice(await this.deck.platform.voice!.list("system").catch(() => []), lang);
    return { engine: "system", voice: this.systemVoice[lang] };
  }
  private systemVoice: Record<string, string> = {};
  private warned = new Set<string>();

  /**
   * Say something (queued after what's being said). The accent follows the
   * text: English is read by an English voice, French by a French one. With the
   * voice set to Japanese, everything is spoken in Japanese (`speak` translates
   * AI answers first).
   */
  say(text: string, lang?: string): void {
    if (!this.available) return;
    const clean = speakable(text);
    if (!clean) return;
    const v = this.deck.settings.data.voice.language;
    const l = lang ?? (v === "ja" ? "ja" : guessLang(clean, v));
    this.queue.push(...sentences(clean).map((s) => ({ text: s, lang: l })));
    if (!this.busy) void this.pump(this.gen);
  }

  /** Read an AI answer: in Japanese mode it's translated by the AI first. */
  async speak(answer: string): Promise<void> {
    if (this.deck.settings.data.voice.language !== "ja") return this.say(answer);
    if (!this.deck.ai.ready) return;
    try {
      const ja = await this.deck.ai.ask(`Translate this into natural spoken Japanese, for a voice to read aloud. Reply with the Japanese text only, no romaji, no notes:\n\n${speakable(answer).slice(0, 3000)}`, {
        system: "You are a translator. Output only Japanese.",
      });
      this.say(ja, "ja");
    } catch {
      /* no translation, no reading */
    }
  }

  stop(): void {
    this.gen++;
    this.queue = [];
    try {
      this.source?.stop();
    } catch {}
    this.source = null;
    this.busy = false;
  }

  private async pump(gen: number): Promise<void> {
    this.busy = true;
    try {
      const rate = this.deck.settings.data.voice.rate;
      const synth = async (item: { text: string; lang: string }) => {
        const { engine, voice } = await this.resolve(item.lang);
        try {
          return await this.deck.platform.voice!.speak(item.text, engine, voice, rate);
        } catch (e) {
          if (engine !== "piper") throw e;
          // the neural voice failed: say it with the system voice, and say why once
          if (!this.warned.has(voice)) {
            this.warned.add(voice);
            this.deck.notify(`voice: ${e instanceof Error ? e.message : e} — using the system voice (voice install ${item.lang} re-downloads it)`, "warning");
          }
          this.systemVoice[item.lang] ??= pickSystemVoice(await this.deck.platform.voice!.list("system").catch(() => []), item.lang);
          return this.deck.platform.voice!.speak(item.text, "system", this.systemVoice[item.lang], rate);
        }
      };
      let next: Promise<ArrayBuffer> | null = this.queue.length ? synth(this.queue.shift()!) : null;
      while (next && gen === this.gen) {
        const bytes = await next;
        next = this.queue.length ? synth(this.queue.shift()!) : null; // the next sentence, while this one plays
        if (gen !== this.gen) break;
        await this.play(bytes);
      }
    } catch (e) {
      this.deck.notify(`voice: ${e instanceof Error ? e.message : e}`, "warning");
      this.queue = [];
    } finally {
      if (gen === this.gen) this.busy = false;
    }
  }

  private async play(bytes: ArrayBuffer): Promise<void> {
    this.ctx ??= new AudioContext();
    const ctx = this.ctx;
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const buf = await ctx.decodeAudioData(bytes.slice(0));
    const v = this.deck.settings.data.voice;
    const a = Math.max(0, Math.min(1, v.robot / 100));
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 1 + a * 0.015; // a touch brighter, never deeper (deeper = scary)
    const hp = new BiquadFilterNode(ctx, { type: "highpass", frequency: 140 });
    const lp = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 7600 - a * 2600 });
    const comp = ctx.createDynamicsCompressor();
    const out = new GainNode(ctx, { gain: (v.volume / 100) * 1.1 });
    src.connect(hp);

    // dry
    hp.connect(new GainNode(ctx, { gain: 1 - a * 0.35 })).connect(lp);
    // ring modulator: the signal times a low sine — the classic robot
    const ring = new GainNode(ctx, { gain: 0 });
    // a high carrier sounds metallic and synthetic; a low one (~50 Hz) sounds like a menacing robot
    const carrier = new OscillatorNode(ctx, { type: "sine", frequency: 140 + a * 60 });
    carrier.connect(ring.gain);
    hp.connect(ring).connect(new GainNode(ctx, { gain: a * 0.4 })).connect(lp);
    // bit crusher: fewer amplitude steps, a digital grit
    const bits = Math.round(14 - a * 6);
    const steps = 2 ** bits;
    const curve = new Float32Array(4096);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.round(x * steps) / steps;
    }
    hp.connect(new WaveShaperNode(ctx, { curve })).connect(new GainNode(ctx, { gain: a * 0.2 })).connect(lp);
    // chorus: a short wobbling copy, metallic
    const delay = new DelayNode(ctx, { delayTime: 0.012, maxDelayTime: 0.05 });
    const lfo = new OscillatorNode(ctx, { type: "sine", frequency: 0.9 });
    const depth = new GainNode(ctx, { gain: 0.003 });
    lfo.connect(depth).connect(delay.delayTime);
    hp.connect(delay).connect(new GainNode(ctx, { gain: a * 0.55 })).connect(lp); // the shimmer that says "synthetic"

    lp.connect(comp).connect(out).connect(ctx.destination);
    carrier.start(t);
    lfo.start(t);
    this.source = src;
    await new Promise<void>((done) => {
      src.onended = () => done();
      src.start(t);
    });
    carrier.stop();
    lfo.stop();
    out.disconnect();
  }
}

/** English or French? (a cheap guess from common words and accents) */
function guessLang(text: string, fallback: string): string {
  const t = ` ${text.toLowerCase()} `;
  const count = (words: string[]) => words.reduce((n, w) => n + (t.split(w).length - 1), 0);
  const fr = count([" le ", " la ", " les ", " des ", " est ", " et ", " je ", " tu ", " vous ", " une ", " pour ", " pas ", " que ", "é", "è", "à", "ç", "ê"]);
  const en = count([" the ", " and ", " is ", " are ", " you ", " of ", " to ", " it ", " that ", " with ", " for ", " this "]);
  if (fr === en) return fallback === "ja" ? "en" : fallback;
  return fr > en ? "fr" : "en";
}

/** What reads well: no code blocks, no markdown marks, no URLs. */
export function speakable(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " (code) ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]*)(\|[^\]]*)?\]\]/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sentences of at most ~240 characters (synthesized one by one). */
function sentences(text: string): string[] {
  const parts = text.match(/[^.!?…]+[.!?…]+["»”)]?\s*|[^.!?…]+$/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + p).length > 240 && cur) {
      out.push(cur.trim());
      cur = "";
    }
    cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Pleasant system voices first (female where there is one), never the novelty ones. */
const PREFERRED: Record<string, string[]> = {
  en: ["Samantha", "Ava", "Allison", "Serena", "Karen", "Moira", "Tessa", "Susan", "Zoe", "Victoria", "Microsoft Zira", "en-us"],
  fr: ["Amélie", "Audrey", "Aurélie", "Marie", "Virginie", "Microsoft Hortense", "fr-fr", "fr"],
  ja: ["Kyoko", "O-Ren", "Microsoft Haruka", "ja"],
};
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Grandma|Grandpa|Rocko|Eddy|Reed|Fred|Junior|Ralph|Kathy|Deranged|Hysterical|Pipe Organ)\b/;

function pickSystemVoice(list: { id: string; lang: string }[], lang: string): string {
  const inLang = list.filter((x) => x.lang.toLowerCase().replace("-", "_").startsWith(`${lang}_`) || x.lang.toLowerCase() === lang).filter((x) => !NOVELTY.test(x.id));
  for (const want of PREFERRED[lang] ?? []) {
    const hit = inLang.find((x) => x.id.toLowerCase().startsWith(want.toLowerCase())) ?? list.find((x) => x.id.toLowerCase() === want.toLowerCase());
    if (hit) return hit.id;
  }
  return inLang[0]?.id ?? "";
}

/** What the deck says on its own, in the voice's language. */
export function phrase(lang: string, key: "welcome" | "test" | "timer", handle = "netrunner"): string {
  const P: Record<string, Record<string, string>> = {
    en: { welcome: `Welcome, ${handle}. Link established.`, test: `Link established. Hello, ${handle}.`, timer: "Timer done." },
    fr: { welcome: `Bienvenue, ${handle}. Liaison établie.`, test: `Liaison établie. Bonjour, ${handle}.`, timer: "Minuteur terminé." },
    ja: { welcome: `おかえりなさい、${handle}。リンク確立。`, test: `リンク確立。こんにちは、${handle}。`, timer: "タイマー終了。" },
  };
  return (P[lang] ?? P.en)[key];
}

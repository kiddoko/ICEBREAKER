import { t } from "./i18n";
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

  /**
   * Silent until the session is ready (Deck.sessionReady): nothing is said on the
   * login screen or while the deck loads — then the greeting comes first.
   */
  open = false;

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
    // no Japanese voice installed (common on Windows): say how to get one instead of reading it with an English voice
    if (!this.systemVoice[lang] && lang === "ja") {
      delete this.systemVoice[lang];
      throw new Error(
        /Win/.test(navigator.userAgent)
          ? "no Japanese voice on this PC — Settings → Time & language → Speech → Add voices → Japanese (Haruka), then restart ICEBREAKER"
          : "no Japanese voice on this computer — System Settings → Accessibility → Spoken Content → System voice → Manage voices → Kyoko",
      );
    }
    return { engine: "system", voice: this.systemVoice[lang] };
  }
  private systemVoice: Record<string, string> = {};

  /**
   * Say something (queued after what's being said). The accent follows the
   * text: English is read by an English voice, French by a French one. With the
   * voice set to Japanese, everything is spoken in Japanese (`speak` translates
   * AI answers first).
   */
  say(text: string, lang?: string): void {
    if (!this.open || !this.available || this.deck.settings.data.sound.muted) return;
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
    // Translating the whole answer before saying anything made the voice start long after
    // the text. Now: small pieces (a few sentences), translated three at a time, each one
    // read as soon as it's there and its turn has come. Stop (or a new answer) drops the rest.
    const gen = this.gen;
    const pieces = chunks(sentences(speakable(answer).slice(0, 2400)), 220);
    const translate = (p: string) =>
      this.deck.ai
        .ask(`Translate into natural spoken Japanese for a voice to read aloud. Japanese text only, no romaji, no notes:\n\n${p}`, { system: "You are a translator. Output only Japanese." })
        .catch(() => "");
    // at most three translations ahead of the piece being read
    const running: Promise<string>[] = [];
    const fill = (i: number) => {
      while (running.length < pieces.length && running.length < i + 3) running.push(translate(pieces[running.length]));
    };
    for (let i = 0; i < pieces.length; i++) {
      fill(i);
      const ja = await running[i];
      if (this.gen !== gen) return; // stopped, or another answer came
      if (ja.trim()) this.say(ja, "ja");
    }
  }

  /**
   * Speak a text while it's still being written (an AI answer streaming in): give it
   * the whole text so far each time (`feed`); every finished sentence is said at
   * once, the rest waits for its full stop — or for `end`. Stop drops it.
   */
  stream(lang?: string): { feed: (full: string) => void; end: (full: string) => void } {
    const gen = this.gen;
    let used = 0;
    const said = (full: string, last: boolean) => {
      if (this.gen !== gen) return;
      const rest = full.slice(used);
      let cut = 0;
      if (last) cut = rest.length;
      else {
        // up to the last full stop seen; the very first piece may stop at a comma (start sooner)
        for (const m of rest.matchAll(/[.!?…。！？\n]["»”)」』]?(\s|$)/g)) cut = m.index! + m[0].length;
        if (!cut && used === 0) for (const m of rest.matchAll(/[,、，;:]\s/g)) if (m.index! >= 20) (cut = m.index! + m[0].length);
      }
      if (!cut) return;
      const piece = rest.slice(0, cut);
      used += cut;
      if (piece.trim()) this.say(piece, lang);
    };
    return { feed: (full) => said(full, false), end: (full) => said(full, true) };
  }

  /** what the voice is saying right now (the subtitles pop-up shows it) */
  subtitle: { text: string; at: number } | null = null;
  /** the last neural-voice problem (shown by `voice`) */
  lastError = "";

  stop(): void {
    this.subtitle = null;
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
          // the neural voices choke on fancy punctuation and symbols: plain text for them
          return await this.deck.platform.voice!.speak(engine === "piper" ? neuralText(item.text) : item.text, engine, voice, rate);
        } catch (e) {
          if (engine !== "piper") throw e;
          // the neural voice failed: say it with the system voice — quietly (no toast mid-sentence);
          // `voice` in the shell shows the last problem
          this.lastError = `${voice}: ${e instanceof Error ? e.message : e}`;
          console.warn("[voice]", this.lastError);
          this.systemVoice[item.lang] ??= pickSystemVoice(await this.deck.platform.voice!.list("system").catch(() => []), item.lang);
          return this.deck.platform.voice!.speak(item.text, "system", this.systemVoice[item.lang], rate);
        }
      };
      const start = (item: { text: string; lang: string }) => ({ text: item.text, bytes: synth(item) });
      let next: { text: string; bytes: Promise<ArrayBuffer> } | null = this.queue.length ? start(this.queue.shift()!) : null;
      while (next && gen === this.gen) {
        const bytes = await next.bytes;
        const text = next.text;
        next = this.queue.length ? start(this.queue.shift()!) : null; // the next sentence, while this one plays
        if (gen !== this.gen) break;
        this.subtitle = { text, at: performance.now() };
        this.deck.requestFrame();
        await this.play(bytes);
        // sentences that arrived while it played (an answer still streaming in): on we go
        if (!next && this.queue.length) next = start(this.queue.shift()!);
      }
      this.subtitle = null;
    } catch (e) {
      this.deck.notify(`voice: ${e instanceof Error ? e.message : e}`, "warning");
      this.queue = [];
    } finally {
      if (gen === this.gen) this.busy = false;
    }
  }

  private async play(bytes: ArrayBuffer): Promise<void> {
    // after a long time in the background the system can leave it suspended, interrupted or closed
    if (this.ctx?.state === "closed") this.ctx = null;
    this.ctx ??= new AudioContext();
    let ctx = this.ctx;
    if ((ctx.state as string) !== "running") {
      await ctx.resume().catch(() => {});
      if ((ctx.state as string) !== "running") {
        void ctx.close().catch(() => {});
        ctx = this.ctx = new AudioContext();
      }
    }
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

  /**
   * The things the voice can announce on its own, checked every 20 s (cheap; the
   * system stats only when that topic is on): the time at :00 and :30, a CPU or
   * memory overload (two checks in a row above 90 %, then quiet for 10 min).
   */
  watch(): void {
    let lastSlot = "";
    let hot = 0, warnedAt = 0;
    setInterval(() => {
      const v = this.deck.settings.data.voice;
      if (!v.enabled) return;
      const now = new Date();
      const m = now.getMinutes();
      const slot = `${now.getHours()}:${m < 30 ? "00" : "30"}`;
      if ((m === 0 || m === 30) && slot !== lastSlot) {
        lastSlot = slot;
        this.deck.speak("time", t("it's {time}", { time: now.toLocaleTimeString(this.deck.settings.data.user.locale || undefined, { hour: "2-digit", minute: "2-digit" }) }));
      }
      if (v.speak?.system === false || !this.deck.platform.system) return;
      void this.deck.platform.system.stats().then((st) => {
        const mem = st.memTotal ? (st.memUsed / st.memTotal) * 100 : 0;
        hot = st.cpu >= 90 || mem >= 90 ? hot + 1 : 0;
        if (hot >= 2 && Date.now() - warnedAt > 10 * 60_000) {
          warnedAt = Date.now();
          this.deck.speak("system", st.cpu >= 90 ? t("warning: CPU at {n} percent", { n: Math.round(st.cpu) }) : t("warning: memory at {n} percent", { n: Math.round(mem) }));
        }
      }).catch(() => {});
    }, 20_000);
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
/**
 * Text → the pieces the voice says one after the other. The FIRST piece is kept short
 * (one sentence) so the voice starts at once; the next ones gather a few sentences
 * (fewer calls to the synthesizer, which prepares the next while one plays).
 * Japanese and Chinese full stops (。！？) count, so a Japanese text is cut too.
 */
function sentences(text: string): string[] {
  const parts = text.match(/[^.!?…。！？\n]+[.!?…。！？\n]+["»”)」』]?\s*|[^.!?…。！？\n]+$/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    const limit = out.length === 0 ? 24 : 180; // the first one: a sentence, the rest: a few
    if (cur && (cur + p).length > limit) {
      out.push(cur.trim());
      cur = "";
    }
    cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
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

/** Text a neural voice can read: no dashes, fancy quotes, ellipses or symbols. */
export function neuralText(s: string): string {
  return s
    .replace(/[—–]/g, ", ")
    .replace(/[«»“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/…/g, "...")
    .replace(/[·•◆◇▸▾▴★☆⏰◷◉○●✓✗✕☑☐→←↑↓]/g, " ")
    .replace(/[^\p{L}\p{N}\s.,;:!?'"()%&+\-/]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sentences gathered into pieces of about `size` characters (never splitting one). */
function chunks(list: string[], size: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const s of list) {
    if (cur && cur.length + s.length + 1 > size) (out.push(cur), (cur = s));
    else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * What the voice says for an alert: its content. The app's name and symbols are
 * dropped from the title; a title left with nothing of its own ("◷ ICEBREAKER",
 * "Test") isn't read at all — only the body.
 */
export function spokenAlert(title: string, body = ""): string {
  const own = title.replace(/\bICEBREAKER\b/gi, "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").trim();
  const generic = !own || /^(test|essai|notification|alert|alerte)$/i.test(own);
  if (generic) return body || own;
  return body ? `${own}. ${body}` : own;
}

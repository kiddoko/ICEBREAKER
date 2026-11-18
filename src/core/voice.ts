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
  private queue: string[] = [];
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

  /** Which engine and voice to use now (auto: piper when it has a voice, else the system one). */
  async resolve(): Promise<{ engine: "piper" | "system"; voice: string }> {
    const v = this.deck.settings.data.voice;
    const info = await this.deck.platform.voice!.info();
    const lang = (this.deck.settings.data.user.locale || navigator.language || "en").slice(0, 2).toLowerCase();
    const piperVoice = info.piper_voices.includes(v.name) ? v.name : info.piper_voices.find((x) => x.startsWith(lang)) ?? info.piper_voices[0];
    if (v.engine === "piper" || (v.engine === "auto" && info.piper && piperVoice)) {
      if (!info.piper || !piperVoice) throw new Error("piper isn't installed — voice install");
      return { engine: "piper", voice: piperVoice };
    }
    if (!info.system) throw new Error("no voice on this system — voice install (piper)");
    return { engine: "system", voice: info.piper_voices.includes(v.name) ? "" : v.name };
  }

  /** Say something (queued after what's being said). */
  say(text: string): void {
    if (!this.available) return;
    const clean = speakable(text);
    if (!clean) return;
    this.queue.push(...sentences(clean));
    if (!this.busy) void this.pump(this.gen);
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
      const { engine, voice } = await this.resolve();
      const rate = this.deck.settings.data.voice.rate;
      const synth = (t: string) => this.deck.platform.voice!.speak(t, engine, voice, rate);
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
    src.playbackRate.value = 1 - a * 0.04; // a touch lower and slower
    const hp = new BiquadFilterNode(ctx, { type: "highpass", frequency: 140 });
    const lp = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 7600 - a * 2600 });
    const comp = ctx.createDynamicsCompressor();
    const out = new GainNode(ctx, { gain: (v.volume / 100) * 1.1 });
    src.connect(hp);

    // dry
    hp.connect(new GainNode(ctx, { gain: 1 - a * 0.55 })).connect(lp);
    // ring modulator: the signal times a low sine — the classic robot
    const ring = new GainNode(ctx, { gain: 0 });
    const carrier = new OscillatorNode(ctx, { type: "sine", frequency: 52 + a * 28 });
    carrier.connect(ring.gain);
    hp.connect(ring).connect(new GainNode(ctx, { gain: a * 0.85 })).connect(lp);
    // bit crusher: fewer amplitude steps, a digital grit
    const bits = Math.round(14 - a * 9);
    const steps = 2 ** bits;
    const curve = new Float32Array(4096);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.round(x * steps) / steps;
    }
    hp.connect(new WaveShaperNode(ctx, { curve })).connect(new GainNode(ctx, { gain: a * 0.35 })).connect(lp);
    // chorus: a short wobbling copy, metallic
    const delay = new DelayNode(ctx, { delayTime: 0.012, maxDelayTime: 0.05 });
    const lfo = new OscillatorNode(ctx, { type: "sine", frequency: 0.9 });
    const depth = new GainNode(ctx, { gain: 0.003 });
    lfo.connect(depth).connect(delay.delayTime);
    hp.connect(delay).connect(new GainNode(ctx, { gain: a * 0.45 })).connect(lp);

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

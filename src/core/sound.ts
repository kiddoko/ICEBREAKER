/**
 * UI sounds. Every sound is synthesized on the fly with Web Audio (no files,
 * no licences): short square-wave blips, filtered noise for "disk" grinding,
 * a detuned buzz for errors — an old OS that is trying its best.
 *
 * Replace any of them with your own: drop `<name>.wav` (or .ogg / .mp3) in
 * `<vault>/.icebreaker/sounds/` and run `sound reload` — or make a whole pack of
 * files (`.icebreaker/sounds/packs/<id>/`, docs/SOUND_PACKS.md). Names:
 *
 *   move     cursor moves in a list           open     a tab / app opens
 *   confirm  enter / validate                 back     esc / close
 *   success  something worked (toast)         error    something failed
 *   notify   neutral toast                    boot     power-on
 *   unlock   login accepted                   denied   wrong password
 *   alert    a reminder / system notification: a retro "tu-dut", twice
 *   tick     a detent of the ring (MODULES, NEXUS): one click per step
 *   select   picking a module / a locker: a little "clunk"
 */
export const SOUND_NAMES = ["move", "open", "confirm", "back", "success", "error", "notify", "boot", "unlock", "denied", "alert", "tick", "select", "blip", "key", "erase"] as const;
export type SoundName = (typeof SOUND_NAMES)[number];

/**
 * The mixer: every sound belongs to one channel, each with its own volume
 * (settings.sound.mix, 0-100), under the main volume (settings.sound.volume).
 *   ui      moving around, opening, confirming, the wheel's clicks
 *   alerts  notifications, success, errors, reminders, unlock / denied
 *   boot    the start-up
 *   text    the blips of text typing itself out (ui/typewriter.ts)
 *   typing  your own keys (off by default: settings.sound.typing)
 */
export const SOUND_CHANNELS = ["ui", "alerts", "boot", "text", "typing"] as const;
export type SoundChannel = (typeof SOUND_CHANNELS)[number];
export const CHANNEL_OF: Record<SoundName, SoundChannel> = {
  move: "ui", open: "ui", confirm: "ui", back: "ui", tick: "ui", select: "ui",
  success: "alerts", error: "alerts", notify: "alerts", alert: "alerts", unlock: "alerts", denied: "alerts",
  boot: "boot",
  blip: "text",
  key: "typing",
  erase: "typing",
};

/** A sound file may weigh this much at most (docs/SOUND_PACKS.md). */
export const MAX_SOUND_BYTES = 1024 * 1024;
/** How long a sound may last: the start-up and the alert may take longer, the rest are clicks. */
export function maxSeconds(name: SoundName): number {
  return name === "boot" ? 6 : name === "alert" || name === "unlock" || name === "denied" ? 3 : name === "blip" || name === "key" || name === "erase" ? 0.3 : 1.5;
}

type Synth = (ctx: AudioContext, out: AudioNode, t: number) => void;

/**
 * A sound pack is a "voice" the same little melodies are played with
 * (themes pick one in [sound] pack = "…", pitch = …).
 */
interface Voice {
  /** Force one waveform for every note (null = each sound's own). */
  wave: OscillatorType | null;
  pitch: number;
  /** Note length multiplier. */
  length: number;
  /** Noise (clicks, grinding) multiplier — 0 removes it. */
  noise: number;
  /** Echo level 0–1 (a quieter repeat ~90 ms later). */
  echo: number;
  /** Low-pass cutoff of the whole output (Hz). */
  tone: number;
}

export const SOUND_PACKS: Record<string, { description: string; voice: Voice }> = {
  retro: { description: "square-wave blips of an old OS doing its best", voice: { wave: null, pitch: 1, length: 1, noise: 1, echo: 0, tone: 4200 } },
  crystal: { description: "glassy chimes with a little echo", voice: { wave: "sine", pitch: 2, length: 1.7, noise: 0, echo: 0.35, tone: 9000 } },
  soft: { description: "muted, rounded ticks — barely there", voice: { wave: "triangle", pitch: 0.75, length: 0.8, noise: 0.25, echo: 0, tone: 2600 } },
  industrial: { description: "low saws and relay clatter", voice: { wave: "sawtooth", pitch: 0.55, length: 1.1, noise: 1.8, echo: 0.15, tone: 3200 } },
  paper: { description: "dry, papery taps — an e-reader turning pages", voice: { wave: "triangle", pitch: 0.5, length: 0.45, noise: 2.2, echo: 0, tone: 1800 } },
  neon: { description: "bright FM-ish synth plucks with a long tail", voice: { wave: "sawtooth", pitch: 1.5, length: 1.4, noise: 0, echo: 0.55, tone: 6000 } },
  sonar: { description: "deep sine pings that ring out", voice: { wave: "sine", pitch: 0.7, length: 2.4, noise: 0, echo: 0.5, tone: 4200 } },
};

let V: Voice = SOUND_PACKS.retro.voice;

export class Sound {
  enabled = true;
  volume = 0.5;
  /** each channel's volume, 0-1 (the mixer) */
  mix: Record<SoundChannel, number> = { ui: 1, alerts: 1, boot: 1, text: 0.6, typing: 0.6 };
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private custom = new Map<SoundName, AudioBuffer>();
  private last = new Map<SoundName, number>();
  private lowpass: BiquadFilterNode | null = null;
  private voice: Voice = SOUND_PACKS.retro.voice;

  /** Pick a pack (unknown names fall back to retro) and a pitch. */
  setPack(pack: string, pitch = 1): void {
    const base = (SOUND_PACKS[pack] ?? SOUND_PACKS.retro).voice;
    this.voice = { ...base, pitch: base.pitch * pitch };
    if (this.lowpass) this.lowpass.frequency.value = this.voice.tone;
  }

  /**
   * Load sounds from the vault, folder by folder (a later folder wins): your own
   * `.icebreaker/sounds/`, then the sound pack's folder if it's one made of files
   * (`.icebreaker/sounds/packs/<id>/`). Rules for the files: docs/SOUND_PACKS.md.
   * `readBytes` returns null when a file is missing.
   */
  async loadCustom(readBytes: (path: string) => Promise<ArrayBuffer | null>, dirs: string[] = [".icebreaker/sounds"]): Promise<number> {
    this.custom.clear();
    const ctx = this.context();
    if (!ctx) return 0;
    for (const dir of dirs)
      for (const name of SOUND_NAMES)
        for (const ext of ["wav", "ogg", "mp3"]) {
          const data = await readBytes(`${dir}/${name}.${ext}`).catch(() => null);
          if (!data) continue;
          if (data.byteLength > MAX_SOUND_BYTES) {
            console.warn(`sound ${dir}/${name}.${ext}: bigger than 1 MB, left out`);
            break;
          }
          try {
            const buf = await ctx.decodeAudioData(data);
            if (buf.duration > maxSeconds(name)) console.warn(`sound ${dir}/${name}.${ext}: ${buf.duration.toFixed(1)} s, longer than ${maxSeconds(name)} s — left out`);
            else this.custom.set(name, buf);
            break;
          } catch {
            console.warn(`sound ${dir}/${name}.${ext}: not a playable audio file`);
          }
        }
    return this.custom.size;
  }

  play(name: SoundName): void {
    const level = this.mix[CHANNEL_OF[name]] ?? 1;
    if (!this.enabled || this.volume <= 0 || level <= 0) return;
    // the same sound twice within 35 ms is noise, not feedback (key repeat…)
    const now = performance.now();
    if (now - (this.last.get(name) ?? 0) < 35) return;
    this.last.set(name, now);
    const ctx = this.context();
    if (!ctx || !this.master) return;
    if (ctx.state === "suspended") void ctx.resume();
    this.master.gain.value = this.volume * 0.35;
    // keys and blips start now; the rest a hair later (so every voice of a chord starts together)
    const t = ctx.currentTime + (CHANNEL_OF[name] === "typing" || name === "blip" ? 0 : 0.005);
    // the channel's fader
    const out = ctx.createGain();
    out.gain.value = level;
    out.connect(this.master);
    const buf = this.custom.get(name);
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(out);
      src.start(t);
      return;
    }
    V = this.voice;
    SYNTHS[name](ctx, out, t);
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      // "interactive": the smallest output buffer the system gives (the typing click must land with the key)
      this.ctx = new AC({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      // a gentle low-pass: square waves through an old speaker
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = this.voice.tone;
      this.lowpass = lp;
      this.master.connect(lp).connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }
}

// ── tiny synth kit ─────────────────────────────────────────────────────────

/** One enveloped oscillator note. */
function tone(ctx: AudioContext, out: AudioNode, t: number, freq: number, dur: number, type: OscillatorType = "square", vol = 0.5, slideTo?: number, echoed = false): void {
  type = V.wave ?? type;
  if (!echoed) {
    freq *= V.pitch;
    if (slideTo) slideTo *= V.pitch;
    dur *= V.length;
    // sine/triangle are quieter than square at the same gain
    if (V.wave === "sine" || V.wave === "triangle") vol *= 1.6;
    if (V.echo > 0) tone(ctx, out, t + 0.09, freq, dur, type, vol * V.echo, slideTo, true);
  }
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
/** Band-passed noise burst: relays, disk heads, static. */
function noise(ctx: AudioContext, out: AudioNode, t: number, dur: number, freq: number, vol = 0.4, q = 1.5): void {
  vol *= V.noise;
  if (vol <= 0.001) return;
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

const jitter = (f: number, amt = 0.03) => f * (1 + (Math.random() * 2 - 1) * amt);

const SYNTHS: Record<SoundName, Synth> = {
  move: (c, o, t) => tone(c, o, t, jitter(1900, 0.05), 0.018, "square", 0.12),
  open: (c, o, t) => {
    noise(c, o, t, 0.05, 2400, 0.25, 4); // relay click
    tone(c, o, t + 0.03, 520, 0.05, "square", 0.22);
    tone(c, o, t + 0.075, 780, 0.06, "square", 0.18);
  },
  confirm: (c, o, t) => {
    tone(c, o, t, 660, 0.045, "square", 0.22);
    tone(c, o, t + 0.05, 990, 0.07, "square", 0.2);
  },
  back: (c, o, t) => tone(c, o, t, 620, 0.07, "square", 0.18, 380),
  success: (c, o, t) => {
    [523, 659, 784].forEach((f, i) => tone(c, o, t + i * 0.06, f, 0.08, "square", 0.18));
    tone(c, o, t + 0.18, 1046, 0.16, "triangle", 0.2);
  },
  error: (c, o, t) => {
    // a buzzer that stutters, like it's not sure it should complain
    for (let i = 0; i < 3; i++) {
      tone(c, o, t + i * 0.085, 110, 0.07, "sawtooth", 0.3);
      tone(c, o, t + i * 0.085, 116.5, 0.07, "square", 0.18);
    }
    noise(c, o, t, 0.25, 300, 0.15, 0.8);
  },
  notify: (c, o, t) => {
    tone(c, o, t, 880, 0.09, "triangle", 0.25);
    tone(c, o, t + 0.07, 1320, 0.12, "sine", 0.12);
  },
  alert: (c, o, t) => {
    // tu-dut · tu-dut, like an old pager
    for (const at of [0, 0.42]) {
      tone(c, o, t + at, 988, 0.11, "square", 0.22);
      tone(c, o, t + at + 0.13, 1319, 0.16, "square", 0.22);
    }
  },
  boot: (c, o, t) => {
    // disk spin-up: grinding seeks, then the POST beep
    for (let i = 0; i < 9; i++) noise(c, o, t + i * 0.055 + Math.random() * 0.03, 0.045, jitter(1100, 0.4), 0.35, 6);
    tone(c, o, t + 0.1, 55, 0.6, "sawtooth", 0.06, 90);
    tone(c, o, t + 0.62, 1000, 0.14, "square", 0.22);
  },
  unlock: (c, o, t) => {
    noise(c, o, t, 0.04, 3000, 0.3, 5);
    [392, 523, 784].forEach((f, i) => tone(c, o, t + 0.04 + i * 0.07, f, 0.09, "square", 0.18));
  },
  // a wheel detent: a dry click (relay noise) with a hair of pitch — each pack colours it
  tick: (c, o, t) => {
    noise(c, o, t, 0.014, jitter(3600, 0.08), 0.32, 7);
    tone(c, o, t, jitter(2400, 0.04), 0.012, "square", 0.07);
  },
  // a shard going into its socket: a soft thump, then two quick notes
  select: (c, o, t) => {
    noise(c, o, t, 0.07, 700, 0.3, 1.8);
    tone(c, o, t + 0.02, 330, 0.05, "square", 0.18);
    tone(c, o, t + 0.07, 494, 0.08, "square", 0.16);
  },
  // text typing itself out: a Game Boy RPG blip (each pack gives it its colour)
  blip: (c, o, t) => tone(c, o, t, jitter(980, 0.04), 0.045, "square", 0.26),
  // your own keys: a little mechanical click — papery, clacky, glassy… with the pack
  key: (c, o, t) => {
    noise(c, o, t, 0.016, jitter(3200, 0.12), 0.22, 4);
    tone(c, o, t, jitter(170, 0.08), 0.014, "triangle", 0.08);
  },
  // erasing (backspace, delete): lower and softer than a key, sliding down — "un-typing"
  erase: (c, o, t) => {
    noise(c, o, t, 0.014, jitter(1800, 0.1), 0.18, 3);
    tone(c, o, t, jitter(420, 0.05), 0.03, "triangle", 0.09, 240);
  },
  denied: (c, o, t) => {
    tone(c, o, t, 196, 0.12, "square", 0.25);
    tone(c, o, t + 0.13, 147, 0.22, "square", 0.25);
  },
};

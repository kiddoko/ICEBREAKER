/**
 * THE MODULES' SAMPLER, the deck's side: what `ib.audio` (permission "audio")
 * drives. A module (in its sandbox, which has no sound of its own) loads
 * samples and sends events dated on the audio clock; an AudioWorklet
 * (core/mixer-worklet.ts, maths in core/mixer-dsp.ts) plays them on the exact
 * frame. A tracker computes its song ~100 ms ahead, so it never stutters even
 * when the screen is busy; a note played on the keyboard is dated "now".
 *
 * Each module has its own samples and voices (never another's), within limits
 * (MAX_*), and everything it plays stops when it's switched off. Its volume is
 * the main volume × the mixer's "Modules" fader (Settings → SOUND). It plays,
 * nothing else: no microphone, no recording of the computer's sound.
 *
 * Its own AudioContext (not the UI sounds' one: their pack's filter isn't for
 * music), made the first time a module asks for sound.
 */
import { MAX_VOICES as DSP_VOICES, toFloats, type DspSample } from "./mixer-dsp";

/** per module */
export const MAX_VOICES = 64;
/** the floats of a module's samples, all together (32 MB) */
export const MAX_SAMPLE_FLOATS = 8 * 1024 * 1024;
export const MAX_EVENTS_PER_CALL = 8192;
/** how far ahead a module may date an event, in seconds */
export const MAX_AHEAD = 30;
/** the biggest file `decode` takes, and the most floats it gives back */
export const MAX_DECODE_BYTES = 16 * 1024 * 1024;
export const MAX_DECODE_FLOATS = 16 * 1024 * 1024;

/** One change to a voice (ib.audio.schedule). */
export interface AudioEvent {
  /** when, on the audio clock (`ib.audio.now()`, seconds); missing or past: at once */
  at?: number;
  /** the voice, 0–63: one sound at a time each (a tracker's track) */
  voice: number;
  /** start this sample (an id given to `sample`) on the voice, from `offset` frames */
  play?: string;
  offset?: number;
  /** how fast to read the sample, in its frames per second: its own recording rate = its own pitch */
  rate?: number;
  /** 0…1 */
  volume?: number;
  /** -1 (left) … 1 (right); 0 the middle */
  pan?: number;
  /** "linear" smooth (the default) or "none": stepped, the grit of the Amiga's Paula chip */
  interp?: "linear" | "none";
  /** silence the voice */
  stop?: boolean;
}

export interface SampleOptions {
  /** the loop, in frames (loopLength 0 or missing: plays once) */
  loopStart?: number;
  loopLength?: number;
}

interface Owner {
  samples: Map<string, { slot: number; floats: number }>;
  /** a module's voice number → the worklet's voice */
  voices: Map<number, number>;
  floats: number;
}

export class Mixer {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private out: GainNode | null = null;
  private starting: Promise<boolean> | null = null;
  private owners = new Map<string, Owner>();
  /** what each module loaded, kept to fill a new audio context (the system closed the old one) */
  private kept = new Map<number, DspSample>();
  private nextSlot = 0;
  private freeSlots: number[] = [];
  private nextVoice = 0;
  private freeVoices: number[] = [];
  private sounding = new Set<number>();
  /** each module's own sound (ib.audio.stream): its node, and whether it made sound lately */
  private streams = new Map<string, { node: AudioWorkletNode; loud: boolean }>();
  /** what each module asked to hear when you silence it (`audio stop`, the ♪ in the status bar) */
  private stopListeners = new Map<string, Set<() => void>>();
  private gain = 0.5;
  /** the deck redraws the status bar when who's playing changes */
  onActive?: () => void;

  /** Is there an audio output here (Web Audio with worklets). */
  available(): boolean {
    return typeof AudioContext !== "undefined" && typeof AudioWorkletNode !== "undefined";
  }

  /** The main volume × the "Modules" fader, 0–1 (0 when the sound is off or muted). */
  setVolume(v: number): void {
    this.gain = Math.max(0, Math.min(1, v));
    if (this.out) this.out.gain.value = this.gain;
  }

  /** The modules that make sound right now (their ids). */
  playing(): string[] {
    const out: string[] = [];
    for (const [id, o] of this.owners) if ([...o.voices.values()].some((v) => this.sounding.has(v))) out.push(id);
    for (const [id, s] of this.streams) if (s.loud && !out.includes(id)) out.push(id);
    return out;
  }

  /** The audio clock, in seconds (what `at` is measured on). */
  async now(): Promise<number> {
    await this.start();
    return this.ctx?.currentTime ?? 0;
  }

  async sample(owner: string, id: string, data: unknown, opts: SampleOptions = {}): Promise<void> {
    if (typeof id !== "string" || !id || id.length > 200) throw new Error("audio.sample: the id must be a short text");
    if (!(data instanceof Float32Array || data instanceof Int8Array || data instanceof Int16Array || data instanceof Uint8Array)) throw new Error("audio.sample: the data must be a Float32Array, Int8Array, Int16Array or Uint8Array");
    const o = this.owner(owner);
    const before = o.samples.get(id);
    const total = o.floats - (before?.floats ?? 0) + data.length;
    if (total > MAX_SAMPLE_FLOATS) throw new Error(`audio.sample: ${owner}'s samples would take more than ${(MAX_SAMPLE_FLOATS * 4) >> 20} MB`);
    const floats = toFloats(data);
    const ls = Math.max(0, Math.floor(Number(opts.loopStart) || 0));
    const ll = Math.max(0, Math.floor(Number(opts.loopLength) || 0));
    const sample: DspSample = { data: floats, loopStart: Math.min(ls, floats.length), loopEnd: ll > 0 ? Math.min(floats.length, ls + ll) : 0 };
    const slot = before?.slot ?? this.freeSlots.pop() ?? this.nextSlot++;
    o.samples.set(id, { slot, floats: data.length });
    o.floats = total;
    this.kept.set(slot, sample);
    await this.start();
    this.node?.port.postMessage({ t: "sample", slot, sample });
  }

  /** Forget a sample (or all of the module's). */
  async drop(owner: string, id?: string): Promise<void> {
    const o = this.owners.get(owner);
    if (!o) return;
    for (const [sid, s] of [...o.samples]) {
      if (id !== undefined && sid !== id) continue;
      o.samples.delete(sid);
      o.floats -= s.floats;
      this.kept.delete(s.slot);
      this.freeSlots.push(s.slot);
      this.node?.port.postMessage({ t: "sample", slot: s.slot, sample: null });
    }
  }

  async schedule(owner: string, events: unknown): Promise<void> {
    if (!Array.isArray(events)) throw new Error("audio.schedule: a list of events");
    if (events.length > MAX_EVENTS_PER_CALL) throw new Error(`audio.schedule: at most ${MAX_EVENTS_PER_CALL} events at a time`);
    if (!(await this.start()) || !this.ctx) throw new Error("no audio output here");
    const o = this.owner(owner);
    const now = this.ctx.currentTime;
    const list = [];
    for (const raw of events as AudioEvent[]) {
      if (!raw || typeof raw !== "object") continue;
      const voice = Number(raw.voice);
      if (!Number.isInteger(voice) || voice < 0 || voice >= MAX_VOICES) throw new Error(`audio.schedule: a voice is 0–${MAX_VOICES - 1}`);
      const at = raw.at === undefined ? now : Number(raw.at);
      if (!Number.isFinite(at)) throw new Error("audio.schedule: `at` must be a time from audio.now()");
      if (at > now + MAX_AHEAD) throw new Error(`audio.schedule: at most ${MAX_AHEAD} s ahead`);
      const e: Record<string, unknown> = { time: Math.max(now, at), voice: this.voiceOf(o, voice) };
      if (raw.play !== undefined) {
        const s = o.samples.get(String(raw.play));
        if (!s) throw new Error(`audio.schedule: no sample "${raw.play}" (audio.sample first)`);
        e.slot = s.slot;
        e.offset = Math.max(0, Number(raw.offset) || 0);
      }
      if (raw.rate !== undefined) e.step = Math.max(0, Number(raw.rate) || 0) / this.ctx.sampleRate;
      if (raw.volume !== undefined) e.vol = Number(raw.volume);
      if (raw.pan !== undefined) e.pan = Number(raw.pan);
      if (raw.interp !== undefined) e.interp = raw.interp === "none" ? 0 : 1;
      if (raw.stop) e.stop = true;
      list.push(e);
    }
    if (this.ctx.state !== "running") void this.ctx.resume().catch(() => {});
    this.node?.port.postMessage({ t: "events", list });
  }

  /**
   * A line for the module's own sound (ib.audio.stream): a node of its own under the
   * "Modules" fader, and the port the module writes its frames to (core/audiostream.ts).
   * A second call replaces the first.
   */
  async openStream(owner: string): Promise<MessagePort> {
    if (!(await this.start()) || !this.ctx || !this.out) throw new Error("no sound output here");
    this.closeStream(owner);
    const node = new AudioWorkletNode(this.ctx, "ib-stream", { numberOfInputs: 0, outputChannelCount: [2] });
    node.connect(this.out);
    const entry = { node, loud: false };
    node.port.onmessage = (ev: MessageEvent<{ t: string; on?: boolean }>) => {
      if (ev.data?.t !== "active" || entry.loud === !!ev.data.on) return;
      entry.loud = !!ev.data.on;
      this.onActive?.();
    };
    const ch = new MessageChannel();
    node.port.postMessage({ t: "port", port: ch.port1 }, [ch.port1]);
    this.streams.set(owner, entry);
    if (this.ctx.state !== "running") void this.ctx.resume().catch(() => {});
    return ch.port2;
  }

  private closeStream(owner: string): void {
    const s = this.streams.get(owner);
    if (!s) return;
    s.node.port.postMessage({ t: "close" });
    s.node.disconnect();
    this.streams.delete(owner);
    if (s.loud) this.onActive?.();
  }

  /**
   * Silence the module's voices now, and forget what it had scheduled. `byUser`: you did it
   * (`audio stop`, the ♪ in the status bar): the module is told (onStop), so its song stops too
   * instead of starting the next notes again.
   */
  stop(owner: string, byUser = false): void {
    const o = this.owners.get(owner);
    if (o?.voices.size) this.node?.port.postMessage({ t: "stop", voices: [...o.voices.values()] });
    const st = this.streams.get(owner);
    st?.node.port.postMessage({ t: "flush" });
    // quiet from now on, as far as the deck says (`audio`, the ♪), without waiting for the worklet's next report
    let changed = false;
    for (const v of o?.voices.values() ?? []) changed = this.sounding.delete(v) || changed;
    if (st?.loud) (st.loud = false), (changed = true);
    if (changed) this.onActive?.();
    if (byUser) for (const fn of this.stopListeners.get(owner) ?? []) try { fn(); } catch { /* the module's own problem */ }
  }

  /** Be told when the user silences this module. Returns how to stop listening. */
  onStop(owner: string, fn: () => void): () => void {
    let set = this.stopListeners.get(owner);
    if (!set) this.stopListeners.set(owner, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  /** The module is switched off (or crashed): silence, and everything it had goes. */
  release(owner: string): void {
    this.closeStream(owner);
    const o = this.owners.get(owner);
    if (!o) return void this.stopListeners.delete(owner);
    this.stop(owner);
    void this.drop(owner);
    for (const v of o.voices.values()) this.freeVoices.push(v);
    this.owners.delete(owner);
    this.stopListeners.delete(owner);
    this.onActive?.();
  }

  /** Decode an audio file (wav, aiff, mp3, m4a, ogg… what the system reads) into floats, one array per channel. */
  async decode(bytes: unknown): Promise<{ rate: number; channels: Float32Array[] }> {
    const buf = bytes instanceof ArrayBuffer ? bytes.slice(0) : ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).slice().buffer : null;
    if (!buf) throw new Error("audio.decode: the file's bytes (Uint8Array)");
    if (buf.byteLength > MAX_DECODE_BYTES) throw new Error("audio.decode: larger than 16 MB");
    await this.start();
    if (!this.ctx) throw new Error("no audio here");
    let audio: AudioBuffer;
    try {
      audio = await this.ctx.decodeAudioData(buf);
    } catch {
      throw new Error("audio.decode: not an audio file this system can read");
    }
    if (audio.length * audio.numberOfChannels > MAX_DECODE_FLOATS) throw new Error("audio.decode: too long (more than 16 million frames)");
    const channels: Float32Array[] = [];
    for (let c = 0; c < audio.numberOfChannels; c++) channels.push(audio.getChannelData(c).slice());
    return { rate: audio.sampleRate, channels };
  }

  /** Bring the sound back after the app sat in the background (the system may suspend or close it). */
  wake(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === "closed") {
      this.ctx = null;
      this.node = null;
      this.out = null;
      this.starting = null;
      void this.start();
    } else if (ctx.state !== "running") void ctx.resume().catch(() => {});
  }

  private owner(id: string): Owner {
    let o = this.owners.get(id);
    if (!o) this.owners.set(id, (o = { samples: new Map(), voices: new Map(), floats: 0 }));
    return o;
  }

  private voiceOf(o: Owner, n: number): number {
    let v = o.voices.get(n);
    if (v === undefined) {
      v = this.freeVoices.pop() ?? this.nextVoice++;
      if (v >= DSP_VOICES) throw new Error("audio: every voice of the deck is taken");
      o.voices.set(n, v);
    }
    return v;
  }

  /** The audio context and the worklet, the first time (false: no sound here). */
  private start(): Promise<boolean> {
    if (this.node) return Promise.resolve(true);
    if (!this.available()) return Promise.resolve(false);
    this.starting ??= (async () => {
      try {
        const ctx = new AudioContext({ latencyHint: "interactive" });
        const { default: url } = await import("./mixer-worklet?worker&url");
        await ctx.audioWorklet.addModule(url);
        const node = new AudioWorkletNode(ctx, "ib-mixer", { numberOfInputs: 0, outputChannelCount: [2] });
        const out = ctx.createGain();
        out.gain.value = this.gain;
        node.connect(out).connect(ctx.destination);
        node.port.onmessage = (ev: MessageEvent<{ t: string; voices: number[] }>) => {
          if (ev.data?.t !== "active") return;
          const was = this.playing().join();
          this.sounding = new Set(ev.data.voices);
          if (this.playing().join() !== was) this.onActive?.();
        };
        for (const [slot, sample] of this.kept) node.port.postMessage({ t: "sample", slot, sample });
        this.ctx = ctx;
        this.node = node;
        this.out = out;
        return true;
      } catch (e) {
        console.warn("[audio] no sampler:", e);
        this.starting = null;
        return false;
      }
    })();
    return this.starting;
  }
}

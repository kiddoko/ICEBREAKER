/**
 * THE MODULES' SAMPLER, its sound maths (core/mixer.ts is the deck's side,
 * core/mixer-worklet.ts runs this in the audio thread). Plain arithmetic on
 * arrays: no import, no Web Audio, so a test can run it (tests/mixer.test.ts).
 *
 * Samples sit in numbered slots (mono floats, -1…1, an optional loop). Voices
 * play them: a position that moves `step` source frames per output frame, a
 * volume, a pan, smooth (linear interpolation) or stepped like the Amiga's
 * Paula chip (`interp: 0`: the nearest frame, with its grit). Events change a
 * voice at an exact output frame: a module computes its song ahead of time and
 * it lands on the frame, whatever the screen is doing.
 *
 * No class fields (`declare` only) and no helpers: the worklet's bundle stays
 * one plain class.
 */

export interface DspSample {
  data: Float32Array;
  /** loop in frames: [loopStart, loopEnd); loopEnd <= loopStart = no loop */
  loopStart: number;
  loopEnd: number;
}

export interface DspEvent {
  /** output frame it happens at (sample-accurate); a past one happens at once */
  frame: number;
  voice: number;
  /** start this slot's sample from `offset` (frames) */
  slot?: number;
  offset?: number;
  /** source frames per output frame (1 = the sample's own speed at the output rate) */
  step?: number;
  /** 0…1 */
  vol?: number;
  /** -1 left … 1 right */
  pan?: number;
  /** 1 smooth (linear), 0 stepped (Paula) */
  interp?: 0 | 1;
  /** silence the voice */
  stop?: boolean;
}

export interface DspVoice {
  slot: number;
  pos: number;
  step: number;
  vol: number;
  pan: number;
  interp: 0 | 1;
  on: boolean;
}

export const MAX_VOICES = 256;
export const MAX_QUEUE = 100_000;

export class MixerDsp {
  declare samples: (DspSample | null)[];
  declare voices: DspVoice[];
  declare queue: DspEvent[];
  declare sorted: boolean;
  declare gain: number;

  constructor() {
    this.samples = [];
    this.voices = [];
    this.queue = [];
    this.sorted = true;
    this.gain = 1;
  }

  setSample(slot: number, s: DspSample | null): void {
    if (!Number.isInteger(slot) || slot < 0 || slot > 65535) return;
    this.samples[slot] = s;
    // a voice playing a slot that changes stops (its position means nothing in the new one)
    for (const v of this.voices) if (v && v.slot === slot) v.on = false;
  }

  add(events: DspEvent[]): void {
    for (const e of events) {
      if (this.queue.length >= MAX_QUEUE) break;
      if (!Number.isInteger(e.voice) || e.voice < 0 || e.voice >= MAX_VOICES || !Number.isFinite(e.frame)) continue;
      this.queue.push(e);
    }
    this.sorted = false;
  }

  /** silence these voices now, and forget what was coming for them */
  stopVoices(voices: number[]): void {
    const set = new Set(voices);
    for (const n of set) if (this.voices[n]) this.voices[n].on = false;
    this.queue = this.queue.filter((e) => !set.has(e.voice));
  }

  /** the voices that make sound right now */
  active(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.voices.length; i++) if (this.voices[i] && this.voices[i].on) out.push(i);
    return out;
  }

  private apply(e: DspEvent): void {
    let v = this.voices[e.voice];
    if (!v) v = this.voices[e.voice] = { slot: -1, pos: 0, step: 1, vol: 1, pan: 0, interp: 1, on: false };
    if (e.stop) v.on = false;
    if (e.step !== undefined && Number.isFinite(e.step)) v.step = Math.max(0, Math.min(64, e.step));
    if (e.vol !== undefined && Number.isFinite(e.vol)) v.vol = Math.max(0, Math.min(1, e.vol));
    if (e.pan !== undefined && Number.isFinite(e.pan)) v.pan = Math.max(-1, Math.min(1, e.pan));
    if (e.interp !== undefined) v.interp = e.interp ? 1 : 0;
    if (e.slot !== undefined) {
      const s = this.samples[e.slot];
      v.slot = e.slot;
      v.pos = Math.max(0, e.offset !== undefined && Number.isFinite(e.offset) ? e.offset : 0);
      v.on = !!s && v.pos < s.data.length;
    }
  }

  /**
   * Fill `left` / `right` (one block) starting at output frame `start`, adding
   * every voice. Events are applied on their frame.
   */
  render(left: Float32Array, right: Float32Array, start: number): void {
    left.fill(0);
    if (right !== left) right.fill(0);
    if (!this.sorted) {
      this.queue.sort((a, b) => a.frame - b.frame);
      this.sorted = true;
    }
    const n = left.length;
    let at = 0;
    let qi = 0;
    while (at < n) {
      // events due by this frame
      while (qi < this.queue.length && this.queue[qi].frame <= start + at) this.apply(this.queue[qi++]);
      // mix until the next event (or the end of the block)
      let until = n;
      if (qi < this.queue.length) until = Math.max(at + 1, Math.min(n, Math.ceil(this.queue[qi].frame - start)));
      for (let i = 0; i < this.voices.length; i++) {
        const v = this.voices[i];
        if (v && v.on) this.mixVoice(v, left, right, at, until);
      }
      at = until;
    }
    if (qi) this.queue.splice(0, qi);
    if (this.gain !== 1) {
      for (let i = 0; i < n; i++) left[i] *= this.gain;
      if (right !== left) for (let i = 0; i < n; i++) right[i] *= this.gain;
    }
  }

  private mixVoice(v: DspVoice, left: Float32Array, right: Float32Array, from: number, to: number): void {
    const s = this.samples[v.slot];
    if (!s) return void (v.on = false);
    const d = s.data;
    const len = d.length;
    const loops = s.loopEnd > s.loopStart && s.loopStart >= 0 && s.loopEnd <= len;
    const end = loops ? s.loopEnd : len;
    const loopLen = s.loopEnd - s.loopStart;
    // linear pan: the middle is full on both sides (an Amiga voice is hard left or right: pan ±1)
    const gl = v.vol * Math.min(1, 1 - v.pan);
    const gr = v.vol * Math.min(1, 1 + v.pan);
    const mono = left === right;
    let pos = v.pos;
    for (let i = from; i < to; i++) {
      if (pos >= end) {
        if (!loops) {
          v.on = false;
          break;
        }
        pos = s.loopStart + ((pos - s.loopStart) % loopLen);
      }
      const k = pos | 0;
      let x = d[k];
      if (v.interp) {
        let k1 = k + 1;
        if (k1 >= end) k1 = loops ? s.loopStart : k;
        x += (d[k1] - x) * (pos - k);
      }
      if (mono) left[i] += x * v.vol;
      else {
        left[i] += x * gl;
        right[i] += x * gr;
      }
      pos += v.step;
    }
    v.pos = pos;
  }
}

/** A module's sample as floats: 8-bit (-128…127) and 16-bit integers scaled, anything odd made silent. */
export function toFloats(data: Float32Array | Int8Array | Int16Array | Uint8Array): Float32Array {
  const out = new Float32Array(data.length);
  const scale = data instanceof Int8Array ? 1 / 128 : data instanceof Int16Array ? 1 / 32768 : data instanceof Uint8Array ? 1 / 128 : 1;
  const bias = data instanceof Uint8Array ? 128 : 0;
  for (let i = 0; i < data.length; i++) {
    const x = (data[i] - bias) * scale;
    out[i] = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
  }
  return out;
}

/**
 * A module's own sound (ib.audio.stream): the blocks it computes, waiting to be
 * played. A ring of stereo frames, bounded (what doesn't fit is dropped), every
 * value checked (NaN → 0, kept in -4…4: the gain after it does the rest).
 */
export class StreamBuffer {
  declare left: Float32Array;
  declare right: Float32Array;
  declare start: number;
  declare size: number;

  constructor(capacity: number) {
    this.left = new Float32Array(Math.max(1, capacity));
    this.right = new Float32Array(Math.max(1, capacity));
    this.start = 0;
    this.size = 0;
  }

  get capacity(): number {
    return this.left.length;
  }

  clear(): void {
    this.start = 0;
    this.size = 0;
  }

  /** add frames at the end (as many as fit); returns how many were taken */
  push(l: Float32Array, r: Float32Array): number {
    const cap = this.left.length;
    const n = Math.min(l.length, r.length, cap - this.size);
    let at = (this.start + this.size) % cap;
    for (let i = 0; i < n; i++) {
      const a = l[i], b = r[i];
      this.left[at] = a > 4 ? 4 : a < -4 ? -4 : a === a ? a : 0;
      this.right[at] = b > 4 ? 4 : b < -4 ? -4 : b === b ? b : 0;
      if (++at === cap) at = 0;
    }
    this.size += n;
    return n;
  }

  /** fill `l` / `r` from the front; silence for what's missing. Returns how many frames were real. */
  pull(l: Float32Array, r: Float32Array): number {
    const cap = this.left.length;
    const n = Math.min(l.length, this.size);
    let at = this.start;
    for (let i = 0; i < n; i++) {
      l[i] = this.left[at];
      r[i] = this.right[at];
      if (++at === cap) at = 0;
    }
    for (let i = n; i < l.length; i++) l[i] = r[i] = 0;
    this.start = at;
    this.size -= n;
    return n;
  }
}

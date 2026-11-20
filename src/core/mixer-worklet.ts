/**
 * THE MODULES' SAMPLER in the audio thread (an AudioWorklet): it runs the
 * sound maths of core/mixer-dsp.ts on every block of 128 frames. Messages
 * come only from the deck (core/mixer.ts), never from a module directly.
 * Every quarter of a second it says which voices sound (the status bar's ♪).
 */
import { MixerDsp, StreamBuffer, type DspEvent, type DspSample } from "./mixer-dsp";

// the AudioWorkletGlobalScope (not in TypeScript's DOM types)
declare const sampleRate: number;
declare const currentFrame: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

type ToWorklet =
  | { t: "sample"; slot: number; sample: DspSample | null }
  | { t: "events"; list: (Omit<DspEvent, "frame"> & { time: number })[] }
  | { t: "stop"; voices: number[] }
  | { t: "gain"; value: number };

class IbMixer extends AudioWorkletProcessor {
  declare dsp: MixerDsp;
  declare told: number;

  constructor() {
    super();
    this.dsp = new MixerDsp();
    this.told = 0;
    this.port.onmessage = (ev: MessageEvent<ToWorklet>) => {
      const m = ev.data;
      if (m.t === "sample") this.dsp.setSample(m.slot, m.sample);
      else if (m.t === "events") this.dsp.add(m.list.map((e) => ({ ...e, frame: Math.round(e.time * sampleRate) })));
      else if (m.t === "stop") this.dsp.stopVoices(m.voices);
      else if (m.t === "gain") this.dsp.gain = Math.max(0, Math.min(1, m.value));
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (out?.length) this.dsp.render(out[0], out[1] ?? out[0], currentFrame);
    if (currentFrame - this.told >= sampleRate / 4) {
      this.told = currentFrame;
      this.port.postMessage({ t: "active", voices: this.dsp.active() });
    }
    return true;
  }
}

registerProcessor("ib-mixer", IbMixer);

/**
 * A module's own sound (ib.audio.stream, core/audiostream.ts): one node a module. The deck
 * hands it a port to the module's sandbox; on it come only blocks of frames, which it plays.
 * When fewer than LOW frames wait, it asks for more (up to HIGH): about 16–32 ms ahead, so a
 * key played on a module's piano is heard ~30 ms later. Two seconds at most wait (the rest
 * is dropped); the deck flushes it when you silence the module.
 */
class IbStream extends AudioWorkletProcessor {
  declare buf: StreamBuffer;
  declare data: MessagePort | null;
  declare asked: number;
  declare played: number;
  declare low: number;
  declare high: number;
  declare told: number;
  declare loud: boolean;
  declare closed: boolean;

  constructor() {
    super();
    this.buf = new StreamBuffer(Math.round(sampleRate * 2));
    this.data = null;
    this.asked = -1;
    this.played = 0;
    this.low = Math.round(sampleRate * 0.016);
    this.high = Math.round(sampleRate * 0.032);
    this.told = 0;
    this.loud = false;
    this.closed = false;
    this.port.onmessage = (ev: MessageEvent<{ t: string; port?: MessagePort }>) => {
      const m = ev.data;
      if (m.t === "port" && m.port && !this.data) {
        this.data = m.port;
        this.data.onmessage = (e: MessageEvent<{ t?: string; l?: unknown; r?: unknown }>) => this.pcm(e.data);
        this.data.postMessage({ t: "hello", rate: sampleRate, low: this.low, high: this.high });
      } else if (m.t === "flush") this.buf.clear();
      else if (m.t === "close") {
        this.data?.close();
        this.data = null;
        this.closed = true;
      }
    };
  }

  pcm(m: { t?: string; l?: unknown; r?: unknown }): void {
    if (m?.t === "pcm" && m.l instanceof Float32Array && m.r instanceof Float32Array && m.l.length === m.r.length && m.l.length <= 16384) this.buf.push(m.l, m.r);
    this.asked = -1;
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (out?.length) {
      const l = out[0], r = out[1] ?? out[0];
      const real = this.buf.pull(l, r);
      for (let i = 0; i < real && !this.loud; i++) if (l[i] > 1e-4 || l[i] < -1e-4 || r[i] > 1e-4 || r[i] < -1e-4) this.loud = true;
      this.played += l.length;
    }
    // running low: ask for more (again, if the module didn't answer within 100 ms)
    if (this.data && this.buf.size < this.low && (this.asked < 0 || currentFrame - this.asked > sampleRate * 0.1)) {
      this.asked = currentFrame;
      this.data.postMessage({ t: "pull", frames: this.high - this.buf.size, played: this.played, buffered: this.buf.size });
    }
    if (currentFrame - this.told >= sampleRate / 4) {
      this.told = currentFrame;
      this.port.postMessage({ t: "active", on: this.loud });
      this.loud = false;
    }
    return !this.closed;
  }
}

registerProcessor("ib-stream", IbStream);

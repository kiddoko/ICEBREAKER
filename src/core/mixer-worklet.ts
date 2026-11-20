/**
 * THE MODULES' SAMPLER in the audio thread (an AudioWorklet): it runs the
 * sound maths of core/mixer-dsp.ts on every block of 128 frames. Messages
 * come only from the deck (core/mixer.ts), never from a module directly.
 * Every quarter of a second it says which voices sound (the status bar's ♪).
 */
import { MixerDsp, type DspEvent, type DspSample } from "./mixer-dsp";

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

import { describe, expect, it } from "vitest";
import { MixerDsp, StreamBuffer, toFloats } from "../src/core/mixer-dsp";
import { Mixer } from "../src/core/mixer";

/** one block (mono: left and right are the same array) */
function block(dsp: MixerDsp, n: number, start = 0): Float32Array {
  const out = new Float32Array(n);
  dsp.render(out, out, start);
  return out;
}
const ramp = (n: number) => Float32Array.from({ length: n }, (_, i) => i / n);

describe("the modules' sampler (core/mixer-dsp.ts)", () => {
  it("plays a sample at its own speed, then stops at its end", () => {
    const dsp = new MixerDsp();
    dsp.setSample(0, { data: Float32Array.from([0.1, 0.2, 0.3, 0.4]), loopStart: 0, loopEnd: 0 });
    dsp.add([{ frame: 0, voice: 0, slot: 0, step: 1, vol: 1 }]);
    const out = block(dsp, 6);
    expect([...out].map((x) => +x.toFixed(3))).toEqual([0.1, 0.2, 0.3, 0.4, 0, 0]);
    expect(dsp.active()).toEqual([]);
  });

  it("smooth (linear) or stepped like Paula (no interpolation)", () => {
    const data = Float32Array.from([0, 1, 0, 1]);
    const smooth = new MixerDsp();
    smooth.setSample(0, { data, loopStart: 0, loopEnd: 0 });
    smooth.add([{ frame: 0, voice: 0, slot: 0, step: 0.5, vol: 1 }]);
    expect([...block(smooth, 4)]).toEqual([0, 0.5, 1, 0.5]);
    const paula = new MixerDsp();
    paula.setSample(0, { data, loopStart: 0, loopEnd: 0 });
    paula.add([{ frame: 0, voice: 0, slot: 0, step: 0.5, vol: 1, interp: 0 }]);
    expect([...block(paula, 4)]).toEqual([0, 0, 1, 1]);
  });

  it("loops between loopStart and loopEnd", () => {
    const dsp = new MixerDsp();
    dsp.setSample(0, { data: Float32Array.from([0.9, 0.1, 0.2]), loopStart: 1, loopEnd: 3 });
    dsp.add([{ frame: 0, voice: 0, slot: 0, step: 1, vol: 1, interp: 0 }]);
    expect([...block(dsp, 7)].map((x) => +x.toFixed(2))).toEqual([0.9, 0.1, 0.2, 0.1, 0.2, 0.1, 0.2]);
    expect(dsp.active()).toEqual([0]);
  });

  it("an event lands on its exact frame, inside a block and across blocks", () => {
    const dsp = new MixerDsp();
    dsp.setSample(0, { data: new Float32Array(1000).fill(0.5), loopStart: 0, loopEnd: 0 });
    dsp.add([{ frame: 5, voice: 0, slot: 0, step: 1, vol: 1 }, { frame: 130, voice: 0, vol: 0 }]);
    const a = block(dsp, 128, 0);
    expect(a[4]).toBe(0);
    expect(a[5]).toBe(0.5);
    const b = block(dsp, 128, 128);
    expect(b[1]).toBe(0.5);
    expect(b[2]).toBe(0);
  });

  it("voices add up; volume, pan and the gain apply", () => {
    const dsp = new MixerDsp();
    dsp.setSample(0, { data: new Float32Array(16).fill(1), loopStart: 0, loopEnd: 0 });
    dsp.add([
      { frame: 0, voice: 0, slot: 0, step: 1, vol: 0.5, pan: -1 },
      { frame: 0, voice: 1, slot: 0, step: 1, vol: 0.25, pan: 1 },
    ]);
    const l = new Float32Array(4);
    const r = new Float32Array(4);
    dsp.gain = 0.5;
    dsp.render(l, r, 0);
    expect(l[0]).toBeCloseTo(0.25);
    expect(r[0]).toBeCloseTo(0.125);
  });

  it("stopping voices silences them and forgets what was coming", () => {
    const dsp = new MixerDsp();
    dsp.setSample(0, { data: ramp(1000), loopStart: 0, loopEnd: 0 });
    dsp.add([{ frame: 0, voice: 3, slot: 0, step: 1, vol: 1 }, { frame: 200, voice: 3, slot: 0 }]);
    block(dsp, 128);
    dsp.stopVoices([3]);
    expect([...block(dsp, 128, 128)].every((x) => x === 0)).toBe(true);
    expect(dsp.queue.length).toBe(0);
  });

  it("changing a sample stops the voices on it; odd values are refused or kept in range", () => {
    const dsp = new MixerDsp();
    dsp.setSample(0, { data: new Float32Array(100).fill(1), loopStart: 0, loopEnd: 0 });
    dsp.add([{ frame: 0, voice: 0, slot: 0, step: Infinity, vol: 7 }, { frame: NaN, voice: 1, slot: 0 }, { frame: 0, voice: 9999, slot: 0 }]);
    expect(dsp.queue.length).toBe(1);
    block(dsp, 2);
    expect(dsp.voices[0].vol).toBe(1);
    expect(dsp.voices[0].step).toBe(1); // Infinity isn't a speed: unchanged
    dsp.setSample(0, { data: new Float32Array(10), loopStart: 0, loopEnd: 0 });
    expect(dsp.active()).toEqual([]);
  });

  it("the user silencing a module tells it (onStop); the module stopping itself doesn't; switched off, it's forgotten", () => {
    const m = new Mixer();
    let told = 0;
    const off = m.onStop("drums", () => told++);
    m.stop("drums");
    expect(told).toBe(0);
    m.stop("drums", true);
    expect(told).toBe(1);
    m.stop("other", true);
    expect(told).toBe(1);
    off();
    m.stop("drums", true);
    expect(told).toBe(1);
    m.onStop("drums", () => told++);
    m.release("drums");
    m.stop("drums", true);
    expect(told).toBe(1);
  });

  it("8- and 16-bit samples become floats", () => {
    expect([...toFloats(Int8Array.from([-128, 0, 64]))]).toEqual([-1, 0, 0.5]);
    expect([...toFloats(Int16Array.from([-32768, 16384]))]).toEqual([-1, 0.5]);
    expect([...toFloats(Uint8Array.from([0, 128, 192]))]).toEqual([-1, 0, 0.5]);
    expect([...toFloats(Float32Array.from([2, NaN, -0.25]))]).toEqual([1, 0, -0.25]);
  });
});

describe("a module's stream (StreamBuffer)", () => {
  it("keeps the order, wraps around, says what was real, pads with silence", () => {
    const b = new StreamBuffer(4);
    expect(b.push(Float32Array.from([0.1, 0.2, 0.3]), Float32Array.from([-1, -2, -3]))).toBe(3);
    const l = new Float32Array(2), r = new Float32Array(2);
    expect(b.pull(l, r)).toBe(2);
    expect([...l, ...r].map((x) => +x.toFixed(2))).toEqual([0.1, 0.2, -1, -2]);
    expect(b.push(Float32Array.from([0.4, 0.5, 0.6, 0.7]), Float32Array.from([0, 0, 0, 0]))).toBe(3); // one doesn't fit
    const l2 = new Float32Array(6), r2 = new Float32Array(6);
    expect(b.pull(l2, r2)).toBe(4);
    expect([...l2].map((x) => +x.toFixed(2))).toEqual([0.3, 0.4, 0.5, 0.6, 0, 0]);
  });
  it("checks every value", () => {
    const b = new StreamBuffer(8);
    b.push(Float32Array.from([NaN, 99, -99]), Float32Array.from([0, 0, 0]));
    const l = new Float32Array(3), r = new Float32Array(3);
    b.pull(l, r);
    expect([...l]).toEqual([0, 4, -4]);
  });
});

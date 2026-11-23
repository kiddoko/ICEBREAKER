import { describe, expect, it } from "vitest";
import { FrameLoop, paceDelay, restLevel } from "../src/core/loop";

const awake = { slow: false, background: false, idle: false, asleep: false };

describe("frame pacing (I1: an idle deck sleeps)", () => {
  it("input always asks for a frame now", () => {
    expect(paceDelay(0, { ...awake, asleep: true })).toBe(0);
  });
  it("awake: an animation keeps its own pace", () => {
    expect(paceDelay(50, awake)).toBe(50);
  });
  it("idle or in the background: 12 frames a second at most", () => {
    expect(paceDelay(50, { ...awake, idle: true })).toBeCloseTo(1000 / FrameLoop.BACKGROUND_FPS);
    expect(paceDelay(50, { ...awake, background: true })).toBeCloseTo(1000 / FrameLoop.BACKGROUND_FPS);
  });
  it("asleep: 2 frames a second at most, slower wishes untouched", () => {
    expect(paceDelay(50, { ...awake, idle: true, asleep: true })).toBe(1000 / FrameLoop.ASLEEP_FPS);
    expect(paceDelay(60_000, { ...awake, asleep: true })).toBe(60_000);
  });
  it("reduce motion: 30 frames a second at most", () => {
    expect(paceDelay(16, { ...awake, slow: true })).toBeCloseTo(1000 / 30);
  });
});

describe("rest level from the time since the last key or mouse move", () => {
  it("awake, then idle after 20 s, asleep after 60 s", () => {
    expect(restLevel(5_000)).toBe("awake");
    expect(restLevel(FrameLoop.IDLE_AFTER + 1)).toBe("idle");
    expect(restLevel(FrameLoop.ASLEEP_AFTER + 1)).toBe("asleep");
    expect(FrameLoop.IDLE_AFTER).toBe(20_000);
    expect(FrameLoop.ASLEEP_AFTER).toBe(60_000);
  });
});

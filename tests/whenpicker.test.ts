import { describe, expect, it } from "vitest";
import { WhenPicker, type WhenResult } from "../src/workspace/whenpicker";
import type { KeyInput } from "../src/core/input";

const enter: KeyInput = { key: "enter", code: "", ctrl: false, alt: false, shift: false, meta: false, combo: "enter" };

describe("WHEN?: a time typed after picking a day", () => {
  const pick = (typed: string) => {
    let out: WhenResult | null = null;
    const p = new WhenPicker("When?", { date: true, time: true }, "fr-FR", (r) => (out = r));
    (p as unknown as { setDate(d: Date): void }).setDate(new Date(2026, 10, 26)); // a click on the 26th
    p.onText(typed);
    p.onKey(enter);
    return out as WhenResult | null;
  };
  it("a bare number is the hour, on the day picked", () => {
    const r = pick("14");
    expect(r?.text).toBeUndefined();
    expect(r?.date?.getDate()).toBe(26);
    expect(r?.time).toBe(14 * 60);
  });
  it("14h, 14:30, 2pm: the same", () => {
    expect(pick("14h30")?.time).toBe(14 * 60 + 30);
    expect(pick("2pm")?.time).toBe(14 * 60);
    expect(pick("14h")?.date?.getDate()).toBe(26);
  });
  it("a day typed (with or without a time) is still read by the command", () => {
    expect(pick("demain 9h")?.text).toBe("demain 9h");
  });
});

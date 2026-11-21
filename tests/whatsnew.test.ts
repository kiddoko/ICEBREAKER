import { describe, expect, it } from "vitest";
import pkg from "../package.json";
import { strWidth } from "../src/core/unicode";
import { NOTES, notesFor } from "../src/whatsnew/notes";
import { compareVersions, isRelease, whatsNewAtStart } from "../src/whatsnew/seen";

describe("WHAT'S NEW opens once per version", () => {
  it("compares versions as numbers", () => {
    expect(compareVersions("0.5.10", "0.5.9")).toBe(1);
    expect(compareVersions("0.5.4", "0.5.4")).toBe(0);
    expect(compareVersions("0.5.4", "0.6.0")).toBe(-1);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.6.0-beta.1", "0.6.0")).toBe(0);
  });

  it("knows a minor version from a patch", () => {
    expect(isRelease("0.6.0")).toBe(true);
    expect(isRelease("1.0.0")).toBe(true);
    expect(isRelease("0.5.4")).toBe(false);
  });

  it("shows after an update, once", () => {
    expect(whatsNewAtStart("0.5.3", "0.5.4", true, true)).toEqual({ show: true, remember: true });
    // remembered: the next start shows nothing
    expect(whatsNewAtStart("0.5.4", "0.5.4", true, true)).toEqual({ show: false, remember: false });
  });

  it("an update from before the screen existed (nothing noted) shows it", () => {
    expect(whatsNewAtStart(undefined, "0.5.4", true, true)).toEqual({ show: true, remember: true });
  });

  it("a fresh install (setup not done) shows nothing but notes the version", () => {
    expect(whatsNewAtStart(undefined, "0.5.4", false, true)).toEqual({ show: false, remember: true });
    expect(whatsNewAtStart("0.5.3", "0.5.4", false, true)).toEqual({ show: false, remember: true });
  });

  it("going back to an older version, or a version without notes: nothing, noted", () => {
    expect(whatsNewAtStart("0.6.0", "0.5.4", true, true)).toEqual({ show: false, remember: true });
    expect(whatsNewAtStart("0.5.3", "0.5.5", true, false)).toEqual({ show: false, remember: true });
  });
});

describe("the notes", () => {
  it("have this version's, newest first, no version twice", () => {
    expect(notesFor(pkg.version)).toBeDefined();
    const versions = NOTES.map((n) => n.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort((a, b) => compareVersions(b, a))).toEqual(versions);
  });

  it("are short: both languages, 3 to 8 one-line items per group", () => {
    for (const n of NOTES) {
      for (const text of [n.en, n.fr]) {
        for (const group of [text.added, text.fixed]) {
          expect(group.length, `${n.version}`).toBeGreaterThanOrEqual(3);
          expect(group.length, `${n.version}`).toBeLessThanOrEqual(8);
          for (const line of group) {
            expect(strWidth(line.replaceAll("`", "")), `${n.version}: ${line}`).toBeLessThanOrEqual(78);
            expect(line.includes("\n")).toBe(false);
          }
        }
      }
      for (const h of [n.en.headline, n.fr.headline]) if (h) expect(strWidth(h)).toBeLessThanOrEqual(84);
      expect(n.fr.added.length).toBe(n.en.added.length);
      expect(n.fr.fixed.length).toBe(n.en.fixed.length);
      if (n.date) expect(n.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

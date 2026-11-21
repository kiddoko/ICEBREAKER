import { describe, expect, it } from "vitest";
import { Grid } from "../src/core/grid";
import { ThemeManager } from "../src/core/theme";
import { UI } from "../src/ui/ui";
import { LayoutProbe } from "../src/ui/probe";
import { drawSky, moonPhase, sceneFor, skyIcon, type SkyKind } from "../src/apps/weathersky";

const KINDS: SkyKind[] = ["sun", "partly", "cloud", "fog", "rain", "snow", "storm"];

describe("the sky", () => {
  it("knows the moon's phase", () => {
    expect(moonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14)))).toBeCloseTo(0, 3); // a known new moon
    expect(moonPhase(new Date(Date.UTC(2000, 0, 21, 4, 40)))).toBeCloseTo(0.5, 1); // the full moon after it
  });
  it("reads open-meteo's codes", () => {
    const o = { isDay: true, wind: 10, windDir: 270 };
    expect(sceneFor(0, o).kind).toBe("sun");
    expect(sceneFor(2, o).kind).toBe("partly");
    expect(sceneFor(45, o).kind).toBe("fog");
    expect(sceneFor(65, o)).toMatchObject({ kind: "rain", intensity: 1 });
    expect(sceneFor(61, o).intensity).toBeLessThan(0.5);
    expect(sceneFor(75, o).kind).toBe("snow");
    expect(sceneFor(95, o).kind).toBe("storm");
    expect(sceneFor(0, o).intensity).toBe(0);
  });
  it("draws every sky, day and night, at every size, inside its rect and never throws", () => {
    for (const kind of KINDS)
      for (const isDay of [true, false])
        for (const [w, h] of [[4, 3], [12, 5], [30, 10], [80, 20], [160, 40]]) {
          const ui = new UI();
          ui.begin(new Grid(w + 4, h + 4), new ThemeManager().current, 0, { x: -1, y: -1 });
          ui.probe = new LayoutProbe(w + 4, h + 4);
          const r = { x: 2, y: 2, w, h };
          for (const sec of [0, 1.7, 4.21, 33.3]) ui.clip(r, () => drawSky(ui, r, { kind, isDay, wind: 25, windDir: 90, intensity: 0.7, moon: 0.3 }, sec));
          // outside the rect, nothing drawn
          for (let y = 0; y < h + 4; y++)
            for (let x = 0; x < w + 4; x++) if (x < 2 || y < 2 || x >= w + 2 || y >= h + 2) expect(ui.grid.ch[y * (w + 4) + x]).toBe(32);
        }
  });
  it("a small picture for each day's card, 5 cells wide", () => {
    for (const kind of KINDS) for (const row of skyIcon(kind)) expect([...row].length).toBe(5);
  });
});

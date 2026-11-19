import { describe, expect, it } from "vitest";
import { focusWidget, newWidgetKey, setWidgetSetting, widgetConfig, widgetIdOf, widgetTarget } from "../src/widgets/instances";
import type { Deck } from "../src/deck";

function fakeDeck(home: string[], panel: string[]) {
  const data = { home: { widgets: home.map((k) => ({ id: widgetIdOf(k), ...(k.includes("#") ? { key: k } : {}), x: 0, y: 0, w: 1, h: 1 })), widgetConfig: {} as Record<string, Record<string, unknown>>, clockStyle: "dots" }, panel: { widgets: panel } };
  const deck = {
    settings: { data, set: (path: string, v: unknown) => { if (path === "home.widgetConfig") data.home.widgetConfig = v as never; else if (path === "home.clockStyle") data.home.clockStyle = v as string; } },
    requestFrame: () => {},
  };
  return deck as unknown as Deck & { settings: { data: typeof data } };
}

describe("the same widget, several times", () => {
  it("gives each copy its own key, across HOME and the side panel", () => {
    const d = fakeDeck(["clock"], ["clock#2"]);
    expect(newWidgetKey(d, "clock")).toBe("clock#3");
    expect(newWidgetKey(d, "weather")).toBe("weather");
    expect(widgetIdOf("clock#3")).toBe("clock");
  });
  it("keeps each copy's settings apart, the shared one as the default", () => {
    const d = fakeDeck(["clock", "clock#2"], []);
    focusWidget("clock#2");
    expect(widgetTarget("clock")).toBe("clock#2");
    expect(widgetTarget("weather")).toBeNull();
    setWidgetSetting(d, "clock", "style", "flip", "home.clockStyle");
    expect(widgetConfig(d, "clock#2", "style", d.settings.data.home.clockStyle)).toBe("flip");
    expect(widgetConfig(d, "clock", "style", d.settings.data.home.clockStyle)).toBe("dots");
    focusWidget(null);
    setWidgetSetting(d, "clock", "style", "big", "home.clockStyle");
    expect(d.settings.data.home.clockStyle).toBe("big");
  });
});

import { squareIn } from "../src/widgets/links";
describe("shortcut squares", () => {
  it("are square on screen (cells twice as tall as wide)", () => {
    const r = squareIn({ x: 0, y: 0, w: 9, h: 6 }, 0.5);
    expect(r.w * 0.5).toBeCloseTo(r.h, 5);
    expect(r).toEqual({ x: 0, y: 1, w: 8, h: 4 });
  });
});

import { pinFor } from "../src/widgets/links";
describe("pins and squares are one list", () => {
  it("knows what a square's command opens", () => {
    expect(pinFor("ideas", 'open "notes/ideas.md"')).toMatchObject({ kind: "note", target: "notes/ideas.md" });
    expect(pinFor("proj", 'explore "/projects"')).toMatchObject({ kind: "folder", target: "projects" });
    expect(pinFor("todo", "launch todo")).toMatchObject({ kind: "module", target: "todo" });
    expect(pinFor("cal", "cal open")).toMatchObject({ kind: "module", target: "cal" });
    expect(pinFor("deploy", 'macro run "deploy"')).toMatchObject({ kind: "macro" });
    expect(pinFor("nexus", "nexus")).toMatchObject({ kind: "page" });
    expect(pinFor("x", "echo hi")).toMatchObject({ kind: "command", target: "echo hi" });
  });
});

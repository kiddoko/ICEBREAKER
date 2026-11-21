import { describe, expect, it } from "vitest";
import { parseSource, sourceFromWords, sourceId, widgetSource, type NewsSource } from "../src/widgets/news";
import type { Deck } from "../src/deck";

/** just enough of a deck for a widget's settings */
const deckWith = (home: Record<string, unknown>) => ({ settings: { data: { home, user: { location: { precision: "city", name: "Paris" } } } } }) as unknown as Deck;

describe("news sources (one per widget)", () => {
  it("go to their id and back", () => {
    const all: NewsSource[] = [{ kind: "area" }, { kind: "country" }, { kind: "cats", cats: ["science", "ai"] }, { kind: "topic", words: "formula 1" }];
    for (const s of all) expect(parseSource(sourceId(s))).toEqual(s.kind === "cats" ? { kind: "cats", cats: [...s.cats].sort() } : s);
    expect(parseSource("cats:")).toBeNull();
    expect(parseSource("topic:  ")).toBeNull();
    expect(parseSource("nonsense")).toBeNull();
    expect(parseSource(3)).toBeNull();
  });

  it("come from what you type after `news show`", () => {
    const area: NewsSource = { kind: "area" };
    expect(sourceFromWords(["area"], area)).toEqual({ kind: "area" });
    expect(sourceFromWords(["pays"], area)).toEqual({ kind: "country" });
    expect(sourceFromWords(["science", "AI"], area)).toEqual({ kind: "cats", cats: ["science", "ai"] });
    expect(sourceFromWords(["+nature"], { kind: "cats", cats: ["science"] })).toEqual({ kind: "cats", cats: ["science", "nature"] });
    expect(sourceFromWords(["-science"], { kind: "cats", cats: ["science"] })).toEqual({ kind: "area" });
    expect(sourceFromWords(["formula", "1"], area)).toEqual({ kind: "topic", words: "formula 1" });
    expect(sourceFromWords([], area)).toBeNull();
  });

  it("an old widget is read the old way: its categories, else the old topic, else your area", () => {
    expect(widgetSource(deckWith({ widgetConfig: { "news#2": { cats: ["ai"] } } }), "news#2")).toEqual({ kind: "cats", cats: ["ai"] });
    expect(widgetSource(deckWith({ newsTopic: "linux", widgetConfig: {} }), "news#2")).toEqual({ kind: "topic", words: "linux" });
    expect(widgetSource(deckWith({ newsInterests: ["tech"] }), "news")).toEqual({ kind: "area" });
    // the page's own words never change a widget
    expect(widgetSource(deckWith({ newsPage: { words: "formula 1" }, widgetConfig: {} }), "news")).toEqual({ kind: "area" });
    // a saved source wins
    expect(widgetSource(deckWith({ newsTopic: "linux", widgetConfig: { news: { source: "country", cats: ["ai"] } } }), "news")).toEqual({ kind: "country" });
  });
});

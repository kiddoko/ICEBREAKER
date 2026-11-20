import { describe, expect, it } from "vitest";
import { journalArgs } from "../src/vault/journal";

const now = new Date(2026, 10, 21, 15, 0);
const day = (r: ReturnType<typeof journalArgs>) => (r.kind === "open" ? `${r.day.getFullYear()}-${r.day.getMonth() + 1}-${r.day.getDate()}` : r.kind);

describe("one journal command", () => {
  it("opens today's page with no words", () => {
    expect(day(journalArgs([], "", now))).toBe("2026-11-21");
  });
  it("adds a line for any text, without opening the page", () => {
    expect(journalArgs(["café avec Léa"], "", now)).toEqual({ kind: "log", text: "café avec Léa" });
    expect(journalArgs(["ran", "5", "km"], "", now)).toEqual({ kind: "log", text: "ran 5 km" });
    expect(journalArgs(["add", "yesterday"], "", now)).toEqual({ kind: "log", text: "yesterday" });
  });
  it("takes piped text as a line", () => {
    expect(journalArgs([], "Sat Nov 21\n", now)).toEqual({ kind: "log", text: "Sat Nov 21" });
    expect(journalArgs(["add"], "a\nb", now)).toEqual({ kind: "log", text: "a b" });
    expect(journalArgs(["add"], "", now).kind).toBe("error");
  });
  it("opens the day one word names", () => {
    expect(day(journalArgs(["yesterday"], "", now))).toBe("2026-11-20");
    expect(day(journalArgs(["hier"], "", now))).toBe("2026-11-20");
    expect(day(journalArgs(["-3"], "", now))).toBe("2026-11-18");
    expect(day(journalArgs(["2026-11-05"], "", now))).toBe("2026-11-5");
    expect(day(journalArgs(["today"], "", now))).toBe("2026-11-21");
  });
  it("lists the last entries", () => {
    expect(journalArgs(["ls", "-n", "7"], "", now)).toEqual({ kind: "ls", n: 7 });
    expect(journalArgs(["ls"], "", now)).toEqual({ kind: "ls", n: 15 });
  });
});

import { describe, expect, it } from "vitest";
import { parse, parseFlags } from "../src/shell/parser";
import { q } from "../src/ui/ui";

const words = (line: string) => parse(line, {})[0].commands[0].words.map((w) => w.value);

describe("the shell parser", () => {
  it("splits words and keeps quoted ones whole", () => {
    expect(words('bind "menu g" "open notes/a b.md"')).toEqual(["bind", "menu g", "open notes/a b.md"]);
  });
  it("reads a quoted title as one word, typographic quotes too", () => {
    expect(words('note "dlgtest"')).toEqual(["note", "dlgtest"]);
    expect(words("note “idées de cadeaux”")).toEqual(["note", "idées de cadeaux"]);
    expect(words("journal l’idée du jour")).toEqual(["journal", "l’idée", "du", "jour"]);
  });
  it("says an unclosed quote is an error, never silence", () => {
    expect(() => parse('note "dlgtest', {})).toThrow(/isn't closed/);
    expect(() => parse("note 'dlgtest", {})).toThrow(/isn't closed/);
  });
  it("chains with ; && ||", () => {
    const p = parse("a; b && c || d", {});
    expect(p.map((x) => x.next)).toEqual([";", "&&", "||", null]);
  });
  it("q() quotes only what needs it, and round-trips through the parser", () => {
    expect(q("notes/a.md")).toBe("notes/a.md");
    for (const s of ['a b', 'say "hi"', "cost $5", "back\\slash"]) expect(words(`x ${q(s)}`)[1]).toBe(s);
  });
  it("reads flags", () => {
    expect(parseFlags(["--json", "todo", "--every", "mon"], ["every"])).toEqual({ flags: { json: true, every: "mon" }, rest: ["todo"] });
  });
});

describe("a line's pieces are read when they run", () => {
  it("cuts at ; && || outside quotes, escapes, ${} and comments", async () => {
    const { segments } = await import("../src/shell/parser");
    expect(segments("export X=1; echo $X")).toEqual([{ text: "export X=1", next: ";" }, { text: "echo $X", next: null }]);
    expect(segments("a && b || c")).toEqual([{ text: "a", next: "&&" }, { text: "b", next: "||" }, { text: "c", next: null }]);
    const raw = String.raw`echo 'a;b' "c && d" e\;f | wc`;
    expect(segments(raw)).toEqual([{ text: raw, next: null }]);
    expect(segments("echo a # b; c")).toEqual([{ text: "echo a # b; c", next: null }]);
    expect(segments("a;; b;")).toEqual([{ text: "a", next: ";" }, { text: "b", next: null }]);
    expect(segments("echo #tag; b")).toEqual([{ text: "echo #tag", next: ";" }, { text: "b", next: null }]);
  });
});

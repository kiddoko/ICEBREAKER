import { afterEach, describe, expect, it } from "vitest";
import { addTranslations, setLang, tOutput } from "../src/core/i18n";

describe("command outputs in the deck's language (decision 10: all of them)", () => {
  afterEach(() => setLang("en"));
  addTranslations("fr", { "{n} events imported into the local calendar (calendar/ in the vault)": "{n} événements importés dans le calendrier local (calendar/ dans le vault)", "(was {v})": "(avant : {v})", "nothing coming up": "rien à venir" });
  it("English stays as it is", () => {
    expect(tOutput("nothing coming up\n")).toBe("nothing coming up\n");
  });
  it("a whole line, a line with values, between colour codes", () => {
    setLang("fr");
    expect(tOutput("nothing coming up\n")).toBe("rien à venir\n");
    expect(tOutput("\x1b[32m3 events imported into the local calendar (calendar/ in the vault)\x1b[0m\n")).toBe("\x1b[32m3 événements importés dans le calendrier local (calendar/ dans le vault)\x1b[0m\n");
    expect(tOutput("\x1b[32m✓\x1b[0m breakermed 0.12.1 \x1b[2m(was 0.10.1)\x1b[0m")).toBe("\x1b[32m✓\x1b[0m breakermed 0.12.1 \x1b[2m(avant : 0.10.1)\x1b[0m");
  });
  it("a single word (a name, a value) and usage lines are left alone", () => {
    setLang("fr");
    expect(tOutput("open\n")).toBe("open\n");
    expect(tOutput("usage: cal add <title> <when>\n")).toBe("usage: cal add <title> <when>\n");
  });
});

describe("a value never spans the pieces of a line", () => {
  afterEach(() => setLang("en"));
  it("each piece is translated on its own", () => {
    addTranslations("fr", { "from /{x}": "depuis /{x}", "{x} ago": "il y a {x}" });
    setLang("fr");
    expect(tOutput("from /notes/a.md · 1 h ago")).toBe("depuis /notes/a.md · il y a 1 h");
  });
});

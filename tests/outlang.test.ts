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

import { ago } from "../src/core/time";
describe("relative times in French", () => {
  afterEach(() => setLang("en"));
  it("a day is « j »", () => {
    const three = Date.now() - 3 * 86_400_000;
    expect(ago(three, true)).toBe("3 d");
    setLang("fr");
    expect(ago(three, true)).toBe("3 j");
    expect(ago(three)).toBe("3j");
  });
});

describe("the LOG in the deck's language, whatever language it was written in (0.7.2)", () => {
  afterEach(() => setLang("en"));
  it("a module switched off at the start: its reason in French", () => {
    setLang("fr");
    const line = "breakerMED: its code changed since you approved it — the copy in the vault isn't the one you approved (an update, a sync, a file put there by hand). Read it and switch it on again: plugin enable breakermed (or the STORE)";
    expect(tOutput(line)).toBe("breakerMED : son code a changé depuis que tu l'as approuvé — la copie du vault n'est pas celle que tu as approuvée (une mise à jour, une synchro, un fichier posé à la main). lis-le et rallume-le : plugin enable breakermed (ou le store)");
    expect(tOutput("clock: not approved on this deck yet: plugin enable clock")).toBe("clock : pas encore approuvé sur ce deck : plugin enable clock");
    expect(tOutput("clock: asks for more than you approved (network → api.x.com): plugin enable clock")).toBe("clock : il demande plus que ce que tu as approuvé (network → api.x.com) : plugin enable clock");
  });
});

describe("a module's output: its own French first (0.7.2: BreakerMED's « tracks » got the music player's « morceaux »)", () => {
  afterEach(() => setLang("en"));
  it("the module's table wins for its own commands, the deck's for the rest", async () => {
    const { addModuleTranslations } = await import("../src/core/i18n");
    addTranslations("fr", { "{n} tracks": "{n} morceaux" });
    addModuleTranslations("breakermed", "fr", { "{n} tracks": "{n} pistes" });
    setLang("fr");
    expect(tOutput("4 tracks", "breakermed")).toBe("4 pistes");
    expect(tOutput("4 tracks", "music")).toBe("4 morceaux");
    expect(tOutput("4 tracks")).toBe("4 morceaux");
  });
});

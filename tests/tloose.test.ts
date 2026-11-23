import { afterEach, describe, expect, it } from "vitest";
import { setLang, tLoose } from "../src/core/i18n";

describe("tips and status lines written without t()", () => {
  afterEach(() => setLang("en"));
  it("are translated whole, by line or by part — and left as they are otherwise", () => {
    setLang("fr");
    expect(tLoose("rename · F2")).toBe("renommer · F2");
    // a part it doesn't know (a path, a command) keeps its case
    expect(tLoose("search the vault · /\nopen Notes/Ideas.md")).toBe("chercher dans le vault · /\nopen Notes/Ideas.md");
    expect(tLoose("back to the root · Notes/Ideas.md")).toBe("retour à la racine · Notes/Ideas.md");
    setLang("en");
    expect(tLoose("rename · F2")).toBe("rename · F2");
  });
});

import { dateLocale, setDateLocale } from "../src/core/i18n";
describe("the deck's date format", () => {
  afterEach(() => (setLang("en"), setDateLocale("")));
  it("is the setting when there is one", () => {
    setDateLocale("en-US");
    setLang("fr");
    expect(dateLocale()).toBe("en-US");
  });
  it("empty: never another language than the deck's", () => {
    setDateLocale("");
    setLang("fr");
    expect(dateLocale().startsWith("fr")).toBe(true);
  });
});

import { uiCase } from "../src/core/i18n";
describe("the interface's lowercase, in French too", () => {
  it("a capital word with an apostrophe, a one-letter word among capitals", () => {
    expect(uiCase("VUE D'ENSEMBLE")).toBe("vue d'ensemble");
    expect(uiCase("MISES À JOUR")).toBe("mises à jour");
  });
  it("…but a lone capital in a sentence, acronyms and keys stay", () => {
    expect(uiCase("What I give it")).toBe("what I give it");
    expect(uiCase("Claude API key · ⌘K")).toBe("Claude API key · ⌘K");
  });
});

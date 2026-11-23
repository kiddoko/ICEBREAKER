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

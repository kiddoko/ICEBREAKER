import { describe, expect, it } from "vitest";
import { afterEach } from "vitest";
import { FOR_DEVELOPERS, START_HERE, startHereNotes, syncStartHere, forThisOS, writeWelcome } from "../src/vault/starthere";
import { WELCOME_NOTE_FR } from "../src/platform/demo-vault";
import { appendLog, entryText } from "../src/vault/journal";
import { keyName, setLang } from "../src/core/i18n";
import type { Vault } from "../src/vault/vault";

/** a vault in memory: just what the docs need */
function memVault(files: Record<string, string> = {}) {
  const f = { ...files };
  const v = {
    files: f,
    exists: async (p: string) => p in f,
    read: async (p: string) => f[p] ?? "",
    write: async (p: string, t: string) => void (f[p] = t),
    mkdir: async () => {},
    rename: async (a: string, b: string) => void ((f[b] = f[a]), delete f[a]),
  };
  return v as unknown as Vault & { files: Record<string, string> };
}
const readme = "START HERE/README.md";

describe("the docs in the vault", () => {
  it("are written into a new vault", async () => {
    const v = memVault();
    const r = await syncStartHere(v);
    expect(r.written).toBe(Object.keys(START_HERE).length);
    expect(v.files[readme]).toBe(forThisOS(START_HERE["README.md"]));
  });
  it("are updated when untouched, kept when you edited them, not brought back when deleted", async () => {
    const v = memVault();
    await syncStartHere(v);
    // the deck's text changed in a new version: simulate with an old copy on disk + its stamp
    v.files[readme] = "old version";
    const stamps = JSON.parse(v.files[".icebreaker/starthere.json"]);
    let h = 2166136261;
    for (let i = 0; i < "old version".length; i++) h = Math.imul(h ^ "old version".charCodeAt(i), 16777619);
    stamps[readme] = (h >>> 0).toString(36);
    v.files[".icebreaker/starthere.json"] = JSON.stringify(stamps);
    expect((await syncStartHere(v)).written).toBe(1);
    expect(v.files[readme]).toBe(forThisOS(START_HERE["README.md"]));
    // you edit it: it stays yours
    v.files[readme] += "\nmy own line";
    const r = await syncStartHere(v);
    expect(r.yours).toContain(readme);
    expect(v.files[readme]).toContain("my own line");
    // you delete one: it stays deleted
    delete v.files["START HERE/ai.md"];
    await syncStartHere(v);
    expect("START HERE/ai.md" in v.files).toBe(false);
  });
});

describe("a French account's first minutes (bench 0.8.0)", () => {
  afterEach(() => setLang("en"));
  const fr = startHereNotes("fr");

  it("gets START HERE in French, with the same notes as in English", async () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(START_HERE).sort());
    const v = memVault();
    await syncStartHere(v, { language: "fr", os: "mac" });
    expect(v.files[readme]).toBe(forThisOS(fr["README.md"], "mac"));
    expect(v.files[readme]).toContain("Bienvenue, netrunner");
    expect(v.files["START HERE/ui.md"]).toContain("# L'interface");
  });

  it("the French notes name the same commands as the English ones", () => {
    const cmds = (s: string) => new Set([...s.matchAll(/`([a-z][\w-]*) /g)].map((m) => m[1]));
    for (const name of Object.keys(START_HERE)) {
      const missing = [...cmds(START_HERE[name])].filter((c) => !cmds(fr[name]).has(c));
      expect(missing, name).toEqual([]);
    }
  });

  it("a language switch: untouched notes follow, edited ones stay, the Welcome note too", async () => {
    const v = memVault();
    await writeWelcome(v, "en");
    await syncStartHere(v, { language: "en", os: "mac" });
    v.files["START HERE/keys.md"] += "\nmine";
    const r = await syncStartHere(v, { language: "fr", os: "mac" });
    expect(v.files[readme]).toContain("Bienvenue, netrunner");
    expect(v.files["START HERE/keys.md"]).toContain("mine");
    expect(r.yours).toEqual(["START HERE/keys.md"]);
    expect("Welcome.md" in v.files).toBe(false);
    expect(v.files["Bienvenue.md"]).toBe(forThisOS(WELCOME_NOTE_FR, "mac"));
    // `starthere --force`: all of them, in the deck's language
    await syncStartHere(v, { language: "fr", os: "mac", force: true });
    expect(v.files["START HERE/keys.md"]).toBe(forThisOS(fr["keys.md"], "mac"));
  });

  it("an edited Welcome note keeps its name and its text", async () => {
    const v = memVault();
    await writeWelcome(v, "en");
    v.files["Welcome.md"] += "\nmy line";
    await syncStartHere(v, { language: "fr", os: "mac" });
    expect(v.files["Welcome.md"]).toContain("my line");
    expect("Bienvenue.md" in v.files).toBe(false);
  });

  it("the Welcome note links only to what a new vault has, and names the AZERTY key", async () => {
    for (const [lg, name] of [["en", "Welcome.md"], ["fr", "Bienvenue.md"]]) {
      const v = memVault();
      await writeWelcome(v, lg);
      expect(v.files[name], lg).not.toContain("[[notes/ideas]]");
      expect(v.files[name], lg).toContain("[[START HERE/README]]");
      expect(v.files[name], lg).toContain("²");
    }
  });

  it("FOR DEVELOPERS/ only with `starthere dev`, then kept up to date", async () => {
    const v = memVault();
    await syncStartHere(v, { os: "mac" });
    expect(Object.keys(v.files).some((p) => p.startsWith("FOR DEVELOPERS/"))).toBe(false);
    await syncStartHere(v, { os: "mac", dev: true });
    expect(v.files["FOR DEVELOPERS/README.md"]).toBe(FOR_DEVELOPERS["README.md"]);
    v.files["FOR DEVELOPERS/themes.md"] = "old";
    const stamps = JSON.parse(v.files[".icebreaker/starthere.json"]);
    let h = 2166136261;
    for (let i = 0; i < 3; i++) h = Math.imul(h ^ "old".charCodeAt(i), 16777619);
    stamps["FOR DEVELOPERS/themes.md"] = (h >>> 0).toString(36);
    v.files[".icebreaker/starthere.json"] = JSON.stringify(stamps);
    await syncStartHere(v, { os: "mac" });
    expect(v.files["FOR DEVELOPERS/themes.md"]).toBe(FOR_DEVELOPERS["themes.md"]);
  });

  it("a new day's page in French, and `journal \"…\"` writes under « ## fil du jour »", async () => {
    setLang("fr");
    const v = memVault();
    (v as unknown as { journalPath: (d: Date) => string }).journalPath = () => "journal/2026-11-24.md";
    const day = new Date(2026, 10, 24);
    const text = await entryText(v, day, "fr-FR");
    expect(text).toContain("humeur:");
    expect(text).toContain("## fil du jour");
    expect(text).toContain("## pensées");
    expect(text).not.toMatch(/## log|## thoughts|mood:/);
    await appendLog(v, day, "première ligne", "fr-FR");
    const page = v.files["journal/2026-11-24.md"];
    expect(page.indexOf("première ligne")).toBeGreaterThan(page.indexOf("## fil du jour"));
    expect(page.indexOf("première ligne")).toBeLessThan(page.indexOf("## pensées"));
  });

  it("the space key is « espace » in a French menu", () => {
    setLang("fr");
    expect(keyName("space")).toBe("espace");
    expect(keyName("⌘K")).toBe("⌘K");
    setLang("en");
    expect(keyName("space")).toBe("space");
  });
});

describe("START HERE on Windows and Linux", () => {
  for (const lg of ["en", "fr"]) {
    it(`${lg}: no shortcut said twice, the Mac's own keys kept, the system's shell`, () => {
      for (const [name, body] of Object.entries(startHereNotes(lg))) {
        const win = forThisOS(body, "windows");
        expect(win, name).not.toMatch(/(?<![\w+])((?:Ctrl|Alt|Shift)\+\S+?) \/ \1(?![\w+])/);
        expect(win, name).not.toMatch(/(?<![\w+])((?:Ctrl|Alt|Shift)\+[^\s()]+) \(\1\)/);
      }
      const readmeWin = forThisOS(startHereNotes(lg)["README.md"], "windows");
      expect(readmeWin).toContain("**Ctrl+N**");
      expect(readmeWin).toContain("shell: powershell");
      expect(readmeWin).not.toContain("zsh");
      expect(forThisOS(startHereNotes(lg)["README.md"], "linux")).toContain("shell: bash");
      expect(forThisOS(startHereNotes(lg)["shell.md"], "windows")).toContain("**⌘X**");
    });
    it(`${lg}: the diagram keeps its width on every system`, () => {
      for (const os of ["mac", "windows", "linux"] as const) {
        const box = forThisOS(startHereNotes(lg)["README.md"], os).split("```")[3].trim().split("\n");
        expect(new Set(box.map((l) => [...l].length)).size, os).toBe(1);
      }
    });
  }
});

import { startHereCommand } from "../src/vault/starthere";
import { helpText } from "../src/shell/help";
import { ActionRegistry } from "../src/apps/registry";
import { registerFxActions } from "../src/deck-actions";
import { terminalKeysHint } from "../src/shell/systerm";
import { t } from "../src/core/i18n";
import type { Deck } from "../src/deck";

describe("the bench's second look at #35", () => {
  afterEach(() => setLang("en"));

  it("THE MENU's effects follow a language switch without a restart", () => {
    const deck = { actions: new ActionRegistry() } as unknown as Deck;
    registerFxActions(deck);
    expect(deck.actions.get("fx.light")!.title).toContain("a hint of glow");
    setLang("fr");
    registerFxActions(deck); // what deck.followLanguage does
    expect(deck.actions.get("fx.light")!.title).toContain("un soupçon de lueur");
  });

  it("README's diagram shows the corner as drawn at the start size, and names the wide one", () => {
    for (const lg of ["en", "fr"]) {
      const md = startHereNotes(lg)["README.md"];
      expect(md).toContain("┌ ◆ ▾  vault");
      expect(md).toContain("**◆ icebreaker ▾**");
    }
  });

  it("`starthere dev` twice: the right folder, its capitals, in French", async () => {
    setLang("fr");
    const v = Object.assign(memVault(), { rescan: async () => {} });
    const out: string[] = [];
    const ctx = { args: ["dev"], out: (s: string) => void out.push(s), deck: { vault: v, openFile: async () => {} } };
    await startHereCommand.run(ctx as never);
    await startHereCommand.run(ctx as never);
    expect(out[1]).toContain("FOR DEVELOPERS est déjà là (starthere dev --force le réécrit)");
  });

  it("`starthere -h` in French: the headings and what each line does", () => {
    setLang("fr");
    const page = helpText(startHereCommand, false);
    expect(page).toContain("UTILISATION");
    expect(page).toContain("starthere dev      écrire aussi FOR DEVELOPERS/");
    expect(page).toContain("EXEMPLES");
    expect(page).not.toContain("bring the docs up to date");
  });

  it("a MODULES card's status fits (« mod·base · oui »), one word per action", () => {
    setLang("fr");
    expect(`${t("MOD·CORE")} · ${t("on")}`).toBe("mod·base · oui");
    expect(t("uninstall  del")).toContain("désinstaller");
    expect(t("Uninstall…")).toMatch(/^désinstaller/);
    expect(t("←↑↓→ choose · enter launch · space switch on/off · del uninstall · type to search")).toContain("suppr désinstaller");
    expect(t("Turn off")).toBe("désactiver");
    expect(t("CHOOSE")).toBe("choisir");
  });

  it("the real terminal's key hint in French", () => {
    setLang("fr");
    expect(terminalKeysHint()).toMatch(/copie|copier/);
  });
});

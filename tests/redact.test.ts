import { describe, expect, it } from "vitest";
import { guardConsole, looksSecret, MASK, redact, redactAny } from "../src/core/redact";
import { EventLog } from "../src/core/eventlog";
import { ErrorLog } from "../src/core/errors";
import { keepInHistory } from "../src/shell/shell";

// a recovery key of the kind `vault encrypt` shows (BIP39 words)
const WORDS = "abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual";
const PASSWORD = "correct-horse-battery-staple-42";

/** everything a log keeps, as one text */
const dump = (l: EventLog) => l.list.map((e) => `${e.text}\n${e.detail ?? ""}`).join("\n");

describe("secrets never reach the logs", () => {
  it("masks keys and tokens by their shape", () => {
    for (const s of ["sk-ant-api03-abcdefghijklmnop", "ghp_abcdefghijklmnop1234", "xoxb-1234567890-abcdef", "AKIAABCDEFGHIJKLMNOP", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig", "ya29.a0AfH6SMBxyz1234567"]) {
      expect(redact(`config set ai.key ${s}`)).not.toContain(s);
    }
    expect(redact("Authorization: Bearer abc.def.ghi-jkl")).toBe(`Authorization: Bearer ${MASK}`);
  });

  it("masks a named password, token or key", () => {
    for (const line of [`login password=${PASSWORD}`, `token: ${PASSWORD}`, `{"api_key": "${PASSWORD}"}`, `run --password ${PASSWORD}`, `x --token=${PASSWORD}`]) {
      const r = redact(line);
      expect(r).not.toContain(PASSWORD);
      expect(r).toContain(MASK);
    }
  });

  it("masks the 24 recovery words, and a good part of them", () => {
    expect(redact(WORDS)).toBe(MASK);
    expect(redact(`vault unlock ${WORDS}`)).not.toContain("abandon");
    const half = WORDS.split(" ").slice(0, 12).join(" ");
    expect(redact(half)).not.toContain("abandon");
  });

  it("leaves ordinary lines alone", () => {
    for (const s of ["open Journal/2026-11-24.md", "vault encrypt --window", "say hello to the world", "The vault is encrypted: 12 files, 3 folders", "config set theme.name neon", "a note about a password manager"]) {
      expect(redact(s)).toBe(s);
      expect(looksSecret(s)).toBe(false);
    }
  });

  it("the LOG tab never keeps a password or the recovery words", () => {
    const log = new EventLog();
    log.add("cmd", WORDS);
    log.add("cmd", `account login password=${PASSWORD}`);
    log.add("error", "unlock failed", { detail: `with ${WORDS}` });
    const e = log.add("action", "vault status");
    log.append(e, `token=${PASSWORD}\n`);
    log.add("debug", `--password ${PASSWORD}`, { source: "some-module" });
    const all = dump(log);
    expect(all).not.toContain(PASSWORD);
    expect(all).not.toContain("abandon ability");
  });

  it("a long output: a key cut in two pieces is still masked, and it stays fast", () => {
    const log = new EventLog();
    const e = log.add("action", "cat big.md");
    const line = "- [ ] some todo item with Text, 42 and words here\n";
    for (let i = 0; i < 200; i++) log.append(e, line.repeat(20));
    log.append(e, `api_key=${PASSWORD.slice(0, 5)}`);
    log.append(e, `${PASSWORD.slice(5)} done\n`);
    expect(e.detail).not.toContain(PASSWORD.slice(5));
    expect(e.detail!.startsWith(line)).toBe(true);
    const t0 = performance.now();
    for (let i = 0; i < 3000; i++) log.append(e, line.repeat(20));
    // masked again from its first line each time, this took seconds (and grew with the output)
    expect(performance.now() - t0).toBeLessThan(1500);
  });

  it("nor does the error log", () => {
    const errs = new ErrorLog();
    errs.add(`vault unlock: wrong recovery key ${WORDS}`);
    errs.add(`fetch failed with api_key=${PASSWORD}`);
    const all = errs.list.map((e) => e.detail).join("\n");
    expect(all).not.toContain(PASSWORD);
    expect(all).not.toContain("abandon ability");
  });

  it("errors printed to the console are masked too", () => {
    expect(redactAny(new Error(`bad password=${PASSWORD}`))).not.toContain(PASSWORD);
    expect(redactAny({ words: WORDS })).not.toContain("abandon ability");
  });

  it("the guarded console masks what it's given", () => {
    const seen: unknown[] = [];
    const c = { log: (...a: unknown[]) => seen.push(...a), info: () => {}, warn: (...a: unknown[]) => seen.push(...a), error: (...a: unknown[]) => seen.push(...a), debug: () => {} };
    guardConsole(c);
    c.error("[plugin x]", new Error(`password=${PASSWORD}`));
    c.warn(WORDS, 42);
    expect(seen.map(String).join(" ")).not.toContain(PASSWORD);
    expect(seen.map(String).join(" ")).not.toContain("abandon ability");
    expect(seen).toContain(42);
  });

  it("the shell's history keeps out the same lines", () => {
    expect(keepInHistory(WORDS)).toBe(false);
    expect(keepInHistory(`x --password ${PASSWORD}`)).toBe(false);
    expect(keepInHistory("open notes.md")).toBe(true);
  });
});

describe("the plain backup vault encrypt leaves (shell/commands/deck.ts)", () => {
  it("is said clearly: still on the disk, readable, copies elsewhere, best-effort wipe", async () => {
    const { plainBackupWarning } = await import("../src/shell/commands/deck");
    const all = plainBackupWarning("/Users/me/Notes-backup-2026-11-24-0130.zip", undefined, "mac").join("\n");
    expect(all).toContain("/Users/me/Notes-backup-2026-11-24-0130.zip");
    expect(all).toMatch(/still on the disk/);
    expect(all).toMatch(/unencrypted/);
    for (const where of ["Time Machine", "iCloud", "Trash"]) expect(all).toContain(where);
    expect(all).toMatch(/overwrites it, then removes it/);
  });
});

describe("a masked field (a password) keeps no copies", async () => {
  const { TextEditor } = await import("../src/ui/editor");
  it("no undo history of what was typed", () => {
    const e = new TextEditor("", { singleLine: true, mask: true });
    for (const ch of PASSWORD) e.onText(ch);
    e.undo();
    expect(e.text).toBe(PASSWORD);
    expect((e as unknown as { undoStack: unknown[] }).undoStack.length).toBe(0);
    // an ordinary field still has it
    const plain = new TextEditor("", { singleLine: true });
    plain.onText("abc");
    plain.undo();
    expect(plain.text).toBe("");
  });
});

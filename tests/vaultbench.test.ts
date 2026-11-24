import { describe, expect, it } from "vitest";
import { deckCommands, plainBackupWarning, backupCopiesNote, showRecovery } from "../src/shell/commands/deck";
import { tokenize } from "../src/shell/parser";
import { recoveryWordAt, wordLines } from "../src/workspace/lock";
import { recoveredMessage } from "../src/vault/recovered";
import type { Deck } from "../src/deck";

/** The Windows bench's Fable pass on 0.8.0 (24/11): the vault and account findings. */

const WORDS = "abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual";

/** a shell context whose questions get `answer(label)`; what was printed is kept */
function shellCtx(answer: (label: string) => string | null, crypt: Record<string, unknown>) {
  const out: string[] = [];
  let reads = 0;
  const deck = {
    account: "test2",
    platform: { vault: { crypt }, account: { check: async () => true } },
    vault: { rescan: async () => {}, markdown: () => [] },
  } as unknown as Deck;
  const ctx = {
    deck,
    isTTY: true,
    env: {},
    out: (s: string) => void out.push(s),
    err: (s: string) => void out.push(s),
    shell: { clear: () => {} },
    read: async (label: string) => {
      // a loop asking again for ever would hang the test: stop it
      if (++reads > 50) throw new Error("asked more than 50 times: a loop");
      return answer(label);
    },
  };
  return { ctx, out, reads: () => reads };
}

async function vault(ctx: unknown, args: string[]) {
  const cmd = deckCommands.find((c) => c.name === "vault")!;
  return cmd.run({ ...(ctx as object), args } as never);
}

describe("vault recovery: esc at « type word N » (it froze the deck, and the unconfirmed key was already written)", () => {
  it("esc stops at once: one question, no loop", async () => {
    // esc / ctrl+C: every read of an interrupted command answers null at once
    const { ctx, reads } = shellCtx(() => null, {});
    expect(await showRecovery(ctx as never, WORDS)).toBe(false);
    expect(reads()).toBe(1);
  });

  it("the new key is written only once a word is typed back; esc keeps the old one", async () => {
    const calls: string[] = [];
    const crypt = {
      status: async () => ({ encrypted: true, unlocked: true, recovery: true, leftovers: 0, busy: false, notes: [] }),
      newRecovery: async () => (calls.push("new"), WORDS),
      confirmRecovery: async () => void calls.push("confirm"),
      dropRecovery: async () => void calls.push("drop"),
    };
    // esc at the word
    let s = shellCtx((l) => (/\[y\/N\]/.test(l) ? "y" : /password/.test(l) ? "pw" : null), crypt);
    expect(await vault(s.ctx, ["recovery"])).toBe(130);
    expect(calls).toEqual(["new", "drop"]);
    expect(s.out.join("")).toContain("your old one still works");
    // every word right: written
    calls.length = 0;
    const list = WORDS.split(" ");
    s = shellCtx((l) => (/\[y\/N\]/.test(l) ? "y" : /password/.test(l) ? "pw" : list[Number(l.match(/word (\d+)/)![1]) - 1]), crypt);
    expect(await vault(s.ctx, ["recovery"])).toBe(0);
    expect(calls).toEqual(["new", "confirm"]);
  });

  it("vault encrypt: esc at the word leaves no recovery key, and says so", async () => {
    const calls: string[] = [];
    const crypt = {
      status: async () => ({ encrypted: false, unlocked: false, recovery: false, leftovers: 0, busy: false, notes: [] }),
      encrypt: async () => ({ files: 3, folders: 1, bytes: 10, left: [], recovery: WORDS }),
      confirmRecovery: async () => void calls.push("confirm"),
      dropRecovery: async () => void calls.push("drop"),
      backups: async () => [],
    };
    const s = shellCtx((l) => (/\[y\/N\]/.test(l) ? "y" : /password/.test(l) ? "pw" : null), crypt);
    expect(await vault(s.ctx, ["encrypt"])).toBe(0);
    expect(calls).toEqual(["drop"]);
    expect(s.out.join("")).toContain("no recovery key yet");
  });
});

describe("vault mount C:\\Users\\… (the \\ were eaten: « C:U »)", () => {
  const words = (line: string) => tokenize(line, {}).flatMap((t) => (t.kind === "word" ? [t.word.value] : []));
  it("a Windows path keeps its \\", () => {
    expect(words("vault mount C:\\Users\\me\\Notes")).toEqual(["vault", "mount", "C:\\Users\\me\\Notes"]);
    expect(words('vault mount "C:\\Users\\me\\My Notes"')).toEqual(["vault", "mount", "C:\\Users\\me\\My Notes"]);
    expect(words("cd D:\\")).toEqual(["cd", "D:\\"]);
  });
  it("elsewhere \\ still escapes, as in sh", () => {
    expect(words("echo a\\ b")).toEqual(["echo", "a b"]);
    expect(words("echo \\$HOME")).toEqual(["echo", "$HOME"]);
  });
});

describe("forgot password: a typo kept what was typed and pointed nowhere", () => {
  it("the wrong word's number comes from the native message", () => {
    expect(recoveryWordAt('word 7 ("abndon") isn\'t in the list')).toBe(7);
    expect(recoveryWordAt("the words don't check out: …")).toBe(0);
  });
  it("all 24 words show, numbered, in a few lines; the wrong one marked", () => {
    const lines = wordLines(WORDS, 62, 7);
    expect(lines.length).toBeLessThanOrEqual(4);
    const flat = lines.flat();
    expect(flat.filter((p) => p.num).length).toBe(24);
    expect(flat.find((p) => p.bad)?.text.trim()).toBe("absorb");
    for (const l of lines) expect(l.map((p) => p.text).join("").trimEnd().length).toBeLessThanOrEqual(62);
  });
});

describe("the plain backup's warning names this computer's tools", () => {
  it("Windows: File History, the Recycle Bin, BitLocker — not Time Machine or FileVault", () => {
    const w = plainBackupWarning("C:\\x.zip", undefined, "windows").join(" ") + backupCopiesNote("windows");
    expect(w).toMatch(/File History/);
    expect(w).toMatch(/BitLocker/);
    expect(w).not.toMatch(/Time Machine|FileVault/);
  });
  it("the Mac keeps Time Machine and FileVault, Linux names neither", () => {
    expect(plainBackupWarning("/x.zip", undefined, "mac").join(" ")).toMatch(/Time Machine.*FileVault/);
    expect(plainBackupWarning("/x.zip", undefined, "linux").join(" ") + backupCopiesNote("linux")).not.toMatch(/Time Machine|FileVault|BitLocker/);
  });
});

describe("files found and put back in .trash/recovered-… are said once", () => {
  it("once, with the folder", () => {
    const told = new Set<string>();
    const notes = ["recovered .trash/recovered-1700/notes/a.md", "the index was missing: rebuilt from the files"];
    expect(recoveredMessage(notes, told)).toContain(".trash/recovered-1700/");
    expect(recoveredMessage(notes, told)).toBeNull();
    expect(recoveredMessage([...notes, "recovered .trash/recovered-1700/b.md", "recovered .trash/recovered-1700/c.md"], told)).toMatch(/^2 files/);
  });
});

// ── the bench's second look at #34 ────────────────────────────────────────

import { ShellExecutor } from "../src/shell/exec";
import { fakeDeck } from "./dataloss-helpers";
import { keptOutNote, waitNote } from "../src/shell/commands/deck";
import { setWait, waitLeft } from "../src/workspace/lock";
import { uiCase } from "../src/core/i18n";

describe("esc at « type word N »: what must still be said reaches the shell (V1/V3)", () => {
  it("the command's last words print after it's stopped, the screen cleared first", async () => {
    const f = fakeDeck();
    const cmds: Record<string, unknown> = {
      ask: {
        name: "ask",
        summary: "",
        interactive: true,
        async run(ctx: { onStop?: (t: string | null, o?: { clear?: boolean }) => void; read: (l: string) => Promise<string | null>; err: (t: string) => void }) {
          ctx.onStop?.("stopped · no new recovery key: your old one still works", { clear: true });
          await ctx.read("written down? type word 3");
          ctx.err("never shown\n");
        },
      },
    };
    const deck = { ...f.deck, settings: { data: { ...f.deck.settings.data, user: { handle: "me" }, shell: { bridge: "more" } } }, commands: { get: (n: string) => cmds[n], names: () => Object.keys(cmds), all: () => Object.values(cmds) }, plugins: { list: () => [] } };
    const out: string[] = [];
    let cleared = 0;
    const ex = new ShellExecutor(deck as unknown as Deck, (t) => void out.push(t), () => void (cleared = out.length + 1));
    // a question waits until esc (the abort)
    ex.readLine = (_l, _o, signal) => new Promise((res) => signal.addEventListener("abort", () => res(null)));
    const running = ex.run("ask");
    await new Promise((r) => setTimeout(r, 0));
    ex.interrupt();
    expect(await running).toBe(130);
    const text = out.join("");
    expect(text).toContain("your old one still works");
    expect(text).not.toContain("never shown");
    expect(cleared).toBe(1); // cleared before anything was printed
  });

  it("vault rekey hands the shell its result and that there's no new key yet", async () => {
    const said: string[] = [];
    const crypt = {
      status: async () => ({ encrypted: true, unlocked: true, recovery: true, leftovers: 0, busy: false, notes: [] }),
      rekey: async () => ({ files: 4, folders: 1, bytes: 10, left: [], recovery: WORDS }),
      confirmRecovery: async () => {},
      dropRecovery: async () => {},
    };
    const s = shellCtx((l) => (/\[y\/N\]/.test(l) ? "y" : /password/.test(l) ? "pw" : null), crypt);
    (s.ctx as Record<string, unknown>).onStop = (t: string | null) => void (t && said.push(t));
    await vault(s.ctx, ["rekey"]);
    expect(said.join("\n")).toContain("4 files encrypted again");
    expect(said.join("\n")).toContain("no new one yet (vault recovery)");
  });
});

describe("the wait after wrong passwords (V7)", () => {
  it("each name keeps its own countdown: a try on another name doesn't hide test2's", () => {
    const w = new Map<string, number>();
    setWait(w, "test2", 4000, 0);
    setWait(w, "nobody", 0, 100);
    expect(waitLeft(w, "test2", 1000)).toBe(3);
    expect(waitLeft(w, " Test2", 1000)).toBe(3);
    expect(waitLeft(w, "nobody", 1000)).toBe(0);
  });
  it("vault decrypt says the wait in the shell", async () => {
    const crypt = {
      status: async () => ({ encrypted: true, unlocked: true, recovery: true, leftovers: 0, busy: false, notes: [] }),
      decrypt: async () => ({ files: 1, folders: 0, bytes: 1, left: [] }),
    };
    const s = shellCtx((l) => (/\[y\/N\]/.test(l) ? "y" : "pw"), crypt);
    (s.ctx.deck.platform.account as Record<string, unknown>).wait = async () => 3400;
    await vault(s.ctx, ["decrypt"]);
    expect(s.out.join("")).toContain(waitNote(3400));
    expect(waitNote(3400)).toContain("wait 4 s");
  });
});

describe("vault export names what it really left out (V4)", () => {
  it("by name, as the native side lists them", () => {
    const n = keptOutNote(["account.json", "settings.json", "shell_history", "starthere.json", "stats.json"]);
    expect(n).toContain(".icebreaker/starthere.json");
    expect(n).toContain(".icebreaker/stats.json");
    expect(n).not.toContain("secrets");
  });
});

describe("proper names keep their capitals in a window", () => {
  it("File History, Recycle Bin, Dropbox, Icebreaker", () => {
    expect(uiCase("copies may also be in File History, OneDrive / Dropbox and the Recycle Bin")).toBe("copies may also be in File History, OneDrive / Dropbox and the Recycle Bin");
    expect(uiCase("Make a folder “Icebreaker” in it")).toBe("make a folder “Icebreaker” in it");
    expect(uiCase("Copies In Time Machine")).toBe("copies in Time Machine");
  });
});

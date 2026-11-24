import { describe, expect, it } from "vitest";
import { UndoHistory } from "../src/core/undo";
import type { Deck } from "../src/deck";
import { ShellExecutor } from "../src/shell/exec";
import { fakeDeck } from "./dataloss-helpers";

function shell() {
  const f = fakeDeck();
  const history = new UndoHistory();
  f.vault.history = history;
  const echo = { name: "echo", summary: "", run: (ctx: { args: string[]; out(s: string): void }) => ctx.out(`${ctx.args.join(" ")}\n`) };
  const deck = {
    ...f.deck,
    history,
    settings: { data: { ...f.deck.settings.data, user: { handle: "me" }, shell: { bridge: "more" } } },
    commands: { get: (n: string) => (n === "echo" ? echo : undefined), names: () => ["echo"], all: () => [echo] },
    plugins: { list: () => [] },
  };
  const out: string[] = [];
  const ex = new ShellExecutor(deck as unknown as Deck, (t) => void out.push(t), () => {});
  return { ex, history, ...f, out };
}

describe("> over an existing note", () => {
  it("⌘Z brings its text back", async () => {
    const { ex, vault, history, out } = shell();
    await vault.write("note.md", "my precious text");
    expect(await ex.run("echo x > note.md")).toBe(0);
    expect(out.join("")).toBe("");
    expect(await vault.read("note.md")).toBe("x\n");
    await history.undo();
    expect(await vault.read("note.md")).toBe("my precious text");
    await history.redo();
    expect(await vault.read("note.md")).toBe("x\n");
  });

  it(">> too; and a new file made by > goes to the trash on ⌘Z", async () => {
    const { ex, vault, history } = shell();
    await vault.write("log.md", "a");
    await ex.run("echo b >> log.md");
    await history.undo();
    expect(await vault.read("log.md")).toBe("a");
    await ex.run("echo new > fresh.md");
    await history.undo();
    expect(await vault.exists("fresh.md")).toBe(false);
  });
});

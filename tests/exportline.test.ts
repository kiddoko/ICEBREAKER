import { describe, expect, it } from "vitest";
import type { Deck } from "../src/deck";
import { ShellExecutor } from "../src/shell/exec";
import { fakeDeck } from "./dataloss-helpers";

function shell() {
  const f = fakeDeck();
  const cmds: Record<string, { name: string; summary: string; run(ctx: { args: string[]; env: Record<string, string>; out(s: string): void }): number | void }> = {
    echo: { name: "echo", summary: "", run: (ctx) => ctx.out(`${ctx.args.join(" ")}\n`) },
    export: { name: "export", summary: "", run: (ctx) => void ctx.args.forEach((a) => (ctx.env[a.split("=")[0]] = a.split("=").slice(1).join("="))) },
    false: { name: "false", summary: "", run: () => 1 },
  };
  const deck = {
    ...f.deck,
    settings: { data: { ...f.deck.settings.data, user: { handle: "me" }, shell: { bridge: "more" } } },
    commands: { get: (n: string) => cmds[n], names: () => Object.keys(cmds), all: () => Object.values(cmds) },
    plugins: { list: () => [] },
  };
  const out: string[] = [];
  return { ex: new ShellExecutor(deck as unknown as Deck, (t) => void out.push(t), () => {}), out };
}

describe("variables set earlier on the same line", () => {
  it("export X=1; echo $X prints 1", async () => {
    const { ex, out } = shell();
    await ex.run("export BX=42; echo $BX");
    expect(out.join("")).toBe("42\n");
  });
  it("$? is the last command's, and && / || still decide", async () => {
    const { ex, out } = shell();
    await ex.run("false; echo $?");
    await ex.run("false && echo no || echo yes");
    expect(out.join("")).toBe("1\nyes\n");
  });
  it("a line that doesn't parse runs nothing", async () => {
    const { ex, out } = shell();
    expect(await ex.run("echo a; echo 'b")).toBe(2);
    expect(out.join("")).not.toContain("a\n");
  });
});

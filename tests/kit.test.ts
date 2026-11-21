import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE UI KIT stays the one place (docs/UI_KIT.md): no page and no module redraws
 * its own text field, checkbox or word wrapping. If this fails, use src/ui/kit.ts
 * (ib.lib.* in a module) instead of drawing it again.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
}

// forward slashes everywhere, so the allow-lists below match on Windows too
const files = [...walk("src"), ...walk("plugins")].map((f) => f.replaceAll("\\", "/"));
/** the kit itself, the two terminals (a real terminal's caret), the sandbox (it forwards a module's caret) */
const KIT = ["src/ui/field.ts", "src/ui/editor.ts", "src/ui/controls.ts", "src/ui/ui.ts", "src/shell/shell.ts", "src/shell/systerm.ts", "src/shell/terminal.ts", "src/plugins/sandbox/bridge.ts"];

function offenders(re: RegExp, allowed: string[] = KIT): string[] {
  return files.filter((f) => !allowed.includes(f) && re.test(readFileSync(f, "utf8")));
}

describe("the UI kit is the only one", () => {
  it("no hand-made text field (a caret drawn outside the kit)", () => {
    expect(offenders(/\bui\.cursor\(/)).toEqual([]);
  });
  it("no other one-line editor than Field", () => {
    expect(offenders(/new TextEditor\([^)]*singleLine/)).toEqual([]);
  });
  it("no hand-made checkbox", () => {
    expect(offenders(/["'`]\[■\]["'`]|\? "\[■\]"|"\[ \]" *:/)).toEqual([]);
  });
  it("one search bar: FilterBar (no search field of its own)", () => {
    expect(offenders(/new Field\(\{ icon: "⌕"/, ["src/ui/filterbar.ts", "src/ui/field.ts"])).toEqual([]);
  });
  it("no hand-made list key routing (ListView.onNavKey)", () => {
    expect(offenders(/k\.key === "up" \? "up" : k\.key === "down"/, ["src/ui/list.ts"])).toEqual([]);
  });
    it("no hand-made word wrapping (wrapWords)", () => {
    expect(offenders(/for \(const \w+ of [\w.()[\] ?|"—]+\.split\(" "\)\)/, ["src/core/unicode.ts"])).toEqual([]);
  });
  it("dialog buttons only through dialogButtons (bottom right, No | Yes)", () => {
    expect(offenders(/"\[Y\]es"|"\[N\]o"|"ok ⏎"|t\("(OK  ⏎|cancel  esc|close  esc)"\)/, ["src/ui/dialog.ts", "src/core/i18n-fr.ts"])).toEqual([]);
  });
});

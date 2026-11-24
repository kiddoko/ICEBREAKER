import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FR } from "../src/core/i18n-fr";

/** every .ts file under src (paths with "/" on Windows too) */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f).replace(/\\/g, "/");
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}

/** the t("…") keys written in a file (plain strings: a template or a variable can't be checked here) */
function keysOf(src: string): string[] {
  // not in comments (their examples aren't shown)
  src = src.replace(/^\s*(\*|\/\/).*$/gm, "");
  return [...src.matchAll(/(?<![\w.])t\("((?:[^"\\]|\\.)+)"[,)]/g)].map((m) => JSON.parse(`"${m[1]}"`) as string);
}

describe("every t() key has its French (bench 0.8: an English key edited without its French came out in English)", () => {
  // the places 0.8 touched: the top row, the deck's menu, the tour, the tabs, the status bar
  const watched = ["src/workspace/chrome.ts", "src/workspace/menus.ts", "src/workspace/tabstrip.ts", "src/workspace/sidepanel.ts"];
  for (const f of watched) {
    it(f, () => {
      const keys = keysOf(readFileSync(f, "utf8"));
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.filter((k) => FR[k] === undefined)).toEqual([]);
    });
  }
  it("the tour's titles and texts", () => {
    const tour = readFileSync("src/workspace/tour.ts", "utf8");
    const texts = [...tour.matchAll(/^\s+(?:title|text): "((?:[^"\\]|\\.)+)",$/gm)].map((m) => JSON.parse(`"${m[1]}"`) as string);
    expect(texts.length).toBeGreaterThan(5);
    expect(texts.filter((k) => FR[k] === undefined)).toEqual([]);
  });
  it("every plain t() key in src", () => {
    const missing = new Set(files("src").filter((f) => !f.includes("/i18n")).flatMap((f) => keysOf(readFileSync(f, "utf8"))).filter((k) => FR[k] === undefined));
    expect([...missing]).toEqual([]);
  });
});


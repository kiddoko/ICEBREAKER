import { describe, expect, it } from "vitest";
import { completeFolder, osOf, pathExamples, vaultPathProblem } from "../src/apps/setuppath";

const fs: Record<string, { name: string; isDir: boolean }[]> = {
  "/home/neo": [
    { name: "Documents", isDir: true },
    { name: "Downloads", isDir: true },
    { name: "notes", isDir: true },
    { name: "notes.txt", isDir: false },
    { name: ".config", isDir: true },
  ],
  "/": [{ name: "home", isDir: true }, { name: "mnt", isDir: true }],
  "C:\\": [{ name: "Users", isDir: true }],
};
const list = async (dir: string) => fs[dir] ?? [];

describe("the setup's vault folder", () => {
  it("takes full paths only, on every system", () => {
    for (const ok of ["/home/neo/vault", "~", "~/vault", "C:\\notes", "d:/notes", "\\\\nas\\share"]) expect(vaultPathProblem(ok)).toBeNull();
    for (const bad of ["vault", "notes/ideas", "./vault", ""]) expect(vaultPathProblem(bad)).not.toBeNull();
  });

  it("tab completes a single match, with its separator", async () => {
    expect(await completeFolder("/home/neo/no", "", list)).toEqual({ text: "/home/neo/notes/", choices: ["notes"] });
    expect(await completeFolder("/h", "", list)).toEqual({ text: "/home/", choices: ["home"] });
    expect(await completeFolder("C:\\U", "", list)).toEqual({ text: "C:\\Users\\", choices: ["Users"] });
  });

  it("tab completes ~ in the listing, keeps it in the text", async () => {
    expect(await completeFolder("~/no", "/home/neo", list)).toEqual({ text: "~/notes/", choices: ["notes"] });
  });

  it("several matches: as far as they agree, and the choices", async () => {
    expect(await completeFolder("~/Do", "/home/neo", list)).toEqual({ text: "~/Do", choices: ["Documents", "Downloads"] });
    expect(await completeFolder("~/d", "/home/neo", list)).toEqual({ text: "~/Do", choices: ["Documents", "Downloads"] });
  });

  it("files and hidden folders aren't offered (unless asked for)", async () => {
    expect((await completeFolder("~/", "/home/neo", list))!.choices).toEqual(["Documents", "Downloads", "notes"]);
    expect(await completeFolder("~/.c", "/home/neo", list)).toEqual({ text: "~/.config/", choices: [".config"] });
  });

  it("nothing to complete: null", async () => {
    expect(await completeFolder("vault", "", list)).toBeNull();
    expect(await completeFolder("/home/neo/zzz", "", list)).toBeNull();
  });
});

describe("the setup's examples follow the system", () => {
  it("knows the system", () => {
    expect(osOf("MacIntel", "")).toBe("mac");
    expect(osOf("Win32", "Mozilla/5.0 (Windows NT 10.0)")).toBe("windows");
    expect(osOf("Linux x86_64", "X11; Linux")).toBe("linux");
  });
  it("shows Windows paths and shells on Windows, never a Mac path", () => {
    const w = pathExamples("windows");
    expect(w.placeholder).toBe("D:\\Icebreaker");
    expect(w.examples).not.toMatch(/Volumes|\/Users/);
    expect(w.shells).toMatch(/PowerShell/);
    expect(vaultPathProblem(w.placeholder)).toBeNull();
    expect(vaultPathProblem(pathExamples("linux").placeholder)).toBeNull();
  });
});

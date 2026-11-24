import { describe, expect, it } from "vitest";
import { bridgeCwd, macroForShell, quoteForShell, shellFamily } from "../src/shell/bridgeshell";

describe("a command typed in a system terminal runs in the right vault folder", () => {
  it("macOS / Linux paths", () => {
    expect(bridgeCwd("/Users/me/Notes", "/Users/me/Notes")).toBe("");
    expect(bridgeCwd("/Users/me/Notes/", "/Users/me/Notes/journal")).toBe("journal");
    expect(bridgeCwd("/Users/me/Notes", "/Users/me/Notes2/x")).toBe("");
    expect(bridgeCwd("/Users/me/Notes", "/Users/me/notes/journal")).toBe(""); // case counts on a case-sensitive path
  });
  it("Windows: PowerShell's \\ (and any case) is the same folder", () => {
    expect(bridgeCwd("C:\\Users\\me\\Notes", "C:\\Users\\me\\Notes\\journal")).toBe("journal");
    expect(bridgeCwd("C:/Users/me/Notes", "C:\\Users\\me\\Notes\\a\\b")).toBe("a/b");
    expect(bridgeCwd("C:\\Users\\me\\Notes", "c:\\users\\me\\notes\\Journal")).toBe("Journal");
    expect(bridgeCwd("C:\\Users\\me\\Notes", "C:\\Users\\me\\Notes")).toBe("");
    expect(bridgeCwd("C:\\Users\\me\\Notes", "C:\\Users\\me\\Notes2")).toBe("");
    expect(bridgeCwd("C:\\Users\\me\\Notes", "D:\\elsewhere")).toBe("");
  });
});

describe("macros said the shell's way", () => {
  it("knows the shells by their program", () => {
    expect(shellFamily("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")).toBe("powershell");
    expect(shellFamily("pwsh")).toBe("powershell");
    expect(shellFamily("cmd.exe")).toBe("cmd");
    expect(shellFamily("/bin/zsh")).toBe("zsh");
  });
  it("PowerShell and cmd get theirs; zsh and your own macros stay as written", () => {
    expect(macroForShell("ls -la", "powershell.exe")).toBe("Get-ChildItem -Force");
    expect(macroForShell("mkdir -p {folder}", "pwsh")).toBe("New-Item -ItemType Directory -Force {folder} | Out-Null");
    expect(macroForShell("grep -ril {text} .", "powershell")).toBe("ib grep -ril {text} .");
    expect(macroForShell("ls -la", "cmd.exe")).toBe("dir /a");
    expect(macroForShell("clear", "cmd")).toBe("cls");
    expect(macroForShell("ls -la", "/bin/zsh")).toBe("ls -la");
    expect(macroForShell("my-own --thing", "powershell")).toBe("my-own --thing");
  });
  it("answers are quoted the way the shell reads them", () => {
    expect(quoteForShell("powershell")!("my folder")).toBe("'my folder'");
    expect(quoteForShell("powershell")!("it's")).toBe("'it''s'");
    expect(quoteForShell("cmd")!("a b")).toBe('"a b"');
    expect(quoteForShell("zsh")).toBeNull();
  });
});

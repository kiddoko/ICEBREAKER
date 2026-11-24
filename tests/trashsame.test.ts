import { describe, expect, it } from "vitest";
import { fakeDeck } from "./dataloss-helpers";

describe("the trash, two files of the same name", () => {
  it("keeps both, and each goes back where it came from", async () => {
    const { vault, platform } = fakeDeck();
    await vault.write("ta/same.md", "A");
    await vault.write("tb/same.md", "B");
    const a = await vault.trash("ta/same.md");
    const b = await vault.trash("tb/same.md");
    expect(a).not.toBe(b);
    expect(await platform.vault.read(a)).toBe("A");
    expect(await platform.vault.read(b)).toBe("B");
    expect(await vault.restore(b)).toBe("tb/same.md");
    expect(await vault.restore(a)).toBe("ta/same.md");
    expect(await platform.vault.read("ta/same.md")).toBe("A");
    expect(await platform.vault.read("tb/same.md")).toBe("B");
  });

  it("a folder can't go into itself: a clear error", async () => {
    const { vault } = fakeDeck();
    await vault.write("ta/n.md", "x");
    await expect(vault.rename("ta", "ta/sub")).rejects.toThrow("into itself");
  });
});

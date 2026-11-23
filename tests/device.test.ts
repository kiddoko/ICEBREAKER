import { describe, expect, it } from "vitest";
import { beginStart, endStart, lookKey, readDevice, writeDevice } from "../src/core/device";
import type { Platform } from "../src/platform/types";

const fake = () => {
  const files: Record<string, string> = {};
  return { files, platform: { config: { read: async (n: string) => files[n] ?? null, write: async (n: string, c: string) => void (files[n] = c) } } as unknown as Platform };
};

describe("what the deck remembers outside every account", () => {
  it("starts empty", async () => {
    expect(await readDevice(fake().platform)).toEqual({ remember: false, last: "", look: {} });
  });
  it("forgets the last name unless 'remember me' is on", async () => {
    const { platform } = fake();
    await writeDevice(platform, (d) => ((d.remember = false), (d.last = "Neo")));
    expect((await readDevice(platform)).last).toBe("");
    await writeDevice(platform, (d) => ((d.remember = true), (d.last = "Neo")));
    expect((await readDevice(platform)).last).toBe("Neo");
  });
  it("keeps each account's look by its name, any case", async () => {
    const { platform } = fake();
    await writeDevice(platform, (d) => void (d.look[lookKey(" Neo ")] = { theme: "e-ink" }));
    expect((await readDevice(platform)).look[lookKey("NEO")]?.theme).toBe("e-ink");
  });
  it("a start that never reached the desktop makes the next one a safe one, for that account only", async () => {
    const { platform } = fake();
    expect(await beginStart(platform, "neo")).toBe(false);
    // crashed: no endStart
    expect(await beginStart(platform, "neo")).toBe(true);
    await endStart(platform);
    expect(await beginStart(platform, "neo")).toBe(false);
    // another account after a crash of neo's: its start is a normal one
    expect(await beginStart(platform, "trinity")).toBe(false);
    await endStart(platform);
    expect((await readDevice(platform)).starting).toBeUndefined();
  });
});

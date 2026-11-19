import { describe, expect, it } from "vitest";
import { lookKey, readDevice, writeDevice } from "../src/core/device";
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
});

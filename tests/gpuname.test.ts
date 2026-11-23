import { describe, expect, it } from "vitest";
import { shortGpuName } from "../src/apps/sysmon";

describe("a graphics card's name, short enough for its tile", () => {
  it("drops the brand words everyone knows", () => {
    expect(shortGpuName("NVIDIA GeForce RTX 5080")).toBe("RTX 5080");
    expect(shortGpuName("AMD Radeon(TM) Graphics")).toBe("Radeon Graphics");
    expect(shortGpuName("Intel(R) UHD Graphics 620")).toBe("UHD Graphics 620");
    expect(shortGpuName("Apple M2")).toBe("Apple M2");
  });
});

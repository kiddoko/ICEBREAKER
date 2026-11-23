import { describe, expect, it } from "vitest";
import { privatePlace, searchRank } from "../src/workspace/filebrowser";

describe("the file picker", () => {
  it("doesn't show the places the deck won't read (AppData, Library, the system's)", () => {
    expect(privatePlace("C:\\Users\\andrs\\AppData")).toBe(true);
    expect(privatePlace("/Users/neo/Library")).toBe(true);
    expect(privatePlace("/etc")).toBe(true);
    expect(privatePlace("C:/Windows")).toBe(true);
    expect(privatePlace("/Users/neo/Documents/library")).toBe(false);
    expect(privatePlace("/Users/neo/Music")).toBe(false);
  });
  it("a search puts the exact name first, then names that start with it", () => {
    const names = ["SquirrelTemp", "Temp", "Templates", "my temp"];
    expect([...names].sort((a, b) => searchRank(a, "temp") - searchRank(b, "temp"))[0]).toBe("Temp");
    expect(searchRank("Templates", "temp")).toBeLessThan(searchRank("SquirrelTemp", "temp"));
  });
});

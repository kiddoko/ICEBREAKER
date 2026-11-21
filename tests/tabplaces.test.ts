import { describe, expect, it } from "vitest";
import { frameArg, frameOfPane, PANE_OF, parsePlaces, parseShows, prunePlaces } from "../src/workspace/tabplaces";

describe("tab places (a tab moved to another frame)", () => {
  it("names frames the way commands do", () => {
    expect(frameArg("tree")).toBe("vault");
    expect(frameArg("VAULT")).toBe("vault");
    expect(frameArg("panel")).toBe("panel");
    expect(frameArg("shell")).toBe("shell");
    expect(frameArg("page")).toBe("main");
    expect(frameArg("main")).toBe("main");
    expect(frameArg("3")).toBeNull();
    expect(frameArg(undefined)).toBeNull();
  });

  it("maps frames and panes both ways", () => {
    for (const f of ["vault", "panel", "shell", "main"] as const) expect(frameOfPane(PANE_OF[f])).toBe(f);
  });

  it("keeps only open tabs and known frames from a saved session", () => {
    const keys = ["home", "note:a.md", "clocks"];
    expect(parsePlaces({ home: "panel", "note:a.md": "shell", clocks: "nowhere", gone: "vault" }, keys)).toEqual({ home: "panel", "note:a.md": "shell" });
    expect(parsePlaces(null, keys)).toEqual({});
    expect(parsePlaces(["home"], keys)).toEqual({});
    expect(parsePlaces({ home: 3 }, keys)).toEqual({});
  });

  it("a frame shows only a tab that lives in it", () => {
    const places = parsePlaces({ home: "panel", clocks: "shell" }, ["home", "clocks"]);
    expect(parseShows({ panel: "home", shell: "home", vault: "clocks" }, places)).toEqual({ panel: "home" });
    expect(parseShows("x", places)).toEqual({});
  });

  it("closed tabs leave their place, and the frame that showed them", () => {
    const r = prunePlaces({ home: "panel", clocks: "shell" }, { panel: "home", shell: "clocks" }, ["home"]);
    expect(r.places).toEqual({ home: "panel" });
    expect(r.shows).toEqual({ panel: "home" });
  });
});

import { describe, expect, it } from "vitest";
import { TextEditor } from "../src/ui/editor";

describe("a click mapped by the last frame, after the text changed", () => {
  it("lands on the text there is (no E901 « reading 'start' »)", () => {
    const ed = new TextEditor("one\ntwo\nthree\nfour");
    // the last frame's rows: line 3, its third wrapped row
    (ed as unknown as { rowMap: { line: number; seg: number }[]; textY: number; textX: number }).rowMap = [{ line: 3, seg: 2 }];
    ed.setText("short");
    expect(() => ed.posAt(5, 0)).not.toThrow();
    expect(ed.posAt(5, 0).line).toBe(0);
  });
});

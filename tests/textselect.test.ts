import { describe, expect, it } from "vitest";
import { TextSelection, type SelectionSource } from "../src/ui/textselect";
import { TerminalBuffer } from "../src/shell/terminal";

/** rows of 10 cells; row 2 goes on from row 1 (a wrapped line) */
const rows = ["$ ls notes", "hello worl", "d again   ", "~/a.md  x "];
const src: SelectionSource = {
  cells: (l) => (rows[l] ? [...rows[l]] : undefined),
  wrapped: (l) => l === 2,
};

describe("the text selection (ibsh and the real terminal)", () => {
  it("copies from where you pressed to where you dragged, in reading order", () => {
    const s = new TextSelection();
    s.press({ line: 0, col: 5 }, 1, src);
    s.drag({ line: 0, col: 2 }, src);
    expect(s.text(src)).toBe("ls"); // trailing spaces trimmed
    s.drag({ line: 3, col: 6 }, src);
    // row 1 → 2 is one line wrapped: no line break there
    expect(s.text(src)).toBe("notes\nhello world again\n~/a.md");
  });
  it("double-click takes a word (a path is one word), triple-click the whole line", () => {
    const s = new TextSelection();
    s.press({ line: 3, col: 3 }, 2, src);
    expect(s.text(src)).toBe("~/a.md");
    s.press({ line: 2, col: 1 }, 3, src);
    expect(s.text(src)).toBe("hello world again");
  });
  it("a click alone selects nothing", () => {
    const s = new TextSelection();
    s.press({ line: 1, col: 4 }, 1, src);
    expect(s.has()).toBe(false);
  });
  it("reads ibsh's wrapped rows", () => {
    const b = new TerminalBuffer();
    b.typing = false;
    b.write("abcdefghijKLM\nnext\n");
    expect(b.rowCells(1, 10)?.slice(0, 3).join("")).toBe("KLM");
    expect(b.rowWrapped(1, 10)).toBe(true);
    expect(b.rowWrapped(2, 10)).toBe(false);
    const s = new TextSelection();
    const bs: SelectionSource = { cells: (r) => b.rowCells(r, 10), wrapped: (r) => b.rowWrapped(r, 10) };
    s.press({ line: 0, col: 0 }, 3, bs);
    expect(s.text(bs)).toBe("abcdefghijKLM");
  });
});

import { middlePath } from "../src/vault/paths";
describe("a long path on a button (TRASH → restore)", () => {
  it("keeps its start and the file's name", () => {
    const p = "/journal/2026/novembre/semaine-47/2026-11-20.md";
    expect(middlePath(p, 80)).toBe(p);
    const m = middlePath(p, 30);
    expect(m.length).toBeLessThanOrEqual(30);
    expect(m.startsWith("/journal")).toBe(true);
    expect(m.endsWith("…/2026-11-20.md")).toBe(true);
  });
});

import { UI } from "../src/ui/ui";
describe("the decrypt reveal (NEWS headlines, MODULES names…)", () => {
  it("shows the text at once when nothing animates, scrambled while it runs", () => {
    const ui = new UI();
    ui.now = 1234;
    expect(ui.reveal("hello world", 0.2)).not.toBe("hello world");
    expect(ui.reveal("hello world", 1)).toBe("hello world");
    ui.still = true; // frames per second at 0, or reduce motion: no frame would finish it
    expect(ui.reveal("hello world", 0.2)).toBe("hello world");
  });
});

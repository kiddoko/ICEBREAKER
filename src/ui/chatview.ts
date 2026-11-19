import { BOLD, DIM, ITALIC, type Rect, type Style } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import { TextEditor, wrapLine } from "./editor";
import { highlightLine, initialMdState } from "./markdown";
import { typed } from "./typewriter";
import type { UI } from "./ui";

/** each chat line's name for the typewriter */
const ids = new WeakMap<object, number>();
let nextId = 0;
function idOf(e: object): number {
  let id = ids.get(e);
  if (id === undefined) ids.set(e, (id = ++nextId));
  return id;
}

/**
 * A chat transcript + input box. Used by the LINK app (talk to the AI) and
 * by plugins. It only displays things; the owner decides what
 * to do with submitted text (`onSubmit`).
 */

export type ChatRole = "user" | "assistant" | "thinking" | "tool" | "info" | "error";

export interface ChatEntry {
  role: ChatRole;
  text: string;
}

interface Row {
  prefix: string;
  text: string;
  styles: (Style | undefined)[];
  base: Style;
}

export class ChatView {
  entries: ChatEntry[] = [];
  input: TextEditor;
  busy = false;
  /** Shown next to the spinner while busy. */
  busyLabel = "jacking in";
  onSubmit?: (text: string) => void;
  onCancel?: () => void;
  /** Name shown before assistant messages. */
  assistantName = "ai";

  private scrollFromBottom = 0;
  private version = 0;
  private cache = { version: -1, width: -1, rows: [] as Row[], typing: "" };

  constructor(placeholder = "type a message — Enter to send, Shift+Enter for a new line") {
    this.input = new TextEditor("", { submitOnEnter: true, placeholder, markdown: false });
    this.input.onSubmit = (text) => {
      if (!text.trim() || this.busy) return;
      this.input.setText("");
      this.scrollFromBottom = 0;
      this.onSubmit?.(text.trim());
    };
  }

  push(role: ChatRole, text: string): ChatEntry {
    const e = { role, text };
    this.entries.push(e);
    this.touch();
    return e;
  }

  /** Append streamed text to an entry. */
  append(e: ChatEntry, delta: string): void {
    e.text += delta;
    this.touch();
  }

  clear(): void {
    this.entries = [];
    this.touch();
  }

  /** Call after mutating entries directly. */
  touch(): void {
    this.version++;
  }

  onKey(k: KeyInput): boolean {
    if (k.key === "pageup") return this.onAction("page-up");
    if (k.key === "pagedown") return this.onAction("page-down");
    if (k.key === "esc" && this.busy) {
      this.onCancel?.();
      return true;
    }
    return this.input.onKey(k);
  }

  onText(t: string): boolean {
    return this.input.onText(t);
  }

  onAction(a: Action): boolean {
    const page = 10;
    if (a === "page-up" || a === "scroll-up") this.scrollFromBottom += a === "page-up" ? page : 3;
    else if (a === "page-down" || a === "scroll-down") this.scrollFromBottom = Math.max(0, this.scrollFromBottom - (a === "page-down" ? page : 3));
    else if (a === "back" && this.busy) this.onCancel?.();
    else if (a === "confirm" && !this.input.isEmpty) this.input.onSubmit?.(this.input.text);
    else return false;
    return true;
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const inputH = Math.min(6, Math.max(1, this.input.lines.length));
    const logH = r.h - inputH - 1;
    const logRect = { x: r.x + 1, y: r.y, w: r.w - 2, h: logH };
    // what the deck and the AI say types itself out (ui/typewriter.ts) — an answer
    // streaming in carries on as it grows; your own messages show at once
    const shown = new Map<ChatEntry, number>();
    for (const e of this.entries) {
      if (e.role === "user") continue;
      const n = typed(ui, `chat:${idOf(e)}`, e.text);
      if (n < [...e.text].length) shown.set(e, n);
    }
    const rows = this.layout(ui, logRect.w, shown);

    const maxScroll = Math.max(0, rows.length - logRect.h);
    this.scrollFromBottom = Math.min(this.scrollFromBottom, maxScroll);
    const start = Math.max(0, rows.length - logRect.h - this.scrollFromBottom);
    for (let i = 0; i < logRect.h; i++) {
      const row = rows[start + i];
      if (!row) break;
      const y = logRect.y + i;
      const x = ui.text(logRect.x, y, row.prefix, row.base);
      let cx = x;
      [...row.text].forEach((ch, k) => {
        const st = row.styles[k];
        cx = ui.text(cx, y, ch, st ? { ...row.base, ...st } : row.base);
      });
    }
    if (rows.length === 0) {
      ui.textCenter(logRect, logRect.y + Math.floor(logRect.h / 2), "· no messages yet ·", { fg: ui.c.subtle });
    }
    if (this.scrollFromBottom > 0) {
      ui.textRight(logRect.x + logRect.w, logRect.y + logRect.h - 1, ` ↓ ${this.scrollFromBottom} more `, { fg: ui.c.panel, bg: ui.c.accent });
    }
    ui.hit(logRect, { onWheel: (d) => this.onAction(d < 0 ? "scroll-up" : "scroll-down") });

    // separator with status
    const sepY = r.y + logH;
    ui.hline(r.x, sepY, r.w, { fg: focused ? ui.c.border : ui.c.faint });
    if (this.busy) {
      ui.text(r.x + 2, sepY, ` ${ui.spinner()} ${this.busyLabel}… `, { fg: ui.c.accent, attrs: BOLD });
      ui.textRight(r.x + r.w - 2, sepY, " esc to abort ", { fg: ui.c.subtle });
    } else {
      ui.textRight(r.x + r.w - 2, sepY, " enter send · shift+enter newline · pgup/pgdn scroll ", { fg: ui.c.faint });
    }

    // input
    const inY = sepY + 1;
    ui.text(r.x + 1, inY, "❯", { fg: focused ? ui.c.accent : ui.c.subtle, attrs: BOLD });
    this.input.render(ui, { x: r.x + 3, y: inY, w: r.w - 4, h: inputH }, focused && !this.busy);
  }

  /** Turn entries into wrapped, styled screen rows (cached until something changes). */
  private layout(ui: UI, width: number, shown: Map<ChatEntry, number> = new Map()): Row[] {
    const typing = [...shown.values()].join(",");
    if (this.cache.version === this.version && this.cache.width === width && this.cache.typing === typing) return this.cache.rows;
    const t = ui.theme;
    const rows: Row[] = [];
    for (const e of this.entries) {
      const { prefix, base } = this.styleFor(e.role, ui);
      const textW = Math.max(4, width - 2);
      let md = initialMdState();
      const limit = shown.get(e);
      const text = limit === undefined ? e.text : [...e.text].slice(0, limit).join("");
      const lines = text.replace(/\s+$/, "").split("\n");
      lines.forEach((line, li) => {
        const hl = e.role === "assistant" ? highlightLine(line, md, t) : null;
        if (hl) md = hl.next;
        for (const seg of wrapLine(line, textW)) {
          const text = line.slice(seg.start, seg.end);
          // styles are per UTF-16 unit; rows are drawn per code point → remap
          const styles: (Style | undefined)[] = [];
          for (let i = seg.start; i < seg.end; ) {
            styles.push(hl?.styles[i]);
            i += line.codePointAt(i)! > 0xffff ? 2 : 1;
          }
          const first = li === 0 && seg.start === 0;
          rows.push({ prefix: first ? prefix : "  ", text, styles, base });
        }
      });
      rows.push({ prefix: "", text: "", styles: [], base });
    }
    this.cache = { version: this.version, width, rows, typing };
    return rows;
  }

  private styleFor(role: ChatRole, ui: UI): { prefix: string; base: Style } {
    const c = ui.c;
    switch (role) {
      case "user": return { prefix: "❯ ", base: { fg: c.accent, attrs: BOLD } };
      case "assistant": return { prefix: "◆ ", base: { fg: c.fg } };
      case "thinking": return { prefix: "∴ ", base: { fg: c.subtle, attrs: ITALIC | DIM } };
      case "tool": return { prefix: "⚙ ", base: { fg: c.info } };
      case "error": return { prefix: "✖ ", base: { fg: c.error } };
      default: return { prefix: "· ", base: { fg: c.muted } };
    }
  }
}

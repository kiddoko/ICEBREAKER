import type { Renderer } from "./renderer";

/**
 * Input normalisation. Keyboard, mouse and gamepad all end up as one of:
 *   - KeyInput    a key press that isn't text (arrows, ctrl+s, F1…)
 *   - text        characters to insert (typing, IME, dead keys, paste)
 *   - MouseInput  in cell coordinates
 *   - Action      a semantic intent ("up", "confirm", "back"…) — what the
 *                 gamepad produces, and what unhandled keys fall back to.
 *
 * Apps can implement just `onAction` and get keyboard + mouse + gamepad navigation for free.
 */

export interface KeyInput {
  /** Normalized key name: "a", "enter", "up", "f1", "space", "esc"… */
  key: string;
  /** Physical key (KeyboardEvent.code) — for layout-independent shortcuts like ctrl+`. */
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  /** "ctrl+shift+z" style string, modifiers always in this order. */
  combo: string;
}

export type MouseKind = "down" | "up" | "move" | "drag" | "wheel" | "dblclick";

export interface MouseInput {
  kind: MouseKind;
  x: number;
  y: number;
  /** 0 left, 1 middle, 2 right */
  button: number;
  /** wheel: positive = scroll down, in lines */
  delta: number;
  ctrl: boolean;
  shift: boolean;
}

export type Action =
  | "up" | "down" | "left" | "right"
  | "confirm" | "back"
  | "page-up" | "page-down" | "home" | "end"
  | "tab-next" | "tab-prev" | "focus-next"
  | "palette" | "osk" | "menu"
  | "scroll-up" | "scroll-down";

export type ActionSource = "keyboard" | "gamepad" | "mouse";

export interface InputSink {
  key(k: KeyInput): void;
  text(t: string): void;
  mouse(m: MouseInput): void;
  action(a: Action, source: ActionSource): void;
}

const KEY_NAMES: Record<string, string> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  " ": "space", Escape: "esc", Enter: "enter", Backspace: "backspace",
  Delete: "delete", Tab: "tab", Home: "home", End: "end",
  PageUp: "pageup", PageDown: "pagedown", Insert: "insert",
};

/** Keys that become actions when nothing else handled them. */
export const KEY_ACTIONS: Record<string, Action> = {
  up: "up", down: "down", left: "left", right: "right",
  enter: "confirm", esc: "back", pageup: "page-up", pagedown: "page-down",
  home: "home", end: "end",
};

export function toKeyInput(e: KeyboardEvent): KeyInput {
  let key = KEY_NAMES[e.key] ?? (e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase());
  if (key === "+" || key === "=") key = e.key; // keep zoom keys readable
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  if (e.metaKey) parts.push("meta");
  parts.push(key);
  return { key, code: e.code, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, combo: parts.join("+") };
}

export class InputManager {
  /** Last known mouse cell (for hover effects). */
  mouseCell = { x: -1, y: -1 };
  /** Called on any input — used for idle detection and to wake the frame loop. */
  onActivity: () => void = () => {};
  private buttons = 0;
  private composing = false;

  constructor(
    private readonly sink: InputSink,
    private readonly renderer: Renderer,
    private readonly host: HTMLElement,
    private readonly textarea: HTMLTextAreaElement,
  ) {
    this.bindKeyboard();
    this.bindMouse();
    this.focus();
  }

  focus(): void {
    this.textarea.focus({ preventScroll: true });
  }

  /** Move the hidden textarea under the text cursor so IME candidate popups appear there. */
  placeCaret(x: number, y: number): void {
    const p = this.renderer.cellToPixels(x, y);
    this.textarea.style.left = `${p.left}px`;
    this.textarea.style.top = `${p.top}px`;
  }

  private bindKeyboard(): void {
    const ta = this.textarea;
    ta.addEventListener("keydown", (e) => {
      this.onActivity();
      if (e.isComposing || e.keyCode === 229) return; // IME is busy, let it work
      const altGr = e.getModifierState("AltGraph");
      const printable = [...e.key].length === 1 && (!(e.ctrlKey || e.metaKey || e.altKey) || altGr);
      if (printable || e.key === "Dead") return; // becomes an `input` event
      const k = toKeyInput(e);
      // Let paste reach the textarea so we get the `paste` event with the clipboard text.
      if (k.combo === "ctrl+v" || k.combo === "meta+v" || k.combo === "shift+insert") return;
      e.preventDefault();
      if (["Control", "Shift", "Alt", "Meta", "AltGraph", "CapsLock"].includes(e.key)) return;
      this.sink.key(k);
    });
    ta.addEventListener("compositionstart", () => (this.composing = true));
    ta.addEventListener("compositionend", () => {
      this.composing = false;
      this.flushText();
    });
    ta.addEventListener("input", () => {
      if (!this.composing) this.flushText();
    });
    ta.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (text) this.sink.text(text.replace(/\r\n?/g, "\n").normalize("NFC"));
    });
    ta.addEventListener("blur", () => setTimeout(() => this.focus(), 0));
  }

  private flushText(): void {
    const v = this.textarea.value;
    this.textarea.value = "";
    if (v) this.sink.text(v.normalize("NFC"));
  }

  private bindMouse(): void {
    const host = this.host;
    const make = (kind: MouseKind, e: MouseEvent, delta = 0): MouseInput => {
      const c = this.renderer.cellAt(e.clientX, e.clientY);
      return { kind, x: c.x, y: c.y, button: e.button, delta, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey };
    };
    host.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this.onActivity();
      this.buttons = e.buttons;
      this.focus();
      this.sink.mouse(make("down", e));
    });
    window.addEventListener("mouseup", (e) => {
      if (!this.buttons) return;
      this.buttons = 0;
      this.sink.mouse(make("up", e));
    });
    host.addEventListener("mousemove", (e) => {
      const c = this.renderer.cellAt(e.clientX, e.clientY);
      if (c.x === this.mouseCell.x && c.y === this.mouseCell.y) return; // only report cell changes
      this.mouseCell = c;
      this.onActivity();
      this.sink.mouse(make(e.buttons ? "drag" : "move", e));
    });
    host.addEventListener("dblclick", (e) => {
      e.preventDefault();
      this.sink.mouse(make("dblclick", e));
    });
    host.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.onActivity();
        const lines = e.deltaMode === 1 ? e.deltaY : e.deltaY / 40;
        this.sink.mouse(make("wheel", e, Math.sign(lines) * Math.max(1, Math.round(Math.abs(lines)))));
      },
      { passive: false },
    );
    host.addEventListener("contextmenu", (e) => e.preventDefault());
  }
}

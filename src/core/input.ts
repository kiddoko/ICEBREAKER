import { takePendingCopy } from "./clipboard";
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
  /** The physical keys (on macOS `ctrl` above also covers ⌘): terminals need the real Control. */
  rawCtrl?: boolean;
  rawMeta?: boolean;
  /** a key that would have typed text, sent as a key because the page asked (App.rawKeys: a piano, a game) */
  raw?: boolean;
  /** held down: the system repeats it */
  repeat?: boolean;
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
  /** x with the part of a cell (2.5 = the middle of column 2): sliders use it for 1 % steps */
  fx?: number;
  /**
   * a drag that stayed in the same cell, or a wheel event too small to make a line
   * (only for the areas that ask: Hit.fine — sliders)
   */
  fine?: boolean;
  /** wheel: the raw pixels of this event (positive = down), for sliders */
  px?: number;
  /** down: 1, 2 for a double click, 3 for a triple (text selection: a word, a line) */
  clicks?: number;
  ctrl: boolean;
  shift: boolean;
}

export type Action =
  | "up" | "down" | "left" | "right"
  | "confirm" | "back"
  | "page-up" | "page-down" | "home" | "end"
  | "tab-next" | "tab-prev" | "focus-next"
  /** Tab: the next thing on the screen (widget, card, line) */
  | "item-next"
  | "palette" | "osk" | "menu"
  | "scroll-up" | "scroll-down";

export type ActionSource = "keyboard" | "gamepad" | "mouse";

export interface InputSink {
  key(k: KeyInput): void;
  /** the page in front wants every key as a key (its place on the keyboard), not as text */
  rawKeys?(): boolean;
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

/** macOS: Cmd plays the role Ctrl has elsewhere, and Option types characters. */
export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform) || /Mac OS X/.test(navigator.userAgent);

/**
 * Normalize a key event. On macOS, Cmd is reported as `ctrl` so every
 * shortcut in the code is written once ("ctrl+k" = Ctrl+K on Windows/Linux,
 * ⌘K on a Mac). The physical Control key also counts as ctrl, so terminal
 * habits like Ctrl+C / Ctrl+L keep working.
 */
export function toKeyInput(e: KeyboardEvent): KeyInput {
  const key = KEY_NAMES[e.key] ?? e.key.toLowerCase();
  const ctrl = e.ctrlKey || (IS_MAC && e.metaKey);
  const meta = IS_MAC ? false : e.metaKey;
  const parts: string[] = [];
  if (ctrl) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  if (meta) parts.push("meta");
  parts.push(key);
  return { key, code: e.code, ctrl, alt: e.altKey, shift: e.shiftKey, meta, combo: parts.join("+"), rawCtrl: e.ctrlKey, rawMeta: e.metaKey, repeat: e.repeat };
}

/**
 * A key that types text, as a key (App.rawKeys): with ⌥ / AltGr the name comes from its place
 * (⌥X is "x", not "≈"); `code` is always the place.
 */
export function rawKeyInput(e: KeyboardEvent): KeyInput {
  const k = toKeyInput(e);
  let key = k.key;
  if (e.altKey || e.key === "Dead") {
    if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
    else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  }
  const parts = [k.alt && "alt", k.shift && "shift", key].filter(Boolean);
  return { ...k, key, combo: parts.join("+"), raw: true, repeat: e.repeat };
}

/** A synthetic ctrl+<letter> press (used to turn native menu commands into our shortcuts). */
function ctrlKey(letter: string, shift = false): KeyInput {
  return { key: letter, code: `Key${letter.toUpperCase()}`, ctrl: true, alt: false, shift, meta: false, combo: `ctrl+${shift ? "shift+" : ""}${letter}` };
}

export class InputManager {
  /** Last known mouse cell (for hover effects). */
  mouseCell = { x: -1, y: -1 };
  /** ⌘ (Mac) / ctrl held right now, alone: the tabs show their numbers (⌘1…9) while it's down */
  modHeld = false;
  private setMod(on: boolean): void {
    if (on === this.modHeld) return;
    this.modHeld = on;
    this.onActivity();
  }
  private mouseFx = -1;
  private wheelPx = 0;
  private wheelAt = 0;
  /** Called on any input — used for idle detection and to wake the frame loop. */
  onActivity: () => void = () => {};
  /**
   * Gestures: the mouse's back / forward buttons, a two-finger swipe left / right
   * on a trackpad (one per swipe), a pinch (or ctrl+wheel). Up / down two-finger
   * swipes stay what they are: scrolling.
   */
  onGesture: (g: "back" | "forward" | "zoom-in" | "zoom-out") => void = () => {};
  /** shift pressed twice quickly (THE MENU) */
  onDoubleShift: () => void = () => {};
  /** a key went down that types, erases or enters (the typing sound) */
  onKeyPress: (kind: "type" | "erase" | "enter") => void = () => {};
  private shiftAt = 0;
  private swipePx = 0;
  private swipeAt = 0;
  private swipeFired = false;
  private swipeLast = 0;
  private swipeFiredAt = 0;
  private pinch = 0;
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
      // ⌘ / ctrl down alone (not part of a shortcut being typed): the tab numbers show
      this.setMod(e.key === (IS_MAC ? "Meta" : "Control"));
      // the typing click (settings.sound.typing): right now, on the key going down —
      // not later, when the browser turns it into text
      if (!e.ctrlKey && !e.metaKey) {
        if (e.key === "Backspace" || e.key === "Delete") this.onKeyPress("erase");
        else if (e.key === "Enter") this.onKeyPress("enter");
        else if ([...e.key].length === 1) this.onKeyPress("type");
      }
      if (e.isComposing || e.keyCode === 229) return; // IME is busy, let it work
      // Characters typed with AltGr (Windows/Linux: @ # { [ on many layouts) or
      // Option (macOS: | { [ …) are text, not shortcuts.
      const altGr = e.getModifierState("AltGraph");
      const macOption = IS_MAC && e.altKey && !e.ctrlKey && !e.metaKey;
      // shift twice, quickly, nothing in between: THE MENU (works anywhere, even typing)
      if (e.key === "Shift" && !e.repeat) {
        const now = performance.now();
        if (now - this.shiftAt < 350) (this.shiftAt = 0), this.onDoubleShift();
        else this.shiftAt = now;
        return;
      }
      this.shiftAt = 0;
      const printable = [...e.key].length === 1 && (!(e.ctrlKey || e.metaKey || e.altKey) || altGr || macOption);
      // a page that plays the keyboard (a piano, a game) gets those keys as keys: their place, never text
      if ((printable || e.key === "Dead") && !e.ctrlKey && !e.metaKey && this.sink.rawKeys?.()) {
        e.preventDefault();
        this.sink.key(rawKeyInput(e));
        return;
      }
      // a plain space: given to the deck here, never left to the webview (which may scroll the page with it)
      if (e.key === " " && !e.ctrlKey && !e.metaKey && !e.altKey) return e.preventDefault(), this.sink.text(" ");
      if (printable || e.key === "Dead") return; // becomes an `input` event
      // ⌘Q ⌘H ⌘M ⌃⌘F are the macOS menu bar's: if we preventDefault them, WKWebView swallows them.
      if (IS_MAC && e.metaKey && (["q", "h", "m"].includes(e.key.toLowerCase()) || (e.ctrlKey && e.code === "KeyF"))) return;
      const k = toKeyInput(e);
      // Let paste reach the textarea so we get the `paste` event with the clipboard text.
      if (k.combo === "ctrl+v" || k.combo === "meta+v" || k.combo === "shift+insert") return;
      e.preventDefault();
      if (["Control", "Shift", "Alt", "Meta", "AltGraph", "CapsLock"].includes(e.key)) return;
      this.sink.key(k);
    });
    // space anywhere else (the focus lost for a moment): never the page's scroll
    window.addEventListener("keydown", (e) => {
      if (e.key === " " && e.target !== ta) e.preventDefault();
    }, true);
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
    // Native Edit-menu commands (macOS turns ⌘C ⌘X ⌘Z into these instead of key
    // events) are routed to the same shortcuts as the keyboard.
    const copyLike = (e: ClipboardEvent, letter: "c" | "x") => {
      let text = takePendingCopy();
      if (text === null) {
        this.sink.key(ctrlKey(letter)); // let the focused widget copy its selection
        text = takePendingCopy();
      }
      e.preventDefault();
      if (text !== null) e.clipboardData?.setData("text/plain", text);
    };
    ta.addEventListener("copy", (e) => copyLike(e, "c"));
    ta.addEventListener("cut", (e) => copyLike(e, "x"));
    ta.addEventListener("beforeinput", (e) => {
      if (e.inputType === "historyUndo" || e.inputType === "historyRedo") {
        e.preventDefault();
        this.sink.key(ctrlKey("z", e.inputType === "historyRedo"));
      }
    });
    ta.addEventListener("keyup", (e) => {
      if (e.key === (IS_MAC ? "Meta" : "Control") || !(IS_MAC ? e.metaKey : e.ctrlKey)) this.setMod(false);
    });
    ta.addEventListener("blur", () => {
      this.setMod(false);
      setTimeout(() => this.focus(), 0);
    });
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
      return { kind, x: c.x, y: c.y, fx: c.fx, button: e.button, delta, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey };
    };
    // back / forward mouse buttons: tabs (and never the webview's own history)
    const sideButton = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return false;
      e.preventDefault();
      return true;
    };
    window.addEventListener("mouseup", (e) => void sideButton(e));
    window.addEventListener("auxclick", (e) => void sideButton(e));
    host.addEventListener("mousedown", (e) => {
      if (sideButton(e)) return this.onGesture(e.button === 3 ? "back" : "forward");
      e.preventDefault();
      this.onActivity();
      this.buttons = e.buttons;
      this.focus();
      this.sink.mouse({ ...make("down", e), clicks: e.detail || 1 });
    });
    window.addEventListener("mouseup", (e) => {
      if (!this.buttons) return;
      this.buttons = 0;
      this.sink.mouse(make("up", e));
    });
    host.addEventListener("mousemove", (e) => {
      const c = this.renderer.cellAt(e.clientX, e.clientY);
      if (c.x === this.mouseCell.x && c.y === this.mouseCell.y) {
        // the same cell: only a drag that moved (by a pixel or so: a slider's handle
        // follows the pointer to the pixel: 1 % steps even when one cell holds 4 or 5 of them)
        if (!e.buttons || Math.abs(c.fx - this.mouseFx) < 0.05) return;
        this.mouseFx = c.fx;
        return this.sink.mouse({ ...make("drag", e), fine: true });
      }
      this.mouseCell = c;
      this.mouseFx = c.fx;
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
        const t0 = performance.now();
        // a pinch (Chromium / WebView2 send it as ctrl+wheel) or ctrl+wheel: zoom
        if (e.ctrlKey) {
          this.pinch += -e.deltaY;
          if (Math.abs(this.pinch) > 40) {
            this.onGesture(this.pinch > 0 ? "zoom-in" : "zoom-out");
            this.pinch = 0;
          }
          return;
        }
        // shift+wheel: browsers turn it into a sideways scroll — it's still the wheel (with shift)
        const shifted = e.shiftKey && Math.abs(e.deltaX) > Math.abs(e.deltaY);
        // a two-finger swipe sideways: one tab per swipe (left → next, right → previous)
        if (!shifted && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5) {
          const a = Math.abs(e.deltaX);
          // a new swipe: a pause, a change of direction, or deltas growing again while
          // macOS's momentum (shrinking deltas) is still coming in
          const fresh = t0 - this.swipeAt > 220 || Math.sign(e.deltaX) !== Math.sign(this.swipePx) || (this.swipeFired && a > this.swipeLast * 1.6 && a > 6 && t0 - this.swipeFiredAt > 250);
          if (fresh) (this.swipePx = 0), (this.swipeFired = false);
          this.swipeAt = t0;
          this.swipeLast = a;
          this.swipePx += e.deltaX;
          if (!this.swipeFired && Math.abs(this.swipePx) > 120) {
            this.swipeFired = true;
            this.swipeFiredAt = t0;
            // fingers moving right (negative deltaX with natural scrolling) = the next tab, like turning a page
            this.onGesture(this.swipePx > 0 ? "back" : "forward");
          }
          return;
        }
        // Trackpads send many tiny events: add up the pixels and report whole lines
        // (one line = one cell). A lone notch of a slow mouse wheel still moves one line.
        const cellH = this.renderer.cellH || 16;
        const dy = shifted ? e.deltaX : e.deltaY;
        const px = e.deltaMode === 1 ? dy * cellH : e.deltaMode === 2 ? dy * cellH * 20 : dy;
        const now = performance.now();
        const lone = now - this.wheelAt > 250;
        this.wheelAt = now;
        if (lone || Math.sign(px) !== Math.sign(this.wheelPx)) this.wheelPx = 0;
        this.wheelPx += px;
        let lines = Math.trunc(this.wheelPx / cellH);
        if (!lines && lone && px) lines = Math.sign(px);
        // not a whole line yet: only sliders hear it (each notch of a Mac mouse is a step there)
        if (!lines) return px ? this.sink.mouse({ ...make("wheel", e, 0), fine: true, px }) : undefined;
        this.wheelPx = lone && Math.abs(this.wheelPx) < cellH ? 0 : this.wheelPx - lines * cellH;
        this.sink.mouse({ ...make("wheel", e, lines), px });
      },
      { passive: false },
    );
    host.addEventListener("contextmenu", (e) => e.preventDefault());
    // Safari / WKWebView (macOS) pinch: gesture events with a scale
    let scale = 1;
    const ge = (name: string, fn: (s: number) => void) =>
      host.addEventListener(name, (e) => {
        e.preventDefault();
        fn((e as unknown as { scale: number }).scale ?? 1);
      }, { passive: false } as AddEventListenerOptions);
    ge("gesturestart", () => (scale = 1));
    ge("gesturechange", (s) => (scale = s));
    ge("gestureend", () => {
      if (scale > 1.12) this.onGesture("zoom-in");
      else if (scale < 0.9) this.onGesture("zoom-out");
      scale = 1;
    });
  }
}

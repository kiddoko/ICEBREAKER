/**
 * The hover tip, drawn above the grid as a page element (like the caret), not in cells:
 * it sits at the pointer to the pixel, its text is crisp (the CRT bend, bloom and scanlines
 * don't blur it), it fades in, and it goes as soon as the pointer moves.
 *
 *   rest the pointer on something for a moment → the tip appears next to it
 *   move (a few pixels), click, press a key, turn the wheel → it goes at once
 *   rest again → it comes back (after a click or a key: only once the pointer has moved)
 *
 * The workspace says each frame what is under the pointer (`want`); this decides when
 * and where to show it.
 */

export interface TipContent {
  /** what it is / does: one or more lines (they wrap) */
  text?: string;
  /** the command it runs (`❯ settings`), shown under the text */
  cmd?: string;
}

export interface TipColors {
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  border: string;
}

/** how long the pointer rests before a tip shows (ms) */
export const TIP_DELAY = 550;
/** how far the pointer may drift (CSS px) before a shown tip goes */
export const TIP_SLOP = 3;

/** Where the tip goes: below right of the pointer, flipped to stay inside the window. Pure (tests). */
export function placeTip(px: { x: number; y: number }, size: { w: number; h: number }, view: { w: number; h: number }): { left: number; top: number } {
  const off = 14, margin = 6;
  let left = px.x + off;
  let top = px.y + off + 6;
  if (left + size.w > view.w - margin) left = Math.max(margin, px.x - off - size.w);
  if (top + size.h > view.h - margin) top = Math.max(margin, px.y - off - size.h);
  return { left: Math.round(left), top: Math.round(top) };
}

export class TipView {
  private el: HTMLDivElement;
  private textEl: HTMLDivElement;
  private cmdEl: HTMLDivElement;
  /** the pointer, in CSS px, and when it last moved */
  private px = { x: -1, y: -1 };
  private movedAt = 0;
  /** where it was when the tip showed (a drift past TIP_SLOP hides it) */
  private shownAt: { x: number; y: number } | null = null;
  private shownKey = "";
  /** a click or a key: no tip until the pointer moves again */
  private quiet = false;
  /** the frame loop: a tip waiting for its delay asks for a frame then */
  wake: () => void = () => {};

  constructor(host: HTMLElement) {
    const el = (this.el = document.createElement("div"));
    el.className = "ib-tip";
    el.setAttribute("role", "tooltip");
    this.textEl = document.createElement("div");
    this.textEl.className = "ib-tip-text";
    this.cmdEl = document.createElement("div");
    this.cmdEl.className = "ib-tip-cmd";
    el.append(this.textEl, this.cmdEl);
    host.appendChild(el);
    window.addEventListener("mousemove", (e) => this.moved(e.clientX, e.clientY), { passive: true });
    const hush = () => {
      this.quiet = true;
      this.hide();
    };
    window.addEventListener("mousedown", hush, { capture: true, passive: true });
    window.addEventListener("keydown", hush, { capture: true, passive: true });
    window.addEventListener("wheel", hush, { capture: true, passive: true });
    window.addEventListener("blur", hush);
    // the window resized: the tip was left where the pointer used to be
    window.addEventListener("resize", () => this.hide());
    document.documentElement.addEventListener("mouseleave", () => this.hide());
  }

  private moved(x: number, y: number): void {
    if (Math.abs(x - this.px.x) < 0.5 && Math.abs(y - this.px.y) < 0.5) return;
    this.px = { x, y };
    this.movedAt = performance.now();
    this.quiet = false;
    const at = this.shownAt;
    if (at && Math.hypot(x - at.x, y - at.y) > TIP_SLOP) this.hide();
    this.wake();
  }

  get shown(): boolean {
    return !!this.shownAt;
  }

  hide(): void {
    if (!this.shownAt) return;
    this.shownAt = null;
    this.shownKey = "";
    this.el.classList.remove("on");
  }

  /**
   * This frame's wish: the tip of what is under the pointer (or null). Returns how many ms
   * until it should show (the caller asks for a frame then), or 0.
   */
  want(content: TipContent | null, key: string, colors: TipColors, font: { family: string; px: number }, reduceMotion: boolean): number {
    if (!content || (!content.text && !content.cmd) || this.quiet || this.px.x < 0) {
      this.hide();
      return 0;
    }
    if (this.shownAt && key === this.shownKey) return 0;
    if (this.shownAt) this.hide(); // something else under the pointer: the old tip goes first
    const wait = TIP_DELAY - (performance.now() - this.movedAt);
    if (wait > 0) return Math.ceil(wait);
    this.show(content, key, colors, font, reduceMotion);
    return 0;
  }

  private show(content: TipContent, key: string, colors: TipColors, font: { family: string; px: number }, reduceMotion: boolean): void {
    const el = this.el;
    // a shortcut at the end of a line stays with what it belongs to (" · ⌘⇧P" went alone to the next line)
    this.textEl.textContent = (content.text ?? "").replace(/ · (?=[^\s·]{1,12}$)/gm, "\u00a0·\u00a0");
    this.textEl.style.display = content.text ? "" : "none";
    this.cmdEl.textContent = content.cmd ? `❯ ${content.cmd}` : "";
    this.cmdEl.style.display = content.cmd ? "" : "none";
    Object.assign(el.style, {
      fontFamily: font.family,
      fontSize: `${Math.max(11, Math.round(font.px * 0.92))}px`,
      background: colors.bg,
      color: colors.fg,
      borderColor: colors.border,
      boxShadow: `0 0 0 1px ${colors.bg}, 0 6px 22px rgba(0,0,0,.45), 0 0 14px ${colors.border}33`,
    });
    this.cmdEl.style.color = colors.accent;
    el.classList.toggle("still", reduceMotion);
    // measured where it will sit, then placed (it is hidden, opacity 0, until "on")
    el.style.left = "0px";
    el.style.top = "0px";
    const size = { w: el.offsetWidth, h: el.offsetHeight };
    const p = placeTip(this.px, size, { w: window.innerWidth, h: window.innerHeight });
    el.style.left = `${p.left}px`;
    el.style.top = `${p.top}px`;
    this.shownAt = { ...this.px };
    this.shownKey = key;
    void el.offsetWidth;
    el.classList.add("on");
  }
}

/** The tip's look (once per page): style.css keeps the deck's layers, this keeps the tip's. */
export const TIP_CSS = [
  ".ib-tip{position:fixed;z-index:20;pointer-events:none;max-width:min(52ch,80vw);padding:.45em .8em .5em;",
  "border:1px solid;border-left-width:3px;border-radius:2px;line-height:1.35;white-space:pre-wrap;",
  "opacity:0;transform:translateY(3px);transition:opacity .06s linear;",
  "-webkit-font-smoothing:antialiased;letter-spacing:.01em}",
  ".ib-tip.on{opacity:1;transform:none;transition:opacity .12s ease-out,transform .14s cubic-bezier(.22,1,.36,1)}",
  ".ib-tip.still,.ib-tip.still.on{transition:none}",
  ".ib-tip-cmd{margin-top:.3em;font-weight:600;opacity:.95}",
  ".ib-tip-text+.ib-tip-cmd{border-top:1px dashed;padding-top:.3em}",
].join("");

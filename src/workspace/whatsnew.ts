import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { lang, t } from "../core/i18n";
import { osKeys } from "../core/keyhints";
import type { Action, KeyInput } from "../core/input";
import { readDevice, writeDevice } from "../core/device";
import { strWidth } from "../core/unicode";
import type { Deck } from "../deck";
import { bigText } from "../ui/bigtext";
import { CLOSE, dialogButtons } from "../ui/dialog";
import { GAP, INSET } from "../ui/layout";
import type { UI } from "../ui/ui";
import { NOTES, notesFor, type NotesText } from "../whatsnew/notes";
import { isRelease, whatsNewAtStart } from "../whatsnew/seen";
import type { Overlay } from "./overlays";

/** where a line's text starts: GAP, the bullet, a space */
const BULLET = GAP + 2;

/**
 * WHAT'S NEW — a version's short notes (src/whatsnew/notes.ts) in a frame: the
 * version big, its date, "New" and "Fixed". It opens by itself once after an
 * update (whatsNewOnce, src/whatsnew/seen.ts), and with `changelog`, Settings →
 * UPDATES → What's new, or THE MENU. ←→ (or the version chips) go through the
 * versions; ↑↓ / the wheel scroll when it's taller than the window; esc, enter
 * or the pad's A / B close it.
 *
 * A minor version (0.6.0…) gets the "release" layout — the big ones deserve it:
 * a burst of sparks when it opens, a starfield drifting behind, a heavy frame, a
 * shimmering banner, the version decrypting in, its headline typing itself out.
 * Give the version a `headline`. Reduce motion / fps 0: all of it, standing still.
 */
export class WhatsNew implements Overlay {
  modal = true;
  done = false;
  private index: number;
  private scroll = 0;
  private readonly born = performance.now();

  constructor(private readonly deck: Deck, version?: string) {
    const i = NOTES.findIndex((n) => n.version === (version ?? deck.updater.version));
    this.index = i >= 0 ? i : 0;
  }

  private go(dir: 1 | -1): void {
    // → newer (up the list), ← older
    const next = this.index - dir;
    if (next < 0 || next >= NOTES.length) return;
    this.index = next;
    this.scroll = 0;
  }

  onKey(k: KeyInput): boolean {
    if (k.key === "esc" || k.key === "enter") this.done = true;
    else if (k.key === "left") this.go(-1);
    else if (k.key === "right") this.go(1);
    else if (k.key === "up") this.scroll = Math.max(0, this.scroll - 1);
    else if (k.key === "down") this.scroll++;
    else if (k.key === "pageup") this.scroll = Math.max(0, this.scroll - 8);
    else if (k.key === "pagedown") this.scroll += 8;
    else if (k.key === "home") this.scroll = 0;
    return true;
  }

  onText(): boolean {
    return true;
  }

  onAction(a: Action): boolean {
    if (a === "back" || a === "confirm") this.done = true;
    else if (a === "left") this.go(-1);
    else if (a === "right") this.go(1);
    else if (a === "up") this.scroll = Math.max(0, this.scroll - 1);
    else if (a === "down") this.scroll++;
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    const notes = NOTES[this.index];
    if (!notes) return void (this.done = true);
    // the notes are written the Mac way (⌘C): Ctrl+C on Windows / Linux (core/keyhints.ts)
    const raw: NotesText = lang() === "fr" ? notes.fr : notes.en;
    const text: NotesText = { added: raw.added.map((l) => osKeys(l)), fixed: raw.fixed.map((l) => osKeys(l)), headline: raw.headline && osKeys(raw.headline) };
    const release = isRelease(notes.version);
    const still = this.deck.settings.data.appearance.reduceMotion || this.deck.settings.data.appearance.maxFps === 0;
    const now = performance.now();

    ui.dim(screen, c.subtle);
    ui.hit(screen, { onClick: () => (this.done = true), onWheel: () => {}, block: true });
    const age = still ? 1e9 : now - this.born;
    if (release) this.sky(ui, screen, age, still);

    // the frame: wide enough for the lines, never wider than the screen
    // a line: the frame's borders, INSET on both sides, the bullet's indent, the text
    const lineW = Math.max(...[...text.added, ...text.fixed].map((l) => strWidth(l.replaceAll("`", "")) + BULLET + INSET * 2 + 2), 50);
    const headW = text.headline ? strWidth(text.headline) + INSET * 2 + 4 : 0;
    const w = Math.min(screen.w - GAP * 2, Math.max(lineW, headW, 60), 92);
    const want = 6 + 3 + text.added.length + text.fixed.length + 6 + (release ? 4 : 0);
    const h = Math.min(screen.h - 2, want);
    const r = { x: screen.x + Math.floor((screen.w - w) / 2), y: screen.y + Math.max(1, Math.floor((screen.h - h) / 3)), w, h };
    const title = release ? `✦ ${t("RELEASE")} ✦` : t("WHAT'S NEW");
    const inner = ui.box(r, { title, focused: true, bg: c.panelAlt, info: NOTES.length > 1 ? t("←→ versions") : undefined, border: release ? "heavy" : undefined });
    ui.hit(r, { onClick: () => {}, onWheel: (d) => (this.scroll = Math.max(0, this.scroll + Math.sign(d))) });

    // what goes in the frame, line by line (scrolls when the window is short)
    type Line = (y: number) => void;
    const lines: Line[] = [];
    const x = inner.x + INSET;
    const room = inner.w - INSET * 2;
    const phase = still ? 0 : (now - this.born) / 60;
    const big = bigText(notes.version);
    const bigW = strWidth(big[0]);
    const tall = inner.h >= want - 2 && bigW <= room;
    if (release) {
      // the banner: a shimmering rule above and below the version
      const rule = "━".repeat(Math.max(0, room));
      lines.push((y) => void ui.gradientText(x, y, rule, ui.theme.gradient, 0, phase));
    }
    if (tall) {
      // a release's version decrypts in (block noise settling into the digits)
      const p = release ? Math.min(1, Math.max(0, (age - 250) / 900)) : 1;
      for (const row of big) lines.push((y) => void ui.gradientText(inner.x + Math.floor((inner.w - bigW) / 2), y, p < 1 ? ui.reveal(row, p, [..."▓▒░█▚▞"]) : row, ui.theme.gradient, BOLD, release ? phase : 0));
    } else {
      lines.push((y) => {
        const s = `ICEBREAKER ${notes.version}`;
        ui.gradientText(inner.x + Math.floor((inner.w - strWidth(s)) / 2), y, s, ui.theme.gradient, BOLD, release ? phase : 0);
      });
    }
    if (release) {
      lines.push((y) => void ui.gradientText(x, y, "━".repeat(Math.max(0, room)), ui.theme.gradient, 0, -phase));
      // the headline types itself out once the version is there
      if (text.headline) {
        const head = text.headline;
        const n = Math.round(Math.min(1, Math.max(0, (age - 1000) / 900)) * [...head].length);
        lines.push((y) => {
          const typed = [...head].slice(0, n).join("");
          const x0 = inner.x + Math.floor((inner.w - strWidth(head)) / 2);
          ui.text(x0, y, typed, { fg: c.accent, attrs: BOLD });
          if (n < [...head].length && Math.floor(age / 120) % 2 === 0) ui.text(x0 + strWidth(typed), y, "▌", { fg: c.accent });
        });
      }
    }
    const when = notes.date ? formatDate(notes.date) : notes.version === this.deck.updater.version ? t("this version") : "";
    // under the big version: "ICEBREAKER · the date" (the one-line title already says ICEBREAKER)
    const sub = tall ? `ICEBREAKER${when ? ` · ${when}` : ""}` : when;
    if (sub) lines.push((y) => void ui.textCenter(inner, y, sub, { fg: c.muted }));
    lines.push(() => {});
    const group = (head: string, items: string[], fg: number, bullet: string, itemFg: number) => {
      if (!items.length) return;
      lines.push((y) => void ui.text(x, y, head, { fg, attrs: BOLD }));
      for (const item of items) {
        lines.push((y) => {
          ui.text(x + GAP, y, bullet, { fg });
          // `a command` in the theme's second colour, without the backticks
          let cx = x + BULLET;
          const end = x + room;
          item.split("`").forEach((part, i) => {
            if (part && cx < end) cx = ui.text(cx, y, part, { fg: i % 2 ? c.accentAlt : itemFg }, end - cx);
          });
        });
      }
      lines.push(() => {});
    };
    group(`✦ ${t("NEW")}`, text.added, c.accent, "▸", c.fg);
    group(`✓ ${t("FIXED")}`, text.fixed, c.success, "·", c.muted);

    // the body, then the footer on the last line
    const bodyH = inner.h - 1;
    const maxScroll = Math.max(0, lines.length - bodyH);
    this.scroll = Math.min(this.scroll, maxScroll);
    lines.slice(this.scroll, this.scroll + bodyH).forEach((draw, i) => draw(inner.y + i));
    if (maxScroll > 0) ui.text(inner.x + inner.w - INSET, inner.y + (this.scroll < maxScroll ? bodyH - 1 : 0), this.scroll < maxScroll ? "▾" : "▴", { fg: c.subtle });

    // footer: every version as a chip on the left ("all versions"), close on the right
    const fy = inner.y + inner.h - 1;
    const bx = dialogButtons(ui, inner, [{ label: CLOSE(), run: () => (this.done = true), selected: true }], fy);
    // oldest on the left, newest on the right (→ goes right). What fits is chosen from the newest
    // and always holds the one you read (it stopped at 0.6.2: 0.6.3 and 0.7.0 had no chip)
    const order = NOTES.map((_, i) => NOTES.length - 1 - i);
    const label = (i: number) => (i === this.index ? `◆ ${NOTES[i].version}` : NOTES[i].version);
    const { from, to } = chipWindow(order.map((i) => strWidth(label(i)) + 3), order.indexOf(this.index), bx - GAP - x - 2);
    let cx = x;
    if (from > 0) cx = ui.text(cx, fy, "‹ ", { fg: c.subtle });
    for (const i of order.slice(from, to + 1)) {
      const v = NOTES[i].version;
      cx += ui.button(cx, fy, label(i), () => ((this.index = i), (this.scroll = 0)), { selected: i === this.index, quiet: i !== this.index, tip: `changelog ${v}` }) + 1;
    }
    if (release && !still) ui.animate(50);
  }

  /**
   * Behind a release's frame: sparks bursting from the middle as it opens, then a slow
   * starfield drifting up, in the theme's gradient (still: the stars only, standing).
   */
  private sky(ui: UI, screen: Rect, age: number, still: boolean): void {
    const g = ui.theme.gradient;
    const cx = screen.x + screen.w / 2, cy = screen.y + screen.h / 3;
    const color = (k: number) => g[Math.floor(k * g.length) % g.length] ?? ui.c.accent;
    // only where the cell AND its two neighbours are empty: over the dimmed screen's words
    // (or between two of them: "◆·ICEBREAKER") they read as typos
    const blank = (x: number, y: number) => {
      if (x < 0 || x >= ui.grid.cols) return true;
      const ch = ui.grid.ch[y * ui.grid.cols + x];
      return ch === 32 || ch === 0 || (ch >= 0x2800 && ch <= 0x28ff);
    };
    const empty = (x: number, y: number) => blank(x - 1, y) && blank(x, y) && blank(x + 1, y);
    // the stars
    const n = Math.floor((screen.w * screen.h) / 55);
    for (let i = 0; i < n; i++) {
      const x = screen.x + Math.floor(rand(i) * screen.w);
      const drift = still ? 0 : (age / 1000) * (0.4 + rand(i + 9) * 1.2);
      const y = screen.y + Math.floor((((rand(i + 3) * screen.h - drift) % screen.h) + screen.h) % screen.h);
      const tw = still ? 0.6 : (Math.sin(age / 400 + i) + 1) / 2;
      if (!empty(x, y)) continue;
      ui.text(x, y, tw > 0.85 ? "✦" : tw > 0.4 ? "·" : "˙", { fg: mix(ui.c.bg, color(rand(i + 5)), 0.25 + 0.5 * tw) });
    }
    // the burst: sparks flying out for a second and a half
    if (still || age > 1600) return;
    const k = age / 1600;
    for (let i = 0; i < 70; i++) {
      const a = rand(i + 20) * Math.PI * 2;
      const v = 0.35 + rand(i + 40) * 0.65;
      const d = (1 - (1 - k) ** 3) * v;
      const x = Math.round(cx + Math.cos(a) * d * screen.w * 0.5), y = Math.round(cy + Math.sin(a) * d * screen.h * 0.45);
      if (x < screen.x || y < screen.y || x >= screen.x + screen.w || y >= screen.y + screen.h || !empty(x, y)) continue;
      ui.text(x, y, k < 0.35 ? "✦" : k < 0.7 ? "+" : "·", { fg: mix(color(rand(i + 60)), ui.c.bg, k * 0.7), attrs: BOLD });
    }
  }
}

/** a stable pseudo-random 0…1 */
function rand(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** "21 November 2026" / "21 novembre 2026" */
function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang() === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * At start, once the desktop is there (Deck.sessionReady): WHAT'S NEW if the
 * app was updated since this device last showed it (src/whatsnew/seen.ts).
 */
export async function whatsNewOnce(deck: Deck): Promise<void> {
  const current = deck.updater.version;
  const device = await readDevice(deck.platform);
  const { show, remember } = whatsNewAtStart(device.whatsNew, current, !!deck.settings.data.setup.done, !!notesFor(current));
  if (remember) await writeDevice(deck.platform, (d) => void (d.whatsNew = current));
  if (show) deck.workspace.whatsNew();
}

/**
 * Which chips fit in `room` (their widths, oldest first): as many of the newest as fit, always
 * with the one at `keep` (the version being read).
 */
export function chipWindow(widths: number[], keep: number, room: number): { from: number; to: number } {
  let to = widths.length - 1;
  let from = to + 1;
  let used = 0;
  while (from > 0 && used + widths[from - 1] <= room) used += widths[--from];
  if (keep >= 0 && keep < from) {
    // the one read is older: the window starts there and runs right as far as it fits
    from = keep;
    used = 0;
    to = keep - 1;
    while (to + 1 < widths.length && used + widths[to + 1] <= room) used += widths[++to];
  }
  return { from: Math.min(from, to), to };
}

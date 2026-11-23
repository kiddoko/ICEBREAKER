import { BOLD, type Rect } from "../core/grid";
import { mix, NONE } from "../core/color";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { easeOut, strWidth, wrapWords } from "../core/unicode";
import type { Deck } from "../deck";
import type { UI } from "../ui/ui";
import type { Overlay } from "./overlays";
import type { Workspace } from "./workspace";
import { finish, typedF } from "../ui/typewriter";
import { cellsFor } from "../ui/dots";
import { drawUplinkCore } from "../ui/uplinkcore";

/**
 * The guided tour (after the setup, or `tour` any time): UPLINK walks you
 * through the deck, one part of the screen lit at a time, the rest dimmed.
 *
 * → / enter next · ← back · esc skip (asks first). Each step says what part of
 * the screen it shows (`at`) and may open it first (`prep`). The panel, tree and
 * shell are put back the way they were at the end.
 */
interface TourStep {
  title: string;
  text: string;
  /** the part of the screen lit up (none: the bubble in the middle) */
  at?: (ws: Workspace, screen: Rect) => Rect | undefined;
  /** make it visible first */
  prep?: (ws: Workspace) => void;
}

const STEPS: TourStep[] = [
  {
    title: "hello, {handle}",
    text: "I'm UPLINK, the deck's AI. One minute and you'll know your way around. → or enter: next · ← back · esc: skip the tour.",
  },
  {
    title: "TABS",
    text: "Every page you open is a tab on top of its frame: click one, or ⌘1…9. ⌘W closes it, ctrl+tab goes to the next one; HOME is pinned, always first. Drag a tab onto another frame to keep it there, or onto another tab: a group. Top left, ◆ ICEBREAKER is the deck's menu: modules, the store, settings, log out.",
    at: (ws, s) => (ws.rects.main ? { ...ws.rects.main, h: 2 } : { x: 0, y: 0, w: s.w, h: 1 }),
  },
  {
    title: "FRAMES",
    text: "The tree, the page, the side panel and the shell are frames. Drag a tab onto another frame to keep it there. Drag the line between two frames to resize them (↔ shows where). Right-click a frame's name → Move to: left, right, top, bottom — or Settings → Layout. ⌘Z undoes.",
    at: (ws) => ws.rects.panel ?? ws.rects.shell ?? ws.rects.main,
  },
  {
    title: "vault",
    text: "Your notes, files and folders. One click selects, a double-click opens. ⌘N a new note, F2 renames, Delete (⌘⌫ on a Mac) sends to the trash — the tree's last line — nothing is lost, ⌘Z brings it back. ⌘⇧T shows or hides the tree.",
    prep: (ws) => void (ws.sidebarVisible = true),
    at: (ws) => ws.rects.sidebar,
  },
  {
    title: "HOME",
    text: "Your widgets. Double-click one (or enter) for its pop-up and its settings. ✎ edit (top right) or ⌘E to edit: drag them anywhere, pull the corner ◢ to resize, a to add one — the same widget as many times as you like.",
    prep: (ws) => ws.deck.openApp("home"),
    at: (ws) => ws.rects.main,
  },
  {
    title: "THE PANEL",
    text: "Widgets that stay in view whatever page you're on. ◨ in the status bar or ⌘⇧P shows or hides it; e edits it together with HOME.",
    prep: (ws) => ws.deck.history.quiet(() => ws.deck.settings.set("panel.shown", true)),
    at: (ws) => ws.rects.panel,
  },
  {
    title: "shell",
    text: "ibsh is the deck's own shell: help lists the commands, man <command> explains one. + opens your computer's real terminal. The log, on the shell's right (a tab when it's narrow), keeps what happened: the commands your clicks ran, errors, messages — tick a filter to see only those.",
    prep: (ws) => void (ws.shellVisible = true),
    at: (ws) => ws.rects.shell,
  },
  {
    title: "STATUS BAR",
    text: "On the left, what the keys do where you are. On the right: ▾ the shell, ⌨ the on-screen keyboard, ✦ the effects, ♪ sound on / off, ☾ the screensaver, ⌘K the menu, F1 the manual, ◧ the tree, ◨ the panel.",
    at: (_ws, s) => ({ x: 0, y: s.h - 1, w: s.w, h: 1 }),
  },
  {
    title: "THE MENU",
    text: "⌘K, or shift twice: THE MENU. Type to search everything — pages, settings, commands, notes. The letter next to a line + enter goes straight there.",
  },
  {
    title: "UNDO",
    text: "Made a mistake? ⌘Z takes back the last thing you did, anywhere: a setting, a widget moved, a file sent to the trash, a rename. ⌘⇧Z does it again.",
  },
  {
    title: "AND ME",
    text: "Ask me about your notes in UPLINK (⌘⇧U): what you wrote last week, a summary, a to-do list — several conversations at once, in tabs. That's it, have fun. `tour` plays this again.",
  },
];

export class Tour implements Overlay {
  modal = true;
  done = false;
  private i = 0;
  /** when this step started (the bubble pops open) */
  private stepAt = 0;
  private asking = false;
  private readonly before: { sidebar: boolean; shell: boolean; panel: boolean; tab: unknown };

  constructor(
    private readonly ws: Workspace,
    private readonly onEnd?: () => void,
  ) {
    const d = ws.deck;
    this.before = { sidebar: ws.sidebarVisible, shell: ws.shellVisible, panel: !!d.settings.data.panel?.shown, tab: ws.activeApp };
    this.go(0);
  }

  private get deck(): Deck {
    return this.ws.deck;
  }

  private go(i: number): void {
    if (i >= STEPS.length) return this.end();
    this.i = Math.max(0, i);
    STEPS[this.i].prep?.(this.ws);
    this.stepAt = performance.now();
    this.deck.sound.play("move");
    this.deck.requestFrame();
  }

  private end(): void {
    if (this.done) return;
    this.done = true;
    const ws = this.ws;
    ws.sidebarVisible = this.before.sidebar;
    ws.shellVisible = this.before.shell;
    ws.deck.history.quiet(() => ws.deck.settings.set("panel.shown", this.before.panel));
    // back on the page you were on (the tour went to HOME)
    const tab = ws.tabs.indexOf(this.before.tab as never);
    if (tab >= 0) ws.active = tab;
    this.deck.sound.play("confirm");
    this.onEnd?.();
    this.deck.requestFrame();
  }

  /** esc: "sure?" — then the tour is gone (`tour` brings it back). */
  private async skip(): Promise<void> {
    if (this.asking) return;
    this.asking = true;
    const ok = await this.deck.confirm(t("Are you sure you want to skip the tutorial?"), t("You can play it again any time: `tour` in the shell, or THE MENU → tour."));
    this.asking = false;
    if (ok) this.end();
    this.deck.requestFrame();
  }

  onKey(k: KeyInput): boolean {
    if (this.asking) return true;
    if (k.key === "right" || k.key === "enter" || k.key === " ") this.next();
    else if (k.key === "left" || k.key === "backspace") this.go(this.i - 1);
    else if (k.key === "esc") void this.skip();
    return true;
  }

  onText(): boolean {
    return true;
  }

  onAction(a: Action): boolean {
    if (this.asking) return false;
    if (a === "confirm" || a === "right" || a === "down") this.next();
    else if (a === "left" || a === "up") this.go(this.i - 1);
    else if (a === "back") void this.skip();
    return true;
  }

  /** next: the text still typing shows whole first */
  private next(): void {
    if (!finish(this.id())) this.go(this.i + 1);
    this.deck.requestFrame();
  }

  private text(): string {
    return t(STEPS[this.i].text);
  }

  /** the typewriter's name for this step's text (ui/typewriter.ts) */
  private id(): string {
    return `tour:${this.i}`;
  }

  render(ui: UI, screen: Rect): void {
    if (this.done) return;
    const c = ui.c;
    const st = STEPS[this.i];
    const target = st.at?.(this.ws, screen);
    // dimmed: the theme's faintest text colour, on its background
    const dim = c.faint;
    ui.animate(60);

    // everything dimmed but the part we're talking about
    if (target) {
      const r = target;
      ui.tint({ x: screen.x, y: screen.y, w: screen.w, h: r.y - screen.y }, dim, c.bg);
      ui.tint({ x: screen.x, y: r.y + r.h, w: screen.w, h: screen.y + screen.h - r.y - r.h }, dim, c.bg);
      ui.tint({ x: screen.x, y: r.y, w: r.x - screen.x, h: r.h }, dim, c.bg);
      ui.tint({ x: r.x + r.w, y: r.y, w: screen.x + screen.w - r.x - r.w, h: r.h }, dim, c.bg);
      // its edge breathes in the accent colour
      const glow = mix(c.accent, c.fg, (Math.sin(ui.now / 300) + 1) / 4);
      if (r.h === 1) ui.tint(r, NONE, mix(c.accent, c.panel, 0.75));
      else {
        ui.tint({ x: r.x, y: r.y, w: r.w, h: 1 }, glow);
        ui.tint({ x: r.x, y: r.y + r.h - 1, w: r.w, h: 1 }, glow);
        ui.tint({ x: r.x, y: r.y, w: 1, h: r.h }, glow);
        ui.tint({ x: r.x + r.w - 1, y: r.y, w: 1, h: r.h }, glow);
      }
    } else ui.tint(screen, dim, c.bg);
    // nothing under the tour gets the mouse
    ui.hit(screen, { onClick: () => this.next(), onWheel: () => {}, block: true });

    // UPLINK, big — the same face as its HOME widget (ui/uplinkcore.ts) — and its speech bubble
    const face = screen.w >= 84 && screen.h >= 20;
    const AW = face ? cellsFor(ui, AVATAR_H) : 0;
    const FW = face ? AW + 6 : 0; // its card: the face, a margin, the frame
    const W = Math.min(60, screen.w - 4 - FW);
    const text = this.text();
    const lines = wrapWords(text, W - 4);
    const BH = lines.length + 5; // the bubble
    const H = Math.max(BH, face ? AVATAR_H + 4 : 0); // with the face's card next to it
    const block = place(screen, target, FW + W, H);
    const b = { x: block.x + FW, y: block.y + Math.floor((H - BH) / 2), w: W, h: BH };
    const shown = typedF(ui, this.id(), text);
    const talking = shown < [...text].length;
    if (face) {
      // a card like the UPLINK widget's: opaque, framed, its name on top
      const card = { x: block.x, y: block.y + Math.floor((H - AVATAR_H - 4) / 2), w: AW + 4, h: AVATAR_H + 4 };
      ui.fill(card, { bg: c.panel });
      ui.box(card, { title: "uplink", focused: true, bg: c.panel });
      const fy = card.y + 2;
      const box = { x: card.x + 2, y: fy, w: AW, h: AVATAR_H };
      // talking: a voice wave; listening: an eye on what it shows, blinking now and then
      let look: { x: number; y: number } | null = null;
      if (!talking) {
        if (target) {
          const dx = (target.x + target.w / 2 - (box.x + AW / 2)) * ui.cellAspect, dy = target.y + target.h / 2 - (box.y + AVATAR_H / 2);
          const len = Math.hypot(dx, dy) || 1;
          look = { x: dx / len, y: dy / len };
        } else look = { x: 0, y: 0 };
      }
      drawUplinkCore(ui, box, { mood: talking ? "speaking" : "idle", look, blink: !talking && ui.now % 3800 < 140 });
    }
    // the bubble pops open when a step starts
    const age = ui.now - this.stepAt;
    const k = Math.min(1, age / 140);
    const bw = Math.max(6, Math.round(W * (0.6 + 0.4 * easeOut(k))));
    if (k < 1) ui.animate(16);
    const bb = { ...b, w: bw };
    ui.fill(bb, { bg: c.panel });
    ui.box(bb, { title: `uplink · ${this.i + 1}/${STEPS.length}`, focused: true });
    if (face) ui.text(bb.x, bb.y + Math.min(3, bb.h - 2), "◀", { fg: c.borderFocus, attrs: BOLD }); // the speech tail
    if (k < 1) return;
    const title = t(st.title).replace("{handle}", this.deck.settings.data.user.handle || "netrunner");
    ui.gradientText(b.x + 2, b.y + 1, title.toLowerCase(), ui.theme.gradient, BOLD, (ui.now / 2000) % 1);
    // typed out (with its blips), a cursor at the end while it talks
    // typed out (with its blips): whole letters, then the one coming in fades up
    let left = shown;
    lines.forEach((line, n) => {
      if (left <= 0) return;
      const chars = [...line];
      const whole = Math.min(chars.length, Math.floor(left));
      const part = chars.slice(0, whole).join("");
      const x = ui.text(b.x + 2, b.y + 2 + n, part, { fg: c.fg });
      if (whole < chars.length) {
        const frac = left - whole;
        if (frac > 0) ui.text(x, b.y + 2 + n, chars[whole], { fg: mix(c.panel, c.fg, frac), raw: true });
        ui.text(x + 1, b.y + 2 + n, "▌", { fg: c.accent });
      }
      left -= chars.length + 1;
    });
    // progress dots and the buttons
    const by = b.y + b.h - 2;
    let x = b.x + 2;
    for (let n = 0; n < STEPS.length; n++) x = ui.text(x, by, n === this.i ? "●" : "·", { fg: n === this.i ? c.accent : c.faint });
    const last = this.i === STEPS.length - 1;
    let rx = b.x + b.w - 2;
    const nextLabel = talking ? `${t("more")} ▸▸` : last ? `${t("let's go")} ✓` : `${t("next")} ▸`;
    rx -= strWidth(nextLabel) + 2;
    ui.button(rx, by, nextLabel, () => this.next(), { selected: true, tip: "→ · enter" });
    if (this.i > 0) {
      const back = `◂ ${t("back")}`;
      rx -= strWidth(back) + 3;
      ui.button(rx, by, back, () => this.go(this.i - 1), { tip: "←" });
    }
    if (!last) {
      const sk = t("skip");
      rx -= strWidth(sk) + 3;
      if (rx > x + 1) ui.button(rx, by, sk, () => void this.skip(), { tip: t("skip the tutorial (esc)") });
    }
  }
}


/** UPLINK's face in the tour: as many lines tall (its width follows, round on screen) */
const AVATAR_H = 11;

/** The bubble next to what it talks about: below, above, beside, or in the middle. */
function place(screen: Rect, r: Rect | undefined, W: number, H: number): Rect {
  const clampX = (x: number) => Math.max(screen.x + 1, Math.min(x, screen.x + screen.w - W - 1));
  const clampY = (y: number) => Math.max(screen.y + 1, Math.min(y, screen.y + screen.h - H - 1));
  if (!r) return { x: clampX(Math.floor((screen.w - W) / 2)), y: clampY(Math.floor((screen.h - H) / 3)), w: W, h: H };
  if (r.y + r.h + 1 + H <= screen.h - 1) return { x: clampX(r.x + 2), y: r.y + r.h + 1, w: W, h: H };
  if (r.y - 1 - H >= 1) return { x: clampX(r.x + 2), y: r.y - 1 - H, w: W, h: H };
  if (r.x + r.w + 2 + W <= screen.w) return { x: r.x + r.w + 2, y: clampY(r.y + 1), w: W, h: H };
  if (r.x - 2 - W >= 0) return { x: r.x - 2 - W, y: clampY(r.y + 1), w: W, h: H };
  // big (the whole page): inside it, low
  return { x: clampX(r.x + Math.floor((r.w - W) / 2)), y: clampY(r.y + r.h - H - 2), w: W, h: H };
}

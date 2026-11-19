import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { Action, KeyInput } from "../core/input";
import { strWidth } from "../core/unicode";
import type { Deck } from "../deck";
import type { UI } from "../ui/ui";
import type { Overlay } from "./overlays";

/**
 * The action wheel: hold RB on the gamepad and 8 slots open in a ring around
 * the middle of the screen; push a stick toward one, let go of RB and it runs.
 * LB turns the page (as many pages as you like). With a mouse or keyboard:
 * `wheel` opens it, click a slot (or arrows + enter), esc closes.
 *
 * Slots are shell commands (settings.gamepad.wheel: pages of {label, icon, cmd});
 * right-click menus offer "add to the wheel" (`wheel add <label> "<cmd>" [icon]`).
 */
export interface WheelSlot {
  label: string;
  icon: string;
  cmd: string;
}

export const SLOTS = 8;

export const DEFAULT_WHEEL = (): WheelSlot[][] => [
  [
    { label: "HOME", icon: "⌂", cmd: "home" },
    { label: "NEXUS", icon: "⬡", cmd: "nexus" },
    { label: "MODULES", icon: "▦", cmd: "modules" },
    { label: "journal", icon: "✎", cmd: "journal" },
    { label: "new note", icon: "✚", cmd: "note" },
    { label: "shell", icon: "❯", cmd: "term" },
    { label: "palette", icon: "⌘", cmd: "palette" },
    { label: "settings", icon: "⚙", cmd: "settings" },
  ],
];

export function wheelPages(deck: Deck): WheelSlot[][] {
  const p = deck.settings.data.gamepad?.wheel;
  return p?.length ? p : DEFAULT_WHEEL();
}

export class ActionWheel implements Overlay {
  modal = true;
  done = false;
  page = 0;
  /** the slot the stick (or the mouse, the arrows) points at, -1 none */
  hot = -1;
  private bornAt = performance.now();

  constructor(
    private readonly deck: Deck,
    /** opened by the gamepad: it runs on RB's release (else: click / enter) */
    readonly fromPad = false,
  ) {}

  private get pages(): WheelSlot[][] {
    return wheelPages(this.deck);
  }

  /** The stick: an angle (0 = up, clockwise) and how far it's pushed (0–1). */
  aim(angle: number, mag: number): void {
    const before = this.hot;
    this.hot = mag < 0.45 ? -1 : Math.round(((angle % (2 * Math.PI)) + 2 * Math.PI) / ((2 * Math.PI) / SLOTS)) % SLOTS;
    if (this.hot !== before && this.hot >= 0) this.deck.sound.play("tick");
  }

  turnPage(d = 1): void {
    const n = this.pages.length + 1; // the last page is an empty one to fill
    this.page = (this.page + d + n) % n;
    this.hot = -1;
    this.deck.sound.play("move");
  }

  /** Let go: run the slot pointed at (nothing pointed at: just close). */
  release(): void {
    this.done = true;
    const slot = this.pages[this.page]?.[this.hot];
    if (slot) {
      this.deck.sound.play("select");
      void this.deck.act(slot.cmd);
    }
  }

  onKey(k: KeyInput): boolean {
    if (k.combo === "esc") return (this.done = true), true;
    if (k.combo === "enter") return this.release(), true;
    if (k.combo === "tab" || k.combo === "pagedown") return this.turnPage(1), true;
    if (k.combo === "shift+tab" || k.combo === "pageup") return this.turnPage(-1), true;
    const step = ({ right: 1, down: 1, left: -1, up: -1 } as Record<string, number>)[k.combo];
    if (step) {
      this.hot = this.hot < 0 ? 0 : (this.hot + step + SLOTS) % SLOTS;
      this.deck.sound.play("tick");
    }
    return true;
  }
  onText(): boolean {
    return true;
  }
  onAction(a: Action): boolean {
    if (a === "back") return (this.done = true), true;
    if (a === "confirm") return this.release(), true;
    if (a === "tab-prev") return this.turnPage(1), true;
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    const age = Math.min(1, (performance.now() - this.bornAt) / 140);
    if (age < 1) ui.animate(16);
    ui.tint(screen, c.subtle);
    ui.hit(screen, { onClick: () => (this.done = true), onWheel: (d) => this.turnPage(d > 0 ? 1 : -1), block: true });
    const cx = screen.x + Math.floor(screen.w / 2);
    const cy = screen.y + Math.floor(screen.h / 2);
    // cells are about twice as tall as wide: the ring is an ellipse on the grid
    const ry = Math.max(5, Math.min(9, Math.floor(screen.h / 2) - 4)) * (0.6 + 0.4 * age);
    const rx = ry * 2.2;
    const slots = this.pages[this.page] ?? [];
    // a dark field under the ring, so the page behind doesn't show through
    const fw = Math.round(rx * 2 + 22), fh = Math.round(ry * 2 + 5);
    ui.fill({ x: cx - Math.floor(fw / 2), y: cy - Math.floor(fh / 2), w: fw, h: fh }, { bg: mix(c.bg, c.panel, 0.4) });

    // the hub
    const hub = { x: cx - 9, y: cy - 2, w: 19, h: 5 };
    ui.box(hub, { border: "double", bg: c.panel, fill: true, focused: true });
    const cur = slots[this.hot];
    ui.textCenter(hub, cy - 1, cur ? cur.label.toUpperCase() : t("ACTIONS"), { fg: cur ? c.accent : c.subtle, bg: c.panel, attrs: BOLD });
    const pages = this.pages.length + 1;
    ui.textCenter(hub, cy, Array.from({ length: pages }, (_, i) => (i === this.page ? "◆" : "◇")).join(" "), { fg: c.accentAlt, bg: c.panel });
    ui.textCenter(hub, cy + 1, this.fromPad ? t("LB page · let go of RB") : t("tab page · enter · esc"), { fg: c.faint, bg: c.panel });

    // a faint ring line
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      const x = Math.round(cx + Math.sin(a) * rx), y = Math.round(cy - Math.cos(a) * ry);
      ui.text(x, y, "·", { fg: mix(c.bg, c.accent, 0.35) });
    }
    for (let i = 0; i < SLOTS; i++) {
      const a = (i / SLOTS) * Math.PI * 2;
      const x = Math.round(cx + Math.sin(a) * rx), y = Math.round(cy - Math.cos(a) * ry);
      const s = slots[i];
      const on = i === this.hot;
      const label = s ? ` ${s.icon} ${s.label} ` : " + ";
      const w = Math.max(5, strWidth(label));
      const r = { x: x - Math.floor(w / 2), y: y - 1, w, h: 3 };
      const bg = on ? mix(c.accent, c.panel, 0.25) : c.panel;
      ui.box(r, { border: on ? "heavy" : "single", bg, fill: true, focused: on });
      ui.textCenter(r, y, label.trim(), { fg: s ? (on ? c.bg : c.fg) : c.faint, bg, attrs: on ? BOLD : 0 });
      ui.hit(r, {
        onClick: () => ((this.hot = i), s ? this.release() : void this.fillSlot(i)),
        tip: s ? s.cmd : t("an empty slot: click to give it a command · wheel add"),
      });
    }
  }

  /** An empty slot clicked: ask what it runs. */
  private async fillSlot(i: number): Promise<void> {
    const cmd = await this.deck.prompt(t("This slot runs… (a shell command)"), { placeholder: "launch todo · open notes/ideas.md · macro run ls" });
    if (!cmd?.trim()) return;
    const label = await this.deck.prompt(t("Its name"), { initial: cmd.trim().split(/\s+/).slice(-1)[0] });
    if (!label?.trim()) return;
    setWheelSlot(this.deck, this.page, i, { label: label.trim(), icon: "◆", cmd: cmd.trim() });
  }
}

/** Put a slot on the wheel (page / index), growing the pages as needed. */
export function setWheelSlot(deck: Deck, page: number, index: number, slot: WheelSlot | null): void {
  const pages = wheelPages(deck).map((p) => [...p]);
  while (pages.length <= page) pages.push([]);
  const p = pages[page];
  while (p.length < index) p.push({ label: "", icon: "", cmd: "" });
  if (slot) p[index] = slot;
  else p.splice(index, 1);
  // blank slots and pages that ended up empty go away (the wheel always offers one empty page to fill)
  deck.settings.set("gamepad", { ...(deck.settings.data.gamepad ?? {}), wheel: pages.map((q) => q.filter((s) => s.cmd)).filter((q) => q.length) });
}

/** The first free slot (a new page when they're all full). */
export function addToWheel(deck: Deck, slot: WheelSlot): { page: number; index: number } {
  const pages = wheelPages(deck);
  for (let pi = 0; pi < pages.length; pi++) if (pages[pi].length < SLOTS) return setWheelSlot(deck, pi, pages[pi].length, slot), { page: pi, index: pages[pi].length };
  setWheelSlot(deck, pages.length, 0, slot);
  return { page: pages.length, index: 0 };
}

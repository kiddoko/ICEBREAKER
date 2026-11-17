import { BOLD, type Rect } from "../core/grid";
import type { Action } from "../core/input";
import { strWidth } from "../core/unicode";
import type { Deck } from "../deck";
import { decrypt } from "../fx/glitch";
import { bigText, SMALL_LOGO } from "../ui/bigtext";
import type { UI } from "../ui/ui";
import type { App, AppSpec } from "./types";

interface Tile {
  icon: string;
  title: string;
  description: string;
  source: string;
  run(): void;
}

/**
 * MODULES — every app the deck can run: core apps and the ones plugins add.
 * (HOME is the widget dashboard; this is the launcher.)
 */
export class ModulesApp implements App {
  readonly kind = "modules";
  readonly key = "modules";
  private selected = 0;
  private cols = 1;
  private bornAt = performance.now();

  constructor(private readonly deck: Deck) {}

  title(): string {
    return "modules";
  }

  status(): string {
    return "←↑↓→ choose · enter launch · `plugin` in the shell to add more";
  }

  private tiles(): Tile[] {
    const d = this.deck;
    const tiles: Tile[] = d.apps
      .list()
      .filter((s) => s.launcher)
      .map((s) => ({ icon: s.icon ?? "◇", title: s.title, description: s.description ?? "", source: d.apps.sourceOf(s.kind) ?? "core", run: () => void d.openApp(s.kind) }));
    tiles.splice(1, 0, { icon: "✚", title: "New note", description: "blank page, any title", source: "core", run: () => void d.newNote() });
    tiles.push({ icon: "❯", title: "Shell", description: "the real deal", source: "core", run: () => d.workspace.focusShell() });
    tiles.push({ icon: "?", title: "Manual", description: "keys, pad, commands", source: "core", run: () => void d.openApp("help") });
    return tiles;
  }

  onAction(a: Action): boolean {
    const n = this.tiles().length;
    switch (a) {
      case "left": this.selected = (this.selected - 1 + n) % n; return true;
      case "right": this.selected = (this.selected + 1) % n; return true;
      case "up": this.selected = Math.max(0, this.selected - this.cols); return true;
      case "down": this.selected = Math.min(n - 1, this.selected + this.cols); return true;
      case "confirm": this.tiles()[this.selected]?.run(); return true;
      default: return false;
    }
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    let y = r.y + 1;
    const big = bigText("ICEBREAKER");
    const logo = r.w >= strWidth(big[0]) + 4 && r.h >= 26 ? big : SMALL_LOGO;
    const lx = r.x + Math.floor((r.w - strWidth(logo[0])) / 2);
    logo.forEach((line, i) => ui.gradientText(lx, y + i, line, ui.theme.gradient, BOLD, Math.sin(ui.now / 2400 + i * 0.15) * 0.08 + 0.08));
    y += logo.length + 1;
    const age = performance.now() - this.bornAt;
    const tagline = "// modules · plug in, jack in";
    if (age < 1000) ui.animate(40);
    ui.textCenter(r, y, age < 1000 ? decrypt(tagline, age / 1000, ui.now) : tagline, { fg: c.muted });
    y += 2;

    // Tiles are as wide as the longest text needs (so nothing gets cut), within reason.
    const tiles = this.tiles();
    const need = Math.max(...tiles.map((t) => Math.max(strWidth(t.title) + 4, strWidth(t.description)))) + 4;
    const tw = Math.max(20, Math.min(need, r.w - 4));
    const th = 4;
    this.cols = Math.max(1, Math.min(tiles.length, Math.floor((r.w - 4 + 2) / (tw + 2))));
    const gridW = this.cols * (tw + 2) - 2;
    const gx = r.x + Math.floor((r.w - gridW) / 2);
    this.selected = Math.min(this.selected, tiles.length - 1);
    tiles.forEach((t, i) => {
      const tx = gx + (i % this.cols) * (tw + 2);
      const ty = y + Math.floor(i / this.cols) * (th + 1);
      if (ty + th > r.y + r.h) return;
      const rect = { x: tx, y: ty, w: tw, h: th };
      const sel = (focused && i === this.selected) || ui.hovered(rect);
      const inner = ui.box(rect, { focused: sel, bg: sel ? c.panelAlt : c.panel, info: t.source === "core" ? undefined : "plugin" });
      ui.text(inner.x + 1, inner.y, `${t.icon}  ${t.title.toUpperCase()}`, { fg: sel ? c.accent : c.fg, attrs: BOLD }, inner.w - 1);
      ui.text(inner.x + 1, inner.y + 1, t.description, { fg: c.subtle }, inner.w - 1);
      ui.hit(rect, {
        onClick: () => {
          this.selected = i;
          t.run();
        },
      });
    });
  }
}

export const modulesSpec: AppSpec = {
  kind: "modules",
  title: "Modules",
  description: "every app and plugin on the deck",
  icon: "▦",
  create: (deck) => new ModulesApp(deck),
};

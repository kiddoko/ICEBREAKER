import { BOLD, DIM, type Rect } from "../core/grid";
import type { Action } from "../core/input";
import { strWidth } from "../core/unicode";
import type { Deck } from "../deck";
import { drawAmbient } from "../fx/ambient";
import { bigText, SMALL_LOGO } from "../ui/bigtext";
import { decrypt } from "../fx/glitch";
import type { UI } from "../ui/ui";
import { basename } from "../vault/paths";
import type { App, AppSpec } from "./types";

interface Tile {
  icon: string;
  title: string;
  description: string;
  run(): void;
}

/** HOME — the deck's dashboard: logo, launcher tiles, recent notes. */
export class HomeApp implements App {
  readonly kind = "home";
  readonly key = "home";
  private selected = 0;
  private bornAt = performance.now();
  private cols = 1;

  constructor(private readonly deck: Deck) {}

  title(): string {
    return "home";
  }

  status(): string {
    return "←↑↓→ choose · enter open · ctrl+k everything else";
  }

  private tiles(): Tile[] {
    const d = this.deck;
    const tiles: Tile[] = d.apps
      .list()
      .filter((s) => s.launcher)
      .map((s) => ({ icon: s.icon ?? "◇", title: s.title, description: s.description ?? "", run: () => void d.openApp(s.kind) }));
    tiles.splice(1, 0, {
      icon: "✚",
      title: "New note",
      description: "blank page, any title",
      run: () => void d.newNote(),
    });
    tiles.push({ icon: "❯", title: "Shell", description: "the real deal", run: () => d.workspace.focusShell() });
    tiles.push({ icon: "?", title: "Manual", description: "keys, pad, commands", run: () => void d.openApp("help") });
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
    if (this.deck.settings.data.fx.ambient) drawAmbient(ui, r, 0.9);

    // logo
    const big = bigText("ICEBREAKER");
    const logo = r.w >= strWidth(big[0]) + 4 && r.h >= 22 ? big : SMALL_LOGO;
    const lw = strWidth(logo[0]);
    const lx = r.x + Math.floor((r.w - lw) / 2);
    let y = r.y + Math.max(1, Math.floor(r.h * 0.08));
    const age = performance.now() - this.bornAt;
    logo.forEach((line, i) => {
      // sweeping shimmer across the gradient
      ui.gradientText(lx, y + i, line, ui.theme.gradient, BOLD, Math.sin(ui.now / 2400 + i * 0.15) * 0.08 + 0.08);
    });
    y += logo.length + 1;
    const tagline = "// open-source cyberdeck · notes · journal · neural link";
    const shown = age < 1400 ? decrypt(tagline, age / 1400, ui.now) : tagline;
    if (age < 1400) ui.animate(40);
    ui.textCenter(r, y, shown, { fg: c.muted });
    y += 2;

    // tiles
    const tiles = this.tiles();
    const tw = 22;
    const th = 4;
    this.cols = Math.max(1, Math.min(tiles.length, Math.floor((r.w - 4) / (tw + 2))));
    const gridW = this.cols * (tw + 2) - 2;
    const gx = r.x + Math.floor((r.w - gridW) / 2);
    this.selected = Math.min(this.selected, tiles.length - 1);
    tiles.forEach((t, i) => {
      const tx = gx + (i % this.cols) * (tw + 2);
      const ty = y + Math.floor(i / this.cols) * (th + 1);
      if (ty + th > r.y + r.h) return;
      const rect = { x: tx, y: ty, w: tw, h: th };
      const sel = (focused && i === this.selected) || ui.hovered(rect);
      const inner = ui.box(rect, { focused: sel, bg: sel ? c.panelAlt : c.panel });
      ui.text(inner.x + 1, inner.y, `${t.icon}  ${t.title.toUpperCase()}`, { fg: sel ? c.accent : c.fg, attrs: BOLD }, inner.w - 1);
      ui.text(inner.x + 1, inner.y + 1, t.description, { fg: c.subtle }, inner.w - 1);
      ui.hit(rect, {
        onClick: () => {
          this.selected = i;
          t.run();
        },
      });
    });
    const rows = Math.ceil(tiles.length / this.cols);
    y += rows * (th + 1) + 1;

    // recent notes
    const recent = [...this.deck.vault.markdown()].sort((a, b) => b.modified - a.modified).slice(0, 5);
    if (recent.length && y + 2 < r.y + r.h) {
      ui.text(gx, y, "RECENT", { fg: c.subtle, attrs: BOLD });
      recent.forEach((e, i) => {
        const ry = y + 1 + i;
        if (ry >= r.y + r.h - 1) return;
        const row = { x: gx, y: ry, w: gridW, h: 1 };
        const hot = ui.hovered(row);
        ui.text(gx, ry, hot ? "▸ " : "  ", { fg: c.accent });
        ui.text(gx + 2, ry, basename(e.path, ".md"), { fg: hot ? c.accent : c.fg }, 30);
        ui.textRight(gx + gridW, ry, `${e.path}  ${ago(e.modified)}`, { fg: c.faint, attrs: DIM });
        ui.hit(row, { onClick: () => void this.deck.openFile(e.path) });
      });
    }
  }
}

function ago(ms: number): string {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const homeSpec: AppSpec = {
  kind: "home",
  title: "Home",
  create: (deck) => new HomeApp(deck),
};

import { BOLD, type Rect } from "../core/grid";
import { IS_MAC, type Action, type ActionSource, type KeyInput, type MouseInput } from "../core/input";
import { strWidth } from "../core/unicode";
import type { App } from "../apps/types";
import type { Deck } from "../deck";
import { drawAmbient } from "../fx/ambient";
import { Rain } from "../fx/rain";
import { inside, type Hit, type UI } from "../ui/ui";
import { ConfirmDialog, Osk, Palette, PromptDialog, Toasts, type Overlay, type ToastKind } from "./overlays";
import { FxPanel } from "./fxpanel";
import { Sidebar } from "./sidebar";

export type Pane = "sidebar" | "main" | "shell";

/**
 * The desktop: top bar with tabs, file tree on the left, the active app in
 * the middle, the shell at the bottom, status bar, and overlays on top.
 * It also routes input: overlays first, then global shortcuts, then the
 * focused pane, then (if nobody used it) the key becomes an Action.
 *
 *   ┌ ◆ ICEBREAKER  1:home  2:journal ●  3:link ─────────── ◆ claude · 12:04 ┐
 *   │ ╭ vault ──────╮ ╭ journal ──────────────────────────────────────────╮ │
 *   │ │ ▾ journal   │ │                                                   │ │
 *   │ ╰─────────────╯ ╰───────────────────────────────────────────────────╯ │
 *   │ ╭ shell ──────────────────────────────────────────────────────────────╮│
 *   └ JOURNAL  journal/2026-11-17.md · ln 3 …            60fps · ^K · F1 ──┘
 */
export class Workspace {
  tabs: App[] = [];
  active = 0;
  focus: Pane = "main";
  sidebarVisible = true;
  shellVisible = true;
  private shellRatio = 0.3;
  overlays: Overlay[] = [];
  readonly toasts = new Toasts();
  readonly sidebar: Sidebar;
  private rects: Partial<Record<Pane, Rect>> = {};
  private dragging: Hit | null = null;

  constructor(private readonly deck: Deck) {
    this.sidebar = new Sidebar(deck);
  }

  get activeApp(): App | undefined {
    return this.tabs[this.active];
  }

  // ── tabs ─────────────────────────────────────────────────────────────────

  /** Show an app; if one with the same key is open, switch to it instead. */
  open(app: App): App {
    const existing = this.tabs.findIndex((t) => t.key === app.key);
    if (existing >= 0) {
      void app.close?.();
      this.active = existing;
    } else {
      this.tabs.splice(this.active + 1, 0, app);
      this.active = Math.min(this.tabs.length - 1, this.active + 1);
      if (this.tabs.length === 1) this.active = 0;
    }
    this.focus = "main";
    const opened = this.tabs[this.active];
    if (opened.kind === "note") this.sidebar.reveal(opened.key.slice(5));
    return opened;
  }

  findTab(key: string): App | undefined {
    return this.tabs.find((t) => t.key === key);
  }

  async closeTab(i = this.active): Promise<void> {
    const app = this.tabs[i];
    if (!app) return;
    if ((await app.close?.()) === false) return;
    this.tabs.splice(i, 1);
    if (this.active >= this.tabs.length) this.active = Math.max(0, this.tabs.length - 1);
    if (this.tabs.length === 0) this.deck.openApp("home");
    this.deck.requestFrame();
  }

  switchTab(i: number): void {
    if (this.tabs.length === 0) return;
    this.active = ((i % this.tabs.length) + this.tabs.length) % this.tabs.length;
    this.focus = "main";
  }

  // ── panes ────────────────────────────────────────────────────────────────

  toggleShell(show = !this.shellVisible): void {
    this.shellVisible = show;
    if (show) this.focus = "shell";
    else if (this.focus === "shell") this.focus = "main";
  }

  focusShell(): void {
    if (!this.shellVisible || this.focus !== "shell") {
      this.shellVisible = true;
      this.focus = "shell";
    } else this.focus = "main";
  }

  toggleSidebar(): void {
    this.sidebarVisible = !this.sidebarVisible;
    if (this.sidebarVisible) this.focus = "sidebar";
    else if (this.focus === "sidebar") this.focus = "main";
  }

  private moveFocus(dir: "left" | "right" | "up" | "down"): void {
    if (dir === "left" && this.sidebarVisible) this.focus = "sidebar";
    else if (dir === "right" && this.focus === "sidebar") this.focus = "main";
    else if (dir === "down" && this.shellVisible) this.focus = "shell";
    else if (dir === "up" && this.focus === "shell") this.focus = "main";
  }

  private cycleFocus(): void {
    const order: Pane[] = ["main", ...(this.shellVisible ? (["shell"] as Pane[]) : []), ...(this.sidebarVisible ? (["sidebar"] as Pane[]) : [])];
    this.focus = order[(order.indexOf(this.focus) + 1) % order.length];
  }

  // ── overlays ─────────────────────────────────────────────────────────────

  push(o: Overlay): void {
    this.overlays.push(o);
  }

  get topModal(): Overlay | undefined {
    return [...this.overlays].reverse().find((o) => o.modal);
  }

  palette(): void {
    if (this.overlays.some((o) => o instanceof Palette)) return;
    this.push(new Palette(() => this.deck.paletteEntries()));
  }

  fxPanel(): void {
    if (!this.overlays.some((o) => o instanceof FxPanel)) this.push(new FxPanel(this.deck));
  }

  toggleOsk(): void {
    const osk = this.overlays.find((o) => o instanceof Osk);
    if (osk) osk.done = true;
    else
      this.push(
        new Osk(
          (t) => this.routeText(t, true),
          (key) => this.routeKey({ key, code: "", ctrl: false, alt: false, shift: false, meta: false, combo: key }, true),
        ),
      );
  }

  confirm(title: string, detail = ""): Promise<boolean> {
    return new Promise((resolve) => this.push(new ConfirmDialog(title, detail, resolve)));
  }

  prompt(title: string, opts: { initial?: string; placeholder?: string; mask?: boolean } = {}): Promise<string | null> {
    return new Promise((resolve) => this.push(new PromptDialog(title, opts, resolve)));
  }

  notify(text: string, kind: ToastKind = "info"): void {
    this.toasts.push(text, kind);
  }

  screensaver(): void {
    this.push(new Screensaver());
  }

  // ── input routing ────────────────────────────────────────────────────────

  private paneTarget(): { onKey?(k: KeyInput): boolean; onText?(t: string): boolean; onAction?(a: Action): boolean } | undefined {
    if (this.focus === "shell" && this.shellVisible) return this.deck.shell;
    if (this.focus === "sidebar" && this.sidebarVisible) return this.sidebar;
    return this.activeApp;
  }

  handleKey(k: KeyInput): void {
    const modal = this.topModal;
    if (modal) {
      modal.onKey?.(k);
      return;
    }
    if (this.globalKey(k)) return;
    this.routeKey(k, false);
  }

  /** Key → focused pane → fallback Action. `fromOsk` skips global shortcuts. */
  private routeKey(k: KeyInput, fromOsk: boolean): void {
    const modal = fromOsk ? this.topModal : undefined;
    if (modal) {
      modal.onKey?.(k);
      return;
    }
    const target = this.paneTarget();
    if (target?.onKey?.(k)) return;
    const fallback: Record<string, Action> = {
      up: "up", down: "down", left: "left", right: "right", enter: "confirm", esc: "back",
      pageup: "page-up", pagedown: "page-down", home: "home", end: "end",
    };
    const a = !k.ctrl && !k.alt ? fallback[k.key] : undefined;
    if (a) this.handleAction(a, "keyboard");
  }

  handleText(t: string): void {
    this.routeText(t, false);
  }

  private routeText(t: string, _fromOsk: boolean): void {
    const modal = this.topModal;
    if (modal) {
      modal.onText?.(t);
      return;
    }
    this.paneTarget()?.onText?.(t);
  }

  handleAction(a: Action, source: ActionSource): void {
    // The on-screen keyboard eats gamepad input while open, even above dialogs.
    const osk = this.overlays.find((o) => o instanceof Osk && !o.done);
    if (osk?.onAction?.(a, source)) return;
    for (const o of [...this.overlays].reverse()) {
      if (o === osk) continue;
      if (o.onAction?.(a, source)) return;
      if (o.modal) return;
    }
    if (this.paneTarget()?.onAction?.(a)) return;

    switch (a) {
      case "palette": this.palette(); break;
      case "osk": this.toggleOsk(); break;
      case "tab-next": this.switchTab(this.active + 1); break;
      case "tab-prev": this.switchTab(this.active - 1); break;
      case "focus-next": this.cycleFocus(); break;
      case "menu": this.deck.openApp("home"); break;
      case "back":
        if (this.focus !== "main") this.focus = "main";
        break;
    }
  }

  /** App-wide shortcuts. Uses physical key codes where layouts differ (AZERTY…). */
  private globalKey(k: KeyInput): boolean {
    const d = this.deck;
    const c = k.combo;
    if (c === "ctrl+k" || c === "ctrl+p") return this.palette(), true;
    if (c === "ctrl+j") return void d.openJournal(new Date()), true;
    if (c === "ctrl+n") return void d.newNote(), true;
    if (c === "ctrl+space") return void d.openApp("link"), true;
    if (c === "ctrl+b") return this.toggleSidebar(), true;
    if (c === "ctrl+w") return void this.closeTab(), true;
    if (c === "ctrl+tab") return this.switchTab(this.active + 1), true;
    if (c === "ctrl+shift+tab") return this.switchTab(this.active - 1), true;
    if (c === "ctrl+," ) return void d.openApp("settings"), true;
    if (c === "f1") return void d.openApp("help"), true;
    if (c === "f11") return void d.toggleFullscreen(), true;
    if (c === "f12" || (k.ctrl && !k.shift && k.code === "Backquote")) return this.focusShell(), true;
    // Pane focus: Alt+arrows (macOS: ⌘⌥+arrows, since ⌥+arrows jumps words there)
    const paneMod = IS_MAC ? k.ctrl && k.alt : k.alt && !k.ctrl;
    if (paneMod && ["left", "right", "up", "down"].includes(k.key)) return this.moveFocus(k.key as "left"), true;
    // Tabs: Alt+1…9 or Ctrl+1…9 (macOS: ⌘1…9)
    const tabMod = (k.alt && !k.ctrl && !IS_MAC) || (k.ctrl && !k.alt);
    if (tabMod && /^Digit[1-9]$/.test(k.code)) return this.switchTab(Number(k.code.slice(5)) - 1), true;
    if (k.ctrl && (k.code === "Equal" || k.code === "NumpadAdd" || k.key === "+")) return d.zoom(1), true;
    if (k.ctrl && (k.code === "Minus" || k.code === "NumpadSubtract" || k.key === "-")) return d.zoom(-1), true;
    if (k.ctrl && (k.code === "Digit0" || k.code === "Numpad0")) return d.zoom(0), true;
    return false;
  }

  handleMouse(m: MouseInput, hits: Hit[]): void {
    const pick = (want: (h: Hit) => boolean) => {
      for (let i = hits.length - 1; i >= 0; i--) if (inside(hits[i].rect, m.x, m.y) && want(hits[i])) return hits[i];
      return undefined;
    };
    switch (m.kind) {
      case "down": {
        if (!this.topModal) {
          for (const pane of ["sidebar", "main", "shell"] as Pane[]) {
            const r = this.rects[pane];
            if (r && inside(r, m.x, m.y)) this.focus = pane;
          }
        }
        const h = pick((x) => !!(x.onClick || x.onDrag));
        this.dragging = h ?? null;
        h?.onClick?.(m);
        break;
      }
      case "drag":
        this.dragging?.onDrag?.(m);
        break;
      case "up":
        this.dragging = null;
        break;
      case "dblclick":
        pick((x) => !!x.onDouble)?.onDouble?.(m);
        break;
      case "wheel":
        pick((x) => !!x.onWheel)?.onWheel?.(m.delta);
        break;
    }
  }

  // ── drawing ──────────────────────────────────────────────────────────────

  render(ui: UI): void {
    const d = this.deck;
    const W = ui.cols;
    const H = ui.rows;
    if (d.settings.data.fx.ambient) drawAmbient(ui, { x: 0, y: 0, w: W, h: H }, 0.7);

    this.renderTopBar(ui, { x: 0, y: 0, w: W, h: 1 });

    const body = { x: 1, y: 1, w: W - 2, h: H - 2 };
    let shellH = 0;
    if (this.shellVisible) shellH = Math.max(5, Math.min(body.h - 8, Math.round(body.h * this.shellRatio)));
    const top = { x: body.x, y: body.y, w: body.w, h: body.h - shellH };
    const sideW = this.sidebarVisible ? Math.max(20, Math.min(34, Math.round(W * 0.18))) : 0;

    this.rects = {};
    if (this.sidebarVisible) {
      const r = { x: top.x, y: top.y, w: sideW, h: top.h };
      this.rects.sidebar = r;
      const inner = ui.box(r, { title: "VAULT", focused: this.focus === "sidebar", info: `${d.vault.markdown().length}` });
      this.sidebar.render(ui, inner, this.focus === "sidebar");
    }

    const mainR = { x: top.x + (sideW ? sideW + 1 : 0), y: top.y, w: top.w - (sideW ? sideW + 1 : 0), h: top.h };
    this.rects.main = mainR;
    const app = this.activeApp;
    const mainFocused = this.focus === "main" && !this.topModal;
    const inner = ui.box(mainR, { title: app ? app.title().toUpperCase() : "", focused: mainFocused, info: app?.kind === "note" ? app.key.slice(5) : app?.kind });
    if (app) ui.clip(inner, () => app.render(ui, inner, mainFocused));

    if (this.shellVisible) {
      const r = { x: body.x, y: top.y + top.h, w: body.w, h: shellH };
      this.rects.shell = r;
      const shellFocused = this.focus === "shell" && !this.topModal;
      const si = ui.box(r, { title: "SHELL", focused: shellFocused, info: "ibsh · ctrl+` toggle" });
      ui.clip(si, () => d.shell.render(ui, si, shellFocused));
      // drag the top border to resize
      const handle = { x: r.x + 12, y: r.y, w: r.w - 40, h: 1 };
      ui.hit(handle, {
        onClick: () => {},
        onDrag: (m) => {
          const fromBottom = body.y + body.h - m.y;
          this.shellRatio = Math.max(0.15, Math.min(0.8, fromBottom / body.h));
        },
      });
    }

    this.renderStatusBar(ui, { x: 0, y: H - 1, w: W, h: 1 });

    const screen = { x: 0, y: 0, w: W, h: H };
    this.overlays = this.overlays.filter((o) => !o.done);
    // the on-screen keyboard is drawn last so it stays clickable above dialogs
    for (const o of this.overlays) if (!(o instanceof Osk)) o.render(ui, screen);
    for (const o of this.overlays) if (o instanceof Osk) o.render(ui, screen);
    this.toasts.render(ui, screen);
  }

  private renderTopBar(ui: UI, r: Rect): void {
    const c = ui.c;
    const d = this.deck;
    ui.fill(r, { bg: c.panelAlt });
    let x = ui.text(r.x, r.y, " ", { bg: c.panelAlt });
    x = ui.gradientText(x, r.y, "◆ ICEBREAKER", ui.theme.gradient, BOLD, (ui.now / 8000) % 1);
    x += 2;

    // right side first, so tabs know how much room they have
    const now = new Date();
    const time = now.toLocaleTimeString(d.settings.data.user.locale || undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const date = now.toLocaleDateString(d.settings.data.user.locale || undefined, { weekday: "short", day: "numeric", month: "short" });
    ui.animate(1000 - now.getMilliseconds());
    const ai = d.ai.ready ? `◆ ${d.ai.provider.label}` : "○ offline";
    const right = ` ${ai}  │  ${date}  ${time} `;
    const rx = r.x + r.w - strWidth(right);
    ui.text(rx, r.y, right, { fg: c.muted, bg: c.panelAlt });
    ui.text(rx + 1, r.y, ai, { fg: d.ai.ready ? c.accent : c.error, bg: c.panelAlt });
    ui.hit({ x: rx, y: r.y, w: strWidth(ai) + 2, h: 1 }, { onClick: () => void d.openApp("link") });

    this.tabs.forEach((t, i) => {
      const label = ` ${i + 1}:${t.title()}${t.dirty?.() ? " ●" : ""} `;
      const w = strWidth(label);
      if (x + w + 2 > rx - 1) return;
      const rect = { x, y: r.y, w: w + 1, h: 1 };
      const isActive = i === this.active;
      const hot = ui.hovered(rect);
      const style = isActive
        ? { fg: c.panel, bg: c.accent, attrs: BOLD }
        : { fg: hot ? c.fg : c.muted, bg: hot ? c.highlight : c.panelAlt };
      x = ui.text(x, r.y, label, style);
      // close button
      const closeX = x;
      ui.text(closeX, r.y, isActive || hot ? "×" : " ", { fg: isActive ? c.panel : c.subtle, bg: style.bg });
      ui.hit(rect, { onClick: () => this.switchTab(i) });
      ui.hit({ x: closeX, y: r.y, w: 1, h: 1 }, { onClick: () => void this.closeTab(i) });
      x += 2;
    });
    if (x + 3 < rx) {
      ui.text(x, r.y, "+", { fg: c.subtle, bg: c.panelAlt, attrs: BOLD });
      ui.hit({ x, y: r.y, w: 1, h: 1 }, { onClick: () => this.palette() });
    }
  }

  private renderStatusBar(ui: UI, r: Rect): void {
    const c = ui.c;
    const d = this.deck;
    ui.fill(r, { bg: c.statusBg });
    const pane = this.focus === "main" ? (this.activeApp?.kind ?? "deck") : this.focus === "sidebar" ? "vault" : "shell";
    let x = ui.text(r.x, r.y, ` ${pane.toUpperCase()} `, { fg: c.panel, bg: c.accent, attrs: BOLD });
    x = ui.text(x, r.y, "", { fg: c.accent, bg: c.statusBg });
    const status = this.focus === "shell" ? d.shell.status() : this.focus === "sidebar" ? "enter open · n new note · r rescan" : (this.activeApp?.status?.() ?? "");

    // right side
    const parts: { text: string; fg: number; onClick?: () => void }[] = [];
    if (d.gamepad.connected) parts.push({ text: "◈ pad", fg: c.success });
    parts.push({ text: "⌨", fg: this.overlays.some((o) => o instanceof Osk) ? c.accent : c.muted, onClick: () => this.toggleOsk() });
    parts.push({ text: "✦ fx", fg: c.accentAlt, onClick: () => this.fxPanel() });
    if (d.settings.data.appearance.showFps) parts.push({ text: `${d.loop.fps}fps ${d.loop.frameMs.toFixed(1)}ms`, fg: c.subtle });
    parts.push({ text: "^K palette", fg: c.muted, onClick: () => this.palette() });
    parts.push({ text: "F1 help", fg: c.muted, onClick: () => void d.openApp("help") });
    const rightW = parts.reduce((s, p) => s + strWidth(p.text) + 3, 0);
    let rx = r.x + r.w - rightW;
    ui.text(x + 1, r.y, status, { fg: c.statusFg, bg: c.statusBg }, Math.max(0, rx - x - 3));
    for (const p of parts) {
      const w = strWidth(p.text);
      ui.text(rx, r.y, "│ ", { fg: c.faint, bg: c.statusBg });
      ui.text(rx + 2, r.y, p.text, { fg: p.onClick && ui.hovered({ x: rx + 2, y: r.y, w, h: 1 }) ? c.accent : p.fg, bg: c.statusBg });
      if (p.onClick) ui.hit({ x: rx + 2, y: r.y, w, h: 1 }, { onClick: p.onClick });
      rx += w + 3;
    }
  }
}

/** Full-screen rain; any input brings you back. */
class Screensaver implements Overlay {
  modal = true;
  done = false;
  private rain = new Rain(1.2);
  onKey(): boolean {
    return (this.done = true);
  }
  onText(): boolean {
    return (this.done = true);
  }
  onAction(): boolean {
    return (this.done = true);
  }
  render(ui: UI, screen: Rect): void {
    ui.fill(screen, { bg: ui.c.bg });
    this.rain.render(ui, screen);
    ui.hit(screen, { onClick: () => (this.done = true), onWheel: () => {} });
  }
}

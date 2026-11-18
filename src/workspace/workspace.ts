import { drawScreensaver } from "../fx/screensaver";
import { IbshApp, TerminalApp } from "../apps/terminal";
import { t } from "../core/i18n";
import { BOLD, type Rect } from "../core/grid";
import { IS_MAC, type Action, type ActionSource, type KeyInput, type MouseInput } from "../core/input";
import { strWidth } from "../core/unicode";
import type { App } from "../apps/types";
import type { Deck } from "../deck";
import { drawBackground } from "../fx/backgrounds";
import { inside, q, type Hit, type MenuEntry, type MenuItem, type UI } from "../ui/ui";
import { copyToClipboard, readClipboard } from "../core/clipboard";
import { ContextMenu } from "./contextmenu";
import { ConfirmDialog, Osk, Palette, PromptDialog, Toasts, type Overlay, type ToastKind, ChooseDialog } from "./overlays";
import type { ChoiceOption } from "../plugins/api";
import { FxPanel } from "./fxpanel";
import { Sidebar } from "./sidebar";
import { SystemTerminal } from "../shell/systerm";

export type ShellTab = "term" | "ibsh" | "history";

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
  /** Hover tooltip: what's under the mouse and since when. */
  private tip = { key: "", since: 0 };
  tipHidden = false;
  /** where the text cursor was last frame (the menu key opens the menu there) */
  private lastCaret: { x: number; y: number } | null = null;
  /** The shell panel's tabs: your system terminal, ibsh, what clicks ran. */
  shellTab: ShellTab = "ibsh";
  private shellTabChosen = false;
  /** your system terminals (tabs in the shell panel; + adds one) */
  terms: SystemTerminal[] = [];
  termIndex = 0;
  get sysTerm(): SystemTerminal | null {
    return this.terms[this.termIndex] ?? null;
  }

  /** One more system terminal, shown at once. */
  newTerminal(): void {
    if (!this.termAvailable) return this.deck.notify(this.deck.platform.pty ? "the shell panel is in ibsh mode (term mode system)" : "needs the desktop app", "warning");
    this.terms.push(new SystemTerminal(this.deck));
    this.termIndex = this.terms.length - 1;
    this.showShellTab("term");
  }

  /** Ask for a new name for terminal i (right-click on its tab, or `term rename`). */
  async renameTerminal(i = this.termIndex): Promise<void> {
    const tm = this.terms[i];
    if (!tm) return;
    const v = await this.deck.prompt("Terminal name", { initial: tm.name });
    if (v?.trim()) void this.deck.act(`term rename ${i + 1} ${q(v.trim())}`);
  }

  /** Close terminal i (default: the one shown); its shell is killed. */
  closeTerminal(i = this.termIndex): void {
    const t = this.terms[i];
    if (!t) return;
    t.dispose();
    this.terms.splice(i, 1);
    this.termIndex = Math.max(0, Math.min(this.termIndex, this.terms.length - 1));
    if (!this.terms.length && this.shellTab === "term") this.showShellTab("ibsh");
  }
  /** The shell takes the big area; the active page moves to the strip below. */
  shellMax = false;

  /**
   * ⤢ maximize: the shell shown in the panel becomes a big tab after the
   * others (the page you were on stays a tab); the panel folds away. `term dock`
   * (or ⤓ in its status) puts a terminal back in the panel.
   */
  toggleShellMax(): void {
    if (this.shellTab === "term" && this.termAvailable && this.terms.length) {
      const [tm] = this.terms.splice(this.termIndex, 1);
      this.termIndex = Math.max(0, Math.min(this.termIndex, this.terms.length - 1));
      this.open(new TerminalApp(this.deck, tm));
    } else this.open(new IbshApp(this.deck));
    this.shellVisible = false;
    this.focus = "main";
  }

  /** A terminal tab goes back to the shell panel (same session). */
  dockTerminal(): void {
    const app = this.activeApp;
    if (app instanceof TerminalApp) {
      app.docked = true;
      this.terms.push(app.term);
      this.termIndex = this.terms.length - 1;
      void this.closeTab().then(() => this.showShellTab("term"));
    } else if (app instanceof IbshApp) void this.closeTab().then(() => this.showShellTab("ibsh"));
  }

  /** Type a macro into the system terminal (asking for its {blanks} first). */
  async runMacro(m: { label: string; cmd: string }): Promise<void> {
    let cmd = m.cmd;
    for (const hole of [...new Set(cmd.match(/\{[^}]+\}/g) ?? [])]) {
      const v = await this.deck.prompt(`${m.label}: ${hole.slice(1, -1)}`, { placeholder: hole.slice(1, -1) });
      if (v === null) return;
      cmd = cmd.split(hole).join(q(v.trim() || "."));
    }
    this.showShellTab("term");
    if (!this.terminal.alive) return this.deck.notify("the terminal isn't running", "error");
    this.terminal.write(`${cmd}\r`);
  }

  private async editMacro(i: number): Promise<void> {
    const list = [...this.deck.settings.data.shell.macros];
    const cur = list[i];
    const label = await this.deck.prompt(i < 0 ? "New macro — button label" : "Label (empty = delete this macro)", { initial: cur?.label ?? "", placeholder: "deploy" });
    if (label === null) return;
    if (!label.trim()) {
      if (cur) void this.deck.act(`macro rm ${q(cur.label)}`);
      return;
    }
    const cmd = await this.deck.prompt(`Command for "${label.trim()}" — {name} asks for a value`, { initial: cur?.cmd ?? "", placeholder: "git pull && npm run build" });
    if (!cmd?.trim()) return;
    if (cur && cur.label !== label.trim()) await this.deck.act(`macro rm ${q(cur.label)}`);
    void this.deck.act(`macro add ${q(label.trim())} ${q(cmd.trim())}`);
  }

  /** The system terminal is on (desktop + setting shell.mode = system). */
  get termAvailable(): boolean {
    return !!this.deck.platform.pty && this.deck.settings.data.shell.mode === "system";
  }

  private get terminal(): SystemTerminal {
    if (!this.terms.length) this.terms.push(new SystemTerminal(this.deck));
    return this.terms[Math.min(this.termIndex, this.terms.length - 1)];
  }

  showShellTab(t: ShellTab): void {
    if (t === "term" && !this.termAvailable) t = "ibsh";
    this.shellTab = t;
    this.shellTabChosen = true;
    this.shellVisible = true;
    this.focus = "shell";
  }

  isShellTab(t: ShellTab): boolean {
    return this.shellVisible && this.shellTab === t;
  }

  private cycleShellTab(): void {
    // every terminal, then ibsh, then history
    if (this.shellTab === "term" && this.termIndex < this.terms.length - 1) return (this.termIndex++, this.showShellTab("term"));
    const tabs: ShellTab[] = [...(this.termAvailable ? (["term"] as ShellTab[]) : []), "ibsh", "history"];
    const next = tabs[(tabs.indexOf(this.shellTab) + 1) % tabs.length];
    if (next === "term") this.termIndex = 0;
    this.showShellTab(next);
  }

  /** Tabs in the order they were looked at (keys), for esc → back. */
  private visited: string[] = [];

  constructor(private readonly deck: Deck) {
    this.sidebar = new Sidebar(deck);
  }

  get activeApp(): App | undefined {
    return this.tabs[this.active];
  }

  // ── tabs ─────────────────────────────────────────────────────────────────

  /**
   * Pages reached from the buttons top-right (NEXUS, STORE, MODULES, settings):
   * they show in the main area without a tab of their own, and go away when you
   * go anywhere else. One at a time, kept last in `tabs`.
   */
  static readonly PAGES = new Set(["modules", "store", "explorer", "settings"]);
  /** the tab to come back to when the page closes */
  private pageReturn = 0;

  /** the open button-page, if any (always the last of `tabs`) */
  get page(): App | undefined {
    const last = this.tabs[this.tabs.length - 1];
    return last && Workspace.PAGES.has(last.kind) ? last : undefined;
  }

  /** the real tabs (what the tab bar shows and 1…9 count) */
  get tabCount(): number {
    return this.tabs.length - (this.page ? 1 : 0);
  }

  /** Close the button-page without going anywhere. */
  private dropPage(): void {
    const p = this.page;
    if (!p) return;
    void p.close?.();
    this.tabs.pop();
    this.active = Math.max(0, Math.min(this.pageReturn, this.tabs.length - 1));
  }

  /** Show an app; if one with the same key is open, switch to it instead. */
  open(app: App): App {
    if (Workspace.PAGES.has(app.kind)) {
      const cur = this.page;
      if (cur?.key === app.key) {
        void app.close?.();
        this.active = this.tabs.length - 1;
      } else {
        if (cur) this.dropPage();
        else this.pageReturn = this.active;
        this.tabs.push(app);
        this.active = this.tabs.length - 1;
      }
      this.focus = "main";
      return this.tabs[this.active];
    }
    if (this.page) this.dropPage();
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
    const wasPage = app === this.page;
    this.tabs.splice(i, 1);
    // closing the tab you're on shows the one before it (in tab order)
    if (wasPage) this.active = Math.max(0, Math.min(this.pageReturn, this.tabs.length - 1));
    else if (i < this.active || (i === this.active && i > 0)) this.active--;
    if (this.active >= this.tabs.length) this.active = Math.max(0, this.tabs.length - 1);
    if (this.tabs.length === 0) this.deck.openApp("home");
    this.deck.requestFrame();
  }

  /** shift+esc (or a page's esc): close it and show the tab before it (HOME stays). */
  async closeAndGoBack(): Promise<void> {
    const app = this.activeApp;
    if (!app || app.kind === "home") return;
    await this.closeTab(this.active);
    this.deck.pageTurn();
  }

  private noteVisit(): void {
    const key = this.activeApp?.key;
    if (!key || this.visited[this.visited.length - 1] === key) return;
    this.visited = [...this.visited.filter((k) => k !== key), key].slice(-30);
  }

  switchTab(i: number): void {
    // leaving a button-page closes it (it's not a tab)
    if (this.page && i !== this.tabs.length - 1) this.dropPage();
    const n = this.tabCount || this.tabs.length;
    if (n === 0) return;
    const next = ((i % n) + n) % n;
    if (next !== this.active) this.deck.pageTurn();
    this.active = next;
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

  /** An interactive shell command asks something: make sure it's seen. */
  focusShellIfHidden(): void {
    this.shellVisible = true;
    this.focus = "shell";
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
    return [...this.overlays].reverse().find((o) => o.modal && !o.done);
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

  choose(title: string, options: ChoiceOption[], selected = 0): Promise<number | null> {
    return new Promise((resolve) => this.push(new ChooseDialog(title, options, selected, resolve)));
  }

  prompt(title: string, opts: { initial?: string; placeholder?: string; mask?: boolean; suggestions?: string[] } = {}): Promise<string | null> {
    return new Promise((resolve) => this.push(new PromptDialog(title, opts, resolve)));
  }

  notify(text: string, kind: ToastKind = "info"): void {
    this.toasts.push(text, kind);
  }

  screensaver(): void {
    this.push(new Screensaver());
  }

  // ── right-click menus ────────────────────────────────────────────────────

  /**
   * Open a context menu at (x, y) with `items` for the thing clicked, then
   * the common lines: copy/paste where there's text, palette, shortcuts, settings.
   */
  openMenu(items: MenuEntry[], x: number, y: number, title?: string): void {
    for (const o of this.overlays) if (o instanceof ContextMenu) o.done = true;
    const has = (label: string) => items.some((e) => e !== "-" && e.label === label);
    const tail: MenuEntry[] = ["-"];
    if (!items.length && (this.focus === "main" || this.focus === "shell")) tail.push(...this.editMenu(), "-");
    if (!has(t("command palette"))) tail.push({ label: t("command palette"), cmd: "palette", hint: IS_MAC ? "⌘K" : "ctrl+K" });
    tail.push({ label: t("shortcuts"), cmd: "shortcuts", hint: IS_MAC ? "⌘/" : "ctrl+/" }, { label: t("settings"), cmd: "settings", hint: IS_MAC ? "⌘," : "ctrl+," });
    this.deck.sound.play("move");
    this.push(new ContextMenu([...items, ...tail], x, y, (it) => this.runMenuItem(it), title));
  }

  private runMenuItem(it: MenuItem): void {
    // the menu is gone before its action runs (so keys reach the page again)
    this.overlays = this.overlays.filter((o) => !o.done);
    this.deck.sound.play("confirm");
    if (it.cmd) void this.deck.act(it.cmd);
    else void Promise.resolve(it.run?.()).catch((e) => this.notify(String((e as Error)?.message ?? e), "error"));
    this.deck.requestFrame();
  }

  /** copy / cut / paste / select all, sent to whatever has the focus. */
  editMenu(opts: { copy?: boolean; cut?: boolean; selectAll?: boolean } = {}): MenuEntry[] {
    const m = IS_MAC ? "⌘" : "ctrl+";
    const key = (letter: string) => () =>
      this.routeKey({ key: letter, code: `Key${letter.toUpperCase()}`, ctrl: true, alt: false, shift: false, meta: false, combo: `ctrl+${letter}`, rawCtrl: !IS_MAC, rawMeta: IS_MAC }, false);
    const out: MenuEntry[] = [];
    if (opts.copy !== false) out.push({ label: t("copy"), run: key("c"), hint: `${m}C` });
    if (opts.cut !== false) out.push({ label: t("cut"), run: key("x"), hint: `${m}X` });
    out.push({ label: t("paste"), run: async () => { const txt = await readClipboard(); if (txt) this.handleText(txt); else this.notify(t("the clipboard is empty (or can't be read)"), "warning"); }, hint: `${m}V` });
    if (opts.selectAll !== false) out.push({ label: t("select all"), run: key("a"), hint: `${m}A` });
    return out;
  }

  /** The focused pane's own menu (empty spot, or the menu key). */
  private paneMenu(): MenuEntry[] {
    if (this.focus === "sidebar" && this.sidebarVisible) return this.sidebar.menu();
    if (this.focus === "shell" && this.shellVisible) return this.shellMenu();
    return this.activeApp?.menu?.() ?? [];
  }

  /** The menu key (or shift+F10, gamepad: hold select): the focused thing's menu, without the mouse. */
  private keyboardMenu(): void {
    const at = this.focus === "sidebar" && this.sidebarVisible ? this.sidebar.anchor() : null;
    const r = this.rects[this.focus] ?? { x: 2, y: 2, w: 10, h: 4 };
    const pos = at ?? this.lastCaret ?? { x: r.x + 2, y: r.y + 1 };
    this.openMenu(this.paneMenu(), pos.x, pos.y + 1);
  }

  /** Right-click on a terminal tab. */
  private termTabMenu(i: number): MenuEntry[] {
    return [
      { label: t("rename…"), run: () => this.renameTerminal(i), hint: "term rename" },
      { label: t("new terminal"), cmd: "term new" },
      { label: t("restart this shell"), run: () => { this.termIndex = i; void this.deck.act("term restart"); } },
      { label: t("open in a tab of its own"), run: () => { this.termIndex = i; void this.deck.act("term max"); } },
      "-",
      { label: t("close"), cmd: `term close ${i + 1}`, danger: true, disabled: this.terms.length < 2 },
    ];
  }

  /** Right-click in the shell panel. */
  private shellMenu(): MenuEntry[] {
    const term = this.shellTab === "term" && this.termAvailable;
    const items: MenuEntry[] = term
      ? [
          { label: t("copy"), run: () => void this.terminal.copySelection(), hint: IS_MAC ? "⌘C" : "ctrl+shift+C", disabled: !this.terminal.hasSelection() },
          ...this.editMenu({ copy: false, cut: false, selectAll: false }),
          { label: t("select all"), run: () => this.terminal.selectAll(), hint: IS_MAC ? "⌘A" : "" },
          "-",
        ]
      : [...this.editMenu(), "-"];
    if (term) items.push({ label: t("clear the screen"), run: () => void this.terminal.onKey({ key: "l", code: "KeyL", ctrl: true, alt: false, shift: false, meta: false, combo: "ctrl+l", rawCtrl: true, rawMeta: false }), hint: "ctrl+L" });
    else if (this.shellTab === "ibsh") items.push({ label: t("clear the screen"), cmd: "clear" });
    items.push(
      { label: t("new terminal"), cmd: "term new" },
      ...(term ? [{ label: t("rename…"), run: () => this.renameTerminal() } as MenuItem] : []),
      { label: t("scripts"), cmd: "script menu" },
      "-",
      { label: this.shellMax ? t("put back in the panel") : t("maximize"), cmd: this.shellMax ? "term dock" : "term max" },
      { label: t("hide the shell"), cmd: "term hide", hint: "ctrl+`" },
    );
    return items;
  }

  /** Right-click on a tab of the top bar. */
  private tabMenu(i: number): MenuEntry[] {
    const app = this.tabs[i];
    const note = app?.kind === "note" ? app.key.slice(5) : "";
    const items: MenuEntry[] = [
      { label: t("close"), cmd: `tab close ${i + 1}`, hint: IS_MAC ? "⌘W" : "ctrl+W" },
      { label: t("close the others"), run: () => this.closeMany((j) => j !== i), disabled: this.tabs.length < 2 },
      { label: t("close the ones on the right"), run: () => this.closeMany((j) => j > i), disabled: i >= this.tabs.length - 1 },
    ];
    if (note) {
      const pinned = (this.deck.settings.data.favorites ?? []).some((f) => f.target === note);
      items.push(
        "-",
        { label: t("show in the tree"), run: () => { if (!this.sidebarVisible) this.toggleSidebar(); this.sidebar.reveal(note); this.focus = "sidebar"; } },
        { label: pinned ? t("unpin") : t("pin"), cmd: `${pinned ? "unpin" : "pin"} ${q("/" + note)}` },
        { label: t("copy path"), run: () => (copyToClipboard(note), this.notify(t("path copied"))) },
      );
    }
    return items;
  }

  /** Close every tab `which` says, right to left (a tab can refuse: unsaved). */
  private async closeMany(which: (i: number) => boolean): Promise<void> {
    const keep = this.tabs[this.active];
    for (let j = this.tabs.length - 1; j >= 0; j--) if (which(j)) await this.closeTab(j);
    const i = keep ? this.tabs.indexOf(keep) : -1;
    if (i >= 0) this.switchTab(i);
  }

  // ── input routing ────────────────────────────────────────────────────────

  private paneTarget(): { onKey?(k: KeyInput): boolean; onText?(t: string): boolean; onAction?(a: Action): boolean } | undefined {
    if (this.focus === "shell" && this.shellVisible) {
      if (this.shellTab === "term" && this.termAvailable) return this.terminal;
      if (this.shellTab === "history") return this.deck.shell.historyPane;
      return this.deck.shell;
    }
    if (this.focus === "sidebar" && this.sidebarVisible) return this.sidebar;
    return this.activeApp;
  }

  handleKey(k: KeyInput): void {
    this.tipHidden = true;
    const modal = this.topModal;
    if (modal) {
      modal.onKey?.(k);
      return;
    }
    // shift+tab: the next part of the screen. Only a note may keep it (to unindent);
    // shells never get it (zsh/ibsh would open their completion instead)
    if (k.combo === "shift+tab") {
      if (this.focus === "main" && this.activeApp?.kind === "note" && this.activeApp.onKey?.(k)) return;
      return this.cycleFocus();
    }
    // the system terminal gets the keyboard (ctrl+c, ctrl+r, esc…); ⌘ shortcuts stay the deck's
    if (this.focus === "shell" && this.shellVisible && this.shellTab === "term" && this.termAvailable && this.terminal.wants(k)) {
      this.terminal.onKey(k);
      return;
    }
    // a terminal tab in the main window: same rule
    const ta = this.activeApp;
    if (this.focus === "main" && ta instanceof TerminalApp && ta.term.wants(k)) return void ta.term.onKey(k);
    if (k.combo === "contextmenu" || k.combo === "shift+f10") return this.keyboardMenu();
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
    // tab: the next thing on the screen (apps that don't say otherwise: the next line)
    else if (k.combo === "tab" && target && !target.onAction?.("item-next")) target.onAction?.("down");
  }

  handleText(t: string): void {
    this.tipHidden = true;
    this.routeText(t, false);
  }

  private routeText(t: string, _fromOsk: boolean): void {
    const modal = this.topModal;
    if (modal) {
      modal.onText?.(t);
      return;
    }
    if (this.paneTarget()?.onText?.(t)) return;
    // Nobody typing? `h` goes HOME from anywhere, 1…9 go to that tab.
    if (t === "h" || t === "H") this.deck.openApp("home");
    else if (/^[1-9]$/.test(t) && Number(t) <= this.tabCount) this.switchTab(Number(t) - 1);
  }

  handleAction(a: Action, source: ActionSource): void {
    const snd = this.deck.sound;
    if (a === "up" || a === "down" || a === "left" || a === "right" || a === "tab-next" || a === "tab-prev") snd.play("move");
    else if (a === "confirm") snd.play("confirm");
    else if (a === "back") snd.play("back");
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
      // esc: back to the page from the tree / shell; a button-page (NEXUS, STORE…) closes.
      // Tabs close with shift+esc (or ctrl+W), so a stray esc never loses one. The gamepad's B still closes.
      case "back":
        if (this.focus !== "main") this.focus = "main";
        else if (this.activeApp === this.page || source === "gamepad") void this.closeAndGoBack();
        break;
    }
  }

  /** App-wide shortcuts. Uses physical key codes where layouts differ (AZERTY…). */
  private globalKey(k: KeyInput): boolean {
    const d = this.deck;
    const c = k.combo;
    // your own shortcuts first (bind / the SHORTCUTS page)
    const mine = d.settings.data.keys?.[c];
    if (mine) return void d.act(mine), true;
    if (c === "ctrl+k" || c === "ctrl+p") return this.palette(), true;
    if (k.ctrl && !k.alt && (k.key === "/" || k.code === "Slash")) return void d.openApp("shortcuts"), true;
    if (c === "ctrl+shift+h") return void d.openApp("home"), true;
    if (c === "ctrl+shift+m") return void d.openApp("modules"), true;
    if (c === "ctrl+shift+n") return void d.newFolder(), true;
    if (c === "ctrl+shift+l") return void d.act("lock"), true;
    if (c === "ctrl+j") return void d.openJournal(new Date()), true;
    if (c === "ctrl+n") return void d.newNote(), true;
    if (c === "ctrl+space") return void d.openApp("link"), true;
    if (c === "ctrl+b") return this.toggleSidebar(), true;
    if (c === "ctrl+w") return void this.closeTab(), true;
    if (c === "shift+esc") return void this.closeAndGoBack(), true;
    if (c === "ctrl+tab") return this.switchTab(this.active + 1), true;
    if (c === "ctrl+shift+tab") return this.switchTab(this.active - 1), true;
    if (c === "ctrl+," ) return void d.openApp("settings"), true;
    if (c === "f1") return void d.openApp("help"), true;
    if (c === "f11") return void d.toggleFullscreen(), true;
    if (c === "f12") return this.focus === "shell" && this.shellVisible ? this.cycleShellTab() : this.focusShell(), true;
    if (k.ctrl && !k.shift && k.code === "Backquote") return this.focusShell(), true;
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
    // right-click outside an open menu: that menu goes, the click lands on what's under it
    const open = this.overlays.find((o): o is ContextMenu => o instanceof ContextMenu && !o.done);
    if (open && m.kind === "down" && m.button === 2 && !open.contains(m.x, m.y)) {
      open.done = true;
      hits = hits.slice(0, open.hitStart);
    }
    const pick = (want: (h: Hit) => boolean) => {
      for (let i = hits.length - 1; i >= 0; i--) {
        if (!inside(hits[i].rect, m.x, m.y)) continue;
        if (want(hits[i])) return hits[i];
        if (hits[i].block) return undefined; // a modal: clicks don't fall through to what's behind
      }
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
        if (m.button === 2) {
          this.tipHidden = true;
          const h = pick((x) => !!(x.onRight || x.menu));
          if (h?.menu && !this.topModal) this.openMenu(h.menu(m), m.x, m.y);
          else if (h?.onRight) h.onRight(m);
          else if (!this.topModal) this.openMenu(this.paneMenu(), m.x, m.y);
          break;
        }
        const h = pick((x) => !!(x.onClick || x.onDrag || x.cmd));
        if (h?.onClick || h?.cmd) this.deck.sound.play("move");
        this.dragging = h ?? null;
        this.tipHidden = true;
        h?.onClick?.(m);
        if (h?.cmd) void this.deck.act(h.cmd);
        break;
      }
      case "drag":
        this.dragging?.onDrag?.(m);
        break;
      case "up":
        this.dragging?.onUp?.(m);
        this.dragging = null;
        break;
      case "dblclick":
        pick((x) => !!x.onDouble)?.onDouble?.(m);
        break;
      case "wheel":
        this.tipHidden = true;
        pick((x) => !!x.onWheel)?.onWheel?.(m.delta);
        break;
    }
  }

  // ── drawing ──────────────────────────────────────────────────────────────

  render(ui: UI): void {
    const d = this.deck;
    this.noteVisit();
    const W = ui.cols;
    const H = ui.rows;
    if (d.settings.data.fx.ambient) drawBackground(ui, { x: 0, y: 0, w: W, h: H }, ui.theme, 0.7);

    this.renderTopBar(ui, { x: 0, y: 0, w: W, h: 1 });

    const body = { x: 1, y: 1, w: W - 2, h: H - 2 };
    let shellH = 0;
    if (this.shellVisible) shellH = Math.max(5, Math.min(body.h - 8, Math.round(body.h * this.shellRatio)));
    const top = { x: body.x, y: body.y, w: body.w, h: body.h - shellH };
    const max = this.shellVisible && this.shellMax;
    const stripH = Math.max(6, Math.round(body.h * 0.3));
    const sideW = this.sidebarVisible ? Math.max(20, Math.min(34, Math.round(W * 0.18))) : 0;
    const right = { x: body.x + (sideW ? sideW + 1 : 0), w: body.w - (sideW ? sideW + 1 : 0) };

    this.rects = {};
    if (this.sidebarVisible) {
      const r = { x: top.x, y: top.y, w: sideW, h: max ? body.h : top.h };
      this.rects.sidebar = r;
      const inner = ui.box(r, { title: "VAULT", focused: this.focus === "sidebar", info: `${d.vault.markdown().length}` });
      this.sidebar.render(ui, inner, this.focus === "sidebar");
    }

    // maximized shell: the page goes to the strip at the bottom
    const mainR = max ? { x: right.x, y: body.y + body.h - stripH, w: right.w, h: stripH } : { x: top.x + (sideW ? sideW + 1 : 0), y: top.y, w: top.w - (sideW ? sideW + 1 : 0), h: top.h };
    this.rects.main = mainR;
    const app = this.activeApp;
    const mainFocused = this.focus === "main" && !this.topModal;
    const inner = ui.box(mainR, { title: app ? t(app.title()).toUpperCase() : "", focused: mainFocused, info: app?.kind === "note" ? app.key.slice(5) : app && app.kind !== app.title().toLowerCase() ? app.kind : undefined });
    if (app?.menu) ui.hit(inner, { menu: () => app.menu!() });
    if (app) ui.clip(inner, () => app.render(ui, inner, mainFocused));

    if (this.shellVisible) {
      const r = max ? { x: right.x, y: body.y, w: right.w, h: body.h - stripH } : { x: body.x, y: top.y + top.h, w: body.w, h: shellH };
      this.rects.shell = r;
      const shellFocused = this.focus === "shell" && !this.topModal;
      const c = ui.c;
      if (!this.shellTabChosen && this.termAvailable) this.shellTab = "term";
      if (this.shellTab === "term" && !this.termAvailable) this.shellTab = "ibsh";
      const si = ui.box(r, { focused: shellFocused, info: t("F12 tabs · ctrl+` toggle") });
      // tabs on the top border: your shell · ibsh · history
      if (this.termAvailable && !this.terms.length) this.terms.push(new SystemTerminal(d));
      const tabs: [ShellTab, string, number][] = [
        ...(this.termAvailable ? this.terms.map((tm, i) => ["term", tm.name, i] as [ShellTab, string, number]) : []),
        ["ibsh", "ibsh", -1],
        ["history", d.shell.unseen ? `${t("history")} •${d.shell.unseen}` : t("history"), -1],
      ];
      let tx = r.x + 2;
      for (const [id, label, ti] of tabs) {
        const on = id === this.shellTab && (ti < 0 || ti === this.termIndex);
        const text = on ? ` ${ui.theme.glyphs.mark} ${label} ` : ` ${label} `;
        const rect = { x: tx, y: r.y, w: strWidth(text), h: 1 };
        const style = on ? (shellFocused ? { fg: c.titleFocus, bg: c.panel, attrs: BOLD } : { fg: c.fg, bg: c.panel, attrs: BOLD }) : { fg: ui.hovered(rect) ? c.accent : c.title, bg: c.panel };
        ui.text(tx, r.y, text, style);
        ui.hit(rect, { onClick: () => (ti >= 0 && (this.termIndex = ti), this.showShellTab(id)), menu: ti >= 0 ? () => this.termTabMenu(ti) : undefined, tip: id === "term" ? `right-click: rename, close… · term rename <name>\n${this.terms[ti]?.shellName ?? ""}: your real shell, with ICEBREAKER's commands added (ib <cmd> forces one)` : id === "ibsh" ? "ICEBREAKER's own shell: works on the vault, rm goes to .trash" : "what clicks ran, with their output" });
        tx += rect.w + 1;
        // + a new terminal, after the last one · × close the one shown (when there are several)
        if (id === "term" && ti === this.terms.length - 1) {
          if (this.terms.length > 1 && this.shellTab === "term") {
            const xr = { x: tx - 1, y: r.y, w: 3, h: 1 };
            ui.text(xr.x, r.y, " × ", { fg: ui.hovered(xr) ? c.error : c.subtle, bg: c.panel });
            ui.hit(xr, { cmd: "term close", tip: "close this terminal" });
            tx += 3;
          }
          const pr = { x: tx, y: r.y, w: 3, h: 1 };
          ui.text(pr.x, r.y, " + ", { fg: ui.hovered(pr) ? c.accent : c.subtle, bg: c.panel });
          ui.hit(pr, { cmd: "term new", tip: "another terminal" });
          tx += 4;
        }
      }
      // ≡ scripts: your saved shell scripts, one click to run
      const slabel = ` ≡ ${t("scripts")} `;
      const sr = { x: tx, y: r.y, w: strWidth(slabel), h: 1 };
      ui.text(sr.x, r.y, slabel, { fg: ui.hovered(sr) ? c.accent : c.title, bg: c.panel });
      ui.hit(sr, { cmd: "script menu", tip: "your scripts (.icebreaker/scripts) · script new <name>" });
      tx += sr.w + 1;
      // ▾ fold the panel away (ctrl+` brings it back)
      const hlabel = ` ▾ ${t("hide")} `;
      const hr = { x: tx, y: r.y, w: strWidth(hlabel), h: 1 };
      ui.text(hr.x, r.y, hlabel, { fg: ui.hovered(hr) ? c.accent : c.title, bg: c.panel });
      ui.hit(hr, { cmd: "term hide", tip: "fold the shell away · ctrl+` brings it back" });
      tx += hr.w + 1;
      // ⤢ maximize / ⤡ restore: drawn like the tabs next to it
      const mlabel = ` ⤢ ${t("maximize")} `;
      const mx = { x: tx, y: r.y, w: strWidth(mlabel), h: 1 };
      ui.text(mx.x, r.y, mlabel, { fg: ui.hovered(mx) ? c.accent : c.title, bg: c.panel });
      ui.hit(mx, { cmd: "term max", tip: "this shell becomes a big tab (term dock puts it back)" });
      tx += mx.w + 1;
      // macro bar above the system terminal (one free row under the tabs)
      let termR = si;
      if (this.shellTab === "term" && this.termAvailable && si.h > 6) {
        const my = si.y + 1;
        termR = { ...si, y: si.y + 3, h: si.h - 3 };
        let bx = si.x;
        this.deck.settings.data.shell.macros.forEach((m, i) => {
          const label = ` ${m.label} `;
          const rect = { x: bx, y: my, w: strWidth(label), h: 1 };
          if (bx + rect.w > si.x + si.w - 4) return;
          const hot = ui.hovered(rect);
          ui.text(bx, my, label, hot ? { fg: c.panel, bg: c.accent, attrs: BOLD } : { fg: c.fg, bg: c.highlight });
          ui.hit(rect, { onClick: (mi) => void (mi.shift ? this.editMacro(i) : this.runMacro(m)), tip: `${m.cmd}\nshift+click: edit · macro rm ${m.label}` });
          bx += rect.w + 1;
        });
        const plus = { x: bx, y: my, w: 3, h: 1 };
        ui.text(bx, my, " + ", { fg: ui.hovered(plus) ? c.accent : c.subtle, bg: c.highlight, attrs: BOLD });
        ui.hit(plus, { onClick: () => void this.editMacro(-1), tip: "new macro · or: macro add <label> <command>" });
      }
      ui.hit(si, { menu: () => this.shellMenu() });
      ui.clip(si, () => {
        if (this.shellTab === "term") this.terminal.render(ui, termR, shellFocused);
        else if (this.shellTab === "history") d.shell.renderHistory(ui, si);
        else d.shell.render(ui, si, shellFocused);
      });
      // drag the top border to resize
      const handle = { x: tx + 2, y: r.y, w: max ? 0 : Math.max(0, r.x + r.w - 30 - tx), h: 1 };
      ui.hit(handle, {
        onClick: () => {},
        onDrag: (m) => {
          const fromBottom = body.y + body.h - m.y;
          this.shellRatio = Math.max(0.15, Math.min(0.8, fromBottom / body.h));
        },
      });
    }

    this.renderStatusBar(ui, { x: 0, y: H - 1, w: W, h: 1 });
    this.renderSubtitles(ui, W, H);

    const screen = { x: 0, y: 0, w: W, h: H };
    this.overlays = this.overlays.filter((o) => !o.done);
    // the on-screen keyboard is drawn last so it stays clickable above dialogs
    for (const o of this.overlays) if (!(o instanceof Osk)) o.render(ui, screen);
    for (const o of this.overlays) if (o instanceof Osk) o.render(ui, screen);
    this.toasts.render(ui, screen);
    this.renderTip(ui, screen);
    if (ui.caret) this.lastCaret = { ...ui.caret };
  }

  /** After ~0.6 s on something clickable: its shell command and a tip. */
  private renderTip(ui: UI, screen: Rect): void {
    const { x, y } = ui.mouse;
    let h: Hit | undefined;
    for (let i = ui.hits.length - 1; i >= 0; i--) {
      const it = ui.hits[i];
      if (!inside(it.rect, x, y) || !(it.onClick || it.onDrag || it.cmd || it.tip)) continue;
      h = it.cmd || it.tip ? it : undefined;
      break;
    }
    const key = h ? `${h.rect.x},${h.rect.y},${h.rect.w},${h.cmd ?? ""},${h.tip ?? ""}` : "";
    if (key !== this.tip.key) {
      this.tip = { key, since: ui.now };
      this.tipHidden = false;
    }
    if (!h || this.tipHidden) return;
    const wait = 650 - (ui.now - this.tip.since);
    if (wait > 0) return ui.animate(wait);
    const c = ui.c;
    const lines: { t: string; fg: number; attrs?: number }[] = [];
    if (h.cmd) lines.push({ t: `❯ ${h.cmd}`, fg: c.accent, attrs: BOLD });
    if (h.tip) for (const l of h.tip.split("\n")) lines.push({ t: l, fg: c.muted });
    const w = Math.min(screen.w - 2, Math.max(...lines.map((l) => strWidth(l.t))) + 4);
    const hgt = lines.length + 2;
    let bx = Math.min(x + 2, screen.w - w - 1);
    let by = y + 1;
    if (by + hgt > screen.h - 1) by = Math.max(0, y - hgt);
    if (bx < 0) bx = 0;
    ui.box({ x: bx, y: by, w, h: hgt }, { bg: c.panelAlt, border: "single" });
    lines.forEach((l, i) => ui.text(bx + 2, by + 1 + i, l.t, { fg: l.fg, bg: c.panelAlt, attrs: l.attrs }, w - 4));
  }

  private renderTopBar(ui: UI, r: Rect): void {
    const c = ui.c;
    const d = this.deck;
    ui.fill(r, { bg: c.panelAlt });
    let x = ui.text(r.x, r.y, " ", { bg: c.panelAlt });
    x = ui.gradientText(x, r.y, `${ui.theme.glyphs.mark} ICEBREAKER`, ui.theme.gradient, BOLD, (ui.now / 8000) % 1);
    x += 2;

    // right side first, so tabs know how much room they have
    const now = new Date();
    const time = now.toLocaleTimeString(d.settings.data.user.locale || undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const date = now.toLocaleDateString(d.settings.data.user.locale || undefined, { weekday: "short", day: "numeric", month: "short" });
    ui.animate(1000 - now.getMilliseconds());
    const ai = d.ai.ready ? `${ui.theme.glyphs.mark} ${d.ai.provider.label}` : `○ ${t("offline")}`;
    // settings stay one click away whatever is open
    const gear = ` ⚙ ${t("settings")} `;
    const right = ` ${ai}  │  ${date}  ${time} `;
    const rx = r.x + r.w - strWidth(right);
    const gx = rx - strWidth(gear) - 1;
    const gearRect = { x: gx, y: r.y, w: strWidth(gear), h: 1 };
    const gearHot = ui.hovered(gearRect) || this.activeApp?.kind === "settings";
    ui.text(gx, r.y, gear, { fg: gearHot ? c.panel : c.muted, bg: gearHot ? c.accent : c.highlight });
    ui.hit(gearRect, { cmd: "settings", tip: "ctrl+, · or `config list` in the shell" });
    // the places you go all the time, one click away
    let nx = gx - 1;
    const nav: [string, string, string, string][] = [
      ["modules", `▦ ${t("modules")}`, "launch modules", "all apps and modules · m on HOME"],
      ["store", `⇣ ${t("store")}`, "store", "modules and themes from GitHub · store in the shell"],
      ["explorer", `⬡ ${t("nexus")}`, "launch explorer", "the vault in 3D · explore in the shell"],
    ];
    // a narrow window: the buttons shrink to their icon so the tabs keep their room
    const tabsW = this.tabs.slice(0, this.tabCount).reduce((n, tb, i) => n + strWidth(` ${i + 1}:${tb.title().toLowerCase()} `) + 1, 0) + 4;
    const navW = nav.filter(([k]) => d.apps.get(k)).reduce((n, [, label]) => n + strWidth(label) + 3, 0);
    const compact = x + tabsW > gx - navW;
    for (const [kind, full, cmd, tip] of nav) {
      if (!d.apps.get(kind)) continue; // its module is off or removed
      const label = compact ? full.split(" ")[0] : full;
      const lw = strWidth(label) + 2;
      nx -= lw;
      const rect = { x: nx, y: r.y, w: lw, h: 1 };
      const on = ui.hovered(rect) || this.activeApp?.kind === kind;
      ui.text(nx, r.y, ` ${label} `, { fg: on ? c.panel : c.muted, bg: on ? c.accent : c.highlight });
      ui.hit(rect, { cmd, tip: compact ? `${full.slice(2)} · ${tip}` : tip });
      nx -= 1;
    }
    ui.text(rx, r.y, right, { fg: c.muted, bg: c.panelAlt });
    ui.text(rx + 1, r.y, ai, { fg: d.ai.ready ? c.accent : c.error, bg: c.panelAlt });
    ui.hit({ x: rx, y: r.y, w: strWidth(ai) + 2, h: 1 }, d.ai.ready ? { cmd: "link", tip: "ctrl+space · or `chat` right here in the shell" } : { cmd: "settings", tip: `AI offline: ${d.ai.problem ?? ""}` });

    // the button-pages (NEXUS, STORE…) have no tab: their button lights up instead
    this.tabs.slice(0, this.tabCount).forEach((t, i) => {
      const label = ` ${i + 1}:${t.title().toLowerCase()}${t.dirty?.() ? " ●" : ""} `;
      const w = strWidth(label);
      if (x + w + 2 > nx) return;
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
      ui.hit(rect, { cmd: `tab ${i + 1}`, tip: `${IS_MAC ? `⌘${i + 1}` : `ctrl+${i + 1}`} · right-click: close others…`, menu: () => this.tabMenu(i) });
      ui.hit({ x: closeX, y: r.y, w: 1, h: 1 }, { cmd: `tab close ${i + 1}`, tip: "ctrl+w · shift+esc closes it" });
      x += 2;
    });
    if (x + 3 < gx) {
      ui.text(x, r.y, "+", { fg: c.subtle, bg: c.panelAlt, attrs: BOLD });
      ui.hit({ x, y: r.y, w: 1, h: 1 }, { cmd: "palette", tip: "ctrl+k: open anything" });
    }
  }

  /** What the voice says, in a small sci-fi box bottom-right (voice.subtitles). */
  private renderSubtitles(ui: UI, W: number, H: number): void {
    const sub = this.deck.voice.subtitle;
    if (!sub || this.deck.settings.data.voice.subtitles === false) return;
    const c = ui.c;
    const w = Math.min(46, W - 4);
    const words = sub.text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const wd of words) {
      if (strWidth(line + " " + wd) > w - 9 && line) (lines.push(line), (line = wd));
      else line = line ? `${line} ${wd}` : wd;
    }
    lines.push(line);
    const shown = lines.slice(0, 3);
    const h = shown.length + 2;
    const r = { x: W - w - 2, y: H - h - 2, w, h };
    ui.box(r, { title: "VOICE", focused: true, bg: c.panelAlt });
    // a little orbit spinning, the AI thinking out loud
    const t = ui.now / 120;
    const orbit = ["◜", "◝", "◞", "◟"];
    ui.text(r.x + 2, r.y + 1, orbit[Math.floor(t) % 4], { fg: c.accent, attrs: BOLD, bg: c.panelAlt });
    ui.text(r.x + 3, r.y + 1, orbit[Math.floor(t + 2) % 4], { fg: c.accentAlt, bg: c.panelAlt });
    const wave = "▁▂▃▅▃▂";
    ui.text(r.x + 2, r.y + 2, [...Array(3)].map((_, i) => wave[Math.floor(t + i * 2) % wave.length]).join(""), { fg: c.accent, bg: c.panelAlt });
    // the words type in
    const typed = Math.floor((ui.now - sub.at) / 28);
    let left = typed;
    shown.forEach((l, i) => {
      const part = l.slice(0, Math.max(0, left));
      left -= l.length + 1;
      ui.text(r.x + 7, r.y + 1 + i, part, { fg: c.fg, bg: c.panelAlt }, w - 9);
    });
    ui.animate(60);
  }

  private renderStatusBar(ui: UI, r: Rect): void {
    const c = ui.c;
    const d = this.deck;
    ui.fill(r, { bg: c.statusBg });
    const pane = this.focus === "main" ? (this.activeApp?.kind ?? "deck") : this.focus === "sidebar" ? "vault" : "shell";
    let x = ui.text(r.x, r.y, ` ${pane.toUpperCase()} `, { fg: c.panel, bg: c.accent, attrs: BOLD });
    x = ui.text(x, r.y, "", { fg: c.accent, bg: c.statusBg });
    const status = this.focus === "shell" && this.shellTab === "term" && this.termAvailable
      ? `${this.sysTerm?.shellName ?? "terminal"} · ctrl = Control (nano: ctrl+X quits) · ⌘C ⌘V copy/paste · ⌘K palette · F12 tabs`
      : this.focus === "shell" ? d.shell.status() : this.focus === "sidebar" ? "enter open · n new note · r rescan" : (this.activeApp?.status?.() ?? "");

    // right side
    const parts: { text: string; fg: number; cmd?: string; tip?: string }[] = [];
    if (d.settings.data.privacy.stealth) parts.push({ text: `◉ ${t("stealth")}`, fg: c.success, cmd: "stealth", tip: t("100 % local: no internet · stealth off") });
    if (d.voice.speaking) parts.push({ text: `◖ ${t("voice")}`, fg: c.accentAlt, cmd: "voice stop", tip: t("speaking · click to stop") });
    if (d.gamepad.connected) parts.push({ text: "◈ pad", fg: c.success });
    parts.push(this.shellVisible ? { text: "▾ shell", fg: c.muted, cmd: "term hide", tip: "fold the shell away · ctrl+`" } : { text: "▴ shell", fg: c.accent, cmd: "term show", tip: "bring the shell back · ctrl+`" });
    parts.push({ text: "⌨", fg: this.overlays.some((o) => o instanceof Osk) ? c.accent : c.muted, cmd: "osk", tip: "on-screen keyboard · pad: X" });
    parts.push({ text: "✦ fx", fg: c.accentAlt, cmd: "view fx", tip: "bloom, scanlines… · `fx` in the shell" });
    const muted = !!d.settings.data.sound.muted;
    parts.push({ text: muted ? "⊘ mute" : "♪", fg: muted ? c.error : c.muted, cmd: "mute", tip: muted ? t("muted: click to hear things again") : t("mute everything (sounds, voice, alerts)") });
    parts.push({ text: "☾", fg: c.muted, cmd: "screensaver", tip: t("screensaver now (any key brings you back)") });
    if (d.settings.data.appearance.showFps) parts.push({ text: `${d.loop.fps}fps ${d.loop.frameMs.toFixed(1)}ms`, fg: c.subtle });
    parts.push({ text: `^K ${t("palette")}`, fg: c.muted, cmd: "palette" });
    parts.push({ text: `F1 ${t("help")}`, fg: c.muted, cmd: "manual" });
    const rightW = parts.reduce((s, p) => s + strWidth(p.text) + 3, 0);
    let rx = r.x + r.w - rightW;
    ui.text(x + 1, r.y, status, { fg: c.statusFg, bg: c.statusBg }, Math.max(0, rx - x - 3));
    for (const p of parts) {
      const w = strWidth(p.text);
      ui.text(rx, r.y, "│ ", { fg: c.faint, bg: c.statusBg });
      ui.text(rx + 2, r.y, p.text, { fg: p.cmd && ui.hovered({ x: rx + 2, y: r.y, w, h: 1 }) ? c.accent : p.fg, bg: c.statusBg });
      if (p.cmd) ui.hit({ x: rx + 2, y: r.y, w, h: 1 }, { cmd: p.cmd, tip: p.tip });
      rx += w + 3;
    }
  }
}

/** Full-screen rain; any input brings you back. */
class Screensaver implements Overlay {
  modal = true;
  done = false;
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
    drawScreensaver(ui, screen);
    ui.hit(screen, { onClick: () => (this.done = true), onWheel: () => {}, block: true });
  }
}

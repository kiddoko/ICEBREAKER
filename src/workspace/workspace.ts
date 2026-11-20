import { RecoveryDialog } from "./recoverydialog";
import { editMenu, shellMenu } from "./menus";
import { editBand, renderNotchBand, renderShellPanel, renderStatusBar, renderSubtitles, renderTip, renderTopBar } from "./chrome";
import { shortcutFor, type Shortcut } from "../core/shortcuts";
import { SidePanel } from "./sidepanel";
import { LogPane } from "./logpane";
import { Tour } from "./tour";
import { KeyCapture } from "./keycapture";
import { QuickMenu } from "./quickmenu";
import { drawScreensaver } from "../fx/screensaver";
import { IbshApp, TerminalApp } from "../apps/terminal";
import { t } from "../core/i18n";
import { type Rect } from "../core/grid";
import { IS_MAC, type Action, type ActionSource, type KeyInput, type MouseInput } from "../core/input";
import type { App } from "../apps/types";
import type { Deck } from "../deck";
import { drawBackground } from "../fx/backgrounds";
import { inside, q, type Hit, type MenuEntry, type MenuItem, type UI } from "../ui/ui";
import { ContextMenu } from "./contextmenu";
import { ConfirmDialog, Osk, PromptDialog, Toasts, type MessageOptions, type Overlay, type PromptOptions, type ToastKind, ChooseDialog } from "./overlays";
import type { ChoiceOption } from "../plugins/api";
import { FxPanel } from "./fxpanel";
import { Sidebar } from "./sidebar";
import { unplaceSquares } from "./favorites";
import { SystemTerminal } from "../shell/systerm";

export type ShellTab = "term" | "ibsh" | "log";

/** the parts of the screen that can have the focus (the side panel only while shown) */
export type Pane = "sidebar" | "main" | "shell" | "panel";

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
  /** the shell panel is shown (and the TERMINAL module is on: core-packages.ts) */
  get shellVisible(): boolean {
    return this.shellShown && this.terminalOn;
  }
  set shellVisible(v: boolean) {
    this.shellShown = v;
  }
  private shellShown = true;
  /** the TERMINAL module (core-packages.ts): off, there's no shell panel */
  terminalOn = true;
  setTerminalModule(on: boolean): void {
    this.terminalOn = on;
    if (!on && this.focus === "shell") this.focus = "main";
    this.deck.requestFrame();
  }
  shellRatio = 0.3;
  overlays: Overlay[] = [];
  readonly toasts = new Toasts();
  readonly sidebar: Sidebar;
  /** where each pane was drawn this frame (the mouse and the side panel use them) */
  rects: Partial<Record<Pane, Rect>> = {};
  private dragging: Hit | null = null;
  /** Hover tooltip: what's under the mouse and since when. */
  tip = { key: "", since: 0 };
  tipHidden = false;
  /** where the text cursor was last frame (the menu key opens the menu there) */
  private lastCaret: { x: number; y: number } | null = null;
  /** The shell panel's tabs: your system terminal, ibsh, what clicks ran. */
  shellTab: ShellTab = "ibsh";
  /** edit mode: HOME and the side panel are rearranged together (e on either, esc ends it) */
  get editing(): boolean {
    // going to another page or module ends it
    if (this._editing && this._editingOn !== this.activeApp) this._editing = false;
    return this._editing;
  }
  set editing(on: boolean) {
    this._editing = on;
    this._editingOn = on ? this.activeApp : undefined;
  }
  private _editing = false;
  /** the page edit mode started on */
  private _editingOn: unknown;
  shellTabChosen = false;
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



  /** The system terminal is on (desktop + setting shell.mode = system). */
  get termAvailable(): boolean {
    return !!this.deck.platform.pty && this.deck.settings.data.shell.mode === "system";
  }

  get terminal(): SystemTerminal {
    if (!this.terms.length) this.terms.push(new SystemTerminal(this.deck));
    return this.terms[Math.min(this.termIndex, this.terms.length - 1)];
  }

  showShellTab(t: ShellTab): void {
    if (!this.terminalOn) return this.terminalOff();
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
    const tabs: ShellTab[] = [...(this.termAvailable ? (["term"] as ShellTab[]) : []), "ibsh", "log"];
    const next = tabs[(tabs.indexOf(this.shellTab) + 1) % tabs.length];
    if (next === "term") this.termIndex = 0;
    this.showShellTab(next);
  }

  /** Tabs in the order they were looked at (keys), for esc → back. */
  private visited: string[] = [];

  constructor(readonly deck: Deck) {
    this.logPane = new LogPane(deck);
    this.sidebar = new Sidebar(deck);
    this.sidePanel = new SidePanel(deck);
    // a note (or a folder) sent to the trash: nothing keeps showing it
    deck.vault.events.on("trashed", ({ path, dest }) => this.letGo(path, dest));
  }

  /**
   * `path` went to the trash (now at `dest`): its tabs close — without writing it back —
   * and its pins (and their squares on HOME) go, in the same ⌘Z step as the trash
   * (vault.trash groups them). Undoing brings the note and its pins back, not the tab.
   */
  private letGo(path: string, dest: string): void {
    const under = (p: string) => p === path || p.startsWith(`${path}/`);
    const gone = this.tabs.filter((t) => t.kind === "note" && under(t.key.slice(5)));
    for (const tab of gone) {
      const i = this.tabs.indexOf(tab);
      void (tab as App & { discard?: (dest: string) => Promise<void> }).discard?.(dest + tab.key.slice(5 + path.length));
      if (tab === this.previewTab) this.previewTab = null;
      this.tabs.splice(i, 1);
      if (i < this.active || (i === this.active && i > 0)) this.active--;
    }
    if (gone.length) {
      this.visited = this.visited.filter((k) => !(k.startsWith("note:") && under(k.slice(5))));
      if (this.active >= this.tabs.length) this.active = Math.max(0, this.tabs.length - 1);
      if (!this.tabs.length) this.deck.openApp("home");
    }
    const pins = this.deck.settings.data.favorites ?? [];
    const keep = pins.filter((f) => !((f.kind === "note" || f.kind === "folder") && under(f.target)));
    if (keep.length !== pins.length) {
      this.deck.settings.set("favorites", keep);
      unplaceSquares(this.deck, pins.filter((f) => !keep.includes(f)));
    }
    this.deck.requestFrame();
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
  static readonly PAGES = new Set(["modules", "store", "explorer", "settings", "trash"]);
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
  /** the side panel on the right (◧): widgets always in view — see sidepanel.ts */
  readonly sidePanel: SidePanel;
  /** where the side panel is this frame (null: hidden) — HOME drops widgets on it */
  get panelArea(): Rect | null {
    return this.sidePanel.area;
  }
  /** a HOME widget is being dragged over the side panel (its key and the pointer's line), or not */
  set panelDrop(at: { key: string; y: number } | null) {
    this.sidePanel.dropHint = at;
  }
  panelAdd(): Promise<void> {
    return this.sidePanel.pick();
  }

  /** the tab the tree's wheel preview made (the next file replaces it) */
  private previewTab: App | null = null;

  /**
   * Show a note at once, in place (the tree's wheel): no transition, focus stays
   * where it is. A preview tab is reused while it's untouched; a note already
   * open is just brought forward.
   */
  previewNote(path: string): void {
    const key = `note:${path}`;
    const existing = this.tabs.findIndex((t) => t.key === key);
    if (existing >= 0) return void (this.active = existing);
    const spec = this.deck.apps.get("note");
    if (!spec) return;
    const app = spec.create(this.deck, path);
    if (this.page) this.dropPage();
    const at = this.previewTab ? this.tabs.indexOf(this.previewTab) : -1;
    if (at >= 0 && !this.previewTab?.dirty?.()) {
      void this.tabs[at].close?.();
      this.tabs[at] = app;
      this.active = at;
    } else {
      this.tabs.splice(this.active + 1, 0, app);
      this.active = Math.min(this.tabs.length - 1, this.active + 1);
    }
    this.previewTab = app;
  }

  open(app: App): App {
    if (this.deck.log.debugOn) this.deck.debug(`opened ${app.kind}`);
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
      if (this.tabs[existing] === this.previewTab) this.previewTab = null; // opened on purpose: it stays
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

  /** `quick`: a swipe or a mouse side button (an even shorter transition). */
  switchTab(i: number, quick = false): void {
    // leaving a button-page closes it (it's not a tab)
    if (this.page && i !== this.tabs.length - 1) this.dropPage();
    const n = this.tabCount || this.tabs.length;
    if (n === 0) return;
    const next = ((i % n) + n) % n;
    if (next !== this.active) this.deck.pageTurn(false, quick);
    this.active = next;
    this.focus = "main";
  }

  // ── panes ────────────────────────────────────────────────────────────────

  toggleShell(show = !this.shellVisible): void {
    if (!this.terminalOn) return this.terminalOff();
    this.shellVisible = show;
    if (show) this.focus = "shell";
    else if (this.focus === "shell") this.focus = "main";
  }

  /** the TERMINAL module is off: say so once, where to get it back */
  private terminalOff(): void {
    this.deck.notify(t("the TERMINAL module is off — MODULES switches it on"), "info");
  }

  focusShell(): void {
    if (!this.terminalOn) return this.terminalOff();
    if (!this.shellVisible || this.focus !== "shell") {
      this.shellVisible = true;
      this.focus = "shell";
    } else this.focus = "main";
  }

  /** An interactive shell command asks something: make sure it's seen. */
  focusShellIfHidden(): void {
    if (!this.terminalOn) return;
    this.shellVisible = true;
    this.focus = "shell";
  }

  toggleSidebar(): void {
    this.sidebarVisible = !this.sidebarVisible;
    if (this.sidebarVisible) this.focus = "sidebar";
    else if (this.focus === "sidebar") this.focus = "main";
  }

  private moveFocus(dir: "left" | "right" | "up" | "down"): void {
    if (dir === "left" && this.focus === "panel") this.focus = "main";
    else if (dir === "left" && this.sidebarVisible) this.focus = "sidebar";
    else if (dir === "right" && this.focus === "sidebar") this.focus = "main";
    else if (dir === "right" && this.focus === "main" && this.sidePanel.area) this.focus = "panel";
    else if (dir === "down" && this.shellVisible) this.focus = "shell";
    else if (dir === "up" && this.focus === "shell") this.focus = "main";
  }

  private cycleFocus(): void {
    const order: Pane[] = ["main", ...(this.sidePanel.area ? (["panel"] as Pane[]) : []), ...(this.shellVisible ? (["shell"] as Pane[]) : []), ...(this.sidebarVisible ? (["sidebar"] as Pane[]) : [])];
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
    this.menu();
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

  /** `preselected` false: enter answers no unless you choose yes (questions whose safe answer is no) */
  confirm(title: string, detail = "", preselected = true): Promise<boolean> {
    return new Promise((resolve) => this.push(new ConfirmDialog(title, detail, resolve, undefined, preselected)));
  }

  /** A message with one ok button (overlays.ts ConfirmDialog in message mode). */
  message(title: string, detail = "", opts: MessageOptions = {}): Promise<void> {
    return new Promise((resolve) => this.push(new ConfirmDialog(title, detail, () => resolve(), opts)));
  }

  choose(title: string, options: ChoiceOption[], selected = 0): Promise<number | null> {
    return new Promise((resolve) => this.push(new ChooseDialog(title, options, selected, resolve)));
  }

  /** The recovery key's 24 words in a window: copy all, one word typed back to close (workspace/recoverydialog.ts). */
  recoveryWords(words: string): Promise<void> {
    return new Promise((resolve) => this.push(new RecoveryDialog(words, resolve)));
  }

  prompt(title: string, opts: PromptOptions = {}): Promise<string | null> {
    return new Promise((resolve) => this.push(new PromptDialog(title, opts, resolve)));
  }

  notify(text: string, kind: ToastKind = "info"): void {
    this.toasts.push(text, kind);
  }

  screensaver(): void {
    this.push(new Screensaver());
  }

  // ── the log tab ──────────────────────────────────────────────────────

  /** the shell's LOG tab (workspace/logpane.ts), made in the constructor */
  readonly logPane: LogPane;

  // ── right-click menus ────────────────────────────────────────────────────

  /**
   * Open a context menu at (x, y) with `items` for the thing clicked — only
   * those (THE MENU, the shortcuts and the settings have their keys: ⌘K, ⌘/, ⌘,).
   * On text with nothing of its own: copy / paste.
   */
  openMenu(items: MenuEntry[], x: number, y: number, title?: string): void {
    for (const o of this.overlays) if (o instanceof ContextMenu) o.done = true;
    // (the menu tidies its separators itself: workspace/contextmenu.ts tidy)
    const all = items.length ? items : this.focus === "main" || this.focus === "shell" ? editMenu(this) : [];
    if (!all.length) return;
    this.deck.sound.play("move");
    this.push(new ContextMenu(all, x, y, (it) => this.runMenuItem(it), title));
  }

  private runMenuItem(it: MenuItem): void {
    // the menu is gone before its action runs (so keys reach the page again)
    this.overlays = this.overlays.filter((o) => !o.done);
    this.deck.sound.play("confirm");
    if (it.cmd) void this.deck.act(it.cmd);
    else void Promise.resolve(it.run?.()).catch((e) => this.notify(String((e as Error)?.message ?? e), "error"));
    this.deck.requestFrame();
  }


  /** The focused pane's own menu (empty spot, or the menu key). */
  private paneMenu(): MenuEntry[] {
    if (this.focus === "sidebar" && this.sidebarVisible) return this.sidebar.menu();
    if (this.focus === "shell" && this.shellVisible) return shellMenu(this);
    return this.activeApp?.menu?.() ?? [];
  }

  /** The menu key (or shift+F10, gamepad: hold select): the focused thing's menu, without the mouse. */
  private keyboardMenu(): void {
    const at = this.focus === "sidebar" && this.sidebarVisible ? this.sidebar.anchor() : null;
    const r = this.rects[this.focus] ?? { x: 2, y: 2, w: 10, h: 4 };
    const pos = at ?? this.lastCaret ?? { x: r.x + 2, y: r.y + 1 };
    this.openMenu(this.paneMenu(), pos.x, pos.y + 1);
  }





  // ── input routing ────────────────────────────────────────────────────────

  private paneTarget(): { onKey?(k: KeyInput): boolean; onText?(t: string): boolean; onAction?(a: Action): boolean } | undefined {
    if (this.focus === "shell" && this.shellVisible) {
      if (this.shellTab === "term" && this.termAvailable) return this.terminal;
      if (this.shellTab === "log") return this.logPane;
      return this.deck.shell;
    }
    if (this.focus === "sidebar" && this.sidebarVisible) return this.sidebar;
    if (this.focus === "panel" && this.sidePanel.area) return this.sidePanel;
    return this.activeApp;
  }

  handleKey(k: KeyInput): void {
    this.tipHidden = true;
    const modal = this.topModal;
    if (modal) {
      // ⌘Z over a pop-up (a widget's settings, the effects…) undoes there too; not
      // where you type or choose something (a prompt, THE MENU's search, a key, a yes/no)
      const u = undoKey(k);
      const typing = modal instanceof PromptDialog || modal instanceof QuickMenu || modal instanceof KeyCapture || modal instanceof ConfirmDialog || modal instanceof Tour;
      if (u && !typing) return void this.deck.undoLast(u === "redo");
      if (k.combo === "ctrl+backspace" && !typing) return void modal.onKey?.(asDelete(k));
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
  routeKey(k: KeyInput, fromOsk: boolean): void {
    const modal = fromOsk ? this.topModal : undefined;
    if (modal) {
      modal.onKey?.(k);
      return;
    }
    const target = this.paneTarget();
    if (target?.onKey?.(k)) return;
    // ⌘⌫ (a MacBook has no Delete key): Delete for whoever didn't take it (the tree, NEXUS, lists…)
    if (k.combo === "ctrl+backspace" && target?.onKey?.(asDelete(k))) return;
    // ⌘Z / ctrl+Z: the deck's history (core/undo.ts) when the pane didn't take it (a note undoes its typing first)
    const u = undoKey(k);
    if (u) return void this.deck.undoLast(u === "redo");
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
      case "palette": this.menu({ pad: true }); break; // the gamepad's Y: THE MENU, a quick key chosen
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

  /**
   * The deck's own shortcuts that aren't shell commands (the rest run their `cmd`).
   * Keyed by the shortcut's id in core/shortcuts.ts.
   */
  private readonly keyActions: Record<string, () => void> = {
    "new-note": () => void this.deck.newNote(),
    "new-folder": () => void this.deck.newFolder(),
    tree: () => this.toggleSidebar(),
    shell: () => this.focusShell(),
    "shell-tabs": () => (this.focus === "shell" && this.shellVisible ? this.cycleShellTab() : this.focusShell()),
    back: () => void this.closeAndGoBack(),
    menu: () => void this.menu(),
  };

  /** The guided tour (workspace/tour.ts): UPLINK shows the deck, one part at a time. */
  tour(onEnd?: () => void): void {
    if (this.overlays.some((o) => o instanceof Tour && !o.done)) return;
    this.push(new Tour(this, onEnd));
  }

  /** THE MENU (workspace/quickmenu.ts): quick keys, or searching everything. Again: closes it. */
  menu(o: { pad?: boolean } = {}): QuickMenu | undefined {
    const open = this.overlays.find((x): x is QuickMenu => x instanceof QuickMenu && !x.done);
    if (open) return void (open.done = true);
    const m = new QuickMenu(this.deck, o);
    this.push(m);
    return m;
  }

  /** Do what a deck shortcut does (its keys, THE MENU, Settings → KEYS). */
  runShortcut(s: Shortcut): void {
    const act = s.id ? this.keyActions[s.id] : undefined;
    if (act) act();
    else if (s.cmd) void this.deck.act(s.cmd);
  }

  /** App-wide shortcuts. Uses physical key codes where layouts differ (AZERTY…). */
  private globalKey(k: KeyInput): boolean {
    const d = this.deck;
    // ⌘/ on any layout (AZERTY types it with shift): the physical key counts
    const c = k.ctrl && !k.alt && (k.key === "/" || k.code === "Slash") ? "ctrl+/" : k.code === "Backquote" && k.ctrl && !k.shift ? "ctrl+`" : k.combo;
    // your own shortcuts first (bind / the SHORTCUTS page)
    const mine = d.settings.data.keys?.[c];
    if (mine) return void d.act(mine), true;
    if (c === "ctrl+p") return this.palette(), true;
    // the deck's shortcuts: one table (core/shortcuts.ts), with your changes (Settings → KEYS)
    const own = shortcutFor(c, d.settings.data.keyOverrides);
    if (own) return this.runShortcut(own), true;
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
          for (const pane of ["sidebar", "main", "shell", "panel"] as Pane[]) {
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
        if (m.fine && !this.dragging?.fine) break; // a move inside one cell: only sliders want it
        this.dragging?.onDrag?.(m);
        break;
      case "up":
        this.dragging?.onUp?.(m);
        this.dragging = null;
        break;
      case "dblclick":
        pick((x) => !!x.onDouble)?.onDouble?.(m);
        break;
      case "wheel": {
        this.tipHidden = true;
        const h = pick((x) => !!x.onWheel);
        if (!m.fine || h?.fine) h?.onWheel?.(m.delta, m); // less than a line: only sliders want it
        break;
      }
        break;
    }
  }

  // ── drawing ──────────────────────────────────────────────────────────────

  /** the tabs as they were last saved (they reopen at the next start) */
  private savedTabs = "";
  /** nothing is saved before the last session has been reopened (it would be overwritten by HOME alone) */
  private sessionReady = false;
  private saveSession(): void {
    const tabs = this.tabs.slice(0, this.tabCount).filter((a) => !["setup", "terminal", "ibsh"].includes(a.kind)).map((a) => a.key);
    const sig = `${tabs.join("|")}#${Math.min(this.active, this.tabCount - 1)}`;
    if (!this.sessionReady || sig === this.savedTabs) return;
    this.savedTabs = sig;
    const s = this.deck.settings;
    s.set("session", { ...(s.data.session ?? {}), tabs, active: Math.max(0, tabs.indexOf(this.tabs[this.active]?.key ?? "")) });
  }

  /** Open again what was open when the deck closed (notes that still exist, modules that are still on). */
  async restoreSession(skip = false): Promise<void> {
    const ses = this.deck.settings.data.session;
    try {
      if (!skip && ses?.tabs?.length) await this.reopen(ses);
    } finally {
      this.sessionReady = true;
    }
  }

  private async reopen(ses: { tabs?: string[]; active?: number }): Promise<void> {
    if (!ses.tabs) return;
    for (const key of ses.tabs) {
      if (key === "home" || this.findTab(key)) continue;
      if (key.startsWith("note:")) {
        const p = key.slice(5);
        if (await this.deck.vault.exists(p)) await this.deck.openFile(p);
      } else if (this.deck.apps.get(key) && !Workspace.PAGES.has(key)) this.deck.openApp(key);
    }
    const want = ses.tabs[ses.active ?? 0];
    const i = this.tabs.findIndex((t) => t.key === want);
    if (i >= 0) this.switchTab(i);
  }

  /** rows hidden by the camera notch in full screen (deck.measureNotch): a band, the deck starts under it */
  notchRows = 0;

  render(ui: UI): void {
    const d = this.deck;
    this.noteVisit();
    this.saveSession();
    const W = ui.cols;
    const N = this.notchRows;
    const H = ui.rows - N;
    // the animated background (not with reduce motion: it's the costliest thing that never stops)
    if (d.settings.data.fx.ambient && !d.settings.data.appearance.reduceMotion) drawBackground(ui, { x: 0, y: N, w: W, h: H }, ui.theme, 0.7);
    if (N) renderNotchBand(ui, { x: 0, y: 0, w: W, h: N });
    if (N && d.settings.data.fx.ambient && !d.settings.data.appearance.reduceMotion) drawBackground(ui, { x: 0, y: 0, w: W, h: N }, ui.theme, 0.7);

    renderTopBar(this, ui, { x: 0, y: N, w: W, h: 1 });

    const body = { x: 1, y: N + 1, w: W - 2, h: H - 2 };
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
    // the side panel on the right: widgets that stay in view (panel show · ◧ in the status bar)
    const panelW = Math.max(24, Math.min(36, Math.round(W * 0.2)));
    this.sidePanel.area = null;
    if (d.settings.data.panel?.shown && mainR.w - panelW - 1 >= 40) {
      mainR.w -= panelW + 1;
      const pr = { x: mainR.x + mainR.w + 1, y: mainR.y, w: panelW, h: mainR.h };
      this.rects.panel = pr; // a click there gives it the focus
      this.sidePanel.render(ui, pr);
    }
    if (this.focus === "panel" && !this.sidePanel.area) this.focus = "main"; // the panel went away
    this.rects.main = mainR;
    const app = this.activeApp;
    const mainFocused = this.focus === "main" && !this.topModal;
    const inner = ui.box(mainR, { title: app ? t(app.title()).toUpperCase() : "", focused: mainFocused, info: app?.kind === "note" ? app.key.slice(5) : app && app.kind !== app.title().toLowerCase() ? app.kind : undefined });
    if (app?.menu) ui.hit(inner, { menu: () => app.menu!() });
    if (app) ui.clip(inner, () => app.render(ui, inner, mainFocused));
    if (this.editing) editBand(this, ui, inner, this.sidePanel.area);

    if (this.shellVisible) {
      const r = max ? { x: right.x, y: body.y, w: right.w, h: body.h - stripH } : { x: body.x, y: top.y + top.h, w: body.w, h: shellH };
      renderShellPanel(this, ui, r, body, max);
    }

    renderStatusBar(this, ui, { x: 0, y: N + H - 1, w: W, h: 1 });
    renderSubtitles(this, ui, W, N + H);

    const screen = { x: 0, y: N, w: W, h: H };
    this.overlays = this.overlays.filter((o) => !o.done);
    // the on-screen keyboard is drawn last so it stays clickable above dialogs
    for (const o of this.overlays) if (!(o instanceof Osk)) o.render(ui, screen);
    for (const o of this.overlays) if (o instanceof Osk) o.render(ui, screen);
    this.toasts.render(ui, screen);
    renderTip(this, ui, screen);
    if (ui.caret) this.lastCaret = { ...ui.caret };
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

/** ⌘Z → undo, ⌘⇧Z / ctrl+Y → redo (any layout: the letter typed, or the physical key). */
export function undoKey(k: KeyInput): "undo" | "redo" | null {
  if (!k.ctrl || k.alt) return null;
  const letter = k.key.length === 1 ? k.key.toLowerCase() : "";
  if (letter === "z" || (!letter && k.code === "KeyZ")) return k.shift ? "redo" : "undo";
  if ((letter === "y" || (!letter && k.code === "KeyY")) && !k.shift) return "redo";
  return null;
}

/** The same key press as Delete (⌘⌫ / ctrl+⌫ where nothing else uses it). */
function asDelete(k: KeyInput): KeyInput {
  return { ...k, key: "delete", code: "Delete", ctrl: false, combo: "delete" };
}

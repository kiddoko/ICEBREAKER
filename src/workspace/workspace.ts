import { RecoveryDialog } from "./recoverydialog";
import { frameMenu, editMenu, shellMenu } from "./menus";
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
import { BOLD, type Rect } from "../core/grid";
import { IS_MAC, type Action, type ActionSource, type KeyInput, type MouseInput } from "../core/input";
import type { App } from "../apps/types";
import type { Deck } from "../deck";
import { drawBackground } from "../fx/backgrounds";
import { inside, q, type Hit, type MenuEntry, type MenuItem, type UI } from "../ui/ui";
import { ContextMenu } from "./contextmenu";
import { ConfirmDialog, Osk, PromptDialog, Toasts, type MessageOptions, type Overlay, type PromptOptions, type ToastKind, ChooseDialog } from "./overlays";
import type { ChoiceOption } from "../plugins/api";
import { FxPanel } from "./fxpanel";
import { WhatsNew } from "./whatsnew";
import { Sidebar } from "./sidebar";
import { unplaceSquares } from "./favorites";
import { SystemTerminal } from "../shell/systerm";
import { frames, todayLayout, type Node as LayoutNode, type Today } from "./layout/tree";
import { CLASSIC, effectiveLayout, isFolded, parseArrangement, resizeBetween, setFolded, type ANode, type FrameId } from "./layout/arrange";
import { bordersOf, solveLayout, type Border } from "./layout/solve";
import { paneToward } from "./layout/focus";
import { drawDropFrame, placeChips, renderTabStrip, soloTab, tabbedBox } from "./tabstrip";
import { frameOfPane, PANE_OF, parsePlaces, parseShows, prunePlaces, type PlaceFrame, type Places, type Shows } from "./tabplaces";
import { groupOf, joinGroup, parseGroups, pick, prune, renameGroup, stripEntries, takeOut, type StripEntry, type TabGroup } from "./tabgroups";
import { GAP, INSET, SECTION } from "../ui/layout";
import { strWidth, truncate } from "../core/unicode";

export type ShellTab = "term" | "ibsh" | "log";

/** the top bar's rows: one (the deck menu, UPLINK, the clock — the tabs are on the frames) */
export const TOP_H = 1;
/** the shell's share of the height to begin with (and after `layout reset`) */
export const SHELL_RATIO = 0.3;

/** the parts of the screen that can have the focus (the side panel only while shown) */
export type Pane = "sidebar" | "main" | "shell" | "panel";

/**
 * The desktop: top bar (the deck menu), frames with their tabs on their border, file tree on the left, the active app in
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
  /** the tab the page's frame shows (always one that lives there: places) */
  active = 0;
  focus: Pane = "main";
  /** tabs moved to another frame (key → frame); the rest live in the page's frame (tabplaces.ts) */
  places: Places = {};
  /** the tab each of those frames shows instead of its own content (absent: its own) */
  shows: Shows = {};
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
  shellRatio = SHELL_RATIO;
  overlays: Overlay[] = [];
  readonly toasts = new Toasts();
  readonly sidebar: Sidebar;
  /** where each pane was drawn this frame (the mouse and the side panel use them) */
  rects: Partial<Record<Pane, Rect>> = {};
  /** the screen's layout tree this frame (layout/tree.ts): the arrangement with the switches above applied */
  layout: LayoutNode | null = null;

  /**
   * Where the frames sit (settings.layout, layout/arrange.ts): what `layout preset` and
   * `frame move` saved, or today's arrangement. Read again only when the setting changes.
   */
  get arrangement(): ANode {
    const raw = this.deck.settings.data.layout;
    if (raw !== this.arrangedFrom) {
      this.arrangedFrom = raw;
      this.arranged = parseArrangement(raw) ?? CLASSIC;
    }
    return this.arranged;
  }
  private arrangedFrom: unknown = undefined;
  private arranged: ANode = CLASSIC;

  /** a border being dragged: which, the arrangement when it was grabbed */
  private borderDrag: { b: Border; arr: ANode; m: MouseInput } | null = null;

  /** Move the border being dragged to the pointer: both sides' new lengths, saved (⌘Z: one step per drag). */
  private dragBorder(m: MouseInput): void {
    const g = this.borderDrag;
    if (!g) return;
    const { b } = g;
    const MIN = 6;
    const row = b.dir === "row";
    const start = row ? b.ra.x : b.ra.y;
    const end = row ? b.rb.x + b.rb.w : b.rb.y + b.rb.h;
    const gap = row ? b.rb.x - (b.ra.x + b.ra.w) : 0;
    const pos = Math.max(start + MIN, Math.min(end - MIN - gap, row ? m.x : m.y));
    const aLen = pos - start, bLen = end - pos - gap;
    const next = resizeBetween(g.arr, b.a as FrameId, b.b as FrameId, b.dir, aLen, bLen);
    this.deck.settings.set("layout", { version: 1, root: next });
  }

  /** Open frame `id` if it's folded (asked to show or focus it: a question in the shell, ⌘B…). */
  private unfold(id: FrameId): void {
    if (isFolded(this.arrangement, id)) this.deck.settings.set("layout", { version: 1, root: setFolded(this.arrangement, id, false) });
  }

  /** Fold frame `id` into a strip, or open it again (frame fold / unfold, a click on the strip). */
  setFrameFolded(id: FrameId, folded: boolean): void {
    this.deck.settings.set("layout", { version: 1, root: setFolded(this.arrangement, id, folded) });
    if (!folded) this.focus = id === "vault" ? "sidebar" : id === "shell" ? "shell" : id === "panel" ? "panel" : "main";
    this.deck.requestFrame();
  }

  /** the shell sits along the bottom, the whole width (its top border drags to resize it then) */
  get shellAtBottom(): boolean {
    const a = this.arrangement;
    return a.kind === "split" && a.dir === "col" && a.children[a.children.length - 1].kind === "frame" && (a.children[a.children.length - 1] as { id: string }).id === "shell";
  }
  private dragging: Hit | null = null;
  /**
   * What's being dragged, said under the pointer (a tab's name, a file's): set by whatever
   * drags it, gone when the button comes up. Where it would land is lit by that source.
   */
  ghost: { label: string } | null = null;

  /** the ghost: a small lit label just under-right of the pointer */
  private drawGhost(ui: UI, screen: Rect): void {
    if (!this.ghost || !this.dragging) return;
    const c = ui.c;
    const label = ` ${this.ghost.label} `;
    const w = Math.min(strWidth(label), 32);
    const x = Math.min(ui.mouse.x + GAP, screen.x + screen.w - w);
    const y = Math.min(ui.mouse.y + INSET, screen.y + screen.h - 1);
    ui.text(x, y, truncate(label, w), { fg: c.panel, bg: c.accent, attrs: BOLD });
    ui.animate(16);
  }

  /** something is being dragged (a tab, a border…): no tips meanwhile */
  get isDragging(): boolean {
    return !!this.dragging;
  }
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
    // the widgets are what's edited: the panel shows them (not a tab moved there)
    if (on) this.ownContent("panel");
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
    // ibsh is a big tab already (term max): there, not a second ibsh in the panel
    const big = t === "ibsh" ? this.tabs.findIndex((a) => a instanceof IbshApp) : -1;
    if (big >= 0) return this.switchTab(big);
    this.unfold("shell");
    if (t === "term" && !this.termAvailable) t = "ibsh";
    this.ownContent("shell");
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
   * Pages reached from the deck menu, ◆ ICEBREAKER (NEXUS, STORE, MODULES, settings):
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

  /** Close the open page (STORE, settings…: × on its chip, esc) and go back to the tab before. */
  closePage(): void {
    this.dropPage();
    this.deck.requestFrame();
  }

  /**
   * NEXUS set aside while the note opened from it is shown (not closed: it keeps where you
   * were); esc on that note brings it back (the user's call: a page from the ◆ menu has no tab,
   * but NEXUS is for exploring).
   */
  private parked: { app: App; opened: string } | null = null;

  /** Esc on the note opened from NEXUS: NEXUS again, as you left it. True if it did. */
  backToParked(): boolean {
    const p = this.parked;
    if (!p || this.activeApp?.key !== p.opened) return false;
    this.parked = null;
    if (this.page) this.dropPage();
    this.pageReturn = this.active;
    this.tabs.push(p.app);
    this.active = this.tabs.length - 1;
    this.focus = "main";
    this.deck.requestFrame();
    return true;
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
  /** the side panel on the right (◨): widgets always in view — see sidepanel.ts */
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
        // another page: a NEXUS set aside closes for good
        if (this.parked) void this.parked.app.close?.(), (this.parked = null);
        if (cur) this.dropPage();
        else this.pageReturn = this.active;
        this.tabs.push(app);
        this.active = this.tabs.length - 1;
      }
      this.focus = "main";
      return this.tabs[this.active];
    }
    // a note (or any page with a tab) opened from NEXUS: NEXUS is set aside, esc brings it back
    let parkNexus: App | null = null;
    if (this.page?.kind === "explorer") {
      if (this.parked) void this.parked.app.close?.();
      parkNexus = this.tabs.pop()!;
      this.active = Math.max(0, Math.min(this.pageReturn, this.tabs.length - 1));
    } else if (this.page) this.dropPage();
    const existing = this.tabs.findIndex((t) => t.key === app.key);
    // already open in another frame: shown there
    if (existing >= 0 && this.reachOf(existing) !== "main") {
      void app.close?.();
      this.switchTab(existing);
      return this.tabs[existing];
    }
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
    if (parkNexus) this.parked = { app: parkNexus, opened: opened.key };
    if (opened.kind === "note") this.sidebar.reveal(opened.key.slice(5));
    return opened;
  }

  /**
   * A page made again (its module reloaded): the new one takes the old one's place,
   * focus and order unchanged. null: the module is gone, so is its tab.
   */
  replaceTab(old: App, fresh: App | null): void {
    const i = this.tabs.indexOf(old);
    if (i < 0) return void fresh?.close?.();
    if (old === this.previewTab) this.previewTab = fresh;
    if (fresh) this.tabs[i] = fresh;
    else {
      this.tabs.splice(i, 1);
      if (i < this.active) this.active--;
      this.active = Math.max(0, Math.min(this.active, this.tabs.length - 1));
      if (!this.tabs.length) this.deck.openApp("home");
    }
    this.deck.requestFrame();
  }

  /**
   * Tab `from` goes to place `to` (both among the real tabs, from 0); the one shown stays
   * shown. False when either isn't a tab.
   */
  moveTab(from: number, to: number): boolean {
    const n = this.tabCount;
    if (from < 0 || to < 0 || from >= n || to >= n) return false;
    if (from === to) return true;
    // HOME stays first (pinned): it doesn't move, nothing goes before it
    const home = this.tabs.findIndex((a) => a.kind === "home");
    if (home >= 0 && (from === home || to <= home)) return false;
    const shown = this.tabs[this.active];
    const [tab] = this.tabs.splice(from, 1);
    this.tabs.splice(to, 0, tab);
    this.active = Math.max(0, this.tabs.indexOf(shown));
    this.deck.requestFrame();
    return true;
  }

  // ── tab groups (workspace/tabgroups.ts) ─────────────────────────────────

  /** several tabs behind one chip of the strip; kept in the session */
  groups: TabGroup[] = [];

  /** The keys of the real tabs, in order. */
  private tabKeys(): string[] {
    return this.tabs.slice(0, this.tabCount).map((a) => a.key);
  }

  /** Tab `m` joins tab `n`'s group (a new group of the two). Both from 0. */
  groupTabs(n: number, m: number, name?: string): boolean {
    const keys = this.tabKeys();
    if (!keys[n] || !keys[m] || n === m) return false;
    if (keys[n] === "home" || keys[m] === "home") return false; // HOME is pinned, never in a group
    this.groups = joinGroup(this.groups, keys[n], keys[m], name);
    this.deck.requestFrame();
    return true;
  }

  /** Tab `n` out of its group, a tab of its own again. */
  ungroupTab(n: number): boolean {
    const key = this.tabKeys()[n];
    if (!key || !groupOf(this.groups, key)) return false;
    this.groups = takeOut(this.groups, key);
    this.deck.requestFrame();
    return true;
  }

  /** The group of tab `n` renamed. */
  renameGroupOf(n: number, name: string): boolean {
    const key = this.tabKeys()[n];
    if (!key || !groupOf(this.groups, key)) return false;
    this.groups = renameGroup(this.groups, key, name);
    this.deck.requestFrame();
    return true;
  }

  /** The strip's chips this frame: lone tabs and groups (closed tabs leave their groups). */
  stripEntries(): StripEntry[] {
    // the page frame's tabs only (the others are drawn by their frames); indexes stay the tabs'
    const keys = this.tabKeys().map((k, i) => (this.reachOf(i) === "main" ? k : ""));
    this.groups = prune(this.groups, keys);
    const shown = keys[this.active];
    if (shown) this.groups = pick(this.groups, shown);
    return stripEntries(this.groups, keys).filter((e) => e.kind === "group" || keys[e.index] !== "");
  }

  findTab(key: string): App | undefined {
    return this.tabs.find((t) => t.key === key);
  }

  async closeTab(i = this.active): Promise<void> {
    const app = this.tabs[i];
    if (!app) return;
    // HOME is pinned: it can't be closed by mistake (⌘W, ×) — it's always the first tab
    if (app.kind === "home" && this.tabs.length > 0) return void this.notify(t("HOME stays: it's pinned (the first tab, ⌘1)"));
    if ((await app.close?.()) === false) return;
    const wasPage = app === this.page;
    const at = this.placeOf(i);
    this.tabs.splice(i, 1);
    // it lived in another frame: that frame shows its own content again (the page's frame is unchanged)
    if (at !== "main") {
      const { [app.key]: _gone, ...rest } = this.places;
      this.places = rest;
      if (this.shows[at] === app.key) this.showIn(at, null);
      if (i < this.active) this.active--;
      return void this.deck.requestFrame();
    }
    // closing the tab you're on shows the one before it (in tab order)
    if (wasPage) this.active = Math.max(0, Math.min(this.pageReturn, this.tabs.length - 1));
    else if (i < this.active || (i === this.active && i > 0)) this.active--;
    if (this.active >= this.tabs.length) this.active = Math.max(0, this.tabs.length - 1);
    if (this.tabs.length === 0) this.deck.openApp("home");
    this.deck.requestFrame();
  }

  /** shift+esc (or a page's esc): close it and show the tab before it (HOME stays). */
  async closeAndGoBack(): Promise<void> {
    // the page you're looking at: in the focused frame (a tab moved there), else the page's frame
    const app = this.focusedPage ?? this.activeApp;
    if (!app || app.kind === "home") return;
    await this.closeTab(this.tabs.indexOf(app));
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
    // a tab that lives in another frame: that frame shows it, and gets the focus
    const at = this.reachOf(next);
    // a frame that can't be shown now (the shell is a big tab, TERMINAL is off): the tab comes
    // back to the page's frame rather than staying out of reach
    if (at !== "main" && !this.canShow(at)) return void this.moveTabTo(next, "main");
    if (at !== "main") return this.showIn(at, this.tabs[next].key);
    if (next !== this.active) this.deck.pageTurn(false, quick);
    this.active = next;
    this.focus = "main";
  }

  /** ctrl+tab, ctrl+⇧tab, a swipe: the next (or previous) tab of the page's frame. */
  stepTab(dir: 1 | -1, quick = false): void {
    const mine = this.mainTabs();
    if (!mine.length) return;
    const k = mine.indexOf(this.active);
    this.switchTab(mine[(((k < 0 ? 0 : k + dir) % mine.length) + mine.length) % mine.length], quick);
  }

  // ── tabs in other frames (tabplaces.ts) ──────────────────────────────────

  /** the frames drawn last frame (a tab whose frame isn't among them is reached in the page's) */
  private onScreen = new Set<PlaceFrame>();
  private drawnOnce = false;

  /**
   * Where tab `i` can be reached right now: its frame, or — when that frame isn't on screen
   * (a narrow window drops the panel, the tree or the shell hidden) — the page's frame, until
   * its own comes back (it was in no list at all).
   */
  reachOf(i: number): PlaceFrame | "main" {
    const at = this.placeOf(i);
    return at !== "main" && this.drawnOnce && !this.onScreen.has(at) ? "main" : at;
  }

  /** the frame tab `i` lives in */
  placeOf(i: number): PlaceFrame | "main" {
    const key = this.tabs[i]?.key;
    return (key && this.places[key]) || "main";
  }

  /** the real tabs (indexes) that live in the page's frame */
  mainTabs(): number[] {
    return Array.from({ length: this.tabCount }, (_, i) => i).filter((i) => this.reachOf(i) === "main");
  }

  /** the tabs (indexes) that live in frame `f`, in tab order */
  tabsIn(f: PlaceFrame): number[] {
    return Array.from({ length: this.tabCount }, (_, i) => i).filter((i) => this.placeOf(i) === f);
  }

  /** the tab frame `f` shows instead of its own content, if any */
  shownIn(f: PlaceFrame): App | undefined {
    const key = this.shows[f];
    return key ? this.tabs.find((a) => a.key === key && this.places[key] === f) : undefined;
  }

  /** the page the focused frame shows (the page's frame: the tab in front; another: its shown tab) */
  get focusedPage(): App | undefined {
    const f = frameOfPane(this.focus);
    return f === "main" ? this.activeApp : this.shownIn(f);
  }

  /** Frame `f` shows tab `key` (or its own content: null), opened if it was hidden, with the focus. */
  /** the frame a tab was just asked to show in (checked after drawing: is it on screen?) */
  private revealing: PlaceFrame | null = null;

  showIn(f: PlaceFrame, key: string | null): void {
    if (key) this.revealing = f;
    if (key) this.shows = { ...this.shows, [f]: key };
    else {
      const { [f]: _gone, ...rest } = this.shows;
      this.shows = rest;
    }
    this.reveal(f);
    this.focus = PANE_OF[f];
    this.deck.requestFrame();
  }

  /**
   * Frame `f` shows its own content again (the shell, the tree, the widgets), not a tab
   * moved there. Called whenever that content is asked for — ctrl+`, a question from a
   * command, ⌘B, panel show, edit mode — or a moved page took what was typed for the shell.
   */
  ownContent(f: PlaceFrame): void {
    if (!this.shows[f]) return;
    const { [f]: _gone, ...rest } = this.shows;
    this.shows = rest;
  }

  /** frame `f` can be shown right now (the shell: not while it's a big tab itself, nor with TERMINAL off) */
  private canShow(f: PlaceFrame): boolean {
    // (not "no shell tab open": `term open` keeps the panel; Fable's re-check R1)
    if (f === "shell") return this.terminalOn;
    return true;
  }

  /** ibsh as a big tab (term max), when the shell panel would show ibsh too: that tab */
  private ibshTab(): number {
    if (this.shellTab === "term" && this.termAvailable && this.terms.length) return -1;
    return this.tabs.findIndex((a) => a instanceof IbshApp);
  }

  /** Make frame `f` seen: shown, unfolded. */
  private reveal(f: PlaceFrame): void {
    if (f === "vault") {
      this.sidebarVisible = true;
      this.unfold("vault");
    } else if (f === "shell") {
      this.shellVisible = true;
      this.unfold("shell");
    } else {
      if (!this.deck.settings.data.panel?.shown) this.deck.settings.set("panel", { ...(this.deck.settings.data.panel ?? {}), shown: true });
      this.unfold("panel");
    }
  }

  /**
   * Tab `i` goes to frame `to` (Refonte UI 3b): it leaves its group, and is shown there.
   * The page's frame keeps at least one tab (HOME comes back to it otherwise).
   */
  moveTabTo(i: number, to: PlaceFrame | "main"): boolean {
    const app = this.tabs[i];
    if (!app || i >= this.tabCount) return false;
    const from = this.placeOf(i);
    if (from === to) return true;
    if (from === "main" && this.mainTabs().length < 2) return void this.notify(t("the page's frame keeps one tab at least")), false;
    if (groupOf(this.groups, app.key)) this.groups = takeOut(this.groups, app.key);
    const places = { ...this.places };
    // its old frame shows its own content again — without opening it (term max: the shell panel
    // came back, ibsh shown twice)
    if (from !== "main" && this.shows[from] === app.key) this.ownContent(from);
    if (to === "main") delete places[app.key];
    else places[app.key] = to;
    this.places = places;
    if (to === "main") {
      this.active = i;
      this.focus = "main";
    } else {
      if (i === this.active) this.fixActive();
      this.showIn(to, app.key);
    }
    this.deck.requestFrame();
    return true;
  }

  /** Each frame: tabs that closed leave their places; the page's frame shows one of its own. */
  private tidyPlaces(): void {
    const open = this.tabs.slice(0, this.tabCount).map((a) => a.key);
    if (Object.keys(this.places).some((k) => !open.includes(k)) || Object.values(this.shows).some((k) => !k || !this.places[k])) {
      ({ places: this.places, shows: this.shows } = prunePlaces(this.places, this.shows, open));
    }
    this.fixActive();
  }

  /** The page's frame shows a tab that lives there (the nearest one; HOME comes back if none is left). */
  private fixActive(): void {
    if (this.page && this.active === this.tabs.length - 1) return;
    if (this.reachOf(this.active) === "main" && this.active < this.tabCount) return;
    let mine = this.mainTabs();
    if (!mine.length) {
      // every tab went elsewhere: HOME comes back to the page's frame
      const home = this.tabs.findIndex((a) => a.kind === "home");
      if (home < 0) return;
      const { [this.tabs[home].key]: _back, ...rest } = this.places;
      this.places = rest;
      for (const f of Object.keys(this.shows) as PlaceFrame[]) if (this.shows[f] === "home") this.showIn(f, null);
      mine = [home];
    }
    this.active = mine.reduce((best, j) => (Math.abs(j - this.active) < Math.abs(best - this.active) ? j : best), mine[0]);
  }

  // ── panes ────────────────────────────────────────────────────────────────

  toggleShell(show = !this.shellVisible): void {
    if (!this.terminalOn) return this.terminalOff();
    if (show) this.unfold("shell");
    if (show) this.ownContent("shell");
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
    // ibsh is a big tab (term max): ctrl+` goes there (the panel showed ibsh a second time)
    const big = this.ibshTab();
    if (big >= 0) return this.switchTab(big);
    this.unfold("shell");
    if (!this.shellVisible || this.focus !== "shell" || this.shows.shell) {
      // ctrl+`: the shell itself, even when a moved tab was shown in its frame (it took the typing)
      this.ownContent("shell");
      this.shellVisible = true;
      this.focus = "shell";
    } else this.focus = "main";
  }

  /** An interactive shell command asks something: make sure it's seen. */
  focusShellIfHidden(): void {
    if (!this.terminalOn) return;
    // the question shows in ibsh's big tab when there is one
    const big = this.ibshTab();
    if (big >= 0) return this.switchTab(big);
    this.unfold("shell");
    // the question is in the shell: a moved tab shown in its frame would hide it
    this.ownContent("shell");
    this.shellVisible = true;
    this.focus = "shell";
  }

  toggleSidebar(): void {
    // folded into a strip: ⌘B opens it rather than hiding it
    if (this.sidebarVisible && isFolded(this.arrangement, "vault")) {
      this.unfold("vault");
      this.ownContent("vault");
      this.focus = "sidebar";
      return;
    }
    this.sidebarVisible = !this.sidebarVisible;
    if (this.sidebarVisible) (this.ownContent("vault"), (this.focus = "sidebar"));
    else if (this.focus === "sidebar") this.focus = "main";
  }

  private moveFocus(dir: "left" | "right" | "up" | "down"): void {
    // the part that really is in that direction (frames can sit anywhere: frame move, layout preset)
    const near = paneToward(this.rects, this.focus, dir);
    if (near) return void (this.focus = near);
    // nothing there: the old rules (left from the shell → the tree…)
    if (dir === "left" && this.focus === "panel") this.focus = "main";
    else if (dir === "left" && this.sidebarVisible) this.focus = "sidebar";
    else if (dir === "right" && this.focus === "sidebar") this.focus = "main";
    else if (dir === "right" && this.focus === "main" && this.sidePanel.area) this.focus = "panel";
    else if (dir === "down" && this.shellVisible) this.focus = "shell";
    else if (dir === "up" && this.focus === "shell") this.focus = "main";
  }

  private cycleFocus(): void {
    const order: Pane[] = ["main", ...(this.rects.panel ? (["panel"] as Pane[]) : []), ...(this.shellVisible ? (["shell"] as Pane[]) : []), ...(this.sidebarVisible ? (["sidebar"] as Pane[]) : [])];
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

  /** WHAT'S NEW (workspace/whatsnew.ts): a version's notes; the current one by default. */
  whatsNew(version?: string): void {
    this.overlays.filter((o) => o instanceof WhatsNew).forEach((o) => (o.done = true));
    this.push(new WhatsNew(this.deck, version));
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
    // a frame showing a tab moved there (Refonte UI 3b): its keys go to that page
    const f = frameOfPane(this.focus);
    const moved = f === "main" ? undefined : this.shownIn(f);
    if (moved && this.rects[this.focus]) return moved;
    if (this.focus === "shell" && this.shellVisible) {
      if (this.shellTab === "term" && this.termAvailable) return this.terminal;
      if (this.shellTab === "log") return this.logPane;
      return this.deck.shell;
    }
    if (this.focus === "sidebar" && this.sidebarVisible) return this.sidebar;
    if (this.focus === "panel" && this.sidePanel.area) return this.sidePanel;
    return this.activeApp;
  }

  /** The page in front plays the keyboard (App.rawKeys) and nothing covers it: its keys come as keys. */
  rawKeys(): boolean {
    return !this.topModal && !!this.focusedPage?.rawKeys;
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
    if (this.focus === "shell" && this.shellVisible && !this.shownIn("shell") && this.shellTab === "term" && this.termAvailable && this.terminal.wants(k)) {
      this.terminal.onKey(k);
      return;
    }
    // a terminal tab (in the page's frame, or moved to another): same rule
    const ta = this.focusedPage;
    if (ta instanceof TerminalApp && ta.term.wants(k)) return void ta.term.onKey(k);
    if (k.combo === "contextmenu" || k.combo === "shift+f10") return this.keyboardMenu();
    // a page that plays the keyboard (App.rawKeys) owns its keys, like an editor owns the arrows:
    // the ones that type (a piano's) and every ⌥ / alt combination (⌥ arrows, ⌥ letters, ⌥ digits —
    // on Windows and Linux the deck's pane and tab keys) are its own; ⌘ / ctrl ones stay the deck's
    const owned = k.raw || (k.alt && !k.ctrl && !k.meta && this.rawKeys());
    if (!owned && this.globalKey(k)) return;
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
      case "tab-next": this.stepTab(1); break;
      case "tab-prev": this.stepTab(-1); break;
      case "focus-next": this.cycleFocus(); break;
      case "menu": this.deck.openApp("home"); break;
      // esc: back to the page from the tree / shell; a button-page (NEXUS, STORE…) closes.
      // Tabs close with shift+esc (or ctrl+W), so a stray esc never loses one. The gamepad's B still closes.
      case "back":
        // leaving a page that plays the keyboard (App.rawKeys): esc gives the keys back to the deck
        if (this.focus === "main" && this.backToParked()) break; // the note opened from NEXUS: NEXUS again
        if (this.focus === "main" && this.activeApp?.rawKeys && this.activeApp !== this.page && source !== "gamepad") this.focus = this.sidebarVisible ? "sidebar" : this.shellVisible ? "shell" : "main";
        else if (this.focus !== "main") this.focus = "main";
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
        this.ghost = null;
        break;
      case "dblclick":
        pick((x) => !!x.onDouble)?.onDouble?.(m);
        break;
      case "wheel": {
        this.tipHidden = true;
        const h = pick((x) => !!x.onWheel);
        // shift + wheel walks the tree from anywhere (Settings → VAULT), but a slider keeps its wheel
        if (m.shift && this.sidebarVisible && !h?.fine && !m.fine && this.sidebar.walkWheel(m.delta)) break;
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
    // the groups of the tabs that are saved (a terminal tab doesn't come back, nor does its place in a group)
    const groups = prune(this.groups, tabs);
    // where the tabs moved to other frames live, and what those frames show
    const { places, shows } = prunePlaces(this.places, this.shows, tabs);
    const sig = `${tabs.join("|")}#${Math.min(this.active, this.tabCount - 1)}#${JSON.stringify(groups)}#${JSON.stringify(places)}#${JSON.stringify(shows)}`;
    if (!this.sessionReady || sig === this.savedTabs) return;
    this.savedTabs = sig;
    const s = this.deck.settings;
    s.set("session", { ...(s.data.session ?? {}), tabs, active: Math.max(0, tabs.indexOf(this.tabs[this.active]?.key ?? "")), groups, places, shows });
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

  private async reopen(ses: { tabs?: string[]; active?: number; groups?: unknown; places?: unknown; shows?: unknown }): Promise<void> {
    if (!ses.tabs) return;
    // the groups come back with their tabs (those that are still there)
    this.groups = parseGroups(ses.groups);
    for (const key of ses.tabs) {
      if (key === "home" || this.findTab(key)) continue;
      if (key.startsWith("note:")) {
        const p = key.slice(5);
        if (await this.deck.vault.exists(p)) await this.deck.openFile(p);
      } else if (this.deck.apps.get(key) && !Workspace.PAGES.has(key)) this.deck.openApp(key);
    }
    // the tabs moved to other frames go back there (those that came back)
    const open = this.tabs.slice(0, this.tabCount).map((a) => a.key);
    this.places = parsePlaces(ses.places, open);
    this.shows = parseShows(ses.shows, this.places);
    this.fixActive();
    const want = ses.tabs[ses.active ?? 0];
    const i = this.tabs.findIndex((t) => t.key === want);
    if (i >= 0 && this.placeOf(i) === "main") this.switchTab(i);
    this.focus = "main";
  }

  /** rows hidden by the camera notch in full screen (deck.measureNotch): a band, the deck starts under it */
  notchRows = 0;

  render(ui: UI): void {
    const d = this.deck;
    this.tidyPlaces();
    this.noteVisit();
    this.saveSession();
    const W = ui.cols;
    const N = this.notchRows;
    const H = ui.rows - N;
    // the animated background (not with reduce motion: it's the costliest thing that never stops)
    if (d.settings.data.fx.ambient && !d.settings.data.appearance.reduceMotion) drawBackground(ui, { x: 0, y: N, w: W, h: H }, ui.theme, 0.7);
    if (N) renderNotchBand(ui, { x: 0, y: 0, w: W, h: N });
    if (N && d.settings.data.fx.ambient && !d.settings.data.appearance.reduceMotion) drawBackground(ui, { x: 0, y: 0, w: W, h: N }, ui.theme, 0.7);

    // the top bar: one row — the deck menu, UPLINK, the clock (each frame has its tabs on its border)
    renderTopBar(this, ui, { x: 0, y: N, w: W, h: TOP_H });

    // the frames: the arrangement (settings.layout — today's when nothing's saved) with the
    // switches applied (tree, panel, shell shown), solved into one rect each (layout/solve.ts).
    // The maximized shell keeps its own layout (the page in a strip at the bottom).
    // a row of air under the top bar: the frames' tabs (VAULT, home…, PANEL) sat right against it
    const body = { x: 1, y: N + TOP_H + SECTION, w: W - 2, h: H - TOP_H - SECTION - 1 };
    const max = this.shellVisible && this.shellMax;
    const today: Today = { sidebar: this.sidebarVisible, shell: this.shellVisible, shellMax: this.shellMax, panel: !!d.settings.data.panel?.shown, shellRatio: this.shellRatio, cols: W, bodyH: body.h };
    const layout = max ? todayLayout(today) : effectiveLayout(this.arrangement, today);
    const at = solveLayout(layout, body).rects;
    this.layout = layout;
    const arr = this.arrangement;
    const strips = new Set(frames(layout).filter((f) => f.strip).map((f) => f.id));

    // the borders between frames: grab one to resize (registered first: what the frames draw on
    // their top line — the shell's tabs, a title — wins the click; the gap between columns is free)
    // (a frame's top is two rows now — its tabs' row and its line: both grab its top border)
    // what you grab: side by side, the gap AND the two frames' edges beside it (one cell was
    // too thin to hit); stacked, the lower frame's two top rows (its tabs' row and its line)
    const borders = max ? [] : bordersOf(layout, at).filter((b) => !b.strip && !(b.dir === "col" && b.b === "shell" && this.shellAtBottom)).map((b) => ({ ...b, line: b.grip, grip: b.dir === "col" ? { ...b.grip, h: 2 } : { ...b.grip, x: b.grip.x - INSET, w: b.grip.w + INSET * 2 } }));
    for (const b of borders) ui.hit(b.grip, { onClick: (m) => (this.borderDrag = { b, arr, m }), onDrag: (m) => this.dragBorder(m), onUp: () => (this.borderDrag = null), tip: t("drag: resize · layout reset puts everything back") });

    this.rects = {};
    // folded frames: a one-cell strip with their name; a click opens them again
    for (const id of strips) {
      const r = at.get(id);
      if (r) drawStrip(ui, r, id === "vault" ? "vault" : id === "panel" ? "panel" : "shell", `frame unfold ${id === "vault" ? "tree" : id}`);
    }
    const vaultR = strips.has("vault") ? undefined : at.get("vault");
    if (this.sidebarVisible && vaultR) {
      this.rects.sidebar = vaultR;
      // every frame has its tabs on its border: the tree's is one, VAULT
      const focused = this.focus === "sidebar" && !this.topModal;
      // a tab moved here (tab move <n> tree) may be the one shown instead of the tree
      const moved = this.shownIn("vault");
      const inner = tabbedBox(ui, vaultR, { focused, info: moved ? undefined : `${d.vault.markdown().length}` });
      const own = soloTab(ui, vaultR, "vault", focused, { onClick: () => (moved ? this.showIn("vault", null) : (this.focus = "sidebar")), tip: t("your notes and files · ◧ or ⌘B hides the tree"), menu: () => [...frameMenu("tree"), "-", { label: t("Hide tree"), cmd: "view sidebar", hint: IS_MAC ? "⌘B" : "ctrl+B" }] }, !moved);
      placeChips(this, ui, own.x + own.w + INSET, vaultR.y, vaultR.x + vaultR.w - INSET, "vault", focused);
      // (clipped: in a tiny window the tree's list drew a row under its frame)
      if (moved) ui.clip(inner, () => moved.render(ui, inner, focused));
      else ui.clip(inner, () => this.sidebar.render(ui, inner, this.focus === "sidebar"));
    }

    // the side panel on the right: widgets that stay in view (panel show · ◨ in the status bar);
    // folded by the solver when the page would keep less than 40 cells
    this.sidePanel.area = null;
    const panelR = strips.has("panel") ? undefined : at.get("panel");
    if (panelR) {
      this.rects.panel = panelR; // a click there gives it the focus
      const focused = this.focus === "panel" && !this.topModal;
      const moved = this.shownIn("panel");
      if (moved) {
        // a tab moved here, shown instead of the widgets (PANEL's tab brings them back)
        const inner = tabbedBox(ui, panelR, { focused });
        soloTab(ui, panelR, t("PANEL"), focused, { onClick: () => this.showIn("panel", null), tip: t("the panel's widgets") }, false);
        ui.clip(inner, () => moved.render(ui, inner, focused));
      } else this.sidePanel.render(ui, panelR);
      // the tabs moved here, after PANEL's own
      placeChips(this, ui, panelR.x + strWidth(t("PANEL")) + INSET * 4, panelR.y, panelR.x + panelR.w - INSET, "panel", focused);
    }
    if (this.focus === "panel" && !this.rects.panel) this.focus = "main"; // the panel went away
    // the page (maximized shell: in the strip at the bottom)
    const mainR = at.get("main") ?? body;
    this.rects.main = mainR;
    const app = this.activeApp;
    const mainFocused = this.focus === "main" && !this.topModal;
    // its tabs on its top border (tabstrip.ts): the names above, their bars on the line
    const inner = tabbedBox(ui, mainR, { focused: mainFocused });
    renderTabStrip(this, ui, { x: mainR.x + INSET, y: mainR.y, w: mainR.w - INSET * 2, h: 2 });
    if (app?.menu) ui.hit(inner, { menu: () => app.menu!() });
    if (app) ui.clip(inner, () => app.render(ui, inner, mainFocused));
    if (this.editing) editBand(this, ui, inner, this.sidePanel.area);

    const shellR = strips.has("shell") ? undefined : at.get("shell");
    // its own top border resizes it (its share of the height) where it's along the bottom
    if (this.shellVisible && shellR) renderShellPanel(this, ui, shellR, body, max || !this.shellAtBottom);
    // a folded frame can't keep the focus (keys would go somewhere you can't see)
    if (this.focus === "sidebar" && strips.has("vault")) this.focus = "main";
    if (this.focus === "shell" && strips.has("shell")) this.focus = "main";
    // the border under the pointer (or being dragged), lit
    // (stacked: only the line is lit, and only when the pointer is on it — over the tabs' row it
    // lit every tab of that row)
    for (const b of borders) {
      const dragged = this.borderDrag?.b.a === b.a && this.borderDrag?.b.b === b.b;
      // lit, with a handle in its middle that says which way it goes
      if (b.dir === "row" && (dragged || ui.hovered(b.grip))) {
        ui.vline(b.line.x, b.line.y, b.line.h, { fg: ui.c.accent }, "┃");
        ui.text(b.line.x, b.line.y + Math.floor(b.line.h / 2), "↔", { fg: ui.c.panel, bg: ui.c.accent, attrs: BOLD });
      }
      const edge = { x: b.line.x, y: b.line.y + 1, w: b.line.w, h: 1 };
      if (b.dir === "col" && (dragged || ui.hovered(edge))) {
        ui.tint(edge, ui.c.accent);
        ui.text(edge.x + Math.floor(edge.w / 2), edge.y, "↕", { fg: ui.c.panel, bg: ui.c.accent, attrs: BOLD });
      }
    }

    // a tab shown in a frame that isn't on screen (a narrow window drops the panel): back to the
    // page's frame, where it can be reached (it was in no list at all)
    // which frames are on screen: a tab whose frame isn't is reached in the page's (reachOf)
    const seen = new Set<PlaceFrame>([...(this.rects.sidebar ? ["vault" as const] : []), ...(this.rects.panel ? ["panel" as const] : []), ...(this.rects.shell ? ["shell" as const] : [])]);
    if ([...seen].join() !== [...this.onScreen].join() || !this.drawnOnce) {
      this.onScreen = seen;
      this.drawnOnce = true;
      d.requestFrame();
    }
    // (a tab asked to show in a frame that didn't come on screen: reachOf has it in the page's)
    if (this.revealing && !this.rects[PANE_OF[this.revealing]]) d.requestFrame();
    this.revealing = null;
    // a tab dragged onto another frame: that frame, outlined
    drawDropFrame(this, ui);

    renderStatusBar(this, ui, { x: 0, y: N + H - 1, w: W, h: 1 });
    renderSubtitles(this, ui, W, N + H);

    const screen = { x: 0, y: N, w: W, h: H };
    this.overlays = this.overlays.filter((o) => !o.done);
    // the on-screen keyboard is drawn last so it stays clickable above dialogs
    for (const o of this.overlays) if (!(o instanceof Osk)) o.render(ui, screen);
    for (const o of this.overlays) if (o instanceof Osk) o.render(ui, screen);
    this.toasts.render(ui, screen);
    this.drawGhost(ui, screen);
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

/** A folded frame: a one-cell strip with its name (down a column, or along a row); a click opens it. */
function drawStrip(ui: UI, r: Rect, name: string, cmd: string): void {
  const c = ui.c;
  ui.fill(r, { bg: c.highlight });
  const label = `▸${name}`;
  // (the theme's text colour: muted on the highlight was too pale to read)
  if (r.w <= r.h) [...label].slice(0, r.h).forEach((ch, i) => ui.text(r.x, r.y + i, ch, { fg: c.fg, bg: c.highlight }));
  else ui.text(r.x + INSET, r.y, `▸ ${name}`, { fg: c.fg, bg: c.highlight }, r.w - INSET * 2);
  ui.hit(r, { cmd, tip: t("click: open it again") });
}

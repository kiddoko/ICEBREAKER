import { AIManager } from "./ai";
import { helpSpec } from "./apps/help";
import { homeSpec } from "./apps/home";
import { journalSpec, JournalApp } from "./apps/journal";
import { linkSpec } from "./apps/link";
import { modulesSpec } from "./apps/modules";
import { setupSpec } from "./apps/setup";
import { noteSpec } from "./apps/note";
import { ActionRegistry, AppRegistry } from "./apps/registry";
import { settingsSpec } from "./apps/settings";
import { sysmonSpec } from "./apps/sysmon";
import type { App, PaletteAction } from "./apps/types";
import { css } from "./core/color";
import { GamepadInput } from "./core/gamepad";
import { Grid } from "./core/grid";
import { InputManager, type Action, type ActionSource, type InputSink, type KeyInput, type MouseInput } from "./core/input";
import { FrameLoop } from "./core/loop";
import { fontStack, loadFont, WEIGHTS } from "./core/fonts";
import { Renderer } from "./core/renderer";
import { Sound } from "./core/sound";
import type { SettingsStore } from "./core/settings";
import { ThemeManager, type Theme } from "./core/theme";
import { glitch } from "./fx/glitch";
import type { Platform } from "./platform/types";
import { PluginHost } from "./plugins/host";
import { deckCommands } from "./shell/commands/deck";
import { fileCommands } from "./shell/commands/files";
import { systemCommands } from "./shell/commands/system";
import { ShellApp } from "./shell/shell";
import { CommandRegistry } from "./shell/types";
import type { Hit } from "./ui/ui";
import { UI } from "./ui/ui";
import { ensureEntry } from "./vault/journal";
import { basename, join, slugify } from "./vault/paths";
import { Vault } from "./vault/vault";
import { BootScreen, type BootLine } from "./workspace/boot";
import { LockScreen } from "./workspace/lock";
import { applyFxPreset } from "./workspace/fxpanel";
import type { ToastKind } from "./workspace/overlays";
import { Workspace } from "./workspace/workspace";
import { BUILTIN_WIDGETS } from "./widgets/builtin";
import { WidgetRegistry } from "./widgets/types";

/**
 * The composition root: creates every subsystem, wires them together and
 * exposes a small set of verbs (openFile, notify, confirm…) that apps,
 * commands and plugins use. If you're looking for "where does X start",
 * it's here.
 */
export class Deck implements InputSink {
  readonly themes = new ThemeManager();
  readonly vault: Vault;
  readonly commands = new CommandRegistry();
  readonly apps = new AppRegistry();
  readonly actions = new ActionRegistry();
  readonly widgets = new WidgetRegistry();
  readonly ai: AIManager;
  readonly plugins: PluginHost;
  readonly workspace: Workspace;
  readonly shell: ShellApp;
  readonly renderer: Renderer;
  readonly loop: FrameLoop;
  readonly input: InputManager;
  readonly gamepad: GamepadInput;
  readonly sound = new Sound();

  private readonly ui = new UI();
  private grid = new Grid(1, 1);
  private hits: Hit[] = [];
  private boot: BootScreen | null = null;
  /** Login screen; while it's up nothing else is drawn or gets input. */
  private lock: LockScreen | null = null;
  /** Account name when the deck has a login (null = no lock). */
  account: string | null = null;
  private glitchUntil = 0;
  private lastActivity = performance.now();

  constructor(
    readonly platform: Platform,
    readonly settings: SettingsStore,
  ) {
    const el = (id: string) => document.getElementById(id)!;
    this.vault = new Vault(platform.vault);
    this.ai = new AIManager(settings);
    this.plugins = new PluginHost(this);
    this.renderer = new Renderer(el("screen") as HTMLCanvasElement, el("bloom") as HTMLCanvasElement, settings.data.appearance.fontSize);
    this.loop = new FrameLoop(this.frame, settings.data.appearance.maxFps);
    this.input = new InputManager(this, this.renderer, el("deck"), el("keyboard-sink") as HTMLTextAreaElement);
    this.input.onActivity = () => {
      this.lastActivity = performance.now();
      this.loop.request();
    };
    this.gamepad = new GamepadInput((a) => {
      this.lastActivity = performance.now();
      this.action(a, "gamepad");
    });
    this.workspace = new Workspace(this);
    this.shell = new ShellApp(this);

    this.vault.events.on("changed", () => this.requestFrame());
    window.addEventListener("resize", () => this.resize());
  }

  get theme(): Theme {
    return this.themes.current;
  }

  // ── startup ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const s = this.settings.data;
    this.vault.journalFolder = s.journal.folder;
    this.ai.envKey = await this.platform.envApiKey().catch(() => null);
    this.ai.claudeCode = this.platform.claudeCode;
    this.ai.claudeCodePath = (await this.platform.claudeCode?.detect().catch(() => null)) ?? null;
    await this.vault.mount(s.vault.path);
    if (!s.vault.path) this.settings.set("vault.path", this.vault.root);
    await this.reloadUserThemes();
    this.themes.current = this.themes.get(s.appearance.theme) ?? this.themes.default;

    this.account = await this.platform.account.status().catch(() => null);
    if (this.account) this.lockNow();
    this.sound.enabled = s.sound.enabled;
    this.sound.volume = s.sound.volume / 100;
    void this.reloadSounds();

    this.registerCore();
    await this.plugins.init();

    this.shell.motd();
    this.openApp("home");
    if (!s.setup.done) this.openApp("setup");
    this.applyFx();
    await this.applyFont();
    // (browsers only allow fullscreen after a click, so this is desktop-only)
    if (s.appearance.startFullscreen && this.platform.kind === "desktop") void this.platform.window.setFullscreen(true).catch(() => {});

    if (s.boot.mode !== "off") this.boot = new BootScreen(await this.bootLines(), await this.memMB(), s.boot.mode);
    this.sound.play("boot");
    setInterval(() => this.checkIdle(), 15_000);
    this.loop.request();
  }

  private registerCore(): void {
    for (const c of [...fileCommands, ...systemCommands, ...deckCommands]) this.commands.register({ ...c, source: "core" });
    for (const w of BUILTIN_WIDGETS) this.widgets.register(w);
    for (const a of [homeSpec, modulesSpec, setupSpec, noteSpec, journalSpec, linkSpec, sysmonSpec, settingsSpec, helpSpec]) this.apps.register(a);

    const act = (id: string, title: string, run: () => void, hint?: string, group = "deck") => this.actions.register({ id, title, run, hint, group });
    act("journal.today", "Journal: today", () => void this.openJournal(new Date()), "ctrl+j", "journal");
    act("journal.yesterday", "Journal: yesterday", () => void this.openJournal(new Date(Date.now() - 86400_000)), undefined, "journal");
    act("note.new", "New note", () => void this.newNote(), "ctrl+n", "notes");
    act("daily.log", "Daily log (end-of-day check-in)", () => void this.shell.runLine("daily"), undefined, "journal");
    act("deck.lock", "Lock the deck", () => this.account ? this.lockNow() : this.notify("no account yet — run `account create` in the shell"), undefined, "deck");
    act("setup.run", "Setup (first-run questionnaire)", () => void this.openApp("setup"), undefined, "deck");
    act("modules.open", "Modules (all apps and plugins)", () => void this.openApp("modules"), undefined, "deck");
    act("link.open", "Open LINK (AI chat)", () => void this.openApp("link"), "ctrl+space", "ai");
    act("ai.key", "Set Anthropic API key", () => void this.shell.runLine("config key"), undefined, "ai");
    act("ai.provider", "Cycle AI provider (Claude Code ⇄ Anthropic API ⇄ local Ollama)", () => {
      const order = ["claude-code", "anthropic", "ollama"] as const;
      this.settings.set("ai.provider", order[(order.indexOf(this.settings.data.ai.provider) + 1) % order.length]);
      this.notify(`AI provider: ${this.settings.data.ai.provider}`);
    }, undefined, "ai");
    act("shell.focus", "Focus shell", () => this.workspace.focusShell(), "ctrl+`", "view");
    act("sidebar.toggle", "Toggle file tree", () => this.workspace.toggleSidebar(), "ctrl+b", "view");
    act("view.fullscreen", "Toggle fullscreen", () => void this.toggleFullscreen(), "F11", "view");
    act("view.zoomin", "Zoom in", () => this.zoom(1), "ctrl+=", "view");
    act("view.zoomout", "Zoom out", () => this.zoom(-1), "ctrl+-", "view");
    act("view.osk", "On-screen keyboard", () => this.workspace.toggleOsk(), "pad X", "view");
    act("fx.panel", "Visual effects… (bloom, scanlines, vignette)", () => this.workspace.fxPanel(), "✦ fx", "fx");
    act("fx.minimal", "Effects: minimal (default)", () => applyFxPreset(this, "minimal"), undefined, "fx");
    act("fx.max", "Effects: everything on", () => applyFxPreset(this, "max"), undefined, "fx");
    act("fx.potato", "Effects: potato mode (all off, 30fps)", () => applyFxPreset(this, "potato"), undefined, "fx");
    act("fx.rain", "Screensaver", () => this.screensaver(), undefined, "fx");
    act("deck.reboot", "Reboot (replay boot sequence)", () => this.reboot(), undefined, "deck");
    act("deck.quit", "Quit ICEBREAKER", () => void this.quit(), undefined, "deck");
    act("vault.rescan", "Rescan vault", () => void this.vault.rescan(), undefined, "vault");
    act("plugin.new", "Create a plugin…", async () => {
      const id = await this.prompt("Plugin id", { placeholder: "my-plugin" });
      if (id) void this.shell.runLine(`plugin new ${id}`);
    }, undefined, "dev");
    act("theme.new", "Create a theme from the current one…", async () => {
      const name = await this.prompt("Theme name", { placeholder: "my-theme" });
      if (name) void this.shell.runLine(`theme new ${name}`);
    }, undefined, "dev");
  }

  /** The POST screen lists real facts about this machine and vault. */
  private async bootLines(): Promise<BootLine[]> {
    const stats = await Promise.race([this.platform.system.stats().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 400))]);
    const ai = this.ai.problem;
    return [
      { text: `CPU0  ${stats?.cpuBrand || "neural bus"} · ${stats?.cores.length ?? "?"} cores`, status: "INFO" },
      { text: `Host  ${stats?.host ?? "deck"} · ${stats?.os ?? this.platform.kind}`, status: "INFO" },
      { text: `Mounted vault at ${this.vault.root} (${this.vault.markdown().length} notes)`, status: "OK" },
      { text: `Indexed ${this.vault.journalDates().size} journal entries`, status: "OK" },
      { text: `Loaded theme: ${this.theme.name} (${this.themes.list().length} available)`, status: this.themes.errors.length ? "WARN" : "OK" },
      { text: "Started input daemon: keyboard · mouse · gamepad", status: "OK" },
      { text: `Shell ibsh with ${this.commands.names().length} commands`, status: "OK" },
      { text: `Plugins: ${this.plugins.active().map((p) => p.manifest.id).join(", ") || "none"}`, status: this.plugins.list().some((p) => p.error) ? "WARN" : "OK" },
      ai ? { text: `Neural link offline: ${ai}`, status: "WARN" } : { text: `Neural link: ${this.ai.provider.label}`, status: "OK" },
      { text: "No hostile ICE detected on local segment", status: "OK" },
      { text: "Reached target: Cyberspace.", status: "OK" },
    ];
  }

  private async memMB(): Promise<number> {
    const s = await this.platform.system.stats().catch(() => null);
    return s ? Math.round(s.memTotal / 1024 ** 2) : 16384;
  }

  // ── the frame ────────────────────────────────────────────────────────────

  private frame = (now: number): number => {
    if (this.grid.cols !== this.renderer.cols || this.grid.rows !== this.renderer.rows) this.grid = new Grid(this.renderer.cols, this.renderer.rows);
    const ui = this.ui;
    ui.begin(this.grid, this.theme, now, this.input.mouseCell);
    ui.cellAspect = this.renderer.cellW / this.renderer.cellH;

    this.boot?.render(ui);
    if (this.boot?.done) {
      // boot just finished: draw the desktop in this very frame, through a glitch
      this.boot = null;
      ui.begin(this.grid, this.theme, now, this.input.mouseCell);
      this.glitch(450);
    }
    if (!this.boot && this.lock) this.lock.render(ui);
    else if (!this.boot) this.workspace.render(ui);

    const g = this.glitchUntil - performance.now();
    if (g > 0) {
      glitch(this.grid, Math.min(1, g / 300), Math.floor(now / 50));
      ui.animate(16);
    }
    this.renderer.draw(this.grid);
    if (ui.caret) this.input.placeCaret(ui.caret.x, ui.caret.y);
    this.hits = ui.hits;
    return ui.wakeIn;
  };

  /** Show the login screen (only when an account exists). */
  lockNow(): void {
    if (!this.account) return;
    this.lock = new LockScreen(this, this.account, () => {
      this.lock = null;
      this.glitch(400);
      this.notify(`welcome back, ${this.settings.data.user.handle}`, "success");
    });
    this.requestFrame();
  }

  get locked(): boolean {
    return this.lock !== null;
  }

  requestFrame(): void {
    this.loop.request();
  }

  private resize(): void {
    this.renderer.resize();
    this.loop.request();
  }

  // ── InputSink: everything the keyboard/mouse/gamepad produce lands here ──

  key(k: KeyInput): void {
    if (this.boot) return this.boot.skip();
    if (this.lock) return this.lock.onKey(k), this.requestFrame();
    this.workspace.handleKey(k);
    this.requestFrame();
  }

  text(t: string): void {
    if (this.boot) return this.boot.skip();
    if (this.lock) return this.lock.onText(t), this.requestFrame();
    this.workspace.handleText(t);
    this.requestFrame();
  }

  mouse(m: MouseInput): void {
    if (this.boot) {
      if (m.kind === "down") this.boot.skip();
      return;
    }
    if (m.kind !== "move") this.workspace.handleMouse(m, this.hits);
    this.requestFrame();
  }

  action(a: Action, source: ActionSource): void {
    if (this.boot) return this.boot.skip();
    if (this.lock) return;
    this.workspace.handleAction(a, source);
    this.requestFrame();
  }

  // ── verbs used by apps, commands and plugins ─────────────────────────────

  notify(text: string, kind: ToastKind = "info"): void {
    this.sound.play(kind === "error" ? "error" : kind === "success" ? "success" : "notify");
    this.workspace.notify(text, kind);
    this.requestFrame();
  }

  confirm(title: string, detail = ""): Promise<boolean> {
    const p = this.workspace.confirm(title, detail);
    this.requestFrame();
    return p;
  }

  prompt(title: string, opts: { initial?: string; placeholder?: string; mask?: boolean } = {}): Promise<string | null> {
    const p = this.workspace.prompt(title, opts);
    this.requestFrame();
    return p;
  }

  openApp(kind: string, args?: unknown): App | null {
    const spec = this.apps.get(kind);
    if (!spec) {
      this.notify(`unknown app: ${kind}`, "error");
      return null;
    }
    try {
      if (this.workspace.activeApp?.key !== kind) this.sound.play("open");
      const app = this.workspace.open(spec.create(this, args));
      this.requestFrame();
      return app;
    } catch (e) {
      this.notify(`${kind}: ${e instanceof Error ? e.message : e}`, "error");
      return null;
    }
  }

  async openFile(path: string): Promise<void> {
    this.openApp("note", path);
  }

  async openJournal(date: Date = new Date()): Promise<void> {
    const existing = this.workspace.findTab("journal");
    if (existing instanceof JournalApp) {
      existing.goto(date);
      this.workspace.open(existing);
    } else {
      await ensureEntry(this.vault, date, this.settings.data.user.locale).catch(() => {});
      this.openApp("journal", date);
    }
    this.requestFrame();
  }

  async newNote(folder = "notes"): Promise<void> {
    const title = await this.prompt("New note title", { placeholder: "e.g. Night city ideas" });
    if (!title?.trim()) return;
    const path = join(folder, `${slugify(title)}.md`);
    if (!(await this.vault.exists(path))) await this.vault.write(path, `# ${title.trim()}\n\n`);
    await this.openFile(path);
  }

  setTheme(name: string): boolean {
    const t = this.themes.get(name);
    if (!t) return false;
    const fontChanged = this.themes.current.font.family !== t.font.family || this.themes.current.font.scale !== t.font.scale || String(this.themes.current.font.weights) !== String(t.font.weights);
    this.themes.current = t;
    if (this.settings.data.appearance.theme !== name) this.settings.set("appearance.theme", name);
    if (fontChanged) void this.applyFont();
    this.applyFx();
    this.renderer.invalidate();
    this.glitch(300);
    this.requestFrame();
    return true;
  }

  async reloadUserThemes(): Promise<void> {
    this.themes.loadUserThemes(await this.vault.toolFiles("themes", ".toml"));
    const cur = this.themes.get(this.theme.name);
    if (cur) this.themes.current = cur;
    this.requestFrame();
  }

  /** Push theme + fx settings to the CSS post-effect layers. */
  applyFx(): void {
    const fx = this.settings.data.fx;
    const t = this.theme;
    const root = document.documentElement.style;
    root.setProperty("--deck-bg", css(t.c.bg));
    root.setProperty("--bloom", String(fx.bloom ? t.fx.bloom : 0));
    root.setProperty("--scanlines", String(fx.scanlines ? t.fx.scanlines : 0));
    root.setProperty("--vignette", String(fx.vignette ? t.fx.vignette : 0));
    document.getElementById("bloom")!.style.display = fx.bloom ? "block" : "none";
    document.getElementById("scanlines")!.style.display = fx.scanlines ? "block" : "none";
    document.getElementById("vignette")!.style.display = fx.vignette ? "block" : "none";
    document.getElementById("deck")!.classList.toggle("flicker", fx.flicker);
    this.renderer.bloomEnabled = fx.bloom;
    this.loop.maxFps = this.settings.data.appearance.maxFps;
    this.requestFrame();
  }

  /** React to a setting changed from the shell or the settings screen. */
  applySettings(key: string): void {
    const s = this.settings.data;
    if (key === "appearance.theme") this.setTheme(s.appearance.theme);
    else if (key === "appearance.fontWeight" || key === "appearance.fontSize" || key === "appearance.scale") void this.applyFont();
    else if (key === "journal.folder") this.vault.journalFolder = s.journal.folder;
    else if (key === "user.handle") this.shell.exec.env.USER = s.user.handle;
    else if (key.startsWith("fx.") || key === "appearance.maxFps") this.applyFx();
    else if (key.startsWith("sound.")) {
      this.sound.enabled = s.sound.enabled;
      this.sound.volume = s.sound.volume / 100;
      this.sound.play("confirm");
    }
    this.requestFrame();
  }

  /** dir +1 / -1 changes the interface scale by 10 % (25–200 %), 0 resets to 100 %. */
  zoom(dir: number): void {
    const cur = this.settings.data.appearance.scale;
    const next = dir === 0 ? 100 : Math.max(25, Math.min(200, Math.round(cur / 5) * 5 + dir * 10));
    if (next !== cur) this.settings.set("appearance.scale", next);
    void this.applyFont();
    this.notify(`scale ${next}%`);
  }

  /** Typeface, weight and size from the theme + appearance settings. */
  async applyFont(): Promise<void> {
    const a = this.settings.data.appearance;
    const f = this.theme.font;
    const weights = f.weights ?? WEIGHTS[a.fontWeight] ?? WEIGHTS.thin;
    await loadFont(f.family, weights);
    this.renderer.setFont(fontStack(f.family), weights);
    this.renderer.setFontSize((a.fontSize * Math.max(25, Math.min(200, a.scale || 100)) * f.scale) / 100);
    this.resize();
  }

  async toggleFullscreen(): Promise<void> {
    const on = !(await this.platform.window.isFullscreen());
    await this.platform.window.setFullscreen(on);
  }

  async mountVault(path: string): Promise<void> {
    for (const t of [...this.workspace.tabs]) await t.close?.();
    this.workspace.tabs = [];
    await this.vault.mount(path);
    this.settings.set("vault.path", this.vault.root);
    await this.reloadUserThemes();
    await this.plugins.reload();
    this.openApp("home");
    this.notify(`vault: ${this.vault.root}`, "success");
  }

  /** (Re)load custom sounds from .icebreaker/sounds. Returns how many were found. */
  async reloadSounds(): Promise<number> {
    const rb = this.platform.vault.readBytes;
    if (!rb) return 0;
    return this.sound.loadCustom(async (p) => ((await this.vault.exists(p).catch(() => false)) ? rb(p) : null));
  }

  glitch(ms: number): void {
    if (!this.settings.data.fx.glitch) return;
    this.glitchUntil = performance.now() + ms;
    this.requestFrame();
  }

  screensaver(): void {
    this.workspace.screensaver();
    this.requestFrame();
  }

  reboot(): void {
    this.boot = new BootScreen([{ text: "Rebooting deck…", status: "INFO" }, { text: `Vault ${basename(this.vault.root)} remounted`, status: "OK" }, { text: "Reached target: Cyberspace.", status: "OK" }], 16384, "full");
    this.requestFrame();
  }

  async quit(): Promise<void> {
    for (const t of this.workspace.tabs) await t.close?.();
    await this.platform.window.quit();
  }

  private checkIdle(): void {
    const min = this.settings.data.fx.screensaverMinutes;
    if (min > 0 && performance.now() - this.lastActivity > min * 60_000 && !this.boot && !this.workspace.overlays.length) this.screensaver();
  }

  /** Everything the command palette can do. */
  paletteEntries(): PaletteAction[] {
    const out: PaletteAction[] = [...this.actions.list()];
    for (const spec of this.apps.list()) {
      if (spec.kind === "note") continue;
      out.push({ id: `app.${spec.kind}`, title: spec.title, group: "open", hint: spec.description, run: () => void this.openApp(spec.kind) });
    }
    for (const t of this.themes.list()) out.push({ id: `theme.${t.name}`, title: t.name, group: "theme", hint: t.description, run: () => void this.setTheme(t.name) });
    for (const e of this.vault.markdown().slice(0, 3000)) out.push({ id: `file.${e.path}`, title: e.path, group: "file", run: () => void this.openFile(e.path) });
    for (const c of this.commands.all()) out.push({ id: `cmd.${c.name}`, title: c.name, group: "$", hint: c.summary, run: () => void this.shell.runLine(c.name).then(() => this.workspace.focusShell()) });
    return out;
  }
}

import { AIManager } from "./ai";
import { helpSpec } from "./apps/help";
import { homeSpec } from "./apps/home";
import { journalSpec, JournalApp } from "./apps/journal";
import { linkSpec } from "./apps/link";
import { modulesSpec } from "./apps/modules";
import { setupSpec } from "./apps/setup";
import { studioSpec } from "./apps/studio";
import { explorerSpec } from "./apps/explorer";
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
import { applyTweaks, ThemeManager, type Theme } from "./core/theme";
import { glitch } from "./fx/glitch";
import type { Platform } from "./platform/types";
import { PluginHost } from "./plugins/host";
import { deckCommands } from "./shell/commands/deck";
import { fileCommands } from "./shell/commands/files";
import { systemCommands } from "./shell/commands/system";
import { ShellApp } from "./shell/shell";
import { ShellExecutor } from "./shell/exec";
import { CommandRegistry } from "./shell/types";
import { q, type Hit } from "./ui/ui";
import { UI } from "./ui/ui";
import { ensureEntry } from "./vault/journal";
import { basename, join, slugify } from "./vault/paths";
import { Vault } from "./vault/vault";
import { BootScreen, type BootLine } from "./workspace/boot";
import { CellFx, Transitions } from "./fx/transition";
import type { ChoiceOption } from "./plugins/api";
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
  /** the last real boot, replayed by `reboot` */
  private lastBoot: BootScreen | null = null;
  /** Until the boot screen exists: draw nothing (no flash of the login or the desktop). */
  private starting = true;
  /** Login screen; while it's up nothing else is drawn or gets input. */
  private lock: LockScreen | null = null;
  /** Account name when the deck has a login (null = no lock). */
  account: string | null = null;
  private glitchUntil = 0;
  private readonly transitions = new Transitions();
  private readonly cellFx = new CellFx();
  private lastActivity = performance.now();

  constructor(
    readonly platform: Platform,
    readonly settings: SettingsStore,
  ) {
    const el = (id: string) => document.getElementById(id)!;
    this.vault = new Vault(platform.vault);
    this.ai = new AIManager(settings);
    // the AI wrote notes: pick them up in the tree, search, widgets…
    this.ai.onVaultWrite = () => void this.vault.rescan().then(() => this.requestFrame());
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
    const t0 = performance.now();
    // look and feel first, so the boot screen is already in your theme and font
    this.refreshTheme(true);
    this.applyFx();
    await this.applyFont();
    // (browsers only allow fullscreen after a click, so this is desktop-only)
    if (s.appearance.startFullscreen && this.platform.kind === "desktop") void this.platform.window.setFullscreen(true).catch(() => {});

    // the POST runs live: each line shows when its step is really done
    const boot = s.boot.mode !== "off" ? new BootScreen(s.boot.mode) : null;
    this.boot = boot;
    this.starting = !boot;
    this.loop.request();
    const step = async <T>(run: () => Promise<T> | T, line: (v: T) => BootLine | null): Promise<T> => {
      const t = performance.now();
      try {
        const v = await run();
        const l = line(v);
        if (l) boot?.log({ ms: performance.now() - t, ...l });
        return v;
      } catch (e) {
        boot?.log({ text: `startup step failed: ${e instanceof Error ? e.message : e}`, status: "FAIL", ms: performance.now() - t });
        throw e;
      }
    };

    const stats = await step(
      () => this.platform.system.stats().catch(() => null),
      (st) => st ? { text: `CPU0  ${st.cpuBrand || "unknown cpu"} · ${st.cores.length} cores · ${st.host} · ${st.os}`, status: "INFO" } : { text: "CPU0  no system probe on this platform", status: "INFO" },
    );
    if (boot) boot.memMB = stats ? Math.round(stats.memTotal / 1024 ** 2) : 0;
    this.vault.journalFolder = s.journal.folder;
    await step(() => this.vault.mount(s.vault.path), () => ({ text: `Mounted vault at ${this.vault.root} (${this.vault.markdown().length} notes, ${this.vault.journalDates().size} journal entries)`, status: "OK" }));
    if (!s.vault.path) this.settings.set("vault.path", this.vault.root);
    const fontOf = () => `${this.theme.font.family}|${this.theme.font.scale}|${this.theme.font.weights}`;
    const font = fontOf();
    await step(() => this.reloadUserThemes(), () => ({ text: `Loaded theme ${this.theme.name} (${this.themes.list().length} available${this.themes.errors.length ? `, ${this.themes.errors.length} broken` : ""})`, status: this.themes.errors.length ? "WARN" : "OK" }));
    this.refreshTheme(true);
    if (fontOf() !== font) await this.applyFont(); // your theme lives in the vault and has its own font

    this.account = await step(
      () => this.platform.account.status().catch(() => null),
      (a) => ({ text: a ? `Account ${a}: login required` : "No account: the deck opens unlocked", status: a ? "OK" : "INFO" }),
    );
    if (this.account) this.lockNow();
    this.sound.enabled = s.sound.enabled;
    this.sound.volume = s.sound.volume / 100;
    await step(() => this.reloadSounds().catch(() => 0), (n) => ({ text: `Sound ${s.sound.enabled ? "on" : "muted"} · pack ${this.theme.sound.pack}${n ? ` · ${n} custom sounds` : ""}`, status: "OK" }));

    await step(async () => {
      this.ai.envKey = await this.platform.envApiKey().catch(() => null);
      this.ai.claudeCode = this.platform.claudeCode;
      this.ai.claudeCodePath = (await this.platform.claudeCode?.detect().catch(() => null)) ?? null;
    }, () => {
      const p = this.ai.problem;
      return p ? { text: `Neural link offline: ${p}`, status: "WARN" } : { text: `Neural link: ${this.ai.provider.label}${this.ai.claudeCodePath ? ` (${this.ai.claudeCodePath})` : ""}`, status: "OK" };
    });

    await step(() => this.registerCore(), () => ({ text: `Shell ibsh: ${this.commands.names().length} commands · ${this.apps.list().length} apps · ${this.widgets.list().length} widgets`, status: "OK" }));
    await step(() => this.plugins.init(), () => ({ text: `Plugins: ${this.plugins.active().map((p) => p.manifest.id).join(", ") || "none"}`, status: this.plugins.list().some((p) => p.error) ? "WARN" : "OK" }));
    this.platform.bridge?.onRun((req) => void this.runBridged(req));
    // files changed in the terminal, Obsidian, Finder…: refresh the tree, search, widgets
    await step(() => this.platform.onVaultChange?.(() => void this.vault.rescan().then(() => this.requestFrame())), () => this.platform.onVaultChange ? { text: "Watching the vault for outside changes", status: "OK" } : null);
    const pads = (navigator.getGamepads?.() ?? []).filter(Boolean).length;
    boot?.log({ text: `Input: keyboard · mouse${pads ? ` · ${pads} gamepad${pads > 1 ? "s" : ""}` : " · gamepad (none plugged in)"}`, status: "OK" });

    this.shell.motd();
    this.openApp("home");
    if (!s.setup.done) this.openApp("setup");
    boot?.log({ text: `Reached target: Cyberspace. (startup took ${Math.round(performance.now() - t0)} ms)`, status: "OK" });
    boot?.finish();
    this.lastBoot = boot;
    this.starting = false;
    this.sound.play("boot");
    setInterval(() => this.checkIdle(), 15_000);
    this.loop.request();
  }

  private registerCore(): void {
    for (const c of [...fileCommands, ...systemCommands, ...deckCommands]) this.commands.register({ ...c, source: "core" });
    for (const w of BUILTIN_WIDGETS) this.widgets.register(w);
    for (const a of [homeSpec, modulesSpec, explorerSpec, studioSpec, setupSpec, noteSpec, journalSpec, linkSpec, sysmonSpec, settingsSpec, helpSpec]) this.apps.register(a);

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

  // ── the frame ────────────────────────────────────────────────────────────

  private frame = (now: number): number => {
    if (this.grid.cols !== this.renderer.cols || this.grid.rows !== this.renderer.rows) this.grid = new Grid(this.renderer.cols, this.renderer.rows);
    const ui = this.ui;
    ui.begin(this.grid, this.theme, now, this.input.mouseCell);
    ui.cellAspect = this.renderer.cellW / this.renderer.cellH;
    if (this.starting) {
      this.renderer.draw(this.grid);
      return 100;
    }

    this.boot?.render(ui);
    if (this.boot?.done) {
      // boot just finished: draw the desktop in this very frame, through a glitch
      this.boot = null;
      ui.begin(this.grid, this.theme, now, this.input.mouseCell);
      this.glitch(450);
    }
    if (!this.boot && this.lock) this.lock.render(ui);
    else if (!this.boot) this.workspace.render(ui);

    // theme motion on the finished frame: changed cells, then page transitions
    if (this.settings.data.fx.glitch) {
      if (this.cellFx.apply(this.grid, this.theme, performance.now())) ui.animate(16);
      if (this.transitions.apply(this.grid, this.theme, performance.now())) ui.animate(16);
    }
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

  /**
   * An unknown command typed in the system terminal: if it's one of ours,
   * run it with ibsh and stream the output back (args arrive NUL-separated).
   */
  private async runBridged(req: { id: string; line: string; cwd: string }): Promise<void> {
    const b = this.platform.bridge!;
    const args = req.line.split("\0");
    if (args[args.length - 1] === "") args.pop();
    const cmd = this.commands.get(args[0] ?? "");
    if (!cmd) return b.send(req.id, null, true, false);
    const line = args.map((a, i) => (i === 0 ? a : q(a))).join(" ");
    if (cmd.interactive) {
      this.workspace.showShellTab("ibsh");
      void this.shell.runLine(line);
      this.requestFrame();
      return b.send(req.id, `\x1b[2m→ ${args[0]} asks questions: it's running in the ibsh tab\x1b[0m\n`, true, true);
    }
    const ex = new ShellExecutor(this, (text) => b.send(req.id, text, false, true), () => {});
    ex.env = this.shell.exec.env;
    const root = this.vault.root.replace(/\/$/, "");
    ex.cwd = req.cwd === root ? "" : req.cwd.startsWith(`${root}/`) ? req.cwd.slice(root.length + 1) : "";
    try {
      await ex.run(line);
    } finally {
      b.send(req.id, null, true, true);
      this.requestFrame();
    }
  }

  /** Do something through its shell command, echoed in the shell (mouse actions use this). */
  act(line: string): Promise<number> {
    return this.shell.runAction(line);
  }

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

  /** Pick one option (type to filter): its index, or null. */
  choose(title: string, options: ChoiceOption[], opts: { selected?: number } = {}): Promise<number | null> {
    const p = this.workspace.choose(title, options, opts.selected ?? 0);
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
      if (this.workspace.activeApp?.key !== kind) {
        this.sound.play("open");
        this.pageTurn();
      }
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
    if (folder === "notes") return void this.act(`note ${title.trim()}`);
    const path = join(folder, `${slugify(title)}.md`);
    if (!(await this.vault.exists(path))) await this.vault.write(path, `# ${title.trim()}\n\n`);
    await this.openFile(path);
  }

  setTheme(name: string): boolean {
    if (!this.themes.get(name)) return false;
    if (this.settings.data.appearance.theme !== name) this.settings.set("appearance.theme", name);
    this.refreshTheme();
    this.glitch(300);
    return true;
  }

  /**
   * Rebuild the current theme: the chosen one + your tweaks (appearance.tweaks).
   * A broken tweak is reported and skipped instead of breaking the deck.
   */
  refreshTheme(quiet = false): void {
    const s = this.settings.data.appearance;
    const base = this.themes.get(s.theme) ?? this.themes.default;
    const prev = this.themes.current;
    let next = base;
    try {
      next = applyTweaks(base, s.tweaks?.[base.name]);
    } catch (e) {
      if (!quiet) this.notify(`theme tweak ignored: ${e instanceof Error ? e.message : e}`, "error");
    }
    this.themes.current = next;
    this.sound.setPack(next.sound.pack, next.sound.pitch);
    const f = (t: Theme) => `${t.font.family}|${t.font.scale}|${t.font.weights}`;
    if (!quiet && f(prev) !== f(next)) void this.applyFont();
    if (!quiet) this.applyFx();
    this.renderer.invalidate();
    this.requestFrame();
  }

  async reloadUserThemes(): Promise<void> {
    this.themes.loadUserThemes(await this.vault.toolFiles("themes", ".toml"));
    this.refreshTheme(true);
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
    document.getElementById("deck")!.classList.toggle("flicker", fx.flicker && t.fx.flicker);
    this.renderer.bloomEnabled = fx.bloom;
    this.loop.maxFps = this.settings.data.appearance.maxFps;
    this.requestFrame();
  }

  /** React to a setting changed from the shell or the settings screen. */
  applySettings(key: string): void {
    const s = this.settings.data;
    if (key === "appearance.theme") this.setTheme(s.appearance.theme);
    else if (key === "appearance.tweaks") this.refreshTheme();
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

  /** The big moments (boot, unlock, theme change): the theme's page transition, glitch by default. */
  glitch(ms: number): void {
    if (!this.settings.data.fx.glitch) return;
    const page = this.theme.anim.page;
    if (page === "none") return;
    if (page !== "glitch") return this.pageTurn(true);
    this.glitchUntil = performance.now() + ms;
    this.requestFrame();
  }

  /** A page or tab change: themes with an eink / wipe / fade transition play it (glitch stays for big moments). */
  pageTurn(big = false): void {
    const page = this.theme.anim.page;
    if (!this.settings.data.fx.glitch || page === "none" || (page === "glitch" && !big)) return;
    this.transitions.run(page, page === "eink" ? 420 : page === "wipe" ? 260 : 220);
    this.requestFrame();
  }

  screensaver(): void {
    this.workspace.screensaver();
    this.requestFrame();
  }

  reboot(): void {
    this.boot = this.lastBoot?.replay() ?? new BootScreen("full", [{ text: `Vault ${basename(this.vault.root)} remounted`, status: "OK" }, { text: "Reached target: Cyberspace.", status: "OK" }]);
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

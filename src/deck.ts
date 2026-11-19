import { startHereCommand } from "./vault/starthere";
import type { ModuleSettingSpec } from "./plugins/api";
import { focusSpec } from "./apps/focus";
import { clocksSpec } from "./apps/clocks";
import { weatherCommand, weatherSpec } from "./apps/weather";
import { pinCommand, pinnedWidget, unpinCommand } from "./workspace/favorites";
import { terminalSpec } from "./apps/terminal";
import { scriptCommand, scriptsMenu } from "./shell/commands/scripts";
import { ServiceRegistry } from "./plugins/services";
import { shortcutCommands, shortcutsSpec } from "./apps/shortcuts";
import { trashSpec } from "./apps/trash";
import { syncLinkWidgets } from "./widgets/links";
import { StatsStore } from "./core/stats";
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
import { DEFAULT_SETTINGS, type SettingsStore } from "./core/settings";
import { applyTweaks, ThemeManager, type Theme } from "./core/theme";
import { glitch } from "./fx/glitch";
import type { Platform } from "./platform/types";
import { PluginHost } from "./plugins/host";
import { deckCommands } from "./shell/commands/deck";
import { fileCommands } from "./shell/commands/files";
import { iconCommand, tagCommand } from "./shell/commands/marks";
import { trashCommand } from "./shell/commands/trash";
import { Marks } from "./vault/marks";
import { ErrorLog } from "./core/errors";
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
import { DeckVoice, phrase } from "./core/voice";
import { storeCommand, storeSpec } from "./apps/store";
import { detachCorePackages } from "./plugins/core-packages";
import { installStealth } from "./core/stealth";
import { setLang, t } from "./core/i18n";
import type { ChoiceOption } from "./plugins/api";
import { LockScreen } from "./workspace/lock";
import type { PromptOptions } from "./workspace/overlays";
import { ActionWheel } from "./workspace/actionwheel";
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
/** What the voice may say (Settings → VOICE): see Deck.speak. */
export type VoiceTopic = "greet" | "ai" | "errors" | "reminders" | "timers" | "calendar" | "weather" | "time" | "system" | "modules";

export class Deck implements InputSink {
  readonly themes = new ThemeManager();
  readonly vault: Vault;
  readonly commands = new CommandRegistry();
  readonly apps = new AppRegistry();
  readonly actions = new ActionRegistry();
  readonly widgets = new WidgetRegistry();
  readonly ai: AIManager;
  /** numbers kept over time by modules (ib.stats), shown by STATS */
  readonly stats: StatsStore;
  /** colour tags + custom icons of files and folders (.icebreaker/tags.json, icons.json) */
  readonly marks: Marks;
  /** every error, with a code (E101…): the shell's "errors" tab, `errors` */
  readonly errors = new ErrorLog();
  /** settings modules declare (ib.settings.register) — shown under MODULES in Settings */
  readonly moduleSettings = new Map<string, ModuleSettingSpec[]>();
  moduleSettingValue(id: string, key: string): unknown {
    const v = this.settings.data.moduleSettings?.[id]?.[key];
    return v !== undefined ? v : this.moduleSettings.get(id)?.find((m) => m.key === key)?.default;
  }
  setModuleSetting(id: string, key: string, value: unknown): void {
    const all = { ...(this.settings.data.moduleSettings ?? {}) };
    all[id] = { ...(all[id] ?? {}), [key]: value };
    this.settings.set("moduleSettings", all);
    for (const fn of this.moduleSettingListeners.get(id) ?? []) fn(key, value);
  }
  readonly moduleSettingListeners = new Map<string, ((key: string, value: unknown) => void)[]>();
  /** what modules expose to each other (ib.modules) */
  readonly services = new ServiceRegistry();
  readonly plugins: PluginHost;
  readonly workspace: Workspace;
  readonly shell: ShellApp;
  readonly renderer: Renderer;
  readonly loop: FrameLoop;
  readonly input: InputManager;
  readonly gamepad: GamepadInput;
  readonly sound = new Sound();
  readonly voice: DeckVoice;

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
    this.stats = new StatsStore(this.vault);
    this.marks = new Marks(this.vault);
    this.ai = new AIManager(settings);
    // the AI wrote notes: pick them up in the tree, search, widgets…
    this.ai.onVaultWrite = () => void this.vault.rescan().then(() => this.requestFrame());
    this.ai.onMessage = () => void this.stats.add("uplink.messages", 1, "uplink", { label: "messages to the AI", kind: "counter" }).catch(() => {});
    this.plugins = new PluginHost(this);
    this.renderer = new Renderer(el("screen") as HTMLCanvasElement, el("bloom") as HTMLCanvasElement, settings.data.appearance.fontSize);
    this.loop = new FrameLoop(this.frame, settings.data.appearance.maxFps);
    this.input = new InputManager(this, this.renderer, el("deck"), el("keyboard-sink") as HTMLTextAreaElement);
    this.input.onGesture = (g) => {
      const ws = this.workspace;
      if (g === "back" || g === "forward") {
        if (ws.topModal) return;
        this.sound.play("move");
        ws.switchTab(ws.active + (g === "forward" ? 1 : -1), true);
      } else this.zoom(g === "zoom-in" ? 1 : -1);
      this.requestFrame();
    };
    this.input.onActivity = () => {
      this.lastActivity = performance.now();
      this.loop.idle = false;
      this.loop.request();
    };
    this.gamepad = new GamepadInput((a) => {
      this.lastActivity = performance.now();
      this.loop.idle = false;
      this.action(a, "gamepad");
    });
    // hold RB: the action wheel
    this.gamepad.onWheel = (e) => {
      this.lastActivity = performance.now();
      const open = this.workspace.overlays.find((o): o is ActionWheel => o instanceof ActionWheel && !o.done);
      if (e.type === "open") {
        if (!open && !this.locked) this.workspace.push(new ActionWheel(this, true));
      } else if (open) {
        if (e.type === "aim") open.aim(e.angle, e.mag);
        else if (e.type === "page") open.turnPage(1);
        else if (e.type === "release") open.release();
        else open.done = true;
      }
      this.requestFrame();
    };
    this.workspace = new Workspace(this);
    this.voice = new DeckVoice(this);
    this.shell = new ShellApp(this);

    // files dragged in from the Finder / Explorer land in the tree
    this.platform.files?.onDragDrop((e) => this.workspace.sidebar.externalDrop(e));
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
    installStealth(this); // before anything goes online
    setLang(s.user.language);
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
    await step(() => this.vault.mount(s.vault.path).then(() => this.recordVaultStats()), () => ({ text: `Mounted vault at ${this.vault.root} (${this.vault.markdown().length} notes, ${this.vault.journalDates().size} journal entries)`, status: "OK" }));
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
    this.sound.enabled = s.sound.enabled && !s.sound.muted;
    this.sound.volume = s.sound.volume / 100;
    await step(() => this.reloadSounds().catch(() => 0), (n) => ({ text: `Sound ${s.sound.enabled ? "on" : "muted"} · pack ${this.soundPack()}${n ? ` · ${n} custom sounds` : ""}`, status: "OK" }));

    await step(async () => {
      this.ai.envKey = await this.platform.envApiKey().catch(() => null);
      this.ai.claudeCode = this.platform.claudeCode;
      this.ai.claudeCodePath = (await this.platform.claudeCode?.detect().catch(() => null)) ?? null;
    }, () => {
      const p = this.ai.problem;
      return p ? { text: `Uplink offline: ${p}`, status: "WARN" } : { text: `Uplink: ${this.ai.provider.label}${this.ai.claudeCodePath ? ` (${this.ai.claudeCodePath})` : ""}`, status: "OK" };
    });

    this.watchForVoice();
    await step(() => this.registerCore(), () => ({ text: `Shell ibsh: ${this.commands.names().length} commands · ${this.apps.list().length} apps · ${this.widgets.list().length} widgets`, status: "OK" }));
    detachCorePackages(this); // core features become modules (plugins/core-packages.ts)
    // no AI at all while the UPLINK module is off (modules can't reach it either)
    this.ai.gate = () => (this.plugins.list().some((p) => p.manifest.id === "uplink" && p.active) ? null : "the UPLINK module is off (MODULES → UPLINK)");
    await step(() => this.plugins.init(), () => ({ text: `Plugins: ${this.plugins.active().map((p) => p.manifest.id).join(", ") || "none"}`, status: this.plugins.list().some((p) => p.error) ? "WARN" : "OK" }));
    this.platform.bridge?.onRun((req) => void this.runBridged(req));
    // files changed in the terminal, Obsidian, Finder…: refresh the tree, search, widgets
    await step(() => this.platform.onVaultChange?.(() => void this.vault.rescan().then(() => this.requestFrame())), () => this.platform.onVaultChange ? { text: "Watching the vault for outside changes", status: "OK" } : null);
    if (s.privacy.stealth) boot?.log({ text: "Stealth mode: no internet — this machine and the local network only", status: "OK" });
    if (s.voice.enabled && this.voice.available) boot?.log({ text: `Voice module online (${s.voice.engine})`, status: "OK" });
    const pads = (navigator.getGamepads?.() ?? []).filter(Boolean).length;
    boot?.log({ text: `Input: keyboard · mouse${pads ? ` · ${pads} gamepad${pads > 1 ? "s" : ""}` : " · gamepad (none plugged in)"}`, status: "OK" });

    this.shell.motd();
    this.openApp("home");
    if (!s.setup.done) this.openApp("setup");
    // the tabs you had open last time
    await step(() => this.workspace.restoreSession(!s.setup.done).catch(() => {}), () => (s.setup.done && s.session?.tabs?.length ? { text: `Session restored: ${s.session.tabs.length} tab(s)`, status: "OK" } : null));
    boot?.log({ text: `Reached target: Cyberspace. (startup took ${Math.round(performance.now() - t0)} ms)`, status: "OK" });
    boot?.finish();
    this.lastBoot = boot;
    this.starting = false;
    this.sound.play("boot");
    setInterval(() => this.checkIdle(), 15_000);
    this.watchVisibility();
    this.loop.request();
  }

  /**
   * Energy: hidden or minimized → no frames at all (and the glyph cache is
   * freed after a minute); visible but in the background → animations crawl
   * at 12 fps. Timers (reminders, music) keep running. Setting
   * `appearance.backgroundFps` to false keeps full speed in the background.
   */
  private releaseTimer: ReturnType<typeof setTimeout> | undefined;
  private watchVisibility(): void {
    const update = () => {
      const hidden = document.hidden;
      this.loop.setPaused(hidden);
      clearTimeout(this.releaseTimer);
      if (hidden) this.releaseTimer = setTimeout(() => this.renderer.release(), 60_000);
      this.gamepad.setActive?.(!hidden && document.hasFocus());
    };
    document.addEventListener("visibilitychange", update);
    const focus = (on: boolean) => {
      this.loop.background = !on && this.settings.data.appearance.backgroundSlow !== false;
      this.gamepad.setActive?.(on && !document.hidden);
      if (on) this.loop.request();
    };
    window.addEventListener("focus", () => focus(true));
    // what nobody caught still lands in the error log (with a sound, the errors tab blinks)
    const caught = (msg: string) => {
      this.errors.add(msg);
      this.sound.play("error");
      this.requestFrame();
    };
    window.addEventListener("error", (e) => caught(e.message || String(e.error)));
    window.addEventListener("unhandledrejection", (e) => caught(e.reason instanceof Error ? e.reason.message : String(e.reason)));
    this.errors.onAdd = (e) => {
      this.requestFrame();
      this.speak("errors", t("error {code}: {title}", { code: e.code.split("").join(" "), title: t(e.title) }));
    };
    window.addEventListener("blur", () => focus(false));
    // some webviews don't report a minimized window as hidden: ask the window itself
    void this.platform.onMinimized?.((min) => {
      this.loop.setPaused(min || document.hidden);
      if (min) this.releaseTimer = setTimeout(() => this.renderer.release(), 60_000);
    });
  }

  private registerCore(): void {
    for (const c of [...fileCommands, ...systemCommands, ...deckCommands, storeCommand, ...shortcutCommands, scriptCommand, pinCommand, unpinCommand, tagCommand, iconCommand, trashCommand, weatherCommand, startHereCommand]) this.commands.register({ ...c, source: "core" });
    for (const w of [...BUILTIN_WIDGETS, pinnedWidget]) this.widgets.register(w);
    syncLinkWidgets(this); // the 1×1 shortcut squares
    for (const a of [homeSpec, modulesSpec, storeSpec, explorerSpec, studioSpec, setupSpec, noteSpec, journalSpec, linkSpec, sysmonSpec, settingsSpec, helpSpec, shortcutsSpec, terminalSpec, weatherSpec, clocksSpec, focusSpec, trashSpec]) this.apps.register(a);

    const act = (id: string, title: string, run: () => void, hint?: string, group = "deck") => this.actions.register({ id, title, run, hint, group });
    act("journal.today", "Journal: today", () => void this.openJournal(new Date()), "ctrl+j", "journal");
    act("journal.yesterday", "Journal: yesterday", () => void this.openJournal(new Date(Date.now() - 86400_000)), undefined, "journal");
    act("note.new", "New note", () => void this.newNote(), "ctrl+n", "notes");
    act("folder.new", "New folder", () => void this.newFolder(), "ctrl+shift+n", "notes");
    act("scripts.menu", "Scripts… (run one of your saved shell scripts)", () => void scriptsMenu(this), undefined, "shell");
    act("terminal.open", "Terminal in a tab", () => void this.act("term open"), undefined, "shell");
    act("shortcuts.open", "Keyboard shortcuts (all, searchable)", () => void this.openApp("shortcuts"), "ctrl+/", "deck");
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
      if (!this.lock) this.greet();
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
      this.greet();
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

  /** The deck's own stats: how many notes the vault holds (kept fresh on every rescan). */
  private vaultStatsOn = false;
  private recordVaultStats(): void {
    if (this.vaultStatsOn) return void this.stats.set("deck.notes", this.vault.markdown().length, "deck").catch(() => {});
    this.vaultStatsOn = true;
    const record = () => {
      void this.stats.set("deck.notes", this.vault.markdown().length, "deck", { label: "notes in the vault" }).catch(() => {});
      void this.stats.set("journal.days", this.vault.journalDates().size, "journal", { label: "journal pages" }).catch(() => {});
    };
    record();
    this.vault.events.on("rescanned", record);
  }

  /** Do something through its shell command, echoed in the shell (mouse actions use this). */
  act(line: string): Promise<number> {
    return this.shell.runAction(line);
  }

  notify(text: string, kind: ToastKind = "info"): void {
    this.sound.play(kind === "error" ? "error" : kind === "success" ? "success" : "notify");
    if (kind === "error") this.errors.add(text);
    // the deck isn't in front (minimized, hidden, another app on top): a real system
    // notification too, so you see it anyway (notifications: off / sound only skip it)
    const mode = this.settings.data.notifications?.mode ?? "both";
    if ((mode === "both" || mode === "visual") && (document.hidden || !document.hasFocus())) {
      const title = kind === "error" ? "ICEBREAKER · error" : kind === "warning" ? "ICEBREAKER · warning" : "ICEBREAKER";
      void this.platform.notify?.(title, text).catch(() => {});
    }
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

  prompt(title: string, opts: PromptOptions = {}): Promise<string | null> {
    const p = this.workspace.prompt(title, opts);
    this.requestFrame();
    return p;
  }

  openApp(kind: string, args?: unknown): App | null {
    // a note needs a file: without one (`launch note`), a new note — never a file called "undefined"
    if (kind === "note" && (args === undefined || args === null || args === "")) return void this.newNote(), null;
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

  /** Ask for a name, make the folder (inside `parent`, default the vault root). */
  async newFolder(parent = ""): Promise<void> {
    const name = await this.prompt("New folder", { placeholder: "e.g. projects" });
    if (!name?.trim()) return;
    await this.act(`mkdir ${q(parent ? `${parent.replace(/\/$/, "")}/${name.trim()}` : name.trim())}`);
  }

  setTheme(name: string): boolean {
    if (!this.themes.get(name)) return false;
    const prev = this.settings.data.appearance.theme;
    if (prev !== name) {
      // effects are per theme: keep this one's, bring back the next one's
      this.rememberFx(prev);
      this.fxSwitching = true;
      this.settings.set("appearance.theme", name);
      this.recallFx(name);
      this.fxSwitching = false;
    }
    this.refreshTheme();
    this.applyFx();
    this.glitch(160);
    return true;
  }

  /** the effects keys that belong to a theme (the screensaver delay stays global) */
  private static readonly FX_PER_THEME = ["bloom", "scanlines", "vignette", "ambient", "flicker", "glitch"] as const;
  private fxSwitching = false;

  /** Save the current effects as this theme's. */
  private rememberFx(theme = this.settings.data.appearance.theme): void {
    if (this.fxSwitching || !theme) return;
    const fx = this.settings.data.fx;
    const snap: Record<string, unknown> = { levels: { ...fx.levels } };
    for (const k of Deck.FX_PER_THEME) snap[k] = fx[k];
    const all = { ...(this.settings.data.fxByTheme ?? {}) };
    if (JSON.stringify(all[theme]) === JSON.stringify(snap)) return;
    all[theme] = snap;
    this.settings.set("fxByTheme", all);
  }

  /** Put back the effects last used with this theme (first time on it: keep the current ones). */
  private recallFx(theme: string): void {
    const snap = this.settings.data.fxByTheme?.[theme] as { levels?: Record<string, number> } & Record<string, unknown> | undefined;
    if (!snap) return;
    for (const k of Deck.FX_PER_THEME) if (typeof snap[k] === "boolean") this.settings.set(`fx.${k}`, snap[k]);
    for (const [k, v] of Object.entries(snap.levels ?? {})) if (typeof v === "number" && k in this.settings.data.fx.levels) this.settings.set(`fx.levels.${k}`, v);
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
    this.sound.setPack(this.soundPack(next), next.sound.pitch);
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
    // whatever changed is now this theme's own setting
    this.rememberFx();
    const fx = this.settings.data.fx;
    const t = this.theme;
    const root = document.documentElement.style;
    root.setProperty("--deck-bg", css(t.c.bg));
    const lv = { ...DEFAULT_SETTINGS.fx.levels, ...fx.levels };
    root.setProperty("--bloom", String(fx.bloom ? (t.fx.bloom * lv.bloom) / 100 : 0));
    // the bloom adds light, and each theme is tuned with it: lowered or off, the
    // picture itself gets that light back (no dimmer screen)
    const bloomNow = fx.bloom ? (t.fx.bloom * lv.bloom) / 100 : 0;
    const boost = Math.min(1.35, 1 + Math.max(0, t.fx.bloom - bloomNow) * 0.6);
    const screenEl = document.getElementById("screen");
    if (screenEl) screenEl.style.filter = boost > 1.005 ? `brightness(${boost.toFixed(3)})` : "";
    root.setProperty("--scanlines", String(fx.scanlines ? (t.fx.scanlines * lv.scanlines) / 100 : 0));
    root.setProperty("--vignette", String(fx.vignette ? (t.fx.vignette * lv.vignette) / 100 : 0));
    document.getElementById("deck")!.classList.toggle("crt", fx.scanlines && t.fx.scanlines * lv.scanlines > 0);
    document.getElementById("bloom")!.style.display = fx.bloom && t.fx.bloom * lv.bloom > 0 ? "block" : "none";
    document.getElementById("scanlines")!.style.display = fx.scanlines ? "block" : "none";
    document.getElementById("vignette")!.style.display = fx.vignette ? "block" : "none";
    document.getElementById("deck")!.classList.toggle("flicker", fx.flicker && t.fx.flicker);
    document.getElementById("deck")!.classList.toggle("monochrome", t.fx.monochrome);
    root.setProperty("--paper", String(t.fx.paper));
    this.renderer.bloomEnabled = fx.bloom;
    this.renderer.setChroma(lv.chroma ?? 0, css(t.c.bg));
    this.renderer.setGlow(lv.glow ?? 0, t.c.bg);
    const sharp = fx.levels.sharpness ?? 100 - (fx.levels.softness ?? 0);
    // a gentler curve: 80 % is a light CRT softness, 0 % still readable
    this.renderer.setSoftness((100 - sharp) * 0.6);
    this.loop.maxFps = this.settings.data.appearance.maxFps;
    this.requestFrame();
  }

  /** React to a setting changed from the shell or the settings screen. */
  applySettings(key: string): void {
    const s = this.settings.data;
    if (key === "user.language") setLang(s.user.language);
    if (key === "appearance.theme") this.setTheme(s.appearance.theme);
    else if (key === "appearance.tweaks") this.refreshTheme();
    else if (key === "appearance.fontWeight" || key === "appearance.fontSize" || key === "appearance.scale") void this.applyFont();
    else if (key === "journal.folder") this.vault.journalFolder = s.journal.folder;
    else if (key === "user.handle") this.shell.exec.env.USER = s.user.handle;
    else if (key.startsWith("fx") || key === "appearance.maxFps") this.applyFx();
    else if (key.startsWith("sound.")) {
      this.sound.enabled = s.sound.enabled && !s.sound.muted;
      this.sound.volume = s.sound.volume / 100;
      if (s.sound.muted) this.voice.stop();
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

  /**
   * Get the user's attention, even when the deck is in the background: the
   * system notification, the "alert" sound (tu-dut), a toast — and the voice
   * reads it when it's on. Modules call it through ib.ui.alert.
   */
  alert(title: string, body = "", topic: VoiceTopic = "reminders"): void {
    const mode = this.settings.data.notifications?.mode ?? "both";
    const hear = mode === "both" || mode === "sound", see = mode === "both" || mode === "visual";
    if (hear) this.sound.play("alert");
    if (see) {
      this.workspace.notify(body ? `${title} — ${body}` : title, "warning");
      void this.platform.notify?.(title, body).catch((e) => console.warn("[notify]", e));
    }
    if (hear) this.speak(topic, body ? `${title}. ${body}` : title);
  }

  /**
   * The voice says `text` — if the voice is on, nothing is muted, and the user
   * wants this kind of thing said (Settings → VOICE → say aloud). Everything
   * that talks goes through here: errors, reminders, the time, modules…
   */
  speak(topic: VoiceTopic, text: string): void {
    const v = this.settings.data.voice;
    if (!v.enabled || this.settings.data.sound.muted || !this.voice.available) return;
    const wanted = topic === "greet" ? v.greet : topic === "ai" ? v.readAI : v.speak?.[topic] !== false;
    if (wanted) this.voice.say(text);
  }

  /**
   * The things the voice can announce on its own, checked every 20 s (cheap; the
   * system stats only when that topic is on): the time at :00 and :30, a CPU or
   * memory overload (two checks in a row above 90 %, then quiet for 10 min).
   */
  private watchForVoice(): void {
    let lastSlot = "";
    let hot = 0, warnedAt = 0;
    setInterval(() => {
      const v = this.settings.data.voice;
      if (!v.enabled) return;
      const now = new Date();
      const m = now.getMinutes();
      const slot = `${now.getHours()}:${m < 30 ? "00" : "30"}`;
      if ((m === 0 || m === 30) && slot !== lastSlot) {
        lastSlot = slot;
        this.speak("time", t("it's {time}", { time: now.toLocaleTimeString(this.settings.data.user.locale || undefined, { hour: "2-digit", minute: "2-digit" }) }));
      }
      if (v.speak?.system === false || !this.platform.system) return;
      void this.platform.system.stats().then((st) => {
        const mem = st.memTotal ? (st.memUsed / st.memTotal) * 100 : 0;
        hot = st.cpu >= 90 || mem >= 90 ? hot + 1 : 0;
        if (hot >= 2 && Date.now() - warnedAt > 10 * 60_000) {
          warnedAt = Date.now();
          this.speak("system", st.cpu >= 90 ? t("warning: CPU at {n} percent", { n: Math.round(st.cpu) }) : t("warning: memory at {n} percent", { n: Math.round(mem) }));
        }
      }).catch(() => {});
    }, 20_000);
  }

  /** "Welcome, netrunner": once per start, when the desktop appears (voice.greet). */
  private greeted = false;
  greet(): void {
    const v = this.settings.data.voice;
    if (this.greeted || !v.enabled || !v.greet || !this.voice.available) return;
    this.greeted = true;
    const h = this.settings.data.user.handle || "netrunner";
    this.voice.say(phrase(v.language, "welcome", h));
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

  /** The sound pack of a theme: the one chosen for it in Settings, else the theme's own. */
  soundPack(theme: Theme = this.theme): string {
    return this.settings.data.sound.packByTheme?.[theme.name] ?? theme.sound.pack;
  }

  /** Choose this theme's sound pack ("default": back to the theme's own). */
  setSoundPack(pack: string): void {
    const all = { ...(this.settings.data.sound.packByTheme ?? {}) };
    if (pack === "default" || pack === this.theme.sound.pack) delete all[this.theme.name];
    else all[this.theme.name] = pack;
    this.settings.set("sound.packByTheme", all);
    this.sound.setPack(this.soundPack(), this.theme.sound.pitch);
  }

  /** A page or tab change: themes with an eink / wipe / fade transition play it (glitch stays for big moments). */
  pageTurn(big = false, quick = false): void {
    const page = this.theme.anim.page;
    if (!this.settings.data.fx.glitch || page === "none" || (page === "glitch" && !big)) return;
    // short: a touch of motion, never a wait (a swipe: shorter still, it follows the fingers)
    const ms = page === "eink" ? 200 : page === "wipe" ? 120 : 100;
    this.transitions.run(page, quick ? Math.round(ms * 0.6) : ms);
    this.requestFrame();
  }

  screensaver(): void {
    this.workspace.screensaver();
    this.requestFrame();
  }

  reboot(): void {
    this.boot = this.lastBoot?.replay() ?? new BootScreen("full", [{ text: `Vault ${basename(this.vault.root)} remounted`, status: "OK" }, { text: "Reached target: Cyberspace.", status: "OK" }]);
    // the start-up sound, like a real start
    this.sound.play("boot");
    this.requestFrame();
  }

  async quit(): Promise<void> {
    for (const t of this.workspace.tabs) await t.close?.();
    await this.platform.window.quit();
  }

  private checkIdle(): void {
    // 90 s without a key or the mouse: ambient animations slow down (energy)
    if (performance.now() - this.lastActivity > 90_000) this.loop.idle = true;
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

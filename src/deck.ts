import { AccessLog } from "./core/access";
import { PermissionDialog, type PermDialogSpec } from "./workspace/permdialog";
import { startHereCommand } from "./vault/starthere";
import { PRESETS } from "./workspace/layout/arrange";
import type { ModuleSettingSpec } from "./plugins/api";
import { focusSpec } from "./apps/focus";
import { clocksSpec } from "./apps/clocks";
import { moonSpec } from "./apps/moon";
import { newsSpec } from "./apps/news";
import { weatherCommand, weatherSpec } from "./apps/weather";
import { pinCommand, pinnedWidget, unpinCommand } from "./workspace/favorites";
import { terminalSpec } from "./apps/terminal";
import { scriptCommand } from "./shell/commands/scripts";
import { ServiceRegistry } from "./plugins/services";
import { shortcutCommands, shortcutsSpec } from "./apps/shortcuts";
import { trashSpec } from "./apps/trash";
import { frameServices } from "./plugins/frame-services";
import type { ModuleProxy } from "./plugins/services";
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
import { css, mix } from "./core/color";
import { GamepadInput } from "./core/gamepad";
import { Grid } from "./core/grid";
import { InputManager, IS_MAC, type Action, type ActionSource, type InputSink, type KeyInput, type MouseInput } from "./core/input";
import { FrameLoop } from "./core/loop";
import { fontStack, loadFont, WEIGHTS } from "./core/fonts";
import { Renderer } from "./core/renderer";
import { macMenuActions } from "./workspace/macmenu";
import { bloomRadius, bloomStrength, flickerSpeed } from "./core/fxlevels";
import { Sound, SOUND_CHANNELS, type SoundName } from "./core/sound";
import { Mixer } from "./core/mixer";
import { DEFAULT_SETTINGS, type SettingsStore } from "./core/settings";
import { UndoHistory } from "./core/undo";
import { setTypewriterHost } from "./ui/typewriter";
import { applyTweaks, ThemeManager, type Theme } from "./core/theme";
import { glitch } from "./fx/glitch";
import type { Platform } from "./platform/types";
import { PluginHost } from "./plugins/host";
import { Updater } from "./core/updater";
import { deckCommands } from "./shell/commands/deck";
import { devCommands } from "./shell/commands/dev";
import { fileCommands } from "./shell/commands/files";
import { iconCommand, tagCommand } from "./shell/commands/marks";
import { trashCommand } from "./shell/commands/trash";
import { Marks } from "./vault/marks";
import { ErrorLog } from "./core/errors";
import { EventLog } from "./core/eventlog";
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
import { whatsNewOnce } from "./workspace/whatsnew";
import { CellFx, Transitions } from "./fx/transition";
import { DeckVoice, phrase, spokenAlert } from "./core/voice";
import { storeCommand, storeSpec } from "./apps/store";
import { updateCommand } from "./shell/commands/update";
import { detachCorePackages } from "./plugins/core-packages";
import { installStealth } from "./core/stealth";
import { setLang, t } from "./core/i18n";
import type { ChoiceOption } from "./plugins/api";
import { LockScreen } from "./workspace/lock";
import type { PromptOptions } from "./workspace/overlays";
import { migrateWheel, QuickMenu } from "./workspace/quickmenu";
import { SettingsRegistry } from "./core/prefs";
import { lookKey, readDevice, writeDevice } from "./core/device";
import { Catalog } from "./core/catalog";
import { blocksSpec } from "./apps/blocks";
import { registerCoreActions } from "./deck-actions";
import { coreSettingRows } from "./apps/settings-rows";
import type { ToastKind } from "./workspace/overlays";
import { Workspace } from "./workspace/workspace";
import { BUILTIN_WIDGETS } from "./widgets";
import { WidgetRegistry } from "./widgets/types";
import { LayoutProbe, type LayoutIssue } from "./ui/probe";

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
  /** what each open page was made with (`openApp(kind, args)`): a module's page is made again with it when the module reloads */
  readonly appArgs = new WeakMap<App, unknown>();
  readonly actions = new ActionRegistry();
  /** the macOS menu bar's items are listened to (once, whatever the logins) */
  private menuBarOn = false;
  /** running on the battery (null: can't tell) — the smoothness setting's "auto" (watchPower) */
  private onBattery: boolean | null = null;
  private powerTimer: ReturnType<typeof setInterval> | undefined;

  /** On battery or on the mains, looked at every 30 s: "auto" smoothness follows the plug. */
  private watchPower(): void {
    const look = async () => {
      let b = (await this.platform.system.onBattery?.().catch(() => null)) ?? null;
      const nav = navigator as Navigator & { getBattery?: () => Promise<{ charging: boolean }> };
      if (b === null && nav.getBattery) b = await nav.getBattery().then((x) => !x.charging, () => null);
      if (b !== this.onBattery) {
        this.onBattery = b;
        this.applyFx();
      }
    };
    void look();
    clearInterval(this.powerTimer);
    this.powerTimer = setInterval(() => void look(), 30_000);
  }
  /** every setting row, the deck's and the modules' (core/prefs.ts): Settings draws them */
  readonly prefs = new SettingsRegistry();
  /** everything the deck can do, as blocks (core/catalog.ts): the BLOCKS page, `catalog`, ib.catalog */
  readonly catalog = new Catalog(this);
  readonly widgets = new WidgetRegistry();
  readonly ai: AIManager;
  /** numbers kept over time by modules (ib.stats), shown by STATS */
  readonly stats: StatsStore;
  /** colour tags + custom icons of files and folders (.icebreaker/tags.json, icons.json) */
  readonly marks: Marks;
  /** every error, with a code (E101…): the shell's "errors" tab, `errors` */
  readonly errors = new ErrorLog();
  /** everything that happens (commands, clicks, errors, messages, debug): the shell's LOG tab */
  readonly log = new EventLog();
  /** who used which permission, when, on what (core/access.ts): Settings → PERMISSIONS, the LOG's "access" filter */
  readonly access: AccessLog;

  /**
   * A line for developers, in the LOG tab under "debug" (modules: `ib.debug`).
   * Always kept (cheap); `debug on` adds the deck's own events.
   */
  /** `debug hits`: tint every clickable area (green: runs a command, yellow: has a menu) */
  showHits = false;
  /** `debug layout show`: what is cut (red) or drawn over another text (yellow), marked on the screen */
  showLayout = false;
  /** what the last frame found while `showLayout` is on */
  layoutIssues: LayoutIssue[] = [];

  /**
   * `debug layout`: draw the screen as it is now, off screen, at another size, and
   * say what is cut or overlaps there (ui/probe.ts). Nothing on screen changes; the
   * next frame redraws the real one.
   */
  probeLayout(cols: number, rows: number): LayoutIssue[] {
    const ui = this.ui;
    const ws = this.workspace;
    const probe = new LayoutProbe(cols, rows);
    const notch = ws.notchRows;
    try {
      ws.notchRows = 0;
      ui.begin(new Grid(cols, rows), this.theme, performance.now(), { x: -1, y: -1 });
      ui.probe = probe;
      if (this.lock) this.lock.render(ui);
      else ws.render(ui);
    } finally {
      ui.probe = null;
      ws.notchRows = notch;
      this.requestFrame();
    }
    return probe.issues;
  }

  debug(text: string, source = "deck"): void {
    this.log.add("debug", text, { source });
  }
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
  /** ICEBREAKER's and the modules' updates (core/updater.ts) */
  readonly updater: Updater;
  readonly workspace: Workspace;
  readonly shell: ShellApp;
  readonly renderer: Renderer;
  readonly loop: FrameLoop;
  readonly input: InputManager;
  readonly gamepad: GamepadInput;
  readonly sound = new Sound();
  /** the modules' sampler (ib.audio, permission "audio"): core/mixer.ts */
  readonly mixer = new Mixer();
  readonly voice: DeckVoice;

  private readonly ui = Object.assign(new UI(), { softCaret: true }); // the caret glides (renderer.setCaret)
  private grid = new Grid(1, 1);
  /** the screen's size in cells (debug state) */
  get gridSize(): { cols: number; rows: number } {
    return { cols: this.grid.cols, rows: this.grid.rows };
  }
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

  /** Undo / redo for everything (⌘Z, ⌘⇧Z): core/undo.ts */
  readonly history = new UndoHistory();

  constructor(
    readonly platform: Platform,
    readonly settings: SettingsStore,
  ) {
    const el = (id: string) => document.getElementById(id)!;
    this.vault = new Vault(platform.vault);
    // ⌘Z: settings and the vault's trash/renames go in one history (core/undo.ts)
    settings.history = this.history;
    settings.onRevert = (path) => this.reverted(path);
    // text that types itself out: its speed and its blip (ui/typewriter.ts)
    setTypewriterHost({
      speed: () => (this.settings.data.appearance.reduceMotion ? 100 : this.settings.data.appearance.textSpeed ?? 50),
      blip: () => this.sound.play("blip"),
    });
    this.vault.history = this.history;
    // the access journal: its lines show in the LOG too ("◈ [todo] vault:write · notes/a.md")
    this.access = new AccessLog(platform);
    this.access.onAdd = (a) => void this.log.add("access", `${a.perm}${a.what ? ` · ${a.what}` : ""}`, { source: a.who });
    this.stats = new StatsStore(this.vault);
    this.marks = new Marks(this.vault);
    this.ai = new AIManager(settings);
    // the AI wrote notes: pick them up in the tree, search, widgets…
    this.ai.onVaultWrite = () => void this.vault.rescan().then(() => this.requestFrame());
    // what the AI reads is in the access journal, and lights the top bar for a moment
    this.ai.onRead = (what) => {
      this.access.note("ai", "vault:read", what);
      this.requestFrame();
      setTimeout(() => this.requestFrame(), 4100);
    };
    this.ai.onMessage = () => void this.stats.add("uplink.messages", 1, "uplink", { label: "messages to the AI", kind: "counter" }).catch(() => {});
    this.plugins = new PluginHost(this);
    this.updater = new Updater(this);
    this.renderer = new Renderer(el("screen") as HTMLCanvasElement, el("bloom") as HTMLCanvasElement, settings.data.appearance.fontSize);
    this.loop = new FrameLoop(this.frame, settings.data.appearance.maxFps);
    this.loop.mustAnimate = () => !!this.boot || !!this.lock;
    this.input = new InputManager(this, this.renderer, el("deck"), el("keyboard-sink") as HTMLTextAreaElement);
    this.input.onKeyPress = (kind) => this.typingSound(kind);
    // shift twice: THE MENU, from anywhere (Settings → KEYS can switch it off)
    this.input.onDoubleShift = () => {
      if (this.locked || this.settings.data.menu?.doubleShift === false) return;
      this.workspace.menu();
      this.requestFrame();
    };
    this.input.onGesture = (g, shift) => {
      const ws = this.workspace;
      if (g === "back" || g === "forward") {
        if (ws.topModal) return;
        this.sound.play("move");
        // like a browser: the mouse's back / forward buttons (a two-finger swipe on a Mac) walk
        // the pages this tab showed; with shift, the tabs
        if (shift) ws.stepTab(g === "forward" ? 1 : -1, true);
        // "back" on the note opened from NEXUS: NEXUS again
        else if (g === "back" && ws.backToParked()) return void this.requestFrame();
        else void this.tabHistoryStep(g === "forward" ? 1 : -1);
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
    // hold RB: THE MENU (the stick chooses, letting go runs it)
    this.gamepad.onWheel = (e) => {
      this.lastActivity = performance.now();
      const open = this.workspace.overlays.find((o): o is QuickMenu => o instanceof QuickMenu && !o.done);
      if (e.type === "open") {
        if (!open && !this.locked) this.workspace.menu({ pad: true });
      } else if (open) {
        if (e.type === "aim") open.aim(e.angle, e.mag);
        else if (e.type === "release") open.release();
        else if (e.type === "cancel") open.done = true;
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

    // nobody logged in: only the login screen — no vault, no modules, no settings of anyone
    const session = await this.platform.account.session().catch(() => null);
    if (!session) return this.startLogin();
    this.account = session.user;

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
    // a new account (not the first) gets a folder of its own next to the default one
    let vaultPath = s.vault.path;
    if (!vaultPath && (await this.platform.account.count().catch(() => 1)) > 1) vaultPath = `${await this.vault.defaultPath()}-${session.id}`;
    await step(() => this.vault.mount(vaultPath), () => null);
    // the vault carries its account's settings: newer ones (changed on another computer) → start again with them
    if (await this.syncVaultAccount()) return;
    await step(() => this.recordVaultStats(), () => ({ text: `Mounted vault at ${this.vault.root} (${this.vault.markdown().length} notes, ${this.vault.journalDates().size} journal entries)${this.vault.docsYours.length ? ` · START HERE: ${this.vault.docsYours.length} notes you edited kept (starthere --force updates them)` : ""}`, status: "OK" }));
    if (!s.vault.path) this.settings.set("vault.path", this.vault.root);
    const fontOf = () => `${this.theme.font.family}|${this.theme.font.scale}|${this.theme.font.weights}`;
    const font = fontOf();
    await step(() => this.reloadUserThemes(), () => ({ text: `Loaded theme ${this.theme.name} (${this.themes.list().length} available${this.themes.errors.length ? `, ${this.themes.errors.length} broken` : ""})`, status: this.themes.errors.length ? "WARN" : "OK" }));
    this.refreshTheme(true);
    if (fontOf() !== font) await this.applyFont(); // your theme lives in the vault and has its own font

    boot?.log({ text: `Account ${session.user}: its settings, its vault`, status: "OK" });
    void this.rememberLook();
    this.sound.enabled = s.sound.enabled && !s.sound.muted;
    this.sound.volume = s.sound.volume / 100;
    this.applyMix();
    await step(() => this.reloadSounds().catch(() => 0), (n) => ({ text: `Sound ${s.sound.enabled ? "on" : "muted"} · pack ${this.soundPack()}${n ? ` · ${n} custom sounds` : ""}`, status: "OK" }));

    await step(async () => {
      this.ai.envKey = await this.platform.envApiKey().catch(() => null);
      this.ai.claudeCode = this.platform.claudeCode;
      this.ai.claudeCodePath = (await this.platform.claudeCode?.detect().catch(() => null)) ?? null;
    }, () => {
      const p = this.ai.problem;
      return p ? { text: `Uplink offline: ${p}`, status: "WARN" } : { text: `Uplink: ${this.ai.provider.label}${this.ai.claudeCodePath ? ` (${this.ai.claudeCodePath})` : ""}`, status: "OK" };
    });

    this.voice.watch(); // the time, CPU / memory overload (core/voice.ts)
    await step(() => this.registerCore(), () => ({ text: `Shell ibsh: ${this.commands.names().length} commands · ${this.apps.list().length} apps · ${this.widgets.list().length} widgets`, status: "OK" }));
    detachCorePackages(this); // core features become modules (plugins/core-packages.ts)
    // no AI at all while the UPLINK module is off (modules can't reach it either)
    this.ai.gate = () => (this.plugins.list().some((p) => p.manifest.id === "uplink" && p.active) ? null : "the UPLINK module is off (MODULES → UPLINK)");
    migrateWheel(this); // the old gamepad wheel's slots → keys on THE MENU (once)
    this.updater.start();
    // short enough to read whole (the list of every module was cut with …); what's wrong, by name,
    // with the whole reason in the LOG
    await this.access.load().catch(() => {});
    await step(() => this.plugins.init(), () => {
      const on = this.plugins.active().length;
      const bad = this.plugins.list().filter((p) => p.error);
      for (const p of bad) this.log.add("notify", `${p.manifest.name ?? p.manifest.id}: ${p.error}`, { source: "warning" });
      if (!bad.length) return { text: `Plugins: ${on} on`, status: "OK" };
      // each one by name with why, in a few words, and what to do; said again once the desktop
      // is there (the boot text goes by fast) — the whole reason is in the LOG
      this.modulesOff = bad.map((p) => ({ id: p.manifest.id, name: p.manifest.name ?? p.manifest.id, why: PluginHost.shortReason(p.error ?? "") }));
      return { text: `Plugins: ${on} on · off: ${this.modulesOff.map((m) => `${m.id} (${m.why})`).join(", ")} — plugin enable <id>`, status: "WARN" };
    });
    this.platform.bridge?.onRun((req) => void this.runBridged(req));
    this.watchPower();
    // the macOS menu bar's deck items (workspace/macmenu.ts): listened to once, ignored while locked
    if (!this.menuBarOn && this.platform.onMenu) {
      this.menuBarOn = true;
      const actions = macMenuActions(this);
      this.platform.onMenu((id) => !this.locked && actions[id]?.());
    }
    // files changed in the terminal, Obsidian, Finder…: refresh the tree, search, widgets
    await step(() => this.platform.onVaultChange?.(() => void this.vault.rescan().then(() => this.requestFrame())), () => this.platform.onVaultChange ? { text: "Watching the vault for outside changes", status: "OK" } : null);
    if (s.privacy.stealth) boot?.log({ text: "Stealth mode: no internet — this machine and the local network only", status: "OK" });
    if (s.voice.enabled && this.voice.available) boot?.log({ text: `Voice module online (${s.voice.engine})`, status: "OK" });
    const pads = (navigator.getGamepads?.() ?? []).filter(Boolean).length;
    boot?.log({ text: `Input: keyboard · mouse${pads ? ` · ${pads} gamepad${pads > 1 ? "s" : ""}` : " · gamepad (none plugged in)"}`, status: "OK" });

    this.shell.motd();
    this.openApp("home");
    if (!s.setup.done) this.openApp("setup");
    void this.askVaultSettings();
    // the tabs you had open last time
    await step(() => this.workspace.restoreSession(!s.setup.done).catch(() => {}), () => (s.setup.done && s.session?.tabs?.length ? { text: `Session restored: ${s.session.tabs.length} tab(s)`, status: "OK" } : null));
    boot?.log({ text: `Reached target: Cyberspace. (startup took ${Math.round(performance.now() - t0)} ms)`, status: "OK" });
    boot?.finish();
    this.lastBoot = boot;
    this.starting = false;
    this.sound.play("boot");
    setInterval(() => this.checkIdle(), 15_000);
    this.watchVisibility();
    // what starting changed (migrations, the vault path, restored tabs) isn't something to ⌘Z
    this.history.clear();
    this.started = true;
    if (!this.boot) this.sessionReady(); // no boot screen: the desktop is there now
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
    // a module starts or stops playing: the status bar's ♪ <module>
    this.mixer.onActive = () => this.requestFrame();
    const update = () => {
      const hidden = document.hidden;
      this.loop.setPaused(hidden);
      if (!hidden) this.sound.wake(), this.mixer.wake();
      clearTimeout(this.releaseTimer);
      if (hidden) this.releaseTimer = setTimeout(() => this.renderer.release(), 60_000);
      this.gamepad.setActive?.(!hidden && document.hasFocus());
    };
    document.addEventListener("visibilitychange", update);
    const focus = (on: boolean) => {
      this.loop.background = !on && this.settings.data.appearance.backgroundSlow !== false;
      this.gamepad.setActive?.(on && !document.hidden);
      if (on) this.loop.request();
      if (on) this.sound.wake(), this.mixer.wake();
    };
    window.addEventListener("focus", () => focus(true));
    // the sound can come back only after a gesture: the first click / key after a time away wakes it
    window.addEventListener("pointerdown", () => (this.sound.wake(), this.mixer.wake()), { capture: true });
    window.addEventListener("keydown", () => (this.sound.wake(), this.mixer.wake()), { capture: true });
    // what nobody caught still lands in the error log (with a sound, the LOG tab blinks)
    const caught = (msg: string) => {
      this.errors.add(msg);
      this.sound.play("error");
      this.requestFrame();
    };
    window.addEventListener("error", (e) => caught(e.message || String(e.error)));
    window.addEventListener("unhandledrejection", (e) => caught(e.reason instanceof Error ? e.reason.message : String(e.reason)));
    this.log.onAdd = () => this.requestFrame();
    // debug on: the deck reports its own events (slow frames at most once a second, settings changed)
    let slowAt = 0;
    this.loop.onFrame = (ms) => {
      if (!this.log.debugOn || ms < 50 || performance.now() - slowAt < 1000) return;
      slowAt = performance.now();
      this.debug(`slow frame: ${ms.toFixed(0)} ms (${this.workspace.activeApp?.kind ?? "?"})`);
    };
    this.settings.onChange((path) => {
      if (this.log.debugOn) this.debug(`setting changed: ${path}`);
      // pins changed (pin, unpin, ⌘Z…): HOME's squares follow
      if (path === "favorites") syncLinkWidgets(this);
    });
    this.errors.onAdd = (e) => {
      this.log.add("error", `${e.code}  ${t(e.title)}`, { detail: e.detail, code: e.code });
      this.requestFrame();
      this.speak("errors", t("error {code}: {title}", { code: e.code.split("").join(" "), title: t(e.title) }));
    };
    window.addEventListener("blur", () => focus(false));
    // started without the focus (launched behind another window, the login done elsewhere): no
    // blur ever comes, so ask now — or the boot screen ran at full rate, unseen (perf R7)
    this.loop.background = !document.hasFocus() && this.settings.data.appearance.backgroundSlow !== false;
    // some webviews don't report a minimized window as hidden: ask the window itself
    void this.platform.onMinimized?.((min) => {
      this.loop.setPaused(min || document.hidden);
      if (min) this.releaseTimer = setTimeout(() => this.renderer.release(), 60_000);
    });
  }

  private registerCore(): void {
    // the settings rows: the deck's own (apps/settings-rows.ts, modules' rows included)
    this.prefs.register("core", () => coreSettingRows(this));
    for (const c of [...fileCommands, ...systemCommands, ...deckCommands, storeCommand, updateCommand, ...shortcutCommands, scriptCommand, pinCommand, unpinCommand, tagCommand, iconCommand, trashCommand, weatherCommand, startHereCommand]) this.commands.register({ ...c, source: "core" });
    // developer tools (factory-reset): only in a build that has them (npm run app:mac, the
    // web preview while developing). A release never registers them: not in help, man, Tab,
    // THE MENU or BLOCKS — they don't exist there.
    void this.platform.dev?.available().then((on) => {
      if (on) for (const c of devCommands) this.commands.register({ ...c, source: "core" });
    }, () => {});
    for (const w of [...BUILTIN_WIDGETS, pinnedWidget]) this.widgets.register(w);
    // the frame's own parts, callable like modules: deck.use("tree").reveal(…), ib.use("terminal")…
    for (const [id, fns] of Object.entries(frameServices(this))) this.services.exposeAll(id, fns);
    syncLinkWidgets(this); // the 1×1 shortcut squares
    for (const a of [homeSpec, modulesSpec, storeSpec, explorerSpec, studioSpec, setupSpec, noteSpec, journalSpec, linkSpec, sysmonSpec, settingsSpec, helpSpec, shortcutsSpec, terminalSpec, weatherSpec, clocksSpec, newsSpec, moonSpec, focusSpec, trashSpec, blocksSpec]) this.apps.register(a);

    registerCoreActions(this); // THE MENU's searchable actions (deck-actions.ts)
  }

  // ── the frame ────────────────────────────────────────────────────────────

  /** `debug perf`: every frame's cost while it records (shell/commands/log.ts) */
  perfRec: { until: number; frames: { at: number; build: number; paint: number; cells: number; glyphs: number; wanted: number }[] } | null = null;

  private frame = (now: number): number => {
    const t0 = performance.now();
    if (this.grid.cols !== this.renderer.cols || this.grid.rows !== this.renderer.rows) this.grid = new Grid(this.renderer.cols, this.renderer.rows);
    const ui = this.ui;
    ui.begin(this.grid, this.theme, now, this.input.mouseCell);
    ui.cellAspect = this.renderer.cellW / this.renderer.cellH;
    ui.still = this.loop.still || !!this.settings.data.appearance.reduceMotion;
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
      if (!this.lock) this.sessionReady();
    }
    const probe = this.showLayout && !this.boot ? (ui.probe = new LayoutProbe(this.grid.cols, this.grid.rows)) : null;
    if (!this.boot && this.lock) this.lock.render(ui);
    else if (!this.boot) this.workspace.render(ui);
    if (probe) (ui.probe = null), (this.layoutIssues = probe.issues);

    // theme motion on the finished frame: changed cells, then page transitions
    if (this.settings.data.fx.glitch) {
      // a theme's ink / glow and the letters' fade are worked out on the clock: 30 frames a
      // second show them as well, and the screen's own rate kept the deck drawing non-stop
      if (this.cellFx.apply(this.grid, this.theme, performance.now())) ui.animate(33);
      if (this.transitions.apply(this.grid, this.theme, performance.now())) ui.animate(16);
    }
    const g = this.glitchUntil - performance.now();
    if (g > 0) {
      glitch(this.grid, Math.min(1, g / 300), Math.floor(now / 50));
      ui.animate(16);
    }
    // `debug hits`: every clickable area outlined (the last one under the pointer wins)
    if (this.showHits) {
      const g = this.grid;
      for (const h of ui.hits) {
        const col = h.cmd ? ui.c.success : h.menu ? ui.c.warning : ui.c.accentAlt;
        for (let y = Math.max(0, h.rect.y); y < Math.min(g.rows, h.rect.y + h.rect.h); y++)
          for (let x = Math.max(0, h.rect.x); x < Math.min(g.cols, h.rect.x + h.rect.w); x++) g.bg[y * g.cols + x] = mix(g.bg[y * g.cols + x], col, 0.25);
      }
    }
    // `debug layout show`: a cut text's first hidden letter's cell in red, an overlap in yellow
    if (probe) {
      const g = this.grid;
      for (const i of probe.issues) {
        const x = Math.max(0, Math.min(g.cols - 1, i.x)), y = Math.max(0, Math.min(g.rows - 1, i.y));
        g.bg[y * g.cols + x] = i.kind === "cut" ? ui.c.error : ui.c.warning;
      }
    }
    const t1 = performance.now();
    this.renderer.draw(this.grid);
    if (this.perfRec) {
      const t2 = performance.now();
      if (t2 < this.perfRec.until) this.perfRec.frames.push({ at: t0, build: t1 - t0, paint: t2 - t1, cells: this.renderer.lastCells, glyphs: this.renderer.takeAtlasMisses(), wanted: this.loop.wanted });
    }
    if (this.renderer.fading) ui.animate(33); // letters still fading in (renderer.fadeMs): 3–4 steps, on the clock
    if (ui.caret) this.input.placeCaret(ui.caret.x, ui.caret.y);
    this.renderer.setCaret(ui.softCaret ? ui.caret : null, css(ui.c.cursor), ui.caretTyped, !!this.settings.data.appearance.reduceMotion);
    this.hits = ui.hits;
    return ui.wakeIn;
  };

  /**
   * Nobody logged in: the login screen, alone. Settings are the defaults (read
   * only), with the look of the account last remembered; no vault is mounted
   * and no module runs. Logging in (or making an account) reloads the deck as
   * that account — its settings, its vault, its theme.
   */
  private async startLogin(): Promise<void> {
    this.settings.readOnly = true;
    const device = await readDevice(this.platform);
    const look = device.look[lookKey(device.last)];
    if (look?.theme && this.themes.get(look.theme)) this.settings.data.appearance.theme = look.theme;
    this.refreshTheme(true);
    this.sound.enabled = true;
    const count = await this.platform.account.count().catch(() => 0);
    this.lock = new LockScreen(this, device, count, () => {
      // the account is unlocked on the native side: start again as that account
      location.reload();
    });
    this.starting = false;
    this.watchVisibility();
    this.loop.request();
  }

  /** Remember this account's look for the login screen (theme, icon). */
  private async rememberLook(): Promise<void> {
    const s = this.settings.data;
    if (!this.account) return;
    await writeDevice(this.platform, (d) => {
      d.look[lookKey(this.account!)] = { theme: s.appearance.theme, avatar: s.user.avatar };
      if (d.remember) d.last = this.account!;
    });
  }

  /** Lock (log out): the settings are saved, the account is locked, the login screen comes back. */
  lockNow(): void {
    void (async () => {
      await this.settings.flush();
      await this.rememberLook();
      await this.platform.account.lock().catch(() => {});
      location.reload();
    })();
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
    // entering / leaving full screen moves the window in steps: measure again once it has settled
    void this.measureNotch();
    clearTimeout(this.notchTimer);
    this.notchTimer = setTimeout(() => void this.measureNotch().then(() => setTimeout(() => void this.measureNotch(), 600)), 250);
  }
  private notchTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * In full screen on a MacBook, the deck covers the camera notch too: the rows it
   * hides become a thin band (workspace.notchRows) and the deck starts under it.
   */
  private async measureNotch(): Promise<void> {
    const w = this.platform.window;
    let rows = 0;
    if (w.notch && (await w.isFullscreen().catch(() => false))) {
      const px = await w.notch();
      const cellCss = this.renderer.cellH / (window.devicePixelRatio || 1);
      if (px > 0 && cellCss > 0) rows = Math.ceil(px / cellCss);
    }
    if (rows !== this.workspace.notchRows) {
      this.workspace.notchRows = rows;
      this.loop.request();
    }
  }

  // ── InputSink: everything the keyboard/mouse/gamepad produce lands here ──

  key(k: KeyInput): void {
    // Windows / Linux: alt+F4 closes the window, as everywhere — before anyone else can keep it
    // (the boot, the login screen, a pop-up, your real terminal, a page that plays the keyboard
    // and owns the alt keys). The page keeps every key, so the system never sees it.
    if (!IS_MAC && k.combo === "alt+f4") return void this.quit();
    if (this.boot) return this.boot.skip();
    if (this.lock) return this.lock.onKey(k), this.requestFrame();
    this.workspace.handleKey(k);
    this.requestFrame();
  }

  /** the page in front plays the keyboard (App.rawKeys): its keys come as keys, not text */
  rawKeys(): boolean {
    return !this.boot && !this.lock && this.workspace.rawKeys();
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
    // any program started in your real terminal has its token: it isn't you typing.
    // An encrypted vault's commands stay in ibsh (they'd read your notes decrypted);
    // a plain vault's run untrusted, like a module's (shell/privileged.ts).
    const crypt = await this.platform.vault.crypt?.status().catch(() => null);
    if (crypt?.encrypted) return b.send(req.id, "\x1b[33mICEBREAKER: the vault is encrypted — its commands stay in ibsh (your terminal only sees noise)\x1b[0m\n", true, true, 1);
    // Settings → PERMISSIONS → Your real terminal: nothing at all
    if (this.settings.data.shell.bridge === "off") return b.send(req.id, "\x1b[33mICEBREAKER: its commands are switched off in your real terminal (Settings → PERMISSIONS) — type them in ibsh\x1b[0m\n", true, true, 1);
    this.access.note("terminal", "shell", args[0] ?? "");
    const line = args.map((a, i) => (i === 0 ? a : q(a))).join(" ");
    if (cmd.interactive) {
      void this.shell.runUntrusted(line, { source: "terminal", grants: "all" });
      this.requestFrame();
      return b.send(req.id, `\x1b[2m→ ${args[0]} asks questions: it's running in the ibsh tab\x1b[0m\n`, true, true, 0);
    }
    // what goes wrong is said in red, and the exit code goes back with the end (the shell's $?, its ✕)
    const ex = new ShellExecutor(this, (text, isError) => b.send(req.id, isError ? `\x1b[31m${text.replace(/\n$/, "")}\x1b[0m${text.endsWith("\n") ? "\n" : ""}` : text, false, true), () => {});
    ex.origin = { source: "terminal", grants: "all" };
    ex.env = this.shell.exec.env;
    const root = this.vault.root.replace(/\/$/, "");
    ex.cwd = req.cwd === root ? "" : req.cwd.startsWith(`${root}/`) ? req.cwd.slice(root.length + 1) : "";
    let status = 1;
    try {
      status = await ex.run(line);
    } finally {
      b.send(req.id, null, true, true, status);
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
    else this.log.add("notify", text, { source: kind });
    // the deck isn't in front (minimized, hidden, another app on top): a real system
    // notification too, so you see it anyway (notifications: off / sound only skip it)
    const n = this.settings.data.notifications;
    if (n.system && (document.hidden || !document.hasFocus())) {
      // the system already shows the app's name: the title says what it is, not "ICEBREAKER"
      // (a screen reader or "announce notifications" would read it before every message)
      const title = kind === "error" ? t("error") : kind === "warning" ? t("warning") : text;
      void this.platform.notify?.(title, title === text ? "" : text).catch(() => {});
    }
    this.workspace.notify(text, kind);
    this.requestFrame();
  }

  /**
   * A question about what a module may do (workspace/permdialog.ts): switching it on, a
   * high-risk permission used for the first time, a command for your real terminal. Gives
   * the chosen button's value (the first one, the way out, for esc).
   */
  askPermission(spec: PermDialogSpec): Promise<string> {
    return new Promise((resolve) => {
      this.workspace.push(new PermissionDialog(spec, resolve));
      this.sound.play("alert");
      this.requestFrame();
    });
  }

  confirm(title: string, detail = "", preselected = true): Promise<boolean> {
    const p = this.workspace.confirm(title, detail, preselected);
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
      const made = spec.create(this, args);
      this.appArgs.set(made, args);
      const app = this.workspace.open(made);
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

  /**
   * Open a note in the tab of `old` (a note), in its place — the tree's double-click, like a
   * browser link. The tab remembers the note it showed (`record`: back / forward don't add to it).
   */
  async openInPlace(old: App, path: string, record = true): Promise<void> {
    const spec = this.apps.get("note");
    if (!spec) return this.openFile(path);
    const hist = this.tabHistory.get(old) ?? { back: [], forward: [] };
    if (record && old.kind === "note") (hist.back.push(old.key.slice(5)), (hist.forward = []));
    await Promise.resolve(old.close?.()).catch(() => {}); // it saves on the way out
    const made = spec.create(this, path);
    this.appArgs.set(made, path);
    this.tabHistory.set(made, hist);
    this.workspace.replaceTab(old, made);
    this.sound.play("open");
    this.requestFrame();
  }

  /** each tab's notes before / after the one it shows (opened in place: the tree's double-click) */
  private tabHistory = new WeakMap<App, { back: string[]; forward: string[] }>();

  /** The mouse's back (-1) / forward (1) button: the note this tab showed before / after. */
  async tabHistoryStep(dir: 1 | -1): Promise<void> {
    const cur = this.workspace.page ? undefined : this.workspace.activeApp;
    const h = cur && this.tabHistory.get(cur);
    if (!cur || !h || cur.kind !== "note") return;
    const from = dir < 0 ? h.back : h.forward;
    const to = dir < 0 ? h.forward : h.back;
    let path: string | undefined;
    // (a note deleted since: skipped)
    while ((path = from.pop()) !== undefined && !(await this.vault.exists(path)));
    if (path === undefined) return;
    to.push(cur.key.slice(5));
    await this.openInPlace(cur, path, false);
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
    if (!(await this.vault.exists(path))) {
      await this.vault.write(path, `# ${title.trim()}\n\n`);
      this.vault.recordCreated(path);
    }
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
      // one ⌘Z brings the old theme back, with its effects
      this.history.group(`theme ${name}`, () => {
        this.settings.set("appearance.theme", name);
        this.recallFx(name);
      });
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
    const bloomNow = fx.bloom ? bloomStrength(t.fx.bloom, lv.bloom) : 0;
    root.setProperty("--bloom", String(bloomNow));
    // the bloom adds light, and each theme is tuned with it: lowered or off, the
    // picture itself gets that light back (no dimmer screen)
    const boost = Math.min(1.35, 1 + Math.max(0, t.fx.bloom - bloomNow) * 0.6);
    const screenEl = document.getElementById("screen");
    // and the user's brightness (Settings → APPEARANCE), on top
    const light = boost * ((this.settings.data.appearance.brightness ?? 100) / 100);
    // in the renderer's colours, not a CSS filter on the screen (redone by the compositor every frame)
    if (screenEl) screenEl.style.filter = "";
    this.renderer.setLight(light);
    root.setProperty("--scanlines", String(fx.scanlines ? (t.fx.scanlines * lv.scanlines) / 100 : 0));
    root.setProperty("--vignette", String(fx.vignette ? (t.fx.vignette * lv.vignette) / 100 : 0));
    document.getElementById("deck")!.classList.toggle("crt", fx.scanlines && t.fx.scanlines * lv.scanlines > 0);
    document.getElementById("bloom")!.style.display = fx.bloom && t.fx.bloom * lv.bloom > 0 ? "block" : "none";
    document.getElementById("scanlines")!.style.display = fx.scanlines ? "block" : "none";
    document.getElementById("vignette")!.style.display = fx.vignette ? "block" : "none";
    document.getElementById("deck")!.classList.toggle("flicker", fx.flicker && t.fx.flicker);
    root.setProperty("--flicker-speed", String(flickerSpeed(fx.flickerSpeed)));
    // the curved glass: its rim and reflection (style.css #curve), 0 = flat; the bend itself is renderer.setCurve
    const curve = Math.max(0, Math.min(100, lv.curve ?? 0)) / 100;
    root.setProperty("--curve", String(curve));
    document.getElementById("deck")!.classList.toggle("curved", curve > 0);
    document.getElementById("deck")!.classList.toggle("monochrome", t.fx.monochrome);
    root.setProperty("--paper", String(t.fx.paper));
    // nothing to bloom (the theme has none, or 0 %): no copy of the screen made at all
    this.renderer.bloomEnabled = fx.bloom && t.fx.bloom * lv.bloom > 0;
    this.renderer.setBloomRadius(bloomRadius(fx.bloom ? lv.bloom : 0));
    this.renderer.setChroma(lv.chroma ?? 0);
    this.renderer.setGlow(lv.glow ?? 0, t.c.bg);
    // the curved glass bends the whole picture (crt.ts) — composed with the bloom and the CRT lines
    this.renderer.setCurve(curve, this.renderer.bloomEnabled ? bloomNow : 0, fx.scanlines ? (t.fx.scanlines * lv.scanlines) / 100 : 0);
    const sharp = fx.levels.sharpness ?? 100 - (fx.levels.softness ?? 0);
    // a gentler curve: 80 % is a light CRT softness, 0 % still readable
    this.renderer.setSoftness((100 - sharp) * 0.6);
    // the pace of frames: the screen's (vsync), or the user's cap; 0 = no animations
    const a = this.settings.data.appearance;
    // with vsync, the smoothness cap: 60 on battery, 120 on the mains ("auto"), or the one chosen
    const smooth = a.smooth === "60" ? 60 : a.smooth === "120" ? 120 : this.onBattery ? 60 : 120;
    this.loop.configure({ maxFps: a.vsync ? smooth : Math.max(0, Math.min(240, a.maxFps)), timed: !a.vsync, frozen: !a.vsync && a.maxFps === 0, slow: !!a.reduceMotion });
    // letters fade in as they appear (not with reduce animations, nor with no animations at all)
    this.renderer.fadeMs = a.fadeIn !== false && !a.reduceMotion && !(!a.vsync && a.maxFps === 0) ? 110 : 0;
    this.requestFrame();
  }

  /** A setting put back by ⌘Z: whoever uses it hears about it, like after `config set`. */
  private reverted(path: string): void {
    this.applySettings(path);
    if (path === "moduleSettings")
      for (const [id, fns] of this.moduleSettingListeners)
        for (const [key, value] of Object.entries(this.settings.data.moduleSettings?.[id] ?? {})) for (const fn of fns) fn(key, value);
  }

  /** What an undo step was, in words: a setting's own name (as in Settings), else a plain phrase. */
  private undoLabel(label: string): string {
    const PLAIN: Record<string, string> = {
      "home.widgets": "the HOME layout",
      "home.widgetConfig": "a widget's settings",
      "home.links": "the shortcut squares",
      "panel.widgets": "the side panel",
      "panel.tops": "the side panel's layout",
      "panel.heights": "a panel widget's size",
      "panel.shown": "the side panel",
      "keys": "your shortcuts",
      "keyOverrides": "a shortcut",
      "menu.keys": "a key on THE MENU",
      "favorites": "the pins",
    };
    if (PLAIN[label]) return t(PLAIN[label]);
    const row = this.prefs.rows().find((r) => r.key === label);
    if (row?.label) return t(row.label);
    // "trash notes/x.md", "rename …", "new …", "theme e-ink": already words
    return label.replace(/^(trash|rename|new|theme) /, (_m, w: string) => `${t(w)} `);
  }

  /** The mixer (Settings → SOUND): each channel's volume, 0-100 → 0-1. */
  private applyMix(): void {
    const s = this.settings.data.sound;
    const mix = s.mix;
    for (const ch of SOUND_CHANNELS) this.sound.mix[ch] = Math.max(0, Math.min(100, mix?.[ch] ?? 100)) / 100;
    // the modules' own sound (ib.audio): the main volume × its fader, nothing when the sound is off
    this.mixer.setVolume(s.enabled && !s.muted ? (s.volume / 100) * (Math.max(0, Math.min(100, mix?.modules ?? 80)) / 100) : 0);
  }

  /**
   * Your own keys click, if you want (Settings → SOUND → mixer → Keyboard, 0 by default; the
   * theme's pack colours it): a click to type, another sound to erase. Played on
   * the key going down (core/input.ts onKeyPress), so it lands with your finger.
   */
  private typingSound(kind: "type" | "erase" | "enter"): void {
    if (!(this.settings.data.sound.mix.typing > 0)) return;
    this.sound.play(kind === "erase" ? "erase" : "key");
  }

  /** ⌘Z (redo: ⌘⇧Z): the last thing done anywhere, taken back — with a word on screen. */
  async undoLast(redo = false): Promise<void> {
    let label: string | undefined;
    try {
      label = redo ? await this.history.redo() : await this.history.undo();
    } catch (e) {
      // e.g. the file was already brought back from the TRASH page
      this.notify(`${t(redo ? "can't redo" : "can't undo")}: ${e instanceof Error ? e.message : e}`, "error");
      return;
    }
    if (label) {
      this.sound.play("back");
      this.notify(`${redo ? "↷ " + t("redone") : "↶ " + t("undone")}: ${this.undoLabel(label)}`);
    } else this.notify(t(redo ? "nothing to redo" : "nothing to undo"));
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
    else if (key.startsWith("fx") || ["appearance.maxFps", "appearance.vsync", "appearance.smooth", "appearance.brightness", "appearance.reduceMotion", "appearance.fadeIn"].includes(key)) this.applyFx();
    else if (key === "sound.packByTheme") {
      this.sound.setPack(this.soundPack(), this.theme.sound.pitch);
      void this.reloadSounds();
    } else if (key.startsWith("sound.")) {
      this.sound.enabled = s.sound.enabled && !s.sound.muted;
      this.sound.volume = s.sound.volume / 100;
      this.applyMix();
      if (s.sound.muted) this.voice.stop();
      // a fader moved: hear that channel (Settings → SOUND → mixer)
      const sample: Record<string, SoundName> = { "sound.mix.text": "blip", "sound.mix.typing": "key", "sound.mix.alerts": "notify", "sound.mix.boot": "unlock" };
      // (at most ~10 a second: a held slider moves 60 steps a second — the value never waits, the sound does)
      const now = performance.now();
      if (now - this.samplePlayedAt > 100) (this.samplePlayedAt = now), this.sound.play(sample[key] ?? "confirm");
    }
    this.requestFrame();
  }
  private samplePlayedAt = 0;

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
    // leaving: the band under the notch goes at once (it never outlives full screen)
    if (!on) this.workspace.notchRows = 0;
    await this.platform.window.setFullscreen(on);
    setTimeout(() => this.resize(), 300);
  }

  /**
   * After mounting: the vault is this account's and brings newer settings (changed
   * on another computer, docs/ENCRYPTION.md "portable vaults") → the deck starts
   * again with them. Settings are frozen first so the old ones aren't saved over them.
   */
  private async syncVaultAccount(canAsk = false): Promise<boolean> {
    const sync = this.platform.account.syncVault;
    if (!sync) return false;
    let r = await sync().catch(() => "none" as const);
    if (r === "ask") {
      // a plain vault is a folder anyone with access can write in: nothing comes from it
      // without your yes. At start there's no window yet: asked once the deck is up.
      if (!canAsk) return (this.vaultSettingsWait = true), false;
      r = await this.answerVaultSettings();
    }
    if (r !== "taken") return false;
    this.settings.freeze();
    location.reload();
    return true;
  }

  /** a plain vault brought newer settings at start: asked once the deck is up */
  private vaultSettingsWait = false;

  private async answerVaultSettings(): Promise<"none" | "ask" | "taken"> {
    this.vaultSettingsWait = false;
    const yes = await this.confirm(
      t("This vault brings newer settings"),
      t("They were changed on another computer — or by something else\nthat writes in this folder. Take them?\n\nYour keys, THE MENU, macros, pins, modules, AI, privacy and\nupdate settings stay this computer's: a vault that isn't\nencrypted never brings those, nor a password."),
      false, // enter alone answers no
    );
    return (await this.platform.account.syncVault?.(yes).catch(() => "none" as const)) ?? "none";
  }

  /** After start: the question a plain vault's newer settings wait for. */
  private async askVaultSettings(): Promise<void> {
    if (!this.vaultSettingsWait) return;
    if ((await this.answerVaultSettings()) !== "taken") return;
    this.settings.freeze();
    location.reload();
  }

  async mountVault(path: string): Promise<void> {
    // typed in the shell (`vault mount`): the keys stay there afterwards, not on HOME
    const inShell = this.workspace.focus === "shell";
    for (const t of [...this.workspace.tabs]) await t.close?.();
    this.workspace.tabs = [];
    try {
      await this.vault.mount(path);
    } catch (e) {
      // an encrypted vault the login's password didn't open: ask for its password here,
      // rather than leaving an empty deck with the other vault's tree
      if (!/encrypted and locked/.test(e instanceof Error ? e.message : String(e)) || !this.platform.vault.crypt) throw e;
      this.vault.entries = [];
      this.vault.events.emit("rescanned", undefined);
      for (;;) {
        const pw = await this.prompt(t("This vault is encrypted: its password"), { mask: true });
        if (pw === null) {
          this.openApp("home");
          throw new Error("the vault is encrypted and locked (vault unlock)");
        }
        try {
          await this.platform.vault.crypt.unlock(pw);
          break;
        } catch (err) {
          this.notify(err instanceof Error ? err.message : String(err), "error");
        }
      }
      await this.vault.mount(path);
    }
    if (await this.syncVaultAccount(true)) return;
    this.settings.set("vault.path", this.vault.root);
    await this.reloadUserThemes();
    await this.plugins.reload();
    this.openApp("home");
    if (inShell) this.workspace.focusShell();
    this.notify(`vault: ${this.vault.root}`, "success");
  }

  /** (Re)load custom sounds from .icebreaker/sounds. Returns how many were found. */
  /** Sound packs made of files, in <vault>/.icebreaker/sounds/packs/<id>/ (docs/SOUND_PACKS.md). */
  soundFolderPacks: string[] = [];

  async reloadSounds(): Promise<number> {
    const rb = this.platform.vault.readBytes;
    if (!rb) return 0;
    const packsDir = ".icebreaker/sounds/packs";
    this.soundFolderPacks = (await this.vault.exists(packsDir).catch(() => false)) ? (await this.vault.list(packsDir)).filter((e) => e.isDir).map((e) => e.name) : [];
    const pack = this.soundPack();
    // your own sounds, then the pack's files on top (what a pack doesn't have stays synthesized)
    const dirs = [".icebreaker/sounds", ...(this.soundFolderPacks.includes(pack) ? [`${packsDir}/${pack}`] : [])];
    return this.sound.loadCustom(async (p) => ((await this.vault.exists(p).catch(() => false)) ? rb(p) : null), dirs);
  }

  /**
   * Get the user's attention, even when the deck is in the background: the
   * system notification, the "alert" sound (tu-dut), a toast — and the voice
   * reads it when it's on. Modules call it through ib.ui.alert.
   *
   * The voice reads what it's about — never the app's name: a title that's only
   * "ICEBREAKER" or "Test" isn't read, the body is. `spoken` says exactly what to read.
   */
  alert(title: string, body = "", topic: VoiceTopic = "reminders", spoken?: string): void {
    // one box each in Settings → NOTIFICATIONS
    const n = this.settings.data.notifications;
    if (n.sound) this.sound.play("alert");
    if (n.screen) this.workspace.notify(body ? `${title} — ${body}` : title, "warning");
    if (n.system && (!n.systemOnlyAway || document.hidden || !document.hasFocus())) void this.platform.notify?.(title, body).catch((e) => console.warn("[notify]", e));
    if (n.voice) this.speak(topic, spoken ?? spokenAlert(title, body));
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



  /** start() went all the way (the vault, the modules, the tabs) */
  private started = false;
  /**
   * The session is ready: start() is done and the desktop is on screen. Until now the
   * voice said nothing at all (a module's missed reminder, an error while loading, the
   * CPU busy starting…): its first words are the greeting.
   */
  /** the modules that should be on and aren't, with why (said once the desktop appears) */
  private modulesOff: { id: string; name: string; why: string }[] = [];

  private sessionReady(): void {
    if (!this.started || this.voice.open) return;
    this.voice.open = true;
    this.greet();
    // a module that's off for a reason you can act on: said here, where you can read it
    for (const m of this.modulesOff.splice(0, 3)) this.notify(t("{m} is off: {why} — switch it on again in the STORE (or: plugin enable {id})", { m: m.name, why: t(m.why), id: m.id }), "warning");
    // updated since this device last saw it: WHAT'S NEW, once (never during the setup)
    void whatsNewOnce(this);
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
    if (!this.settings.data.fx.glitch || this.settings.data.appearance.reduceMotion) return;
    const page = this.theme.anim.page;
    if (page === "none") return;
    if (page !== "glitch") return this.pageTurn(true);
    this.glitchUntil = performance.now() + ms;
    this.requestFrame();
  }

  /**
   * Any module — or a part of the deck (tree, terminal, shell, theme, home,
   * panel, tabs, notes, sound, deck) — as an object: `deck.use("todo").add("x")`.
   * The deck's own code has every permission. See plugins/frame-services.ts.
   */
  use<T = ModuleProxy>(module: string): T {
    return this.services.proxy<T>({ id: "core", permissions: "all" }, module);
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
    void this.reloadSounds(); // a pack made of files: load them (another pack: they go)
  }

  /** A page or tab change: themes with an eink / wipe / fade transition play it (glitch stays for big moments). */
  pageTurn(big = false, quick = false): void {
    const page = this.theme.anim.page;
    if (!this.settings.data.fx.glitch || this.settings.data.appearance.reduceMotion || page === "none" || (page === "glitch" && !big)) return;
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
    // a page can keep the deck open ("save?" → cancel): then nothing quits
    for (const t of [...this.workspace.tabs]) if ((await Promise.resolve(t.close?.()).catch(() => true)) === false) return;
    await this.updater.onQuit();
    await this.platform.window.quit();
  }

  private checkIdle(): void {
    // 90 s without a key or the mouse: ambient animations slow down (energy)
    if (performance.now() - this.lastActivity > 90_000) this.loop.idle = true;
    const min = this.settings.data.fx.screensaverMinutes;
    if (min > 0 && performance.now() - this.lastActivity > min * 60_000 && !this.boot && !this.workspace.overlays.length) this.screensaver();
  }

  /** Everything THE MENU can search. */
  paletteEntries(): PaletteAction[] {
    const out: PaletteAction[] = [...this.actions.list()];
    for (const spec of this.apps.list()) {
      if (spec.kind === "note") continue;
      out.push({ id: `app.${spec.kind}`, title: spec.title, group: "open", hint: spec.description, run: () => void this.openApp(spec.kind) });
    }
    for (const t of this.themes.list()) out.push({ id: `theme.${t.name}`, title: t.name, group: "theme", hint: t.description, run: () => void this.setTheme(t.name) });
    // the ready-made layouts (the user's: THE MENU runs them as you, like ibsh)
    for (const [name, p] of Object.entries(PRESETS)) out.push({ id: `layout.${name}`, title: `layout preset ${name}`, group: "layout", hint: p.doc, run: () => void this.act(`layout preset ${name}`) });
    out.push({ id: "layout.reset", title: "layout reset", group: "layout", hint: "the classic layout back", run: () => void this.act("layout reset") });
    for (const e of this.vault.markdown().slice(0, 3000)) out.push({ id: `file.${e.path}`, title: e.path, group: "file", run: () => void this.openFile(e.path) });
    for (const c of this.commands.all()) out.push({ id: `cmd.${c.name}`, title: c.name, group: "$", hint: c.summary, run: () => void this.shell.runLine(c.name).then(() => this.workspace.focusShell()) });
    return out;
  }
}

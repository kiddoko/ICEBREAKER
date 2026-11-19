import { applyFxPreset, currentFxPreset, FX_PRESET_NAMES } from "../workspace/fxpanel";
/**
 * THE DECK'S SETTINGS, declared as rows — the same rows modules get from
 * ib.settings.register. Settings (apps/settings.ts) only draws them; the
 * catalog (core/catalog.ts) lists them; `config set` changes the same keys.
 *
 * Rows come in order: a row with `section` and no label starts a category.
 * Kinds and the drawing rules are in core/prefs.ts.
 */
import { AvatarPicker } from "../workspace/avatarpicker";
import { SOUND_PACKS } from "../core/sound";
import { t } from "../core/i18n";
import { displayKeys, keysOf, menuKeyOf, SHORTCUT_CATEGORIES, SHORTCUTS } from "../core/shortcuts";
import { rebind, rebindMenuKey } from "./shortcuts";
import { KeyCapture } from "../workspace/keycapture";
import { SETTINGS_HELP } from "./settings-help";
import { focus } from "../widgets/focusstate";
import { q } from "../ui/ui";
import { fxMax, getFx, setFx, type FxLevel } from "../core/fxlevels";
import type { Deck } from "../deck";
import type { SettingRow as Row } from "../core/prefs";

/** a neural voice for the voice's language is installed (null: don't know yet) */
const neural: { v: boolean | null } = { v: null };
export async function checkNeural(deck: Deck): Promise<void> {
  try {
    const info = await deck.platform.voice?.info();
    const lang = deck.settings.data.voice.language;
    neural.v = !!info?.piper && info.piper_voices.some((v) => v.includes(`-${lang}_`) || v.includes(`-${lang}-`));
  } catch {
    neural.v = false;
  }
  deck.requestFrame();
}

export function coreSettingRows(deck: Deck): Row[] {
  const d = deck;
  const s = d.settings;
  const set = (key: string, v: unknown) => {
    s.set(key, v);
    d.applySettings(key);
  };
  const toggle = (key: string, label: string, section?: string): Row => ({
    section,
    key,
    label,
    kind: "toggle",
    cmd: () => `config set ${key} ${!s.get(key)}`,
    value: () => (s.get(key) ? "on" : "off"),
    change: () => set(key, !s.get(key)),
  });
  const cycle = <T,>(key: string, label: string, options: T[], section?: string, show: (v: T) => string = String): Row => ({
    section,
    key,
    label,
    kind: "choice",
    cmd: () => {
      const i = options.indexOf(s.get(key) as T);
      return `config set ${key} ${q(String(options[(i + 1) % options.length]))}`;
    },
    value: () => show(s.get(key) as T),
    change: (dir) => {
      const i = options.indexOf(s.get(key) as T);
      set(key, options[(i + dir + options.length) % options.length]);
    },
  });
  /** a real slider row; ←→ step by 5 */
  /**
   * Every number with a range is a slider, and they all follow the same rules (ui/slider.ts):
   * ←→ step by `step` (5 by default, 1 for small ranges), 0 reads "off" when it means off,
   * the unit shows when it isn't a percentage.
   */
  const slide = (key: string, label: string, min: number, max: number, get: () => number, put: (v: number) => void, extra: { zeroIsOff?: boolean; show?: (v: number) => string; cmd?: (v: number) => string; step?: number } = {}): Row => ({
    key,
    label,
    kind: "slider",
    cmd: () => (extra.cmd ? extra.cmd(get()) : `config set ${key} ${get()}`),
    value: () => (extra.show ? extra.show(get()) : extra.zeroIsOff && get() === 0 ? t("off") : `${get()}%`),
    change: (dir) => {
      const step = extra.step ?? 5;
      put(Math.max(min, Math.min(max, Math.round(get() / step) * step + dir * step)));
    },
    slider: { min, max, get, set: put, zeroIsOff: extra.zeroIsOff, show: extra.show, step: extra.step },
  });
  const fxSlide = (e: FxLevel, label: string, show?: (v: number) => string) =>
    slide(`fx.levels.${e}`, label, 0, fxMax(e), () => getFx(d, e), (v) => void setFx(d, e, v), { zeroIsOff: e !== "sharpness", show, cmd: (v) => `fx ${e} ${v}` });
  const num = (key: string) => Number(s.get(key) ?? 0);
  const text = (key: string, label: string, section?: string, placeholder = "", suggestions?: () => string[]): Row => ({
    section,
    key,
    kind: "text",
    isText: true,
    label,
    cmd: () => `config set ${key} ${q(String(s.get(key) ?? ""))}`,
    value: () => String(s.get(key) || "—"),
    change: async () => {
      const v = await d.prompt(t(label), { initial: String(s.get(key) ?? ""), placeholder, suggestions: suggestions?.() });
      if (v !== null) set(key, v);
    },
  });

  return [
    { section: "YOU", label: "", value: () => "" },
    cycle("user.language", "Language", ["en", "fr"], undefined, (v) => (v === "fr" ? "Français" : "English")),
    text("user.handle", "Name"),
    {
      label: "Avatar",
      // the picker shows what you chose: here, just the way in
      value: () => "edit",
      cmd: () => `avatar ${s.data.user.avatar?.id ?? "visor"} ${s.data.user.avatar?.color ?? "accent"}`,
      change: () => d.workspace.push(new AvatarPicker(d)),
    },
    cycle("user.gender", "Gender", ["", "woman", "man", "nonbinary", "other"], undefined, (v) => v || "—"),
    { ...text("user.genderOther", "Your word"), hidden: () => s.get("user.gender") !== "other" },
    {
      key: "user.pronouns",
      label: "Pronouns",
      cmd: () => `config set user.pronouns ${q(String(s.get("user.pronouns") ?? ""))}`,
      value: () => String(s.get("user.pronouns") || "—"),
      // the usual ones, or your own
      change: async () => {
        const opts = ["", "she/her", "he/him", "they/them", "elle", "il", "iel"];
        const cur = String(s.get("user.pronouns") ?? "");
        const i = await d.choose(t("pronouns"), [...opts.map((o) => ({ label: o || t("not specified") })), { label: t("my own…") }], { selected: Math.max(0, opts.indexOf(cur)) });
        if (i === null) return;
        if (i < opts.length) return set("user.pronouns", opts[i]);
        const v = await d.prompt(t("Your pronouns"), { initial: opts.includes(cur) ? "" : cur, placeholder: "xe/xem", suggestions: ["xe/xem", "ze/hir", "ae/aer", "fae/faer", "any", "ille", "ul", "al"] });
        if (v !== null) set("user.pronouns", v.trim());
      },
    },
    text("user.locale", "Date format", undefined, "fr-FR, en-US… (empty = system)", () => ["fr-FR", "fr-CH", "fr-BE", "fr-CA", "en-US", "en-GB", "de-CH", "de-DE", "it-CH", "it-IT", "es-ES", "pt-BR", "ja-JP", "nb-NO"]),
    // your account: who you are, log out (new accounts are made on the login page)
    { label: "Account", kind: "action", value: () => d.account ?? "—", cmd: () => "account passwd", change: () => void d.shell.runLine("account passwd").then(() => d.workspace.focusShell()) },
    { label: "Log out", kind: "action", value: () => "⏻", cmd: () => "logout", change: () => d.lockNow() },
    { section: "APPEARANCE", label: "", value: () => "" },
    cycle("appearance.theme", "Theme", d.themes.list().map((t) => t.name)),
    slide("appearance.scale", "Zoom", 50, 200, () => num("appearance.scale"), (v) => set("appearance.scale", v)),
    slide("appearance.fontSize", "Font size", 10, 20, () => num("appearance.fontSize"), (v) => set("appearance.fontSize", v), { step: 1, show: (v) => `${v}px` }),
    cycle("appearance.fontWeight", "Font weight", ["thin", "light", "regular"]),
    toggle("appearance.startFullscreen", "Start in full screen"),
    // the pace of frames: vsync (the screen's rate) or your own cap, greyed while vsync is on
    toggle("appearance.vsync", "V-Sync"),
    (() => {
      const row = slide("appearance.maxFps", "Frame rate", 0, 240, () => num("appearance.maxFps"), (v) => set("appearance.maxFps", v), { show: (v) => (v === 0 ? t("still") : `${v}fps`) });
      const vsync = () => s.data.appearance.vsync !== false;
      return { ...row, disabled: vsync, change: (dir: 1 | -1) => (vsync() ? d.notify(t("vertical sync is on: it follows your screen")) : row.change?.(dir)) };
    })(),
    slide("appearance.brightness", "Brightness", 50, 150, () => num("appearance.brightness") || 100, (v) => set("appearance.brightness", v)),
    toggle("appearance.reduceMotion", "Reduce motion"),
    toggle("appearance.fadeIn", "Smooth text"),
    slide("appearance.textSpeed", "Text speed", 0, 100, () => num("appearance.textSpeed"), (v) => set("appearance.textSpeed", v), { show: (v) => (v >= 100 ? t("instant") : `${v}%`) }),
    toggle("appearance.showFps", "Show FPS"),
    toggle("appearance.lineNumbers", "Line numbers"),
    toggle("appearance.backgroundSlow", "Save energy in background"),

    // (the effects are part of APPEARANCE)
    toggle("fx.ambient", "Animated background"),
    toggle("fx.flicker", "CRT flicker"),
    toggle("fx.glitch", "Glitch effects"),
    {
      label: "Effects preset",
      kind: "choice",
      // ‹ › goes through the presets (none · light · medium · heavy · party); the sliders below follow
      value: () => currentFxPreset(d),
      cmd: () => `fx ${currentFxPreset(d) === "custom" ? "light" : currentFxPreset(d)}`,
      change: (dir) => {
        const cur = currentFxPreset(d);
        const i = cur === "custom" ? (dir > 0 ? -1 : 0) : FX_PRESET_NAMES.indexOf(cur);
        applyFxPreset(d, FX_PRESET_NAMES[(i + dir + FX_PRESET_NAMES.length) % FX_PRESET_NAMES.length]);
      },
    },
    // one slider per effect: 0 = off
    fxSlide("bloom", "Bloom"),
    fxSlide("scanlines", "Scanlines"),
    fxSlide("vignette", "Vignette"),
    fxSlide("chroma", "Chromatic aberration"),
    fxSlide("glow", "Glow"),
    fxSlide("sharpness", "Sharpness", (v) => `${v}%`),
    slide("fx.screensaverMinutes", "Screensaver", 0, 60, () => num("fx.screensaverMinutes"), (v) => set("fx.screensaverMinutes", v), { step: 5, zeroIsOff: true, show: (v) => (v ? `${v} min` : t("never")) }),
    cycle("boot.mode", "Boot animation", ["full", "fast", "off"]),
    { section: "SOUND", label: "", value: () => "" },
    // ui sounds: one slider, 0 = off
    slide("sound.volume", "Volume", 0, 100, () => (s.data.sound.enabled ? num("sound.volume") : 0), (v) => {
      set("sound.enabled", v > 0);
      if (v > 0) set("sound.volume", v);
    }, { zeroIsOff: true }),
    {
      label: "Sound pack",
      steps: true,
      value: () => `${d.soundPack()}${d.soundPack() === d.theme.sound.pack ? ` ${t("(default)")}` : ""}`,
      cmd: () => `sound pack ${d.soundPack()}`,
      change: (dir) => {
        const packs = [...Object.keys(SOUND_PACKS), ...d.soundFolderPacks];
        d.setSoundPack(packs[(packs.indexOf(d.soundPack()) + dir + packs.length) % packs.length]);
        d.sound.play("tick");
      },
    },
    // the mixer: one fader per kind of sound, under the main volume above (core/sound.ts SOUND_CHANNELS)
    { label: "Mixer", kind: "head", value: () => "" },
    slide("sound.mix.ui", "Interface", 0, 100, () => num("sound.mix.ui"), (v) => set("sound.mix.ui", v), { zeroIsOff: true }),
    slide("sound.mix.alerts", "Notifications", 0, 100, () => num("sound.mix.alerts"), (v) => set("sound.mix.alerts", v), { zeroIsOff: true }),
    slide("sound.mix.text", "Text", 0, 100, () => num("sound.mix.text"), (v) => set("sound.mix.text", v), { zeroIsOff: true }),
    slide("sound.mix.typing", "Keyboard", 0, 100, () => num("sound.mix.typing"), (v) => set("sound.mix.typing", v), { zeroIsOff: true }),
    slide("sound.mix.boot", "Startup", 0, 100, () => num("sound.mix.boot"), (v) => set("sound.mix.boot", v), { zeroIsOff: true }),
    toggle("sound.typing", "Keyboard sounds"),
    { section: "NOTIFICATIONS", label: "", value: () => "" },
    // how reminders, timers and modules call you: one box each (Deck.alert)
    toggle("notifications.screen", "Banners"),
    toggle("notifications.sound", "Sound"),
    toggle("notifications.system", "Notification Center"),
    { ...toggle("notifications.systemOnlyAway", "Only in background"), hidden: () => !s.data.notifications.system },
    toggle("notifications.voice", "Read aloud"),
    { label: "Test", kind: "action", value: () => "test", cmd: () => "alert test", change: () => d.alert(t("Test"), t("this is how you'll be called")) },
    { section: "VOICE", label: "", value: () => "" },
    toggle("voice.enabled", "Voice"),
    toggle("voice.readAI", "Read AI answers"),
    toggle("voice.subtitles", "Subtitles"),
    toggle("voice.greet", "Greeting"),
    // say aloud: one switch per kind of thing (Deck.speak)
    { label: "Say aloud", kind: "head", value: () => "" },
    toggle("voice.speak.errors", "Errors"),
    toggle("voice.speak.reminders", "Reminders"),
    toggle("voice.speak.timers", "Timers"),
    toggle("voice.speak.calendar", "Events"),
    toggle("voice.speak.weather", "Weather"),
    toggle("voice.speak.time", "Time"),
    toggle("voice.speak.system", "System alerts"),
    toggle("voice.speak.modules", "Modules"),
    slide("voice.robot", "Robot effect", 0, 100, () => num("voice.robot"), (v) => set("voice.robot", v), { zeroIsOff: true }),
    slide("voice.rate", "Speed", 50, 200, () => Math.round(num("voice.rate") * 100), (v) => set("voice.rate", v / 100), { show: (v) => `×${(v / 100).toFixed(2).replace(/0$/, "")}` }),
    slide("voice.volume", "Volume", 0, 100, () => num("voice.volume"), (v) => set("voice.volume", v), { zeroIsOff: true }),
    cycle("voice.language", "Language", ["en", "fr", "ja"], undefined, (v) => (v === "fr" ? "Français" : v === "ja" ? "日本語" : "English")),
    cycle("voice.engine", "Engine", ["auto", "piper", "system"], undefined, (v) => String(v)),
    {
      label: "Natural voice",
      value: () => (s.data.voice.language === "ja" ? "system voice" : neural.v === null ? "…" : neural.v ? "installed" : "download"),
      cmd: () => `voice install ${s.data.voice.language === "en" ? "en" : s.data.voice.language}`,
      change: () => {
        if (s.data.voice.language === "ja") return d.notify("Japanese uses the system voice", "info");
        if (neural.v) return void d.act("voice test");
        // the download shows its progress in the shell
        d.workspace.showShellTab("ibsh");
        d.notify("downloading the natural voice — the shell shows the progress", "info");
        void d.act(`voice install ${s.data.voice.language}`).then(() => checkNeural(deck));
      },
    },
    { label: "Test", value: () => "test", cmd: () => "voice test", change: () => void d.act("voice test") },
    { section: "PRIVACY", label: "", value: () => "" },
    toggle("privacy.stealth", "Stealth mode"),
    { section: "SHELL", label: "", value: () => "" },
    cycle("shell.mode", "Shell", ["system", "ibsh"], undefined, (v) => (v === "system" ? "my terminal + ICEBREAKER" : "ibsh only")),
    cycle("shell.prompt", "Prompt", ["icebreaker", "mine"], undefined, (v) => (v === "mine" ? "mine (my own theme)" : "ICEBREAKER's")),
    { section: "UPLINK (AI)", label: "", value: () => "" },
    cycle("ai.provider", "Provider", ["claude-code", "anthropic", "ollama"], undefined, (v) => (v === "claude-code" ? "claude code (subscription)" : v === "anthropic" ? "anthropic api (tokens)" : "ollama (local)")),
    text("ai.claudeCodeModel", "Model (Claude Code)", undefined, "sonnet, opus… (empty = default)"),
    toggle("ai.allowWrites", "Allow writing notes"),
    text("ai.model", "Model (API)", undefined, "claude-opus-5-5"),
    cycle("ai.effort", "Effort", ["low", "medium", "high", "xhigh", "max"]),
    {
      label: "API key",
      value: () => (s.secrets.anthropicApiKey ? `sk-…${s.secrets.anthropicApiKey.slice(-4)}` : d.ai.envKey ? "from env" : "not set"),
      change: () => void d.shell.runLine("config key"),
    },
    text("ai.ollamaHost", "Ollama host", undefined, "http://localhost:11434"),
    text("ai.ollamaModel", "Ollama model", undefined, "llama3.1"),
    toggle("ai.saveChats", "Save chats"),
    { section: "KEYS", label: "", value: () => "" },
    ...keyRows(deck, toggle),
    { section: "OVERVIEW", label: "", value: () => "" },
    { label: "Active modules", value: () => `${d.plugins.active().length} / ${d.plugins.list().length}`, cmd: () => "modules", change: () => void d.openApp("modules") },
    { label: "Store", value: () => "open", cmd: () => "store", change: () => void d.act("store") },
    { label: "Module APIs", value: () => String(d.services.list().length), cmd: () => "modules api", change: () => void d.act("modules api") },
    { section: "VAULT", label: "", value: () => "" },
    text("journal.folder", "Journal folder"),
    toggle("editor.autosave", "Autosave"),
    toggle("editor.treeWheel", "Preview on scroll"),
    {
      label: "Vault folder",
      value: () => d.vault.root,
      change: async () => {
        const p = await d.prompt("Mount another folder as vault (absolute path)", { initial: d.vault.root });
        if (p) await d.mountVault(p);
      },
    },
    // ── each module's own settings (only the modules that are on) ──
    ...moduleRows(deck, text),
    { section: "DANGER ZONE", label: "", value: () => "" },
    { label: "Self-destruct", value: () => "☢", cmd: () => "self-destruct", change: () => void d.act("self-destruct") },
  ];
}

/**
 * KEYS: every shortcut, by category, each one editable right here — its keys
 * (click / enter / F2: press the new ones), its key on THE MENU (≡), ↺
 * back to the default; yours first, with × to remove them.
 */
function keyRows(deck: Deck, toggle: (k: string, l: string) => Row): Row[] {
  const d = deck;
  const s = d.settings;
  const over = () => s.data.keyOverrides ?? {};
  const lead = () => s.data.menu?.keys ?? {};
  const rows: Row[] = [
    toggle("menu.doubleShift", "Double Shift opens THE MENU"),
    { kind: "action", label: "New shortcut", value: () => "add", cmd: () => "bind --pick", change: () => d.workspace.push(new KeyCapture(d, t("A new shortcut"), [])) },
    { kind: "action", label: "All shortcuts", value: () => "open", cmd: () => "shortcuts", change: () => void d.openApp("shortcuts") },
    { head: true, label: "Yours", value: () => "" },
  ];
  const mine = Object.entries(s.data.keys ?? {});
  if (!mine.length) rows.push({ kind: "info", label: "None yet", value: () => "" });
  for (const [combo, cmd] of mine) {
    rows.push({
      label: cmd,
      value: () => displayKeys(combo),
      cmd: () => `bind ${q(combo)} ${q(cmd)}`,
      // enter on the line: change what it runs
      change: async () => {
        const v = await d.prompt(t("Run what? (a shell command)"), { initial: cmd });
        if (v?.trim()) void d.act(`bind ${q(combo)} ${q(v.trim())}`);
      },
      keys: {
        combo: () => combo,
        editCombo: () =>
          d.workspace.push(new KeyCapture(d, t("New keys for: {what}", { what: cmd }), [], (k) => void d.act(`unbind ${q(combo)}`).then(() => d.act(`bind ${q(k)} ${q(cmd)}`)))),
        remove: () => void d.act(`unbind ${q(combo)}`),
      },
    });
  }
  for (const cat of SHORTCUT_CATEGORIES) {
    if (cat === "yours") continue;
    rows.push({ head: true, label: cat, value: () => "" });
    for (const sc of SHORTCUTS.filter((x) => x.cat === cat)) {
      const id = sc.id;
      if (!id) {
        // fixed: shown so the page is complete, nothing to change
        rows.push({ label: sc.what, value: () => displayKeys(sc.keys), keys: { combo: () => sc.keys } });
        continue;
      }
      rows.push({
        label: sc.short ?? sc.what,
        value: () => displayKeys(keysOf(sc, over())),
        cmd: () => `keys set ${id} ${keysOf(sc, over()).split(" · ")[0] || "…"}`,
        isDefault: () => !(id in over()) && !(id in lead()),
        reset: () => void d.act(`keys reset ${id}`),
        keys: {
          combo: () => keysOf(sc, over()),
          menuKey: () => menuKeyOf(sc, lead()),
          editCombo: () => rebind(d, sc),
          editMenuKey: () => rebindMenuKey(d, sc),
        },
      });
    }
  }
  return rows;
}

/** A section per module: the built-in ones here, the others from ib.settings.register. */
/** the built-in modules' sections (WEATHER, NEWS, FOCUS, CLOCKS) */
function moduleRows(deck: Deck, text: (k: string, l: string, sec?: string, ph?: string, sug?: () => string[]) => Row): Row[] {
  const d = deck;
  const on = (id: string) => d.plugins.list().some((p) => p.manifest.id === id && p.active);
  const out: Row[] = [];
  const head = (name: string) => out.push({ section: `◇ ${name}`, label: "", value: () => "" });
  if (on("weather")) {
    head("WEATHER");
    out.push(text("home.weatherCity", "Weather city", undefined, "Lausanne", () => [...((d.settings.data.home.weatherPlaces ?? []) as { name: string }[]).map((p) => p.name), "Lausanne", "Genève", "Zürich", "Paris", "London", "New York", "Tokyo", "Oslo", "Berlin", "Montréal"]));
    out.push({ label: "Saved places", value: () => String((d.settings.data.home.weatherPlaces ?? []).length), cmd: () => "weather places", change: () => void d.act("weather open") });
  }
  if (on("news")) {
    head("NEWS");
    out.push(text("home.newsTopic", "News topic", undefined, "space, F1…"));
    out.push({ label: "News interests", value: () => (d.settings.data.home.newsInterests ?? []).join(", ") || "—", cmd: () => "news interests", change: () => void d.act("news interests") });
  }
  if (on("focus")) {
    head("FOCUS");
    out.push({ label: "Focus / break", steps: true, value: () => `${focus.work} / ${focus.rest}`, cmd: () => "focus set 25 5", change: (dir) => {
      const p: [number, number][] = [[25, 5], [50, 10], [90, 20]];
      const i = p.findIndex(([w]) => w === focus.work);
      const [w, b] = p[(i + dir + p.length) % p.length];
      void d.act(`focus set ${w} ${b}`);
    } });
  }
  if (on("clocks")) {
    head("CLOCKS");
    out.push({ label: "World clocks", value: () => d.settings.data.home.worldClocks.map((z) => z.split("/").pop()).join(", "), cmd: () => "worldclock", change: () => void d.act("launch clocks") });
  }
  return out;
}

/**
 * One module's own section (what it gave ib.settings.register): the plugin
 * host registers it in deck.prefs under the module's id while the module is on.
 */
export function moduleSettingRows(deck: Deck, id: string): Row[] {
  const d = deck;
  const rows = d.moduleSettings.get(id) ?? [];
  if (!rows.length || !d.plugins.list().some((p) => p.manifest.id === id && p.active)) return [];
  const out: Row[] = [{ section: `◇ ${d.plugins.list().find((p) => p.manifest.id === id)?.manifest.name ?? id.toUpperCase()}`, label: "", value: () => "" }];
  for (const ms of rows) {
    const k = `plugin.${id}.${ms.key}`;
    if (ms.type === "action") {
      const cmdOf = () => (typeof ms.cmd === "function" ? ms.cmd() : ms.cmd ?? "");
      out.push({
        key: k,
        kind: "action",
        label: ms.label,
        value: () => ms.value?.() ?? "open",
        cmd: cmdOf,
        change: async () => {
          if (ms.run) await ms.run();
          else if (cmdOf()) await d.act(cmdOf());
        },
      });
      if (ms.help) SETTINGS_HELP[k] = [ms.help, ms.help];
      continue;
    }
    out.push({
      key: k,
      label: ms.label,
      kind: ms.type === "toggle" ? "toggle" : ms.type === "choice" ? "choice" : "text",
      isText: ms.type === "text",
      steps: ms.type === "choice",
      value: () => {
        const v = d.moduleSettingValue(id, ms.key);
        return ms.type === "toggle" ? (v ? "on" : "off") : String(v ?? "—");
      },
      cmd: () => `modules set ${id} ${ms.key} ${q(String(d.moduleSettingValue(id, ms.key) ?? ""))}`,
      change: async (dir) => {
        const v = d.moduleSettingValue(id, ms.key);
        if (ms.type === "toggle") return void d.setModuleSetting(id, ms.key, !v);
        if (ms.type === "choice" && ms.options?.length) {
          const i = ms.options.indexOf(String(v));
          return void d.setModuleSetting(id, ms.key, ms.options[(i + dir + ms.options.length) % ms.options.length]);
        }
        const nv = await d.prompt(ms.label, { initial: String(v ?? "") });
        if (nv !== null) d.setModuleSetting(id, ms.key, ms.type === "number" ? Number(nv) : nv);
      },
    });
    if (ms.help) SETTINGS_HELP[k] = [ms.help, ms.help];
  }
  return out;
}

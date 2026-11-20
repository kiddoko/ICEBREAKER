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
import { heldStep } from "../ui/slider";
import { fxMax, getFx, setFx, type FxLevel } from "../core/fxlevels";
import type { Deck } from "../deck";
import type { SettingRow as Row } from "../core/prefs";
import type { VaultCryptStatus } from "../platform/types";
import { pickFolder } from "../workspace/filebrowser";
import { ollamaModels } from "../ai/ollama";
import { commandNames } from "../core/suggest";

/** what the model fields offer (▾, Tab); anything else can still be typed */
const CLAUDE_CODE_MODELS = ["opus", "sonnet", "haiku", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2"];
const CLAUDE_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2"];
const OLLAMA_COMMON = ["llama3.1", "llama3.2", "qwen2.5", "mistral", "gemma2", "phi3"];


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

/** the vault's encryption, for the PRIVACY rows (asked again every few seconds) */
const crypt: { v: VaultCryptStatus | null; at: number } = { v: null, at: -1e9 };
function cryptState(deck: Deck): VaultCryptStatus | null {
  if (performance.now() - crypt.at > 3000) {
    crypt.at = performance.now();
    void deck.platform.vault.crypt?.status().then((st) => {
      crypt.v = st;
      deck.requestFrame();
    }).catch(() => {});
  }
  return crypt.v;
}

/** An interactive command (it asks for your password…) run in the ibsh tab, the keys going there. */
function runAsking(deck: Deck, line: string): void {
  crypt.at = -1e9;
  void deck.act(line).finally(() => (crypt.at = -1e9));
  deck.workspace.focusShell();
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
  /**
   * Every number with a range is a slider, and they all follow the same rules (ui/slider.ts):
   * ←→ step by `step` (1 by default), faster when held; 0 reads "off" when it means off,
   * the unit shows when it isn't a percentage.
   */
  const slide = (key: string, label: string, min: number, max: number, get: () => number, put: (v: number) => void, extra: { zeroIsOff?: boolean; show?: (v: number) => string; cmd?: (v: number) => string; step?: number } = {}): Row => ({
    key,
    label,
    kind: "slider",
    cmd: () => (extra.cmd ? extra.cmd(get()) : `config set ${key} ${get()}`),
    value: () => (extra.show ? extra.show(get()) : extra.zeroIsOff && get() === 0 ? t("off") : `${get()}%`),
    // ←→ one at a time, faster when held (ui/slider.ts heldStep): never more than one step at once
    change: (dir) =>
      heldStep(key, dir < 0 ? -1 : 1, (d) => {
        const v = Math.max(min, Math.min(max, get() + d * (extra.step ?? 1)));
        if (v !== get()) put(v);
      }),
    slider: { min, max, get, set: put, zeroIsOff: extra.zeroIsOff, show: extra.show, step: extra.step },
  });
  const fxSlide = (e: FxLevel, label: string, show?: (v: number) => string) =>
    slide(`fx.levels.${e}`, label, 0, fxMax(e), () => getFx(d, e), (v) => void setFx(d, e, v), { zeroIsOff: e !== "sharpness", show, cmd: (v) => `fx ${e} ${v}` });
  const num = (key: string) => Number(s.get(key) ?? 0);
  /** a small heading inside a category: what follows belongs together (one look in settings.ts) */
  const head = (label: string): Row => ({ label, head: true, kind: "head", value: () => "" });
  /** a row that only means something when `ok()`: greyed (and still) otherwise — never a sentence saying why */
  const needs = (ok: () => boolean, row: Row): Row => ({ ...row, disabled: () => !ok() || (row.disabled?.() ?? false) });
  const soundOn = () => s.data.sound.enabled !== false;
  const voiceOn = () => s.data.voice.enabled !== false;
  const provider = (p: string) => () => s.data.ai.provider === p;
  // suggestions: the ▾ list and Tab completion of the prompt (can be fetched: Ollama's models)
  const text = (key: string, label: string, section?: string, placeholder = "", suggestions?: () => string[] | Promise<string[]>): Row => ({
    section,
    key,
    kind: "text",
    isText: true,
    label,
    cmd: () => `config set ${key} ${q(String(s.get(key) ?? ""))}`,
    value: () => String(s.get(key) || "—"),
    change: async () => {
      const v = await d.prompt(t(label), { initial: String(s.get(key) ?? ""), placeholder, suggestions: await suggestions?.() });
      if (v !== null) set(key, v);
    },
  });

  return [
    { section: "YOU", label: "", value: () => "" },
    head("Profile"),
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
    head("Account"),
    { label: "Account", kind: "action", value: () => d.account ?? "—", cmd: () => "account passwd", change: () => void d.shell.runLine("account passwd").then(() => d.workspace.focusShell()) },
    { label: "Log out", kind: "action", value: () => "⏻", cmd: () => "logout", change: () => d.lockNow() },
    { section: "APPEARANCE", label: "", value: () => "" },
    head("Screen"),
    cycle("appearance.theme", "Theme", d.themes.list().map((t) => t.name)),
    slide("appearance.scale", "Zoom", 50, 200, () => num("appearance.scale"), (v) => set("appearance.scale", v)),
    slide("appearance.fontSize", "Font size", 10, 20, () => num("appearance.fontSize"), (v) => set("appearance.fontSize", v), { step: 1, show: (v) => `${v}px` }),
    cycle("appearance.fontWeight", "Font weight", ["thin", "light", "regular"]),
    toggle("appearance.startFullscreen", "Start in full screen"),
    slide("appearance.brightness", "Brightness", 50, 150, () => num("appearance.brightness") || 100, (v) => set("appearance.brightness", v)),
    head("Motion"),
    // the pace of frames: vsync (the screen's rate) or your own cap, greyed while vsync is on
    toggle("appearance.vsync", "V-Sync"),
    (() => {
      const row = slide("appearance.maxFps", "Frame rate", 0, 240, () => num("appearance.maxFps"), (v) => set("appearance.maxFps", v), { show: (v) => (v === 0 ? t("still") : `${v}fps`) });
      const vsync = () => s.data.appearance.vsync !== false;
      return needs(() => !vsync(), row);
    })(),
    toggle("appearance.reduceMotion", "Reduce motion"),
    head("Text"),
    toggle("appearance.fadeIn", "Smooth text"),
    slide("appearance.textSpeed", "Text speed", 0, 100, () => num("appearance.textSpeed"), (v) => set("appearance.textSpeed", v), { show: (v) => (v >= 100 ? t("instant") : `${v}%`) }),
    toggle("appearance.lineNumbers", "Line numbers"),
    head("Performance"),
    toggle("appearance.showFps", "Show FPS"),
    toggle("appearance.backgroundSlow", "Save energy in background"),

    // (the effects are part of APPEARANCE)
    head("Effects"),
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
    head("Screensaver and start"),
    slide("fx.screensaverMinutes", "Screensaver", 0, 60, () => num("fx.screensaverMinutes"), (v) => set("fx.screensaverMinutes", v), { zeroIsOff: true, show: (v) => (v ? `${v} min` : t("never")) }),
    cycle("boot.mode", "Boot animation", ["full", "fast", "off"]),
    { section: "SOUND", label: "", value: () => "" },
    head("Sound"),
    // ui sounds: one slider, 0 = off
    slide("sound.volume", "Volume", 0, 100, () => (s.data.sound.enabled ? num("sound.volume") : 0), (v) => {
      set("sound.enabled", v > 0);
      if (v > 0) set("sound.volume", v);
    }, { zeroIsOff: true }),
    needs(soundOn, {
      label: "Sound pack",
      steps: true,
      value: () => `${d.soundPack()}${d.soundPack() === d.theme.sound.pack ? ` ${t("(default)")}` : ""}`,
      cmd: () => `sound pack ${d.soundPack()}`,
      change: (dir) => {
        const packs = [...Object.keys(SOUND_PACKS), ...d.soundFolderPacks];
        d.setSoundPack(packs[(packs.indexOf(d.soundPack()) + dir + packs.length) % packs.length]);
        d.sound.play("tick");
      },
    }),
    // the mixer: one fader per kind of sound, under the main volume above (core/sound.ts SOUND_CHANNELS)
    head("Mixer"),
    needs(soundOn, slide("sound.mix.ui", "Interface", 0, 100, () => num("sound.mix.ui"), (v) => set("sound.mix.ui", v), { zeroIsOff: true })),
    needs(soundOn, slide("sound.mix.alerts", "Notifications", 0, 100, () => num("sound.mix.alerts"), (v) => set("sound.mix.alerts", v), { zeroIsOff: true })),
    needs(soundOn, slide("sound.mix.text", "Text", 0, 100, () => num("sound.mix.text"), (v) => set("sound.mix.text", v), { zeroIsOff: true })),
    needs(soundOn, slide("sound.mix.typing", "Keyboard", 0, 100, () => num("sound.mix.typing"), (v) => set("sound.mix.typing", v), { zeroIsOff: true })),
    needs(soundOn, slide("sound.mix.boot", "Startup", 0, 100, () => num("sound.mix.boot"), (v) => set("sound.mix.boot", v), { zeroIsOff: true })),
    needs(soundOn, slide("sound.mix.modules", "Modules", 0, 100, () => num("sound.mix.modules"), (v) => set("sound.mix.modules", v), { zeroIsOff: true })),
    needs(soundOn, toggle("sound.typing", "Keyboard sounds")),
    { section: "NOTIFICATIONS", label: "", value: () => "" },
    // how reminders, timers and modules call you: one box each (Deck.alert)
    head("How you're called"),
    toggle("notifications.screen", "Banners"),
    toggle("notifications.sound", "Sound"),
    toggle("notifications.system", "Notification Center"),
    needs(() => !!s.data.notifications.system, toggle("notifications.systemOnlyAway", "Only in background")),
    toggle("notifications.voice", "Read aloud"),
    head("Try it"),
    { label: "Test", kind: "action", value: () => "test", cmd: () => "alert test", change: () => d.alert(t("Test"), t("this is how you'll be called")) },
    { section: "VOICE", label: "", value: () => "" },
    head("Voice"),
    toggle("voice.enabled", "Voice"),
    needs(voiceOn, toggle("voice.readAI", "Read AI answers")),
    needs(voiceOn, toggle("voice.subtitles", "Subtitles")),
    needs(voiceOn, toggle("voice.greet", "Greeting")),
    // say aloud: one switch per kind of thing (Deck.speak)
    head("Say aloud"),
    needs(voiceOn, toggle("voice.speak.errors", "Errors")),
    needs(voiceOn, toggle("voice.speak.reminders", "Reminders")),
    needs(voiceOn, toggle("voice.speak.timers", "Timers")),
    needs(voiceOn, toggle("voice.speak.calendar", "Events")),
    needs(voiceOn, toggle("voice.speak.weather", "Weather")),
    needs(voiceOn, toggle("voice.speak.time", "Time")),
    needs(voiceOn, toggle("voice.speak.system", "System alerts")),
    needs(voiceOn, toggle("voice.speak.modules", "Modules")),
    head("How it sounds"),
    needs(voiceOn, slide("voice.robot", "Robot effect", 0, 100, () => num("voice.robot"), (v) => set("voice.robot", v), { zeroIsOff: true })),
    needs(voiceOn, slide("voice.rate", "Speed", 50, 200, () => Math.round(num("voice.rate") * 100), (v) => set("voice.rate", v / 100), { show: (v) => `×${(v / 100).toFixed(2).replace(/0$/, "")}` })),
    needs(voiceOn, slide("voice.volume", "Volume", 0, 100, () => num("voice.volume"), (v) => set("voice.volume", v), { zeroIsOff: true })),
    needs(voiceOn, cycle("voice.language", "Language", ["en", "fr", "ja"], undefined, (v) => (v === "fr" ? "Français" : v === "ja" ? "日本語" : "English"))),
    needs(voiceOn, cycle("voice.engine", "Engine", ["auto", "piper", "system"], undefined, (v) => String(v))),
    needs(voiceOn, {
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
    }),
    needs(voiceOn, { label: "Test", value: () => "test", cmd: () => "voice test", change: () => void d.act("voice test") }),
    { section: "PRIVACY", label: "", value: () => "" },
    head("Network"),
    toggle("privacy.stealth", "Stealth mode"),
    // the vault encrypted or plain: back and forth as often as you like (each way checks every file)
    ...(d.platform.vault.crypt
      ? ([
          head("Vault encryption"),
          {
            label: "Vault encryption",
            kind: "action",
            value: () => {
              const st = cryptState(d);
              return !st ? "…" : st.busy ? "working…" : st.encrypted ? (st.unlocked ? "on" : "on · locked") : "off";
            },
            cmd: () => (cryptState(d)?.encrypted ? "vault decrypt --window" : "vault encrypt --window"),
            change: () => runAsking(d, cryptState(d)?.encrypted ? "vault decrypt --window" : "vault encrypt --window"),
          },
          {
            label: "Recovery key",
            kind: "action",
            value: () => {
              const st = cryptState(d);
              return !st?.encrypted || st.recovery ? "make a new one" : "none: make one";
            },
            cmd: () => "vault recovery --window",
            change: () => void runAsking(d, "vault recovery --window"),
            disabled: () => !cryptState(d)?.encrypted,
          },
          {
            label: "Vault key",
            kind: "action",
            value: () => "change it",
            cmd: () => "vault rekey --window",
            change: () => void runAsking(d, "vault rekey --window"),
            disabled: () => !cryptState(d)?.encrypted,
          },
        ] as Row[])
      : []),
    { section: "SHELL", label: "", value: () => "" },
    // the TERMINAL module (core-packages.ts) off: no panel, these mean nothing
    needs(() => d.workspace.terminalOn, cycle("shell.mode", "Shell", ["system", "ibsh"], undefined, (v) => (v === "system" ? "my terminal + ICEBREAKER" : "ibsh only"))),
    needs(() => d.workspace.terminalOn, cycle("shell.prompt", "Prompt", ["icebreaker", "mine"], undefined, (v) => (v === "mine" ? "mine (my own theme)" : "ICEBREAKER's"))),
    { section: "UPLINK (AI)", label: "", value: () => "" },
    head("Provider"),
    cycle("ai.provider", "Provider", ["claude-code", "anthropic", "ollama"], undefined, (v) => (v === "claude-code" ? "claude code (subscription)" : v === "anthropic" ? "anthropic api (tokens)" : "ollama (local)")),
    needs(provider("claude-code"), text("ai.claudeCodeModel", "Model (Claude Code)", undefined, "sonnet, opus… (empty = default)", () => CLAUDE_CODE_MODELS)),
    needs(provider("anthropic"), text("ai.model", "Model (API)", undefined, "claude-opus-5-5", () => CLAUDE_MODELS)),
    needs(provider("anthropic"), cycle("ai.effort", "Effort", ["low", "medium", "high", "xhigh", "max"])),
    needs(provider("anthropic"), {
      label: "API key",
      value: () => (s.secrets.anthropicApiKey ? `sk-…${s.secrets.anthropicApiKey.slice(-4)}` : d.ai.envKey ? "from env" : "not set"),
      change: () => void d.shell.runLine("config key"),
    }),
    head("Local (Ollama)"),
    needs(provider("ollama"), text("ai.ollamaHost", "Ollama host", undefined, "http://localhost:11434", () => ["http://localhost:11434", "http://127.0.0.1:11434"])),
    text("ai.ollamaModel", "Ollama model", undefined, "llama3.1", async () => {
      const pulled = await ollamaModels(String(s.get("ai.ollamaHost") ?? ""));
      return [...pulled, ...OLLAMA_COMMON.filter((m) => !pulled.includes(m))];
    }),
    head("Your notes and chats"),
    toggle("ai.allowWrites", "Allow writing notes"),
    toggle("ai.saveChats", "Save chats"),
    { section: "KEYS", label: "", value: () => "" },
    ...keyRows(deck, toggle),
    { section: "OVERVIEW", label: "", value: () => "" },
    { label: "Active modules", value: () => `${d.plugins.active().length} / ${d.plugins.list().length}`, cmd: () => "modules", change: () => void d.openApp("modules") },
    { label: "Store", value: () => "open", cmd: () => "store", change: () => void d.act("store") },
    { label: "Module APIs", value: () => String(d.services.list().length), cmd: () => "modules api", change: () => void d.act("modules api") },
    { section: "VAULT", label: "", value: () => "" },
    head("Notes"),
    text("journal.folder", "Journal folder", undefined, "journal", () => d.vault.entries.filter((e) => e.isDir && !e.path.startsWith(".")).map((e) => e.path)),
    toggle("editor.autosave", "Autosave"),
    toggle("editor.treeWheel", "Preview on scroll"),
    head("Where it is"),
    {
      label: "Vault folder",
      kind: "action",
      value: () => d.vault.root,
      cmd: () => "vault mount <folder>",
      change: async () => {
        // another folder as the vault (it stays where it is): chosen, not typed
        const p = await pickFolder(d, t("USE ANOTHER FOLDER AS THE VAULT"), d.vault.root);
        if (p) await d.mountVault(p);
      },
    },
    ...(d.platform.vault.move
      ? ([{ label: "Move vault", kind: "action", value: () => t("elsewhere…"), cmd: () => "vault move --window", change: () => runAsking(d, "vault move --window") }] as Row[])
      : []),
    // ── each module's own settings (only the modules that are on) ──
    ...moduleRows(deck, text),
    // ICEBREAKER's and the modules' updates (core/updater.ts)
    { section: "UPDATES", label: "", value: () => "" },
    head("Now"),
    {
      label: "ICEBREAKER",
      kind: "info",
      value: () => {
        const u = d.updater;
        if (u.progress) return `${t("downloading")} ${u.progress.total ? Math.round((u.progress.done / u.progress.total) * 100) : "…"}%`;
        if (u.busy) return t("looking…");
        if (u.app) return `${u.version} → ${u.app.version}${u.app.downloaded ? ` · ${t("ready")}` : ""}`;
        return u.checkedAt ? `${u.version} · ${t(u.appError ? "couldn't check" : "up to date")}` : u.version;
      },
    },
    {
      label: "Modules",
      kind: "info",
      value: () => (d.updater.modules.length ? d.updater.modules.map((m) => `${m.id} ${m.latest}`).join(", ") : d.updater.checkedAt ? t("up to date") : "—"),
    },
    needs(() => !s.data.privacy.stealth, { label: "Look now", kind: "action", value: () => t("check"), cmd: () => "update", change: () => void d.act("update") }),
    needs(() => d.updater.pending(), { label: "Install", kind: "action", value: () => t("install now"), cmd: () => "update install --window", change: () => void d.act("update install --window") }),
    head("By itself"),
    needs(() => !s.data.privacy.stealth, cycle("updates.check", "Look for updates", ["daily", "start", "never"], undefined, (v) => (v === "daily" ? "every day" : v === "start" ? "at start" : "never"))),
    needs(() => !s.data.privacy.stealth && s.data.updates.check !== "never", toggle("updates.download", "Download by itself")),
    needs(() => !s.data.privacy.stealth && s.data.updates.check !== "never", cycle("updates.install", "Install", ["ask", "auto"], undefined, (v) => (v === "ask" ? "ask me first" : "by itself (ICEBREAKER: when I quit)"))),
    head("Where from"),
    text("updates.endpoint", "Releases", undefined, "empty = the official ones"),
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
        const v = await d.prompt(t("Run what? (a shell command)"), { initial: cmd, suggestions: commandNames(d) });
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
    out.push(text("home.newsTopic", "News topic", undefined, "space, F1…", () => ["tech", "science", "ai", "space", "world", "economy", "nature", "health", "culture", "sports", "games", "F1"]));
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

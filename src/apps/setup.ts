import { heldStep, slider } from "../ui/slider";
import { Field } from "../ui/field";
import { mix } from "../core/color";
import { LANGS, setLang, t } from "../core/i18n";
import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import { geocode, type Place } from "../core/location";
import type { Deck } from "../deck";
import { decrypt } from "../fx/glitch";
import { typed } from "../ui/typewriter";
import { q, type UI } from "../ui/ui";
import { easeOut, strWidth, truncate, wrapWords } from "../core/unicode";
import { applyFxPreset, FX_PRESET_NAMES, FX_PRESETS } from "../workspace/fxpanel";
import type { App, AppSpec } from "./types";
import { GAP, INSET } from "../ui/layout";
import { completeFolder, osOf, pathExamples, vaultPathProblem } from "./setuppath";
import { IS_MAC } from "../core/input";
import { pickFolder } from "../workspace/filebrowser";

/** this system's examples: its shells, a vault folder's path */
const HERE = pathExamples(osOf(navigator.platform, navigator.userAgent));

interface Option { value: string; label: string; hint?: string }
interface Step {
  id: string;
  title: string;
  question: string;
  /** Text steps take typed input; choice steps a pick from `options`; slider steps a number. */
  text?: { placeholder: string; mask?: boolean };
  slider?: { min: number; max: number; start: number };
  options?: () => Option[];
  skip?: () => boolean;
}

/** The questions come in chapters (the bar at the top): the step ids of each. */
const CHAPTERS: { name: string; steps: string[] }[] = [
  { name: "SIGNAL", steps: ["language", "warning", "intro", "mode"] },
  { name: "IDENTITY", steps: ["handle", "gender", "gender-other"] },
  { name: "SYSTEM", steps: ["terminal", "vault", "vault-path", "encrypt"] },
  { name: "WORLD", steps: ["locale", "precision", "place", "ai", "calendar"] },
  { name: "LOOK", steps: ["voice", "theme", "fx", "sound", "notifications"] },
  { name: "READY", steps: ["done"] },
];
const chapterOf = (id: string) => Math.max(0, CHAPTERS.findIndex((c) => c.steps.includes(id)));

/** 0→1 that starts fast and lands softly */

/**
 * First-run questionnaire: who you are, where you are (as precisely as you
 * like), which AI, which HOME, how much eye candy. Everything can be changed
 * later in Settings; run it again with ⌘K → "Setup".
 *
 * On a wide screen, the left column is the deck writing down your answers as
 * you go (click one to go back to it); the right one is the question. Fast:
 * 1-9 picks, tab skips a question, ctrl+enter finishes with the defaults.
 *
 * It runs the first time an account logs in (each account has its own
 * settings and vault), and again from ⌘K → "Setup".
 */
export class SetupApp implements App {
  readonly kind = "setup";
  readonly key = "setup";
  private step = 0;
  private sel = 0;
  /** the READ THIS FIRST screen was read (nothing skips it) */
  private warned = false;
  /** the typed answers (ui/field.ts): one plain, one for a secret */
  private readonly plain = new Field({ icon: "❯", onChange: () => (this.error = "") });
  private readonly secret = new Field({ icon: "❯", mask: true, onChange: () => (this.error = "") });
  private get field(): Field {
    return this.cur.text?.mask ? this.secret : this.plain;
  }
  private get input(): string {
    return this.field.text;
  }
  private stepAt = 0;
  private busy = false;
  private error = "";
  private places: Place[] = [];
  /** digits typed for an option number (10, 11… need two) */
  private digits = "";
  private digitsAt = 0;
  /** the last blip of the sound slider (not one per step: it would buzz) */
  private blipAt = 0;
  private a: Record<string, string> = {};
  private readonly steps: Step[];

  constructor(private readonly deck: Deck) {
    const s = deck.settings.data;
    this.firstRun = !s.setup.done;
    // a new account: what the deck calls you starts as its name
    const handle = s.user.handle === "netrunner" && deck.account ? deck.account : s.user.handle;
    // the deck's language is the first answer already (run again on a French deck, "English" was
    // chosen and enter switched the deck to English)
    this.a = { handle, language: s.user.language, locale: s.user.locale, precision: s.user.location.precision };
    // stealth already on (a setup run again, or a half-finished one): the questions start from it
    if (s.privacy.stealth) this.a.mode = "stealth";
    this.steps = [
      {
        id: "language", title: "LANGUAGE · LANGUE",
        question: "Language of the deck · Langue du deck",
        options: () => LANGS.map((l) => ({ value: l.id, label: l.name })),
      },
      // READ THIS FIRST: one screen nobody can skip (tab, ctrl+enter and the "finish" button wait for it)
      { id: "warning", title: "⚠ READ THIS FIRST", question: "TEST SOFTWARE — not ready for heavy, secure or professional use.\n\nICEBREAKER is a hobby project made by one person who isn't a developer, with an AI writing most of the code. It has never been audited.\n\n· Store nothing sensitive in it: no passwords, banking, medical, legal or confidential documents — encrypted vault or not.\n· Back up your vault often (copy its folder): a bug can lose notes.\n· No warranty, no support: you use it at your own risk.\n\nYou can help: report bugs, say how it went, share ideas, make modules and themes — github.com/kiddoko/ICEBREAKER (Issues and Discussions).", options: () => [{ value: "ok", label: "I've read it — I understand" }] },
      { id: "intro", title: "JACK IN", question: "A few questions to set up your deck. Takes a minute, every one can be skipped — and everything can be changed later.", options: () => [{ value: "go", label: "Let's go" }, { value: "skip", label: "Skip — use the defaults" }] },
      {
        id: "mode", title: "CONNECTION",
        question: "The deck offers tools — it never requires them. You can keep everything in your vault, use no account and no AI, and stay off the internet entirely.",
        options: () => [
          { value: "connected", label: "Connected", hint: "I pick each online feature (AI, weather, Google…)" },
          { value: "stealth", label: "Stealth", hint: "100 % local — no internet, only this machine and my network" },
        ],
      },
      { id: "handle", title: "HANDLE", question: "What should the deck call you?", text: { placeholder: "netrunner" } },
      {
        id: "gender", title: "PROFILE",
        question: "Your gender, if you want to say — it only lives in your settings, to address you right later. Skip it and the deck stays neutral.",
        options: () => [
          { value: "", label: "Not specified", hint: "neutral" },
          { value: "woman", label: "Woman" },
          { value: "man", label: "Man" },
          { value: "nonbinary", label: "Non-binary" },
          { value: "other", label: "Other", hint: "you can say which next" },
        ],
      },
      { id: "gender-other", title: "PROFILE", question: "Your word for it (optional, enter to skip):", text: { placeholder: "" }, skip: () => this.a.gender !== "other" },
      {
        id: "terminal", title: "TERMINAL",
        question: "The shell panel can be your real terminal ({shells}…) with ICEBREAKER's commands added — ssh, git, vim, everything works. Or ICEBREAKER's own shell, limited to the vault.",
        options: () => [
          { value: "system", label: "My terminal + ICEBREAKER commands", hint: "careful: rm deletes for real there" },
          { value: "ibsh", label: "ICEBREAKER shell only", hint: "the vault only, rm goes to .trash" },
        ],
        skip: () => !deck.platform.pty,
      },
      {
        id: "vault", title: "VAULT",
        question: "Your notes, journal and calendar live in one folder of plain files: {vault}. It can be any folder — a drive, a synced folder, or your own server mounted as a network drive, so everything stays on hardware you own.",
        options: () => [
          { value: "keep", label: "Keep this folder" },
          { value: "other", label: "Another folder", hint: t("a full path: {examples}…", { examples: HERE.examples }) },
        ],
      },
      { id: "vault-path", title: "VAULT", question: "Folder path (created if missing):", text: { placeholder: HERE.placeholder }, skip: () => this.a.vault !== "other" },
      {
        // an option, never the default: plain files stay readable by everything
        id: "encrypt", title: "ENCRYPTION",
        question: "Encrypt the vault? Encrypted, the folder holds only noise: your password opens it, here or on another computer (a USB key works), and 24 words written on paper get you back in if you forget it. Plain, any app (Obsidian, git, your terminal) reads your notes. You can switch either way later, as often as you like (Settings → PRIVACY).",
        options: () => [
          { value: "plain", label: "Plain files", hint: "readable by any app — the default" },
          { value: "encrypted", label: "Encrypted", hint: "have paper and a pen ready: 24 words to write down" },
        ],
        skip: () => !this.deck.platform.vault.crypt,
      },
      {
        // the deck's language was the first question: this one is only how dates are written
        id: "locale", title: "DATE FORMAT",
        question: "How should dates and times be written? (the calendar, the journal, the clock, the news) — the deck's language was the first question.",
        options: () => [
          { value: "fr-FR", label: "Français", hint: dateExample("fr-FR") },
          { value: "en-GB", label: "English (UK)", hint: dateExample("en-GB") },
          { value: "en-US", label: "English (US)", hint: dateExample("en-US") },
          { value: "", label: "Same as the system", hint: dateExample(undefined) },
        ],
      },
      {
        skip: () => this.stealth,
        id: "precision", title: "LOCATION", question: "Weather and local news need to know roughly where you are. Share only what you want — it stays on this machine.",
        options: () => [
          { value: "none", label: "Nothing", hint: "no weather, world news only" },
          { value: "country", label: "My country", hint: "national news, capital's weather" },
          { value: "city", label: "My city", hint: "local weather and news" },
          { value: "precise", label: "Exact coordinates", hint: "best weather, typed as lat, lon" },
        ],
      },
      {
        id: "place", title: "WHERE", question: "", text: { placeholder: "Paris" },
        skip: () => this.a.precision === "none" || this.stealth,
      },
      {
        id: "ai", title: "UPLINK", question: "Which AI should your uplink (LINK) and the modules use?",
        // stealth: nothing online is even offered (a local Ollama can be set up later: Settings → UPLINK)
        skip: () => this.stealth,
        options: () => [
          ...(this.stealth
            ? []
            : [
                { value: "claude-code", label: "Claude Code", hint: deck.ai.claudeCodePath ? "found — uses your Claude plan, no API tokens" : "not found — install it and run `claude` once" },
                { value: "anthropic", label: "Anthropic API key", hint: "pay per token" },
              ]),
          { value: "ollama", label: "Ollama", hint: "a local model, on this machine or a box on your network" },
          { value: "keep", label: "No AI", hint: "everything else works without it" },
        ],
      },
      {
        id: "calendar", title: "CALENDAR",
        question: "Your agenda. It can live entirely in your vault (plain Markdown, offline, no account), or also show your Google calendars.",
        options: () => [
          { value: "local", label: "In my vault only", hint: "nothing leaves this computer" },
          ...(deck.platform.google && !this.stealth ? [{ value: "google", label: "Connect Google Calendar", hint: "your browser opens Google's page" }] : []),
          { value: "later", label: "Decide later", hint: "local works; cal google connect any time" },
        ],
        skip: () => !deck.commands.get("cal"),
      },
      {
        id: "voice", title: "VOICE",
        question: "Give the deck a voice? Made on this computer, through a robot filter: clearly a machine, still smooth. Its language, its engine and what it says: Settings → VOICE.",
        options: () => [
          { value: "on", label: "Yes, a voice", hint: "it greets you; the rest in Settings → VOICE" },
          { value: "off", label: "No voice", hint: "voice on, any time" },
        ],
        skip: () => !deck.platform.voice,
      },
      {
        id: "theme", title: "LOOK",
        question: "A theme to start with: one click shows it on the whole deck, a second click (or enter) keeps it.",
        options: () =>
          deck.themes.list().map((th) => ({ value: th.name, label: th.name, hint: `${th.font.family} · ${th.description}` })),
      },
      {
        id: "fx", title: "EYE CANDY", question: "How much CRT? Each one shows on the whole deck as you move to it; enter (or a second click) keeps it. The ✦ fx button changes it any time.",
        options: () => FX_PRESET_NAMES.map((p) => ({ value: p, label: p, hint: FX_PRESETS[p].hint })),
      },
      {
        id: "sound", title: "SOUND", question: "How loud are the interface's sounds? (blips and clicks of an old OS doing its best — 0 is off)",
        slider: { min: 0, max: 100, start: 50 },
      },
      {
        id: "notifications", title: "NOTIFICATIONS", question: "Reminders and modules can call you. How?",
        options: () => [
          { value: "both", label: "Sound and on screen" },
          { value: "sound", label: "Sound only" },
          { value: "visual", label: "On screen only" },
          { value: "none", label: "Nothing at all" },
        ],
      },
      { id: "done", title: "READY", question: "Deck configured. Everything is in Settings if you change your mind.", options: () => [{ value: "go", label: "Jack in" }] },
    ];
    this.sel = Math.max(0, LANGS.findIndex((l) => l.id === s.user.language));
  }

  title(): string {
    return "setup";
  }

  /** stealth chosen (or already on): nothing online is offered, nothing goes online */
  private get stealth(): boolean {
    return this.a.mode === "stealth";
  }

  /** the account's first setup (not one run again from THE MENU, over a vault in use) */
  private readonly firstRun: boolean;

  /** the setup is over (finish ran): a second finish (a double click, ctrl+enter twice) does nothing */
  private finished = false;

  status(): string {
    // the vault's folder: tab completes the path there, ⌘O browses (it said "tab skip")
    if (this.cur.id === "vault-path") return t("type a path · tab completes · ⌘O browse · enter next · esc back");
    return t(this.cur.text ? "type · enter next · tab skip · esc back · ctrl+enter finish" : this.cur.slider ? "←→ or drag · enter next · tab skip · esc back · ctrl+enter finish" : "a number, ↑↓ or a click chooses · enter or a 2nd click keeps · tab skip · esc back");
  }

  private get cur(): Step {
    return this.steps[this.step];
  }

  private options(): Option[] {
    if (this.cur.id === "place" && this.places.length)
      return this.places.map((p, i) => ({ value: String(i), label: [p.name, p.admin, p.country].filter(Boolean).join(", ") }));
    return this.cur.options?.() ?? [];
  }

  /** The effects as they were before the EYE CANDY step tried presets on (put back if none is kept). */
  private fxBefore: string | null = null;

  /** the theme / effects preview waiting for the cursor to settle */
  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  /** how long the cursor rests on a theme or a preset before the whole deck wears it */
  private static readonly PREVIEW_MS = 140;

  /**
   * On the theme and EYE CANDY steps, the deck wears what's under the cursor — once the
   * cursor rests there: going through them fast (or back and forth between the steps)
   * changed the whole look, fonts and WebGL glass included, at every key (a crash on Linux).
   */
  private preview(): void {
    clearTimeout(this.previewTimer);
    // left EYE CANDY without keeping a preset — back to THEME too: the effects tried on go away.
    // (They stayed on the theme step, and the next theme saved them as the old theme's own:
    // a half-finished setup left "party" — WebGL curvature — on, and on Linux every login crashed.)
    if (this.cur.id !== "fx") this.fxBack();
    if (this.cur.id !== "theme" && this.cur.id !== "fx") return;
    if (this.cur.id === "fx") this.fxBefore ??= JSON.stringify(this.deck.settings.data.fx);
    const step = this.cur.id;
    this.previewTimer = setTimeout(() => {
      if (this.finished || this.cur.id !== step) return;
      const o = this.options()[this.sel];
      if (!o) return;
      if (step === "theme" && this.deck.theme.name !== o.value) this.deck.setTheme(o.value);
      if (step === "fx") applyFxPreset(this.deck, o.value);
    }, SetupApp.PREVIEW_MS);
  }

  /** Left EYE CANDY without choosing: the effects you had. */
  private fxBack(): void {
    clearTimeout(this.previewTimer);
    if (this.fxBefore === null || this.a.fx) return;
    const before = this.fxBefore;
    this.fxBefore = null;
    if (before === JSON.stringify(this.deck.settings.data.fx)) return; // nothing was tried on
    this.deck.settings.set("fx", JSON.parse(before));
    this.deck.applyFx();
  }

  /** Back to an answered question (a click in the log). */
  private jumpTo(i: number): void {
    if (i >= this.step || this.steps[i]?.skip?.()) return;
    this.step = i + 1;
    this.go(-1);
  }

  private go(dir: 1 | -1): void {
    let i = this.step + dir;
    while (this.steps[i]?.skip?.()) i += dir;
    if (i < 0 || i >= this.steps.length) return;
    this.step = i;
    this.stepAt = performance.now();
    this.error = "";
    this.places = [];
    const st = this.cur;
    this.plain.clear();
    this.secret.clear();
    const opts = this.options();
    if (st.slider) this.a[st.id] ??= String(st.id === "sound" && this.deck.settings.data.sound.enabled ? this.deck.settings.data.sound.volume : st.slider.start);
    this.sel = Math.max(0, opts.findIndex((o) => o.value === (this.a[st.id] ?? (st.id === "theme" ? this.deck.theme.name : undefined))));
    this.preview();
  }

  private async next(): Promise<void> {
    const st = this.cur;
    if (this.busy) return;
    if (st.id === "place") return this.submitPlace();
    if (st.text) {
      // the vault's folder: one that can really be used, checked now — not at the end, where a
      // path that didn't work left the vault in the default folder without a word
      if (st.id === "vault-path") return this.submitVaultPath();
      this.a[st.id] = this.input.trim() || this.placeholder(st);
      return this.go(1);
    }
    if (st.slider) return this.go(1);
    const o = this.options()[this.sel];
    if (!o) return;
    this.a[st.id] = o.value;
    if (st.id === "language") {
      setLang(o.value); // the rest of the questions in that language
      this.deck.settings.set("user.language", o.value);
      if (!this.a.locale) this.a.locale = o.value === "fr" ? "fr-FR" : "";
    }
    if (st.id === "warning") this.warned = true;
    // stealth applies the moment it's chosen: nothing goes online during the rest of the setup
    // (HOME's weather and news behind it, the update check…), not only once it's finished
    if (st.id === "mode") this.deck.settings.set("privacy.stealth", o.value === "stealth");
    if (st.id === "intro" && o.value === "skip") return this.finish(true);
    if (st.id === "done") return this.finish(false);
    this.go(1);
  }

  /** Typing replaces the suggestion; enter on empty keeps it. */
  private placeholder(st: Step): string {
    if (st.id === "handle") return this.a.handle || "netrunner";
    // a path is never translated nor lowered (it was: "/volumes/nas/…"); the suggestion is
    // where the vault is now, on this system
    if (st.id === "vault-path") return this.deck.vault.root || (st.text?.placeholder ?? "");
    return t(st.text?.placeholder ?? "");
  }

  /** The vault's folder, typed: kept (absolute, or ~/…), else said why and asked again. */
  private async submitVaultPath(): Promise<void> {
    const typed = this.input.trim();
    // enter on the grey suggestion — where the vault is now — keeps it (it said "type the full path")
    if (!typed) {
      if (!this.deck.vault.root) return void (this.error = t("type the folder's full path (or esc: keep this folder)"));
      this.a.vault = "keep";
      delete this.a["vault-path"];
      return this.go(1);
    }
    const why = vaultPathProblem(typed);
    if (why) return void (this.error = t(why));
    this.a["vault-path"] = typed;
    this.go(1);
  }

  /** Tab in the vault's folder: completes the folder name, like a terminal. */
  private async completeVaultPath(): Promise<void> {
    const files = this.deck.platform.files;
    if (!files) return;
    const typed = this.input;
    const home = typed.startsWith("~") ? await files.home().catch(() => "") : "";
    const done = await completeFolder(typed, home, (dir) => files.list(dir).catch(() => []));
    if (!done) return void this.deck.sound.play("denied");
    if (done.text !== typed) this.field.text = done.text;
    this.error = done.choices.length > 1 ? done.choices.slice(0, 8).join("  ") + (done.choices.length > 8 ? "  …" : "") : "";
    this.deck.requestFrame();
  }

  private async submitPlace(): Promise<void> {
    const loc = this.deck.settings.data.user.location;
    if (this.places.length) {
      const p = this.places[this.sel];
      this.deck.settings.set("user.location", { precision: this.a.precision, name: p.name, country: p.countryCode, lat: p.lat, lon: p.lon });
      return this.go(1);
    }
    const q = this.input.trim();
    if (!q) return void (this.error = t("type something (or esc to change precision)"));
    if (this.a.precision === "precise") {
      const m = q.match(/^(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)$/);
      if (!m) return void (this.error = t("expected: 48.85, 2.35"));
      this.deck.settings.set("user.location", { ...loc, precision: "precise", name: "", lat: Number(m[1]), lon: Number(m[2]) });
      return this.go(1);
    }
    this.busy = true;
    try {
      this.places = (await geocode(q, (this.a.locale || "en").split("-")[0])).slice(0, 5);
      this.sel = 0;
      if (!this.places.length) this.error = t("nothing found for “{q}”", { q });
    } catch {
      this.error = t("couldn't reach the geocoder (offline?)");
    } finally {
      this.busy = false;
      this.deck.requestFrame();
    }
  }

  private finish(skipped: boolean): void {
    if (this.busy || this.finished) return;
    // nothing finishes before the warning was read (ctrl+enter on the first screen, the button)
    if (!this.warned) {
      const w = this.steps.findIndex((x) => x.id === "warning");
      if (w >= 0) return void ((this.step = w), (this.sel = 0), this.deck.requestFrame());
    }
    this.finished = true;
    const set = (k: string, v: unknown) => this.deck.settings.set(k, v);
    this.fxBack();
    if (!skipped) {
      set("user.handle", this.a.handle || "netrunner");
      set("user.locale", this.a.locale ?? "");
      if (this.a.precision === "none") set("user.location", { precision: "none", name: "", country: "", lat: null, lon: null });
      if (this.a.ai && this.a.ai !== "keep") set("ai.provider", this.a.ai);
      if (this.a.fx) applyFxPreset(this.deck, this.a.fx);
      if (this.a.sound !== undefined) {
        const v = Number(this.a.sound);
        set("sound.enabled", v > 0);
        if (v > 0) set("sound.volume", v);
      }
      if (this.a.notifications) {
        const hear = this.a.notifications === "both" || this.a.notifications === "sound", see = this.a.notifications === "both" || this.a.notifications === "visual";
        set("notifications.screen", see), set("notifications.system", see), set("notifications.sound", hear), set("notifications.voice", hear);
      }
      if (this.a.terminal) set("shell.mode", this.a.terminal);
      // modules are configured through their commands, like everything else — once the vault
      // is the one they'll keep (their choice is saved in it): after the mount / the encryption
      const calendar = this.a.calendar;
      const modules = async () => {
        if (calendar === "local" || calendar === "google") await this.deck.act(`cal mode ${calendar}`);
      };
      set("user.language", this.a.language || this.deck.settings.data.user.language || "en");
      set("user.gender", this.a.gender ?? "");
      set("user.genderOther", this.a.gender === "other" ? (this.a["gender-other"] ?? "") : "");
      // the CONNECTION question answered: that (not answered — tab, ctrl+enter: stealth stays as it is)
      if (this.a.mode) void this.deck.act(`stealth ${this.stealth ? "on" : "off"}`);
      if (this.a.theme) void this.deck.act(`theme set ${this.a.theme}`);
      if (this.a.voice === "on") {
        void (async () => {
          await this.deck.act("voice on");
          await this.deck.act("voice greet on");
          await this.deck.act(`voice language ${this.a.language || "en"}`);
          await this.deck.act("voice test");
        })();
      } else if (this.a.voice === "off") void this.deck.act("voice off");
      const path = this.a.vault === "other" ? this.a["vault-path"] : "";
      const encrypt = this.a.encrypt === "encrypted";
      if (encrypt) {
        // the encryption happens here, over the setup (its dialogs: confirm, password, the
        // recovery key, where the backup went) — the deck, the tour and UPLINK wait for it
        this.busy = true;
        void (async () => {
          await this.mountChosen(path);
          await this.encrypt();
          this.busy = false;
          this.leave(skipped);
          void modules();
        })();
        return;
      }
      void (async () => {
        await this.mountChosen(path);
        await modules();
      })();
    }
    this.leave(skipped);
  }

  /** The folder typed for the vault (none: the default one stays). A failure is said, not swallowed. */
  private async mountChosen(path: string | undefined): Promise<void> {
    if (!path) return;
    const code = await this.deck.act(`vault mount ${q(path)}`).catch(() => 1);
    // a new account's first setup: the default folder it was given at first (Icebreaker-<name>)
    // goes, if nothing but the deck's own notes is in it (vault.rs vault_discard_seed)
    if (code === 0 && this.firstRun) await this.deck.platform.vault.discardSeed?.().catch(() => false);
    if (code !== 0)
      this.deck.notify(t("the vault couldn't go to {path} — it stays in {root} (vault move: Settings → VAULT)", { path, root: this.deck.vault.root }), "error");
  }

  /**
   * ENCRYPTION chosen: encrypt, over the setup. A wrong password asks again (it gave up on
   * the encryption and started the tour); cancelled or failed, the deck says the vault is
   * still plain and asks whether to try again — the tour waits.
   */
  private async encrypt(): Promise<void> {
    for (;;) {
      const code = await this.deck.act("vault encrypt --window").catch(() => 1);
      const st = await this.deck.platform.vault.crypt?.status().catch(() => null);
      if (code === 0 || st?.encrypted) return;
      const again = await this.deck.confirm(t("The vault isn't encrypted"), t("It stays plain files for now. Try again?\n\n(Later: Settings → PRIVACY, or vault encrypt in the shell.)"));
      if (!again) return void this.deck.notify(t("vault left plain — vault encrypt any time"), "warning");
    }
  }

  /** The setup is done: HOME, then the tour and the Welcome note. */
  private leave(skipped: boolean): void {
    const set = (k: string, v: unknown) => this.deck.settings.set(k, v);
    set("setup.done", true);
    // the answers aren't something to ⌘Z (the acts above finish a moment later)
    setTimeout(() => this.deck.history.clear(), 1500);
    const ws = this.deck.workspace;
    const i = ws.tabs.indexOf(this);
    if (i >= 0) ws.tabs.splice(i, 1);
    ws.active = Math.max(0, Math.min(ws.active, ws.tabs.length - 1));
    this.deck.openApp("home");
    // then the Welcome note opens on top (HOME stays the first tab): where to start
    // (a moment later, so a vault mounted just now is there)
    // the guided tour (workspace/tour.ts), then the Welcome note
    if (!skipped)
      setTimeout(() => {
        this.deck.workspace.tour(() => void this.deck.vault.exists("Welcome.md").then((ok) => (ok ? this.deck.openFile("Welcome.md") : undefined)));
      }, 1200);
    this.deck.notify(skipped ? t("setup skipped — ctrl+k → Setup to run it later") : t("welcome, {handle}", { handle: this.a.handle || "netrunner" }), "success");
  }

  onText(t: string): boolean {
    if (this.busy) return true;
    if (!this.cur.text || this.places.length) {
      // quick answers: a number picks an option (more than 9: type both digits — it
      // shows that one, enter keeps it)
      if (!/^[0-9]$/.test(t)) return true;
      const now = performance.now();
      this.digits = now - this.digitsAt < 700 ? this.digits + t : t;
      this.digitsAt = now;
      const n = Number(this.digits), count = this.options().length;
      if (n >= 1 && n <= count) {
        this.sel = n - 1;
        this.preview();
        this.deck.sound.play("move");
        if (count < 10) void this.next();
      }
      return true;
    }
    if (t.includes("\n")) {
      const rest = t.replace(/[\r\n]+/g, "");
      if (rest) this.field.onText(rest);
      void this.next();
      return true;
    }
    return this.field.onText(t);
  }

  onKey(k: KeyInput): boolean {
    // fast: tab skips the question (its default stays), ctrl+enter finishes with the defaults
    if (k.combo === "tab" && this.cur.id === "warning") return true; // read it, then enter
    // the vault's folder: tab completes the folder name, like a terminal (it skipped the
    // question and dropped what was typed — the vault stayed in the default folder)
    if (k.combo === "tab" && this.cur.id === "vault-path") return void this.completeVaultPath(), true;
    // ⌘O: the folder browser (every path asked can be chosen with the mouse too)
    if (k.combo === "ctrl+o" && this.cur.id === "vault-path") return void this.browseVault(), true;
    // typed something: tab keeps it, like enter (skipping threw it away)
    if (k.combo === "tab" && this.cur.text && this.input.trim() && !this.places.length) return void this.next(), true;
    if (k.combo === "tab" && this.cur.id !== "done") return this.go(1), true;
    if (k.combo === "ctrl+enter" && !this.busy) return this.finish(false), true;
    if (this.cur.text && !this.places.length) return this.field.onKey(k);
    return false;
  }

  /** The vault's folder, chosen in the deck's file browser instead of typed. */
  private async browseVault(): Promise<void> {
    // from what's typed, else where the vault is now (it opened at the home folder)
    const start = this.input.trim() || this.deck.vault.root || undefined;
    const path = await pickFolder(this.deck, t("the vault's folder"), start);
    if (!path) return;
    this.plain.text = path;
    this.error = "";
    this.deck.requestFrame();
  }

  /** The sound step's value moved: hear it (at most ~8 blips a second). */
  private setSound(v: number): void {
    const st = this.cur;
    if (!st.slider) return;
    v = Math.max(st.slider.min, Math.min(st.slider.max, Math.round(v)));
    if (String(v) === this.a[st.id]) return;
    this.a[st.id] = String(v);
    this.deck.sound.volume = v / 100;
    this.deck.sound.enabled = v > 0;
    const now = performance.now();
    if (v > 0 && now - this.blipAt > 120) {
      this.blipAt = now;
      this.deck.sound.play("tick");
    }
  }

  onAction(a: Action): boolean {
    const st = this.cur;
    if (st.slider && (a === "left" || a === "right")) return heldStep("setup:sound", a === "left" ? -1 : 1, (d) => (this.setSound(Number(this.a[st.id]) + d), this.deck.requestFrame())), true;
    const n = this.options().length;
    switch (a) {
      case "up": this.sel = (this.sel - 1 + Math.max(1, n)) % Math.max(1, n); this.preview(); return true;
      case "down": this.sel = (this.sel + 1) % Math.max(1, n); this.preview(); return true;
      case "confirm": void this.next(); return true;
      case "back":
        if (this.places.length) this.places = [];
        else this.go(-1);
        return true;
      default: return false;
    }
  }

  /** What the log shows for an answered question. */
  private answerOf(st: Step): string {
    const v = this.a[st.id];
    if (v === undefined) return "";
    if (st.text) return v || "—";
    const o = st.options?.().find((x) => x.value === v);
    return o ? (st.id === "theme" || st.id === "language" || st.id === "voice-lang" ? o.label : t(o.label)) : v || "—";
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    const st = this.cur;
    const age = performance.now() - this.stepAt;
    if (age < 600) ui.animate(16);

    // ── top: the chapters, and how far along ───────────────────────────────
    // a short frame (a small window with the tree and the shell open): the question first — the
    // title and the bar take one line, or none at all (the box with its buttons was cut off)
    const header = r.h >= 14 ? "full" : r.h >= 9 ? "line" : "none";
    let y = r.y + (header === "full" ? 1 : 0);
    const brand = "◢◤ ICEBREAKER // setup";
    if (header !== "none") {
      ui.text(r.x + 2, y, brand, { fg: c.accent, attrs: BOLD });
      if (this.deck.account) ui.text(r.x + 3 + strWidth(brand), y, `· ${this.deck.account}`, { fg: c.title });
      const cur = chapterOf(st.id);
      const brandEnd = r.x + 3 + strWidth(brand) + (this.deck.account ? strWidth(`· ${this.deck.account}`) + 1 : 0);
      const labels = CHAPTERS.map((ch, k) => (k < cur ? `✓ ${t(ch.name)}` : t(ch.name)));
      const allW = labels.reduce((n, l) => n + strWidth(l), 0) + (labels.length - 1) * 3;
      let cx = r.x + r.w - 2;
      if (cx - allW > brandEnd + GAP) {
        for (let k = CHAPTERS.length - 1; k >= 0; k--) {
          cx -= strWidth(labels[k]);
          ui.text(cx, y, labels[k], { fg: k === cur ? c.accent : k < cur ? c.subtle : c.faint, attrs: k === cur ? BOLD : 0 });
          if (k) (cx -= 3), ui.text(cx, y, " ─ ", { fg: c.faint });
        }
      } else {
        // a narrow window: the chapter you're in and how far along (they overlapped the title)
        const label = `${t(CHAPTERS[cur].name)} · ${cur + 1}/${CHAPTERS.length}`;
        if (cx - strWidth(label) > brandEnd + GAP) ui.textRight(cx, y, label, { fg: c.accent, attrs: BOLD });
      }
      y += 1;
    }
    const visible = this.steps.filter((s2) => !s2.skip?.());
    const at = Math.max(0, visible.indexOf(st));
    if (header === "full") {
      ui.bar(r.x + 2, y, r.w - 4, visible.length > 1 ? at / (visible.length - 1) : 1, c.accent, c.faint);
      y += 2;
    }

    // ── left: the deck writing your answers down (wide screens) ────────────
    const logW = r.w >= 100 ? 34 : 0;
    if (logW) {
      const lx = r.x + 2;
      ui.text(lx, y, t("// what you told the deck"), { fg: c.subtle });
      let ly = y + 2;
      const answered = this.steps.map((s2, i) => ({ s2, i })).filter(({ s2, i }) => i < this.step && !s2.skip?.() && this.answerOf(s2) !== "");
      const fit = answered.slice(-Math.max(1, r.y + r.h - ly - 3));
      for (const { s2, i } of fit) {
        const row = { x: lx, y: ly, w: logW, h: 1 };
        const hot = ui.hovered(row);
        const name = t(s2.title).toLowerCase();
        ui.text(lx, ly, `${hot ? "‹" : "›"} ${name}`, { fg: hot ? c.accent : c.muted }, logW - 12);
        const val = truncate(this.answerOf(s2), 14);
        const dotsFrom = lx + 2 + strWidth(name) + 1;
        const valX = lx + logW - strWidth(val);
        if (valX - dotsFrom > 1) ui.text(dotsFrom, ly, "·".repeat(valX - dotsFrom - 1), { fg: c.faint });
        ui.text(valX, ly, val, { fg: c.accent, attrs: hot ? BOLD : 0 });
        ui.hit(row, { onClick: () => this.jumpTo(i), tip: t("click: change it") });
        ly++;
      }
      // the line being written: the cursor blinks there
      ui.text(lx, ly, `▸ ${t(st.title).toLowerCase()}`, { fg: c.fg, attrs: BOLD }, logW - 2);
      if (Math.floor(ui.now / 500) % 2) ui.text(lx + logW - 1, ly, "█", { fg: c.accent });
      ui.animate(500);
      ui.vline(lx + logW + 2, y, r.y + r.h - y - 2, { fg: c.faint }, "┊");
    }

    // ── right: the question, sliding in ─────────────────────────────────────
    const area = { x: r.x + (logW ? logW + 6 : 2), w: r.w - (logW ? logW + 8 : 4) };
    // the warning uses all the width there is: it must fit, button included, in a small window
    const w = st.id === "warning" ? Math.min(110, area.w) : Math.min(76, area.w);
    const slide = Math.round((1 - easeOut(age / 220)) * 6);
    const x = area.x + Math.floor((area.w - w) / 2) + slide;
    // never taller than the frame (8 at least ran its bottom — the buttons — out of a small frame)
    const box = { x, y, w, h: Math.max(4, Math.min(r.y + r.h - y, Math.max(8, r.y + r.h - y - 2))) };
    const inner = ui.box(box, { title: age < 400 ? decrypt(t(st.title), age / 400, ui.now) : t(st.title), focused: true, bg: c.panel, info: `${at + 1}/${visible.length}` });
    let iy = inner.y + 1;
    let qText = t(st.question, { vault: this.deck.vault.root, shells: HERE.shells });
    if (st.id === "place") qText = this.places.length ? t("Which one?") : this.a.precision === "precise" ? t("Coordinates (lat, lon):") : this.a.precision === "country" ? t("Which country?") : t("Which city?");
    // the question types itself in, with its blips (ui/typewriter.ts: the text speed setting)
    let qLines = wrapWords(qText, inner.w - 4);
    // the warning never pushes its own button out of the box: blank lines go first, then the end
    if (st.id === "warning") {
      const room = inner.h - 4;
      if (qLines.length > room) qLines = qLines.filter((l) => l.trim());
      if (qLines.length > room) qLines = qLines.slice(0, Math.max(1, room));
    } else {
      // a short window: what you answer with (the choices, the field) and the buttons come first,
      // the question is cut with … (it ran over the buttons' line)
      const need = st.text || st.slider ? 2 : Math.min(this.options().length, 3);
      const room = Math.max(1, inner.h - 3 - need);
      if (qLines.length > room) qLines = qLines.filter((l) => l.trim());
      // (a line truncate already ended with … gets no second one: "… …")
      if (qLines.length > room) {
        const last = truncate(qLines[room - 1], inner.w - 6);
        qLines = [...qLines.slice(0, room - 1), last.endsWith("…") ? last : `${last} …`];
      }
    }
    const shownChars = typed(ui, `setup:${st.id}`, qText);
    let used = 0;
    let first = true;
    for (const line of qLines) {
      const part = line.slice(0, Math.max(0, shownChars - used));
      used += line.length + 1;
      // the warning's first line stands out
      ui.text(inner.x + 2, iy++, part, st.id === "warning" && first ? { fg: c.warning, bg: c.panel, attrs: BOLD } : { fg: c.fg, bg: c.panel });
      if (line.trim()) first = false;
    }
    iy++;
    if (st.text && !this.places.length) {
      // a path: a "browse…" button beside its field (the deck's file browser)
      const browse = st.id === "vault-path" ? `${t("browse…")}  ${IS_MAC ? "⌘O" : "ctrl+O"}` : "";
      const bw = browse ? strWidth(browse) + 2 + GAP : 0;
      this.field.render(ui, { x: inner.x + GAP, y: iy, w: inner.w - GAP * 2 - bw, h: 1 }, { focused, placeholder: this.placeholder(st) });
      if (browse) ui.button(inner.x + inner.w - GAP * 2 - strWidth(browse), iy, browse, () => void this.browseVault(), { tip: t("choose the folder with the mouse") });
      iy += 2;
      const footY = inner.y + inner.h - 1;
      if (iy >= footY - (this.error ? 1 : 0)) {
        // no room for the hint under the field
      } else if (this.busy) ui.text(inner.x + 2, iy, `${ui.spinner()} ${t("locating…")}`, { fg: c.muted, bg: c.panel });
      else ui.text(inner.x + 2, iy, st.id === "vault-path" ? t("a full path (~/notes works) · tab completes the folder's name · or browse…") : t("enter: keep the grey suggestion · type to replace it"), { fg: c.subtle, bg: c.panel }, inner.w - 4);
    } else if (st.slider) {
      // a real slider: drag, hold, ←→ one at a time (faster when held) — you hear the level as it moves
      const v = Number(this.a[st.id] ?? st.slider.start);
      slider(ui, { x: inner.x + 2, y: iy, w: inner.w - 4, h: 1 }, v, st.slider.min, st.slider.max, (nv) => this.setSound(nv), { zeroIsOff: true });
      iy += 2;
      if (iy < inner.y + inner.h - 1) ui.text(inner.x + 2, iy, t("enter: keep it"), { fg: c.subtle, bg: c.panel }, inner.w - 4);
    } else {
      // more options than rows (the themes in a small window): the ones around the cursor, ▲ ▼ for the rest
      const all = this.options();
      // (the error line and the keys line stay below)
      const room = Math.max(1, inner.y + inner.h - GAP - iy);
      const first = all.length > room ? Math.max(0, Math.min(this.sel - Math.floor(room / 2), all.length - room)) : 0;
      const last = first + Math.min(room, all.length);
      const topY = iy;
      all.forEach((o, i) => {
        if (i < first || i >= last) return;
        // the options arrive one after the other
        const appear = easeOut((age - 60 - (i - first) * 35) / 160);
        if (appear <= 0) return ui.animate(16);
        const row = { x: inner.x + 1, y: iy, w: inner.w - 2, h: 1 };
        const sel = i === this.sel;
        const hot = ui.hovered(row);
        const bg = sel ? mix(c.accent, c.panel, 0.78) : hot ? c.highlight : c.panel;
        ui.fill(row, { bg });
        if (sel) {
          // a light sweeps across the chosen line
          const sweep = Math.floor(((ui.now % 1400) / 1400) * (row.w + 12)) - 6;
          for (let k = 0; k < 4; k++) {
            const sx = row.x + sweep + k;
            if (sx >= row.x && sx < row.x + row.w) ui.fill({ x: sx, y: iy, w: 1, h: 1 }, { bg: mix(c.accent, c.panel, 0.6 + k * 0.05) });
          }
          ui.animate(33);
        }
        const fade = (col: typeof c.fg) => mix(c.panel, col, appear);
        // the number (what 1-9 picks) in a column as wide as the biggest one
        const numW = String(this.options().length).length;
        ui.textRight(row.x + 1 + numW, iy, sel ? "▶" : String(i + 1), { fg: fade(sel ? c.accent : c.subtle), attrs: BOLD });
        const lx = row.x + numW + 2;
        const label = st.id === "theme" || st.id === "language" || st.id === "voice-lang" ? o.label : t(o.label);
        ui.text(lx, iy, label, { fg: fade(sel || hot ? c.accent : c.fg), attrs: sel ? BOLD : 0 }, row.w - (lx - row.x) - 1);
        const lend = lx + strWidth(label) + 2;
        let hx = row.x + row.w - 1;
        if (st.id === "theme") {
          // its palette, as swatches
          const th = this.deck.themes.get(o.value);
          if (th) {
            hx -= 13;
            [th.c.bg, th.c.panel, th.c.fg, th.c.accent, th.c.accentAlt, th.c.success].forEach((col, k) => ui.text(hx + 1 + k * 2, iy, "██", { fg: col }));
          }
        }
        if (o.hint && hx - lend > 6 && (sel || hot || w >= 70)) {
          const hint = st.id === "theme" || st.id === "locale" ? o.hint : t(o.hint);
          ui.textRight(hx - 1, iy, truncate(hint, hx - lend - 1), { fg: fade(sel ? c.fg : c.subtle) });
        }
        // one click chooses it (a theme shows at once), a click on the chosen one keeps it
        ui.hit(row, { onClick: () => { if (this.sel === i) void this.next(); else { this.sel = i; this.preview(); this.deck.sound.play("move"); } }, tip: sel ? t("click again (or enter): keep it") : undefined });
        iy++;
      });
      if (first > 0) ui.text(inner.x + inner.w - GAP, topY, "▲", { fg: c.accent });
      if (last < all.length) ui.text(inner.x + inner.w - GAP, topY + (last - first) - INSET, "▼", { fg: c.accent });
    }
    if (this.error) ui.text(inner.x + 2, inner.y + inner.h - 2, `⚠ ${this.error}`, { fg: c.error, bg: c.panel }, inner.w - 4);
    // the way back and the way past, always in the same place, as buttons (esc going back
    // was said nowhere a tester looked), then the keys
    const keys = st.id === "vault-path" ? t("tab completes the folder · enter next") : st.text ? t("enter next") : st.slider ? t("←→ · enter next") : t("↑↓ or a number · enter keeps");
    // the button on the right first; back / skip on the left only where they fit before it (they
    // ran into it: "‹ retour esc ir passer tab eurs par défaut ^⏎"), short when the room is short;
    // then the keys, if there's still room
    const fy = inner.y + inner.h - 1;
    let right = inner.x + inner.w - GAP;
    if (st.id !== "done" && this.warned) {
      const fin = [`${t("finish with the defaults")} ⌃⏎`, `${t("finish")} ⌃⏎`].find((f) => strWidth(f) + 2 <= inner.w / 2) ?? "";
      if (fin) {
        right -= strWidth(fin) + 2;
        ui.button(right, fy, fin, () => this.finish(false), { accent: c.subtle });
        right -= GAP;
      }
    }
    let fx = inner.x + GAP;
    // back and skip chosen together, long or short, so both fit (skip went first when room was short)
    const firstShown = this.steps.findIndex((s2) => !s2.skip?.());
    const back = this.step > firstShown, skip = st.id !== "done" && st.id !== "warning" && st.id !== "vault-path";
    const pairs: [string, string][] = [[`‹ ${t("back")}  esc`, `${t("skip")}  tab`], ["‹ esc", `${t("skip")} ⇥`], ["‹", "⇥"]];
    const width = (p: [string, string]) => (back ? strWidth(p[0]) + 2 + GAP : 0) + (skip ? strWidth(p[1]) + 2 + GAP : 0);
    const pair = pairs.find((p) => fx + width(p) <= right);
    if (pair && back) fx += ui.button(fx, fy, pair[0], () => this.go(-1), { quiet: true, tip: t("the question before (esc)") }) + GAP;
    if (pair && skip) fx += ui.button(fx, fy, pair[1], () => this.go(1), { quiet: true, tip: t("keep the default and go on (tab)") }) + GAP;
    const left = right - fx;
    if (left > 6) ui.text(fx, fy, keys, { fg: c.subtle, bg: c.panel }, left);
  }
}

/** today, written the way a date format writes it: "lun. 23 nov. · 14:30" — what the DATE FORMAT step shows */
function dateExample(locale: string | undefined): string {
  const d = new Date();
  return `${d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })} · ${d.toLocaleDateString(locale)} · ${d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
}

export const setupSpec: AppSpec = {
  kind: "setup",
  title: "Setup",
  description: "the first-run questionnaire",
  icon: "⚙",
  create: (deck) => new SetupApp(deck),
};

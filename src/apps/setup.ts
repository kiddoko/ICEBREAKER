import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import { geocode, type Place } from "../core/location";
import type { Deck } from "../deck";
import { decrypt } from "../fx/glitch";
import { q, type UI } from "../ui/ui";
import { LAYOUT_PRESETS } from "../widgets/builtin";
import { applyFxPreset } from "../workspace/fxpanel";
import type { App, AppSpec } from "./types";

interface Option { value: string; label: string; hint?: string }
interface Step {
  id: string;
  title: string;
  question: string;
  /** Text steps take typed input; choice steps a pick from `options`. */
  text?: { placeholder: string; mask?: boolean };
  options?: () => Option[];
  skip?: () => boolean;
}

/**
 * First-run questionnaire: who you are, where you are (as precisely as you
 * like), which AI, which HOME, how much eye candy. Everything can be changed
 * later in Settings; run it again with Ctrl+K → "Setup".
 */
export class SetupApp implements App {
  readonly kind = "setup";
  readonly key = "setup";
  private step = 0;
  private sel = 0;
  private input = "";
  private stepAt = 0;
  private busy = false;
  private error = "";
  private places: Place[] = [];
  private a: Record<string, string> = {};
  /** First password entry, kept only until the confirmation (never in `a`). */
  private pw = "";
  private readonly steps: Step[];

  constructor(private readonly deck: Deck) {
    const s = deck.settings.data;
    this.a = { handle: s.user.handle, locale: s.user.locale, precision: s.user.location.precision };
    this.steps = [
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
        id: "lock", title: "ACCESS",
        question: "Lock the deck with a login? The password is hashed (Argon2id) and never stored. It locks the app — your notes stay plain Markdown files on disk.",
        options: () => [
          { value: "create", label: "Create a login", hint: "name + password at every start" },
          { value: "none", label: "No login", hint: "add one later: account create" },
        ],
        skip: () => !!deck.account,
      },
      { id: "acct-user", title: "ACCOUNT", question: "Account name:", text: { placeholder: "" }, skip: () => !!deck.account || this.a.lock !== "create" },
      { id: "acct-pass", title: "PASSWORD", question: "Choose a password (8 characters or more). There is no recovery: if you forget it, you'll have to delete the login file.", text: { placeholder: "8 characters or more", mask: true }, skip: () => !!deck.account || this.a.lock !== "create" },
      { id: "acct-pass2", title: "PASSWORD", question: "Type it again:", text: { placeholder: "same password", mask: true }, skip: () => !!deck.account || this.a.lock !== "create" },
      {
        id: "terminal", title: "TERMINAL",
        question: "The shell panel can be your real terminal (zsh, bash…) with ICEBREAKER's commands added — ssh, git, vim, everything works. Or ICEBREAKER's own shell, limited to the vault.",
        options: () => [
          { value: "system", label: "My terminal + ICEBREAKER commands", hint: "careful: rm deletes for real there" },
          { value: "ibsh", label: "ICEBREAKER shell only", hint: "the vault only, rm goes to .trash" },
        ],
        skip: () => !deck.platform.pty,
      },
      {
        id: "vault", title: "VAULT",
        question: `Your notes, journal and calendar live in one folder of plain files: ${deck.vault.root}. It can be any folder — a drive, a synced folder, or your own server mounted as a network drive, so everything stays on hardware you own.`,
        options: () => [
          { value: "keep", label: "Keep this folder" },
          { value: "other", label: "Another folder", hint: "a full path: /Volumes/nas/vault, /Users/you/Sync/notes…" },
        ],
      },
      { id: "vault-path", title: "VAULT", question: "Folder path (created if missing):", text: { placeholder: "/Volumes/nas/icebreaker" }, skip: () => this.a.vault !== "other" },
      { id: "locale", title: "LANGUAGE", question: "Dates, calendar and news language.", options: () => [{ value: "fr-FR", label: "Français" }, { value: "en-US", label: "English (US)" }, { value: "en-GB", label: "English (UK)" }, { value: "", label: "Same as the system" }] },
      {
        skip: () => this.a.mode === "stealth",
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
        skip: () => this.a.precision === "none" || this.a.mode === "stealth",
      },
      {
        id: "ai", title: "NEURAL LINK", question: "Which AI should LINK and plugins use?",
        options: () => [
          ...(this.a.mode === "stealth"
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
          ...(deck.platform.google && this.a.mode !== "stealth" ? [{ value: "google", label: "Connect Google Calendar", hint: "your browser opens Google's page" }] : []),
          { value: "later", label: "Decide later", hint: "local works; cal google connect any time" },
        ],
        skip: () => !deck.commands.get("cal"),
      },
      {
        id: "voice", title: "VOICE",
        question: "Give the deck a voice? Synthesized on this computer, through a robot filter: clearly a machine, still smooth. It can greet you and read LINK's answers.",
        options: () => [
          { value: "read", label: "Yes — greet me and read the AI's answers" },
          { value: "greet", label: "Yes — just the greeting" },
          { value: "off", label: "No voice", hint: "voice on, any time" },
        ],
        skip: () => !deck.platform.voice,
      },
      {
        id: "voice-engine", title: "VOICE",
        question: "Which voice? Piper is an open-source neural voice (light, natural, made robotic by the filter); it's a one-time download of about 85 MB. The system voice needs nothing.",
        options: () => [
          { value: "piper", label: "Download piper", hint: "better — open source, runs offline after" },
          { value: "system", label: "The system voice", hint: "no download" },
        ],
        skip: () => !deck.platform.voice || this.a.voice === "off" || !this.a.voice || this.a.mode === "stealth",
      },
      {
        id: "theme", title: "LOOK",
        question: "A theme to start with (theme set <name> or theme studio any time).",
        options: () =>
          ["nightshade", "e-ink", "neon-district", "abyss", "phosphor", "redline"]
            .filter((n) => deck.themes.get(n))
            .map((n) => ({ value: n, label: n, hint: deck.themes.get(n)!.description })),
      },
      {
        id: "home", title: "HOME", question: "Pick a starting dashboard. Press e on HOME to rearrange, a to add widgets.",
        options: () => [
          { value: "essentials", label: "Essentials", hint: "clock, weather, calendar, system, notes" },
          { value: "productivity", label: "Productivity", hint: "tasks, focus timer, streak, news" },
          { value: "gadget", label: "Gadget", hint: "neural link, moon, world clock, quotes" },
        ],
      },
      {
        id: "fx", title: "EYE CANDY", question: "How much CRT do you want?",
        options: () => [
          { value: "minimal", label: "Minimal", hint: "crisp, light animations" },
          { value: "max", label: "Full CRT", hint: "bloom, scanlines, flicker" },
          { value: "potato", label: "Potato", hint: "no effects, for old laptops" },
        ],
      },
      {
        id: "sound", title: "SOUND", question: "UI sounds? (blips and clicks of an old OS doing its best — replaceable, see docs)",
        options: () => [{ value: "on", label: "On" }, { value: "off", label: "Off" }],
      },
      { id: "done", title: "READY", question: "Deck configured. Everything is in Settings if you change your mind.", options: () => [{ value: "go", label: "Jack in" }] },
    ];
  }

  title(): string {
    return "setup";
  }

  status(): string {
    return this.cur.text ? "type · enter next · esc back" : "1-9 or ↑↓ choose · enter next · esc back";
  }

  private get cur(): Step {
    return this.steps[this.step];
  }

  private options(): Option[] {
    if (this.cur.id === "place" && this.places.length)
      return this.places.map((p, i) => ({ value: String(i), label: [p.name, p.admin, p.country].filter(Boolean).join(", ") }));
    return this.cur.options?.() ?? [];
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
    this.input = "";
    const opts = this.options();
    this.sel = Math.max(0, opts.findIndex((o) => o.value === this.a[st.id]));
  }

  private async next(): Promise<void> {
    const st = this.cur;
    if (this.busy) return;
    if (st.id === "place") return this.submitPlace();
    if (st.id === "acct-pass") {
      if (this.input.length < 8) return void (this.error = "8 characters or more");
      this.pw = this.input;
      return this.go(1);
    }
    if (st.id === "acct-pass2") return this.createAccount();
    if (st.text) {
      this.a[st.id] = this.input.trim() || this.placeholder(st);
      return this.go(1);
    }
    const o = this.options()[this.sel];
    if (!o) return;
    this.a[st.id] = o.value;
    if (st.id === "intro" && o.value === "skip") return this.finish(true);
    if (st.id === "done") return this.finish(false);
    this.go(1);
  }

  /** Typing replaces the suggestion; enter on empty keeps it. */
  private placeholder(st: Step): string {
    if (st.id === "handle") return this.a.handle || "netrunner";
    if (st.id === "acct-user") return this.a["acct-user"] || this.a.handle || "netrunner";
    return st.text?.placeholder ?? "";
  }

  private async createAccount(): Promise<void> {
    if (this.input !== this.pw) {
      this.pw = "";
      this.go(-1);
      this.error = "they didn't match — choose it again";
      return;
    }
    this.busy = true;
    try {
      const user = (this.a["acct-user"] || this.a.handle || "netrunner").trim();
      await this.deck.platform.account.create(user, this.pw);
      this.deck.account = await this.deck.platform.account.status();
      this.deck.sound.play("unlock");
      this.go(1);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.pw = "";
      this.input = "";
      this.busy = false;
      this.deck.requestFrame();
    }
  }

  private async submitPlace(): Promise<void> {
    const loc = this.deck.settings.data.user.location;
    if (this.places.length) {
      const p = this.places[this.sel];
      this.deck.settings.set("user.location", { precision: this.a.precision, name: p.name, country: p.countryCode, lat: p.lat, lon: p.lon });
      return this.go(1);
    }
    const q = this.input.trim();
    if (!q) return void (this.error = "type something (or esc to change precision)");
    if (this.a.precision === "precise") {
      const m = q.match(/^(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)$/);
      if (!m) return void (this.error = "expected: 48.85, 2.35");
      this.deck.settings.set("user.location", { ...loc, precision: "precise", name: "", lat: Number(m[1]), lon: Number(m[2]) });
      return this.go(1);
    }
    this.busy = true;
    try {
      this.places = (await geocode(q, (this.a.locale || "en").split("-")[0])).slice(0, 5);
      this.sel = 0;
      if (!this.places.length) this.error = `nothing found for “${q}”`;
    } catch {
      this.error = "couldn't reach the geocoder (offline?)";
    } finally {
      this.busy = false;
      this.deck.requestFrame();
    }
  }

  private finish(skipped: boolean): void {
    const set = (k: string, v: unknown) => this.deck.settings.set(k, v);
    if (!skipped) {
      set("user.handle", this.a.handle || "netrunner");
      set("user.locale", this.a.locale ?? "");
      if (this.a.precision === "none") set("user.location", { precision: "none", name: "", country: "", lat: null, lon: null });
      if (this.a.ai && this.a.ai !== "keep") set("ai.provider", this.a.ai);
      if (this.a.home) set("home.widgets", LAYOUT_PRESETS[this.a.home as keyof typeof LAYOUT_PRESETS]);
      if (this.a.fx) applyFxPreset(this.deck, this.a.fx as "minimal" | "max" | "potato");
      if (this.a.sound) set("sound.enabled", this.a.sound === "on");
      if (this.a.terminal) set("shell.mode", this.a.terminal);
      // modules are configured through their commands, like everything else
      if (this.a.calendar === "local") void this.deck.act("cal mode local");
      if (this.a.calendar === "google") void this.deck.act("cal mode google");
      set("user.gender", this.a.gender ?? "");
      set("user.genderOther", this.a.gender === "other" ? (this.a["gender-other"] ?? "") : "");
      void this.deck.act(`stealth ${this.a.mode === "stealth" ? "on" : "off"}`);
      if (this.a.theme) void this.deck.act(`theme set ${this.a.theme}`);
      if (this.a.voice && this.a.voice !== "off") {
        void (async () => {
          await this.deck.act("voice on");
          await this.deck.act(`voice read ${this.a.voice === "read" ? "on" : "off"}`);
          await this.deck.act("voice greet on");
          if (this.a["voice-engine"] === "piper") await this.deck.act(`voice install ${(this.a.locale || "en").slice(0, 2).toLowerCase()}`);
          await this.deck.act("voice test");
        })();
      } else if (this.a.voice === "off") void this.deck.act("voice off");
      if (this.a.vault === "other" && this.a["vault-path"]) void this.deck.act(`vault mount ${q(this.a["vault-path"])}`);
    }
    set("setup.done", true);
    const ws = this.deck.workspace;
    const i = ws.tabs.indexOf(this);
    if (i >= 0) ws.tabs.splice(i, 1);
    ws.active = Math.max(0, Math.min(ws.active, ws.tabs.length - 1));
    this.deck.openApp("home");
    this.deck.notify(skipped ? "setup skipped — ctrl+k → Setup to run it later" : `welcome, ${this.a.handle || "netrunner"}`, "success");
  }

  onText(t: string): boolean {
    if (this.busy) return true;
    if (!this.cur.text || this.places.length) {
      // quick answers: 1-9 picks an option
      const n = Number(t);
      if (/^[1-9]$/.test(t) && n <= this.options().length) {
        this.sel = n - 1;
        void this.next();
      }
      return true;
    }
    if (t.includes("\n")) {
      this.input += t.replace(/[\r\n]+/g, "");
      void this.next();
      return true;
    }
    this.input += t;
    this.error = "";
    return true;
  }

  onKey(k: KeyInput): boolean {
    if (this.cur.text && !this.places.length && k.combo === "backspace") {
      this.input = this.input.slice(0, -1);
      return true;
    }
    return false;
  }

  onAction(a: Action): boolean {
    const n = this.options().length;
    switch (a) {
      case "up": this.sel = (this.sel - 1 + Math.max(1, n)) % Math.max(1, n); return true;
      case "down": this.sel = (this.sel + 1) % Math.max(1, n); return true;
      case "confirm": void this.next(); return true;
      case "back":
        if (this.places.length) this.places = [];
        else this.go(-1);
        return true;
      default: return false;
    }
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const c = ui.c;
    const st = this.cur;
    const w = Math.min(72, r.w - 4);
    const x = r.x + Math.floor((r.w - w) / 2);
    let y = r.y + Math.max(1, Math.floor(r.h * 0.18));
    // progress: one dot per step
    const dots = this.steps.map((_, i) => (i < this.step ? "━━" : i === this.step ? "██" : "──")).join(" ");
    ui.textCenter(r, y, dots, { fg: c.accent });
    y += 2;
    const age = performance.now() - this.stepAt;
    const p = Math.min(1, age / 500);
    if (p < 1) ui.animate(30);
    ui.textCenter(r, y, `▸ ${p < 1 ? decrypt(st.title, p, ui.now) : st.title} ◂`, { fg: c.accent, attrs: BOLD });
    y += 2;
    let q = st.question;
    if (st.id === "place") q = this.places.length ? "Which one?" : this.a.precision === "precise" ? "Coordinates (lat, lon):" : this.a.precision === "country" ? "Which country?" : "Which city?";
    for (const line of wrap(q, w)) ui.textCenter(r, y++, line, { fg: c.fg });
    y++;
    if (st.text && !this.places.length) {
      const box = ui.box({ x, y, w, h: 3 }, { focused: true });
      const shown = st.text.mask && this.input ? "•".repeat(this.input.length) : this.input || this.placeholder(st);
      ui.text(box.x + 1, box.y, shown, { fg: this.input ? c.fg : c.faint }, box.w - 2);
      if (focused) ui.cursor(box.x + 1 + Math.min(this.input.length, box.w - 3), box.y);
      y += 4;
      if (this.busy) ui.textCenter(r, y, `${ui.spinner()} ${st.id.startsWith("acct") ? "hashing…" : "locating…"}`, { fg: c.muted });
    } else {
      this.options().forEach((o, i) => {
        const row = { x, y, w, h: 1 };
        const sel = i === this.sel;
        const hot = ui.hovered(row);
        if (sel) ui.fill(row, { bg: mix(c.accent, c.bg, 0.82) });
        ui.text(x + 1, y, sel ? "▶" : String(i + 1), { fg: sel ? c.accent : c.subtle, attrs: Math.floor(ui.now / 500) % 2 ? BOLD : 0 });
        ui.text(x + 3, y, o.label, { fg: sel || hot ? c.accent : c.fg, bg: sel ? mix(c.accent, c.bg, 0.82) : undefined, attrs: sel ? BOLD : 0 });
        if (o.hint) ui.textRight(x + w - 1, y, o.hint, { fg: c.subtle, bg: sel ? mix(c.accent, c.bg, 0.82) : undefined });
        ui.hit(row, { onClick: () => { this.sel = i; void this.next(); } });
        y++;
      });
      if (this.cur.options) ui.animate(500);
    }
    if (this.error) ui.textCenter(r, y + 1, `⚠ ${this.error}`, { fg: c.error });
  }
}

function wrap(s: string, w: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    if ((line + " " + word).trim().length > w) {
      out.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) out.push(line);
  return out;
}

export const setupSpec: AppSpec = {
  kind: "setup",
  title: "Setup",
  description: "the first-run questionnaire",
  icon: "⚙",
  create: (deck) => new SetupApp(deck),
};

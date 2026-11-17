import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import { geocode, type Place } from "../core/location";
import type { Deck } from "../deck";
import { decrypt } from "../fx/glitch";
import type { UI } from "../ui/ui";
import { LAYOUT_PRESETS } from "../widgets/builtin";
import { applyFxPreset } from "../workspace/fxpanel";
import type { App, AppSpec } from "./types";

interface Option { value: string; label: string; hint?: string }
interface Step {
  id: string;
  title: string;
  question: string;
  /** Text steps take typed input; choice steps a pick from `options`. */
  text?: { placeholder: string };
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
  private readonly steps: Step[];

  constructor(private readonly deck: Deck) {
    const s = deck.settings.data;
    this.a = { handle: s.user.handle, locale: s.user.locale, precision: s.user.location.precision };
    this.steps = [
      { id: "intro", title: "JACK IN", question: "A few questions to set up your deck. Takes a minute, all optional.", options: () => [{ value: "go", label: "Let's go" }, { value: "skip", label: "Skip — use the defaults" }] },
      { id: "handle", title: "HANDLE", question: "What should the deck call you?", text: { placeholder: "netrunner" } },
      { id: "locale", title: "LANGUAGE", question: "Dates, calendar and news language.", options: () => [{ value: "fr-FR", label: "Français" }, { value: "en-US", label: "English (US)" }, { value: "en-GB", label: "English (UK)" }, { value: "", label: "Same as the system" }] },
      {
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
        skip: () => this.a.precision === "none",
      },
      {
        id: "ai", title: "NEURAL LINK", question: "Which AI should LINK and plugins use?",
        options: () => [
          { value: "claude-code", label: "Claude Code", hint: deck.ai.claudeCodePath ? "found — uses your Claude plan, no API tokens" : "not found — install it and run `claude` once" },
          { value: "anthropic", label: "Anthropic API key", hint: "pay per token" },
          { value: "ollama", label: "Ollama", hint: "local models, fully offline" },
          { value: "keep", label: "Decide later" },
        ],
      },
      {
        id: "home", title: "HOME", question: "Pick a starting dashboard. Press e on HOME to rearrange, a to add widgets.",
        options: () => [
          { value: "essentials", label: "Essentials", hint: "clock, weather, calendar, system, notes" },
          { value: "productivity", label: "Productivity", hint: "tasks, focus timer, streak, news" },
          { value: "gadget", label: "Gadget", hint: "matrix rain, moon, world clock, quotes" },
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
      { id: "done", title: "READY", question: "Deck configured. Everything is in Settings if you change your mind.", options: () => [{ value: "go", label: "Jack in" }] },
    ];
  }

  title(): string {
    return "setup";
  }

  status(): string {
    return this.cur.text ? "type · enter next · esc back" : "↑↓ choose · enter next · esc back";
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
    this.input = st.id === "handle" ? this.a.handle ?? "" : "";
    const opts = this.options();
    this.sel = Math.max(0, opts.findIndex((o) => o.value === this.a[st.id]));
  }

  private async next(): Promise<void> {
    const st = this.cur;
    if (this.busy) return;
    if (st.id === "place") return this.submitPlace();
    if (st.text) {
      this.a[st.id] = this.input.trim() || st.text.placeholder;
      return this.go(1);
    }
    const o = this.options()[this.sel];
    if (!o) return;
    this.a[st.id] = o.value;
    if (st.id === "intro" && o.value === "skip") return this.finish(true);
    if (st.id === "done") return this.finish(false);
    this.go(1);
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
    }
    set("setup.done", true);
    this.deck.openApp("home");
    this.deck.notify(skipped ? "setup skipped — ctrl+k → Setup to run it later" : `welcome, ${this.a.handle || "netrunner"}`, "success");
  }

  onText(t: string): boolean {
    if (!this.cur.text || this.places.length) return false;
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
      const shown = this.input || st.text.placeholder;
      ui.text(box.x + 1, box.y, shown, { fg: this.input ? c.fg : c.faint }, box.w - 2);
      if (focused) ui.cursor(box.x + 1 + Math.min(this.input.length, box.w - 3), box.y);
      y += 4;
      if (this.busy) ui.textCenter(r, y, `${ui.spinner()} locating…`, { fg: c.muted });
    } else {
      this.options().forEach((o, i) => {
        const row = { x, y, w, h: 1 };
        const sel = i === this.sel;
        const hot = ui.hovered(row);
        if (sel) ui.fill(row, { bg: mix(c.accent, c.bg, 0.82) });
        ui.text(x + 1, y, sel ? "▶" : " ", { fg: c.accent, attrs: Math.floor(ui.now / 500) % 2 ? BOLD : 0 });
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

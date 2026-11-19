import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import { t } from "../core/i18n";
import type { KeyInput } from "../core/input";
import { displayKeys, keysOf, menuKeyEntries, normalizeCombo, SHORTCUTS, MENU } from "../core/shortcuts";
import { strWidth } from "../core/unicode";
import type { Deck } from "../deck";
import { q, type UI } from "../ui/ui";
import type { Overlay } from "./overlays";

/**
 * "A shortcut for this": waits for a key combo, shows what it would replace
 * (the deck's own keys or one of yours), lists what the key will do — one
 * action or several, run one after the other — then OK binds it:
 *   bind <keys> "action 1; action 2"
 * Opened from right-click menus (a macro, a module, a note…), or `bind` with no keys.
 */
export class KeyCapture implements Overlay {
  modal = true;
  done = false;
  private combo: string | null = null;
  private warn = "";

  constructor(
    private readonly deck: Deck,
    private readonly title: string,
    private readonly actions: string[],
    /** rebinding one of the deck's own shortcuts: OK hands the keys here instead of `bind` */
    private readonly onPick?: (combo: string) => void,
    /** the deck shortcut being rebound (not a conflict with itself) */
    private readonly self?: string,
    /** combo: ctrl/alt/shift + a key · menu: one key on THE MENU · both: either (a new shortcut) */
    private readonly mode: "combo" | "menu" | "both" = "both",
  ) {}

  /** What a combo would take over: a built-in shortcut or one of yours. */
  private conflict(combo: string): string {
    if (combo.startsWith(MENU)) {
      const key = combo.slice(MENU.length);
      const e = menuKeyEntries(this.deck.settings.data.menu?.keys, this.deck.settings.data.keys).find((x) => x.key === key && x.shortcut?.id !== this.self);
      return e ? t("THE MENU uses it for: {what} (OK replaces it)", { what: e.shortcut ? t(e.label) : e.label }) : "";
    }
    const mine = this.deck.settings.data.keys?.[combo];
    if (mine) return t("already yours: {cmd} (OK replaces it)", { cmd: mine });
    const built = SHORTCUTS.find((s) => s.id !== this.self && keysOf(s, this.deck.settings.data.keyOverrides).split(" · ").includes(combo));
    return built ? t("the deck uses it for: {what} (OK replaces it)", { what: t(built.what) }) : "";
  }

  private async ok(): Promise<void> {
    if (!this.combo) return;
    if (this.onPick) {
      this.done = true;
      this.onPick(this.mode === "menu" ? this.combo.slice(MENU.length) : this.combo);
      return;
    }
    if (!this.actions.length) await this.addAction();
    if (!this.actions.length) return;
    this.done = true;
    void this.deck.act(`bind ${q(this.combo)} ${q(this.actions.join("; "))}`);
  }

  private async addAction(): Promise<void> {
    const cmd = await this.deck.prompt(t("Then what? (a shell command)"), { placeholder: "open notes/ideas.md · launch todo · macro run ls" });
    if (cmd?.trim()) this.actions.push(cmd.trim());
    this.deck.requestFrame();
  }

  onKey(k: KeyInput): boolean {
    if (["ctrl", "alt", "shift", "meta", "control", "option", "command"].includes(k.key.toLowerCase())) return true; // wait for the real key
    if (k.combo === "esc") return (this.done = true), true;
    if (k.combo === "enter" && this.combo) return void this.ok(), true;
    if (this.mode === "menu") return (this.warn = t("one key: a letter, a digit, a sign")), true;
    const combo = normalizeCombo(k.combo);
    if (!combo) {
      this.warn = this.mode === "both" ? t("ctrl / alt / shift + a key — or one key alone: its key on THE MENU") : t("use a modifier: ctrl / alt / shift + a key");
      return true;
    }
    this.combo = combo;
    this.warn = this.conflict(combo);
    this.deck.sound.play("tick");
    return true;
  }
  onText(ch: string): boolean {
    // one key alone (a letter, a digit, a sign): its key on THE MENU
    if (this.mode === "combo" || [...ch].length !== 1 || ch === " ") return true;
    this.combo = `${MENU}${ch}`;
    this.warn = this.conflict(this.combo);
    this.deck.sound.play("tick");
    return true;
  }

  render(ui: UI, screen: Rect): void {
    const c = ui.c;
    ui.tint(screen, c.subtle);
    ui.hit(screen, { onClick: () => {}, onWheel: () => {}, block: true });
    const w = Math.min(60, screen.w - 4);
    const h = 12 + this.actions.length;
    const r = { x: screen.x + Math.floor((screen.w - w) / 2), y: screen.y + Math.floor((screen.h - h) / 3), w, h };
    const inner = ui.box(r, { title: t("SHORTCUT"), focused: true, bg: c.panel });
    let y = inner.y;
    ui.text(inner.x + 1, y, this.title, { fg: c.fg, bg: c.panel, attrs: BOLD }, inner.w - 2);
    y += 2;
    // the combo, big and centred (or the invitation, blinking)
    const invite = this.mode === "menu" ? t("press one key…") : t("press the keys…");
    const shown = this.combo ? displayKeys(this.combo) : Math.floor(ui.now / 500) % 2 ? invite : "";
    if (!this.combo) ui.animate(500);
    const kw = Math.max(18, strWidth(shown) + 4);
    const kx = inner.x + Math.floor((inner.w - kw) / 2);
    const keyBg = this.combo ? mix(c.accent, c.panel, 0.75) : c.highlight;
    ui.fill({ x: kx, y, w: kw, h: 1 }, { bg: keyBg });
    ui.textCenter({ x: kx, y, w: kw, h: 1 }, y, shown, { fg: this.combo ? c.fg : c.muted, bg: keyBg, attrs: BOLD });
    y += 1;
    if (this.warn) ui.textCenter(inner, y, this.warn, { fg: c.warning, bg: c.panel });
    y += 2;
    if (this.onPick) {
      // rebinding a deck shortcut: what it does is already known
      ui.text(inner.x + 1, y++, this.mode === "menu" ? t("⌘K, this key, enter: it runs") : t("one combo: it replaces this shortcut's keys"), { fg: c.subtle, bg: c.panel });
      y += this.actions.length + 2;
    } else {
    // what the key does, in order
    ui.text(inner.x + 1, y++, this.actions.length ? t("it will:") : t("it will: (OK asks what)"), { fg: c.subtle, bg: c.panel });
    this.actions.forEach((a, i) => {
      ui.text(inner.x + 2, y, `${i + 1}. ${a}`, { fg: c.fg, bg: c.panel }, inner.w - 7);
      if (this.actions.length > 1) {
        const xr = { x: inner.x + inner.w - 4, y, w: 3, h: 1 };
        ui.text(xr.x, y, " × ", { fg: ui.hovered(xr) ? c.error : c.subtle, bg: c.panel });
        ui.hit(xr, { onClick: () => void this.actions.splice(i, 1), tip: t("remove this action") });
      }
      y++;
    });
    ui.button(inner.x + 2, y, t("+ another action"), () => void this.addAction(), { tip: t("one key, several things, one after the other") });
    y += 2;
    }
    let bx = inner.x + inner.w - 2;
    const cancel = t("cancel  esc");
    bx -= strWidth(cancel) + 2;
    ui.button(bx, y, cancel, () => (this.done = true));
    const ok = t("OK  ⏎");
    bx -= strWidth(ok) + 4;
    ui.button(bx, y, ok, () => void this.ok(), { selected: !!this.combo, tip: this.combo ? `bind ${this.combo} …` : t("press the keys first") });
  }
}

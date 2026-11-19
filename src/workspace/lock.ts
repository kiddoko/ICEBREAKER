import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import type { KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { decrypt } from "../fx/glitch";
import { avatarOf, avatarRGB, drawAvatar } from "../core/avatar";
import type { UI } from "../ui/ui";

/**
 * The login screen. Nothing else is drawn or receives input while it's up
 * (the deck routes everything here). The password lives in memory only for
 * the time of the check, and is wiped right after.
 */
export class LockScreen {
  private user: string;
  private pass = "";
  private field: "user" | "pass" | "remember";
  /** fill in the account name next time (off by default: nothing is shown before you type it) */
  private remember: boolean;
  /** the account came remembered: then (only then) your icon shows before you log in */
  private readonly prefilled: boolean;
  private busy = false;
  private fails = 0;
  private error = "";
  private shownAt = 0;
  private shakeAt = -1e9;

  constructor(
    private readonly deck: Deck,
    account: string,
    private readonly onUnlock: () => void,
  ) {
    this.remember = deck.settings.data.user.rememberAccount === true;
    this.user = this.remember ? account : "";
    this.prefilled = !!this.user;
    this.field = this.user ? "pass" : "user";
  }

  onText(t: string): void {
    if (this.busy) return;
    const clean = t.replace(/[\r\n]+/g, "");
    if (this.field === "remember") {
      if (clean === " ") this.toggleRemember();
      return;
    }
    if (this.field === "user") this.user += clean;
    else this.pass += clean;
    this.error = "";
    if (/\n/.test(t)) void this.submit();
  }

  onKey(k: KeyInput): void {
    if (this.busy) return;
    switch (k.combo) {
      case "enter":
        if (this.field === "user" && !this.pass) this.field = "pass";
        else void this.submit();
        return;
      case "tab":
      case "down": {
        const order = ["user", "pass", "remember"] as const;
        this.field = order[(order.indexOf(this.field) + 1) % 3];
        this.deck.sound.play("move");
        return;
      }
      case "shift+tab":
      case "up": {
        const order = ["user", "pass", "remember"] as const;
        this.field = order[(order.indexOf(this.field) + 2) % 3];
        this.deck.sound.play("move");
        return;
      }
      case "backspace":
        if (this.field === "user") this.user = this.user.slice(0, -1);
        else if (this.field === "pass") this.pass = this.pass.slice(0, -1);
        return;
      case "ctrl+u":
      case "esc":
        if (this.field === "pass") this.pass = "";
        else if (this.field === "user") this.user = "";
        return;
    }
  }

  private toggleRemember(): void {
    this.remember = !this.remember;
    this.deck.sound.play("move");
  }

  private async submit(): Promise<void> {
    if (!this.pass) {
      this.field = "pass";
      return;
    }
    this.busy = true;
    this.deck.requestFrame();
    let ok = false;
    try {
      ok = await this.deck.platform.account.verify(this.user, this.pass);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
    this.pass = ""; // never keep it around
    this.busy = false;
    if (ok) {
      // the choice sticks only once the login worked
      if (this.remember !== (this.deck.settings.data.user.rememberAccount === true)) this.deck.settings.set("user.rememberAccount", this.remember);
      this.deck.sound.play("unlock");
      this.onUnlock();
    } else {
      this.fails++;
      this.shakeAt = performance.now();
      this.deck.sound.play("denied");
      if (!this.error) this.error = `access denied${this.fails > 1 ? ` ×${this.fails}` : ""}`;
    }
    this.deck.requestFrame();
  }

  render(ui: UI): void {
    const c = ui.c;
    const W = ui.cols, H = ui.rows;
    if (!this.shownAt) this.shownAt = ui.now;
    ui.fill({ x: 0, y: 0, w: W, h: H }, { bg: c.bg });
    ui.hit({ x: 0, y: 0, w: W, h: H }, { onClick: () => {}, onWheel: () => {}, block: true });

    // a centred card: the title, then (if the account is remembered) your icon, the
    // two fields with their labels above them, remember me, the button
    const w = Math.min(44, W - 4);
    const shake = performance.now() - this.shakeAt < 300 ? Math.round(Math.sin((performance.now() - this.shakeAt) / 25) * 2) : 0;
    if (shake) ui.animate(16);
    const showIcon = this.prefilled && H >= 28;
    const cardH = 13 + (showIcon ? 4 : 0);
    const x = Math.floor((W - w) / 2) + shake;
    let y = Math.max(1, Math.floor((H - cardH - 4) / 2));
    const p = Math.min(1, (ui.now - this.shownAt) / 600);
    if (p < 1) ui.animate(30);

    const mark = ui.theme.glyphs.mark;
    ui.gradientText(Math.floor((W - 12) / 2), y, `${mark} ICEBREAKER`, ui.theme.gradient, BOLD, (ui.now / 8000) % 1);
    ui.animate(200);
    y += 2;
    const title = "deck locked · authenticate";
    ui.textCenter({ x: 0, y, w: W, h: 1 }, y, p < 1 ? decrypt(title, p, ui.now) : title, { fg: c.muted });
    y += 2;
    const card = ui.box({ x, y, w, h: cardH }, { title: "ACCESS", focused: true, bg: c.panel });
    const ix = card.x + 2, iw = card.w - 4;
    let cy = card.y;
    if (showIcon) {
      const av = this.deck.settings.data.user.avatar;
      drawAvatar(ui, { x: card.x, y: cy, w: card.w, h: 3 }, avatarOf(av?.id), avatarRGB(ui, av?.color), { dim: p < 1, bg: c.panel });
      cy += 4;
    }
    this.input(ui, { x: ix, y: cy, w: iw, h: 2 }, "ACCOUNT", this.user, false, this.field === "user", () => (this.field = "user"));
    cy += 3;
    this.input(ui, { x: ix, y: cy, w: iw, h: 2 }, "PASSWORD", this.pass, true, this.field === "pass", () => (this.field = "pass"));
    cy += 3;
    {
      const on = this.field === "remember";
      const label = `${this.remember ? "[■]" : "[ ]"} remember me`;
      ui.text(ix, cy, label, { fg: on ? c.accent : this.remember ? c.fg : c.subtle, bg: c.panel, attrs: on ? BOLD : 0 });
      if (on) ui.text(ix + label.length + 2, cy, "space", { fg: c.faint, bg: c.panel });
      ui.hit({ x: ix, y: cy, w: label.length, h: 1 }, { onClick: () => ((this.field = "remember"), this.toggleRemember()), tip: "fill in the account name next time" });
    }
    cy += 2;
    if (this.busy) ui.textCenter(card, cy, `${ui.spinner()} verifying…`, { fg: c.accent, bg: c.panel });
    else {
      const label = "jack in ⏎";
      ui.button(card.x + Math.floor((card.w - label.length - 2) / 2), cy, label, () => void this.submit());
    }
    y = card.y + card.h + 2;
    if (this.error) ui.textCenter({ x: 0, y, w: W, h: 1 }, y, `⚠ ${this.error}`, { fg: c.error });
    if (this.fails >= 5)
      ui.textCenter({ x: 0, y: y + 1, w: W, h: 1 }, y + 1, "forgot it? quit, delete account.json in the app's config folder (see README)", { fg: c.faint });
    ui.textCenter({ x: 0, y: H - 2, w: W, h: 1 }, H - 2, "tab switch field · enter unlock · ⌘Q / alt+F4 quit", { fg: c.faint });
  }

  /** A field: its label on one line, the box on the next. */
  private input(ui: UI, r: Rect, label: string, value: string, mask: boolean, focused: boolean, focus: () => void): void {
    const c = ui.c;
    ui.text(r.x, r.y, label, { fg: focused ? c.accent : c.subtle, bg: c.panel, attrs: focused ? BOLD : 0 });
    const fy = r.y + 1;
    const bg = focused ? mix(c.accent, c.bg, 0.82) : c.highlight;
    ui.fill({ x: r.x, y: fy, w: r.w, h: 1 }, { bg });
    const shown = mask ? "•".repeat(Math.min(value.length, r.w - 2)) : value;
    ui.text(r.x + 1, fy, shown, { fg: c.fg, bg }, r.w - 2);
    if (focused && !this.busy) ui.cursor(r.x + 1 + Math.min(shown.length, r.w - 2), fy);
    ui.hit({ x: r.x, y: r.y, w: r.w, h: 2 }, { onClick: focus });
  }

}

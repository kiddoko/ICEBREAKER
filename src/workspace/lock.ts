import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import type { KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { decrypt } from "../fx/glitch";
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

    const w = Math.min(44, W - 4);
    const shake = performance.now() - this.shakeAt < 300 ? Math.round(Math.sin((performance.now() - this.shakeAt) / 25) * 2) : 0;
    if (shake) ui.animate(16);
    const x = Math.floor((W - w) / 2) + shake;
    let y = Math.max(1, Math.floor(H / 2) - 6);
    const p = Math.min(1, (ui.now - this.shownAt) / 600);
    if (p < 1) ui.animate(30);

    const mark = ui.theme.glyphs.mark;
    ui.gradientText(Math.floor((W - 12) / 2), y, `${mark} ICEBREAKER`, ui.theme.gradient, BOLD, (ui.now / 8000) % 1);
    ui.animate(200);
    y += 2;
    const title = "deck locked · authenticate";
    ui.textCenter({ x: 0, y, w: W, h: 1 }, y, p < 1 ? decrypt(title, p, ui.now) : title, { fg: c.muted });
    y += 2;

    this.input(ui, { x, y, w, h: 1 }, "account", this.user, false, this.field === "user", () => (this.field = "user"));
    y += 2;
    this.input(ui, { x, y, w, h: 1 }, "password", this.pass, true, this.field === "pass", () => (this.field = "pass"));
    y += 2;
    {
      const on = this.field === "remember";
      const label = `${this.remember ? "[■]" : "[ ]"} remember me`;
      ui.text(x + 10, y, label, { fg: on ? c.accent : this.remember ? c.fg : c.subtle, attrs: on ? BOLD : 0 });
      if (on) ui.text(x + 10 + label.length + 2, y, "space", { fg: c.faint });
      ui.hit({ x: x + 10, y, w: label.length, h: 1 }, { onClick: () => ((this.field = "remember"), this.toggleRemember()), tip: "fill in the account name next time" });
    }
    y += 2;

    if (this.busy) ui.textCenter({ x: 0, y, w: W, h: 1 }, y, `${ui.spinner()} verifying…`, { fg: c.accent });
    else {
      const label = " jack in ⏎ ";
      const bx = Math.floor((W - label.length) / 2);
      ui.button(bx, y, label.trim(), () => void this.submit());
    }
    y += 2;
    if (this.error) ui.textCenter({ x: 0, y, w: W, h: 1 }, y, `⚠ ${this.error}`, { fg: c.error });
    if (this.fails >= 5)
      ui.textCenter({ x: 0, y: y + 1, w: W, h: 1 }, y + 1, "forgot it? quit, delete account.json in the app's config folder (see README)", { fg: c.faint });
    ui.textCenter({ x: 0, y: H - 2, w: W, h: 1 }, H - 2, "tab switch field · enter unlock · ⌘Q / alt+F4 quit", { fg: c.faint });
  }

  private input(ui: UI, r: Rect, label: string, value: string, mask: boolean, focused: boolean, focus: () => void): void {
    const c = ui.c;
    ui.text(r.x, r.y, label.padEnd(9), { fg: focused ? c.accent : c.subtle, attrs: focused ? BOLD : 0 });
    const fx = r.x + 10, fw = r.w - 10;
    const bg = focused ? mix(c.accent, c.bg, 0.88) : c.panel;
    ui.fill({ x: fx, y: r.y, w: fw, h: 1 }, { bg });
    const shown = mask ? "•".repeat(Math.min(value.length, fw - 2)) : value;
    ui.text(fx + 1, r.y, shown, { fg: c.fg, bg }, fw - 2);
    ui.hline(fx, r.y + 1, fw, { fg: focused ? c.accent : c.faint }, "─");
    if (focused && !this.busy) ui.cursor(fx + 1 + Math.min(shown.length, fw - 2), r.y);
    ui.hit({ x: r.x, y: r.y, w: r.w, h: 1 }, { onClick: focus });
  }
}

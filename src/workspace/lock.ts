import { mix } from "../core/color";
import { BOLD, type Rect } from "../core/grid";
import type { KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { decrypt } from "../fx/glitch";
import { avatarOf, avatarRGB, drawAvatar } from "../core/avatar";
import { lookKey, writeDevice, type DeviceInfo } from "../core/device";
import type { UI } from "../ui/ui";

/**
 * THE LOGIN PAGE — the only way into the deck, and the only place accounts are
 * made. Each account is someone's own deck: its settings, its theme, its vault.
 * Nothing else is drawn or loaded while it's up (no vault, no module).
 *
 *   log in           name + password → the deck starts again as that account
 *   + new account    an account of this deck approves it (name + password: every
 *                    account runs as the same computer user, so a new one could
 *                    otherwise open a terminal on a locked deck), then the new
 *                    name and password → the setup runs for it
 *   first account    no account yet: make yours (a deck used without a login
 *                    keeps its settings and its vault — they become yours)
 *
 * Passwords live in memory only for the time of the check, and are wiped right after.
 */
type Mode = "login" | "approve" | "new";
type Field = "user" | "pass" | "pass2" | "remember";

export class LockScreen {
  private mode: Mode;
  private v: Record<"user" | "pass" | "pass2", string> = { user: "", pass: "", pass2: "" };
  private field: Field;
  private remember: boolean;
  /** who approves the new account (kept until it's made, then wiped) */
  private approver = { user: "", pass: "" };
  private busy = false;
  private fails = 0;
  private error = "";
  private shownAt = 0;
  private shakeAt = -1e9;
  /** the password was right: your icon shows for a moment, then the deck starts as you */
  private granted: { at: number; user: string } | null = null;

  constructor(
    private readonly deck: Deck,
    private readonly device: DeviceInfo,
    /** how many accounts exist (0: the first one is made here) */
    private readonly count: number,
    private readonly onUnlock: () => void,
  ) {
    this.remember = device.remember;
    this.mode = count === 0 ? "new" : "login";
    this.v.user = this.mode === "login" && device.remember ? device.last : "";
    this.field = this.v.user ? "pass" : "user";
  }

  private get first(): boolean {
    return this.count === 0;
  }

  /** the fields of this mode, in tab order */
  private get order(): Field[] {
    if (this.mode === "new") return ["user", "pass", "pass2"];
    if (this.mode === "approve") return ["user", "pass"];
    return ["user", "pass", "remember"];
  }

  private setMode(m: Mode): void {
    this.mode = m;
    this.v = { user: "", pass: "", pass2: "" };
    if (m === "login") this.approver = { user: "", pass: "" };
    this.field = "user";
    this.error = "";
    this.shownAt = 0;
    this.deck.sound.play("move");
  }

  onText(t: string): void {
    if (this.busy || this.granted) return;
    const clean = t.replace(/[\r\n]+/g, "");
    if (this.field === "remember") {
      if (clean === " ") this.toggleRemember();
      return;
    }
    this.v[this.field] += clean;
    this.error = "";
    if (/\n/.test(t)) void this.submit();
  }

  onKey(k: KeyInput): void {
    if (this.busy || this.granted) return;
    const order = this.order;
    switch (k.combo) {
      case "enter": {
        // enter moves to the next empty field, then submits
        const next = order.find((f) => f !== "remember" && !this.v[f as "user"]);
        if (next && next !== this.field) this.field = next;
        else void this.submit();
        return;
      }
      case "tab":
      case "down":
      case "shift+tab":
      case "up": {
        const dir = k.combo === "tab" || k.combo === "down" ? 1 : order.length - 1;
        this.field = order[(Math.max(0, order.indexOf(this.field)) + dir) % order.length];
        this.deck.sound.play("move");
        return;
      }
      case "backspace":
        if (this.field !== "remember") this.v[this.field] = this.v[this.field].slice(0, -1);
        return;
      case "ctrl+u":
        if (this.field !== "remember") this.v[this.field] = "";
        return;
      case "esc":
        // back to logging in (making an account is cancelled); in a field: clear it
        if (this.mode !== "login" && !this.first) this.setMode("login");
        else if (this.field !== "remember") this.v[this.field] = "";
        return;
    }
  }

  private toggleRemember(): void {
    this.remember = !this.remember;
    this.deck.sound.play("move");
  }

  private wipe(): void {
    this.v.pass = "";
    this.v.pass2 = "";
  }

  private async submit(): Promise<void> {
    const { user, pass, pass2 } = this.v;
    if (!user.trim()) return void (this.field = "user");
    if (!pass) return void (this.field = "pass");
    if (this.mode === "approve") {
      // step 1 of a new account: remember who approves it (checked when it's made)
      this.approver = { user, pass };
      this.mode = "new";
      this.v = { user: "", pass: "", pass2: "" };
      this.field = "user";
      this.shownAt = 0;
      this.deck.sound.play("confirm");
      return;
    }
    if (this.mode === "new" && pass !== pass2) {
      this.error = pass2 ? "the two passwords differ" : "type the password again";
      this.field = "pass2";
      this.v.pass2 = "";
      return;
    }
    this.busy = true;
    this.deck.requestFrame();
    let ok = false;
    try {
      if (this.mode === "new") {
        await this.deck.platform.account.create(user, pass, this.approver.user || undefined, this.approver.pass || undefined);
        ok = true;
      } else ok = await this.deck.platform.account.verify(user, pass);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      // the approval was wrong: back to it
      if (/approve/i.test(this.error)) {
        const msg = this.error;
        this.setMode("approve");
        this.error = msg;
      }
    }
    this.wipe();
    this.approver.pass = "";
    this.busy = false;
    if (ok) {
      await writeDevice(this.deck.platform, (d) => {
        d.remember = this.remember;
        d.last = user.trim();
      });
      this.deck.sound.play("unlock");
      // only now — name AND password right — does the deck show who you are
      this.granted = { at: performance.now(), user: user.trim() };
      this.deck.requestFrame();
      setTimeout(() => this.onUnlock(), this.mode === "login" ? 900 : 300);
    } else if (this.mode === "login") {
      this.fails++;
      this.shakeAt = performance.now();
      this.deck.sound.play("denied");
      if (!this.error) this.error = `access denied${this.fails > 1 ? ` ×${this.fails}` : ""}`;
    } else {
      this.shakeAt = performance.now();
      this.deck.sound.play("error");
    }
    this.deck.requestFrame();
  }

  render(ui: UI): void {
    const c = ui.c;
    const W = ui.cols, H = ui.rows;
    if (!this.shownAt) this.shownAt = ui.now;
    ui.fill({ x: 0, y: 0, w: W, h: H }, { bg: c.bg });
    ui.hit({ x: 0, y: 0, w: W, h: H }, { onClick: () => {}, onWheel: () => {}, block: true });

    const w = Math.min(46, W - 4);
    const shake = performance.now() - this.shakeAt < 300 ? Math.round(Math.sin((performance.now() - this.shakeAt) / 25) * 2) : 0;
    if (shake) ui.animate(16);
    // room for an icon is always kept (the card doesn't jump); it shows only once
    // the name and the password were right (typing a name reveals nothing)
    const iconRoom = H >= 28 && this.mode === "login";
    const look = this.granted ? this.device.look[lookKey(this.granted.user)] : undefined;
    const fields = this.order.filter((f) => f !== "remember");
    const cardH = 5 + fields.length * 3 + (this.mode === "login" ? 2 : 1) + (iconRoom ? 4 : 0) + (this.mode !== "login" ? 2 : 0);
    const x = Math.floor((W - w) / 2) + shake;
    let y = Math.max(1, Math.floor((H - cardH - 6) / 2));
    const p = Math.min(1, (ui.now - this.shownAt) / 600);
    if (p < 1) ui.animate(30);

    const mark = ui.theme.glyphs.mark;
    ui.gradientText(Math.floor((W - 12) / 2), y, `${mark} ICEBREAKER`, ui.theme.gradient, BOLD, (ui.now / 8000) % 1);
    ui.animate(200);
    y += 2;
    const title = this.first ? "first start · make your account" : this.mode === "login" ? "deck locked · authenticate" : this.mode === "approve" ? "new account · step 1 of 2" : "new account · step 2 of 2";
    ui.textCenter({ x: 0, y, w: W, h: 1 }, y, p < 1 ? decrypt(title, p, ui.now) : title, { fg: c.muted });
    y += 2;
    const boxTitle = this.first ? "FIRST ACCOUNT" : this.mode === "login" ? "ACCESS" : "NEW ACCOUNT";
    const card = ui.box({ x, y, w, h: cardH }, { title: boxTitle, focused: true, bg: c.panel });
    const ix = card.x + 2, iw = card.w - 4;
    let cy = card.y;
    if (iconRoom) {
      if (this.granted && look?.avatar) {
        drawAvatar(ui, { x: card.x, y: cy, w: card.w, h: 3 }, avatarOf(look.avatar.id), avatarRGB(ui, look.avatar.color), { dim: performance.now() - this.granted.at < 200, bg: c.panel });
        ui.animate(16);
      } else if (this.granted) ui.textCenter(card, cy + 1, "✓", { fg: c.success, bg: c.panel, attrs: BOLD });
      else ui.textCenter(card, cy + 1, "· · ·", { fg: c.faint, bg: c.panel });
      cy += 4;
    }
    // what this step is for, in one line
    if (this.mode !== "login") {
      const why = this.first
        ? "your settings, your theme, your vault — behind a password"
        : this.mode === "approve"
          ? "an account of this deck approves the new one"
          : "the new account: its own settings and vault";
      ui.text(ix, cy, why, { fg: c.subtle, bg: c.panel }, iw);
      cy += 2;
    }
    const labels: Record<string, string> = {
      user: this.mode === "new" ? "NEW ACCOUNT NAME" : this.mode === "approve" ? "AN ACCOUNT OF THIS DECK" : "ACCOUNT",
      pass: this.mode === "new" ? "ITS PASSWORD (8+ characters)" : "PASSWORD",
      pass2: "THE PASSWORD AGAIN",
    };
    for (const f of fields) {
      this.input(ui, { x: ix, y: cy, w: iw, h: 2 }, labels[f], this.v[f as "user"], f !== "user", this.field === f, () => (this.field = f));
      cy += 3;
    }
    if (this.mode === "login") {
      const on = this.field === "remember";
      const label = `${this.remember ? "[■]" : "[ ]"} remember me`;
      ui.text(ix, cy, label, { fg: on ? c.accent : this.remember ? c.fg : c.subtle, bg: c.panel, attrs: on ? BOLD : 0 });
      if (on) ui.text(ix + label.length + 2, cy, "space", { fg: c.faint, bg: c.panel });
      ui.hit({ x: ix, y: cy, w: label.length, h: 1 }, { onClick: () => ((this.field = "remember"), this.toggleRemember()), tip: "fill in the account name next time" });
      cy += 2;
    }
    if (this.granted) ui.textCenter(card, cy, `access granted · welcome, ${this.granted.user}`, { fg: c.success, bg: c.panel, attrs: BOLD });
    else if (this.busy) ui.textCenter(card, cy, `${ui.spinner()} ${this.mode === "new" ? "making the account…" : "verifying…"}`, { fg: c.accent, bg: c.panel });
    else {
      const label = this.mode === "login" ? "jack in ⏎" : this.mode === "approve" ? "continue ⏎" : "create ⏎";
      ui.button(card.x + Math.floor((card.w - label.length - 2) / 2), cy, label, () => void this.submit());
    }
    // under the card: make an account / go back
    if (!this.first) {
      const label = this.mode === "login" ? "+ new account" : "‹ back to the login";
      const ly = card.y + card.h + 1;
      const lx = Math.floor((W - label.length) / 2);
      const hot = ui.hovered({ x: lx, y: ly, w: label.length, h: 1 });
      ui.text(lx, ly, label, { fg: hot ? c.accent : c.subtle, attrs: hot ? BOLD : 0 });
      ui.hit({ x: lx, y: ly, w: label.length, h: 1 }, { onClick: () => this.setMode(this.mode === "login" ? "approve" : "login"), tip: this.mode === "login" ? "an account of its own: settings, theme, vault" : "esc" });
    }
    y = card.y + card.h + 3;
    if (this.error) ui.textCenter({ x: 0, y, w: W, h: 1 }, y, `⚠ ${this.error}`, { fg: c.error });
    if (this.fails >= 5 && this.mode === "login")
      ui.textCenter({ x: 0, y: y + 1, w: W, h: 1 }, y + 1, "forgot it? quit, and remove that account from accounts.json in the app's config folder (see README)", { fg: c.faint });
    const keys = this.mode === "login" ? "tab next field · enter unlock · ⌘Q / alt+F4 quit" : this.first ? "tab next field · enter create" : "tab next field · enter next · esc back";
    ui.textCenter({ x: 0, y: H - 2, w: W, h: 1 }, H - 2, keys, { fg: c.faint });
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

import { Field } from "../ui/field";
import { strWidth, wrapWords } from "../core/unicode";
import { checkbox } from "../ui/controls";
import { BOLD, type Rect } from "../core/grid";
import { IS_MAC, type KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { decrypt } from "../fx/glitch";
import { avatarOf, avatarRGB, drawAvatar } from "../core/avatar";
import { lookKey, writeDevice, type DeviceInfo } from "../core/device";
import type { UI } from "../ui/ui";
import { FileBrowser } from "./filebrowser";

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
 *   first account    no account yet: make yours
 *   forgot password  an encrypted vault's recovery key (24 words) sets a new
 *                    password for the account and its vault (desktop only)
 *   open a vault     a vault from another computer or a USB key, plain or
 *                    encrypted: its account's name + password (or its 24 words)
 *                    → that account on this computer, its settings with it
 *                    (approved by an account of this deck, like a new account)
 *
 * Passwords live in memory only for the time of the check, and are wiped right after.
 */
type Mode = "login" | "approve" | "new" | "recover" | "open";
type FieldName = "path" | "user" | "words" | "pass" | "pass2" | "remember";
type TextField = Exclude<FieldName, "remember">;

export class LockScreen {
  private mode: Mode;
  /** the fields (ui/field.ts): the passwords masked */
  private readonly fields: Record<TextField, Field> = {
    path: new Field(),
    user: new Field(),
    words: new Field(),
    pass: new Field({ mask: true }),
    pass2: new Field({ mask: true }),
  };
  private val(f: TextField): string {
    return this.fields[f].text;
  }
  private put(f: TextField, s: string): void {
    this.fields[f].text = s;
  }
  /** what's typed, all fields (kept while an account approves a vault from elsewhere) */
  private values(): Record<TextField, string> {
    return { path: this.val("path"), user: this.val("user"), words: this.val("words"), pass: this.val("pass"), pass2: this.val("pass2") };
  }
  private load(v: Partial<Record<TextField, string>>): void {
    for (const f of Object.keys(this.fields) as TextField[]) this.put(f, v[f] ?? "");
  }
  /** an empty field of this mode, else null */
  private firstEmpty(skip: Field[] = []): TextField | undefined {
    return this.order.find((f) => f !== "remember" && !this.val(f as TextField) && !skip.includes(this.fields[f as TextField])) as TextField | undefined;
  }
  /** forgot password for a vault from elsewhere (open a vault → forgot password?): its folder is asked too */
  private withPath = false;
  /** the file browser choosing the vault's folder (drawn on top of the login page) */
  private browser: FileBrowser | null = null;
  /** open a vault / recover one: what was typed, kept while an account of this deck approves it */
  private pending: { mode: Mode; v: Record<TextField, string>; withPath: boolean } | null = null;
  private field: FieldName;
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
    this.put("user", this.mode === "login" && device.remember ? device.last : "");
    this.field = this.val("user") ? "pass" : "user";
  }

  private get first(): boolean {
    return this.count === 0;
  }

  /** the fields of this mode, in tab order */
  private get order(): FieldName[] {
    if (this.mode === "new") return ["user", "pass", "pass2"];
    if (this.mode === "recover") return this.withPath ? ["path", "user", "words", "pass", "pass2"] : ["user", "words", "pass", "pass2"];
    if (this.mode === "open") return ["path", "user", "pass"];
    if (this.mode === "approve") return ["user", "pass"];
    return ["user", "pass", "remember"];
  }

  private setMode(m: Mode, keep: TextField[] = []): void {
    const old = this.values();
    this.mode = m;
    this.load(Object.fromEntries(keep.map((k) => [k, old[k]])));
    if (m === "login" || m === "new") this.approver = { user: "", pass: "" };
    if (m !== "recover") this.withPath = false;
    if (m === "login") this.pending = null;
    this.field = this.firstEmpty() ?? "user";
    this.error = "";
    this.shownAt = 0;
    this.deck.sound.play("move");
  }

  /** The vault's folder, chosen in the deck's own file browser instead of typed. */
  private browse(): void {
    if (!this.deck.platform.files) return;
    this.browser = new FileBrowser(this.deck, {
      source: "computer",
      title: "THE VAULT'S FOLDER",
      start: this.val("path").trim() || undefined,
      pickDir: (p) => {
        this.browser = null;
        if (p) {
          this.put("path", p);
          this.field = this.firstEmpty([this.fields.path]) ?? "user";
        }
        this.deck.requestFrame();
      },
    });
  }

  onText(t: string): void {
    if (this.browser) return void this.browser.onText(t);
    if (this.busy || this.granted) return;
    if (this.field === "remember") {
      if (t === " ") this.toggleRemember();
      return;
    }
    // (a paste on several lines — the recovery key — becomes one line, words apart)
    this.fields[this.field].onText(t);
    this.error = "";
  }

  onKey(k: KeyInput): void {
    if (this.browser) {
      this.browser.onKey(k);
      if (this.browser?.done) this.browser = null;
      return;
    }
    if (this.busy || this.granted) return;
    // ctrl+o (or enter on an empty folder field): the file browser
    if (this.field === "path" && (k.combo === "ctrl+o" || k.combo === "cmd+o" || (k.combo === "enter" && !this.val("path").trim()))) return this.browse();
    const order = this.order;
    switch (k.combo) {
      case "enter": {
        // enter moves to the next empty field, then submits
        const next = this.firstEmpty();
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
      case "esc":
        // back to logging in (making an account is cancelled); in a field: clear it
        if (this.first && (this.mode === "open" || this.mode === "recover")) this.setMode("new");
        else if (this.mode !== "login" && !this.first) this.setMode("login");
        else if (this.field !== "remember") this.fields[this.field].clear();
        return;
    }
    // the rest: the field's own keys (⌫, ←→, ⌘V, ctrl+U…)
    if (this.field !== "remember") this.fields[this.field].onKey(k);
  }

  private toggleRemember(): void {
    this.remember = !this.remember;
    this.deck.sound.play("move");
  }

  private wipe(): void {
    this.put("pass", "");
    this.put("pass2", "");
    this.put("words", "");
  }

  /** "open a vault" is there only where the native side can read one */
  private get canOpen(): boolean {
    return !!this.deck.platform.account.openVault;
  }

  /** "forgot password" is there only where the native side can use a recovery key */
  private get canRecover(): boolean {
    return !!this.deck.platform.account.recover;
  }

  private async submit(): Promise<void> {
    const { path, user, words, pass, pass2 } = this.values();
    if ((this.mode === "open" || (this.mode === "recover" && this.withPath)) && !path.trim()) return void (this.field = "path");
    if (!user.trim()) return void (this.field = "user");
    if (this.mode === "recover" && !words.trim()) return void (this.field = "words");
    if (!pass) return void (this.field = "pass");
    if (this.mode === "approve" && this.pending) {
      // a vault from elsewhere, approved: back to it, and on
      this.approver = { user, pass };
      this.mode = this.pending.mode;
      this.withPath = this.pending.withPath;
      this.load(this.pending.v);
      this.pending = null;
      this.shownAt = 0;
      return void this.submit();
    }
    if (this.mode === "approve") {
      // step 1 of a new account: remember who approves it (checked when it's made)
      this.approver = { user, pass };
      this.mode = "new";
      this.load({});
      this.field = "user";
      this.shownAt = 0;
      this.deck.sound.play("confirm");
      return;
    }
    if ((this.mode === "new" || this.mode === "recover") && pass !== pass2) {
      this.error = pass2 ? "the two passwords differ" : "type the password again";
      this.field = "pass2";
      this.put("pass2", "");
      return;
    }
    this.busy = true;
    this.deck.requestFrame();
    let ok = false;
    try {
      if (this.mode === "new") {
        await this.deck.platform.account.create(user, pass, this.approver.user || undefined, this.approver.pass || undefined);
        ok = true;
      } else if (this.mode === "recover") {
        await this.deck.platform.account.recover!(user, words, pass, this.withPath ? path : undefined, this.approver.user || undefined, this.approver.pass || undefined);
        ok = true;
      } else if (this.mode === "open") {
        await this.deck.platform.account.openVault!(path, user, pass, this.approver.user || undefined, this.approver.pass || undefined);
        ok = true;
      } else ok = await this.deck.platform.account.verify(user, pass);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      // a vault from elsewhere needs an account of this deck to approve it: ask, then go on
      if (/approve/i.test(this.error) && (this.mode === "open" || this.mode === "recover")) {
        const msg = this.error;
        this.pending = { mode: this.mode, v: this.values(), withPath: this.withPath };
        this.mode = "approve";
        this.load({});
        this.field = "user";
        this.shownAt = 0;
        this.error = msg;
        this.busy = false;
        this.approver = { user: "", pass: "" };
        this.deck.requestFrame();
        return;
      }
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
    // what this step is for (the card's first lines, wrapped to its inner width)
    const why = this.mode === "login" ? "" : this.mode === "open"
      ? "its account's name and password"
      : this.mode === "recover"
        ? "your vault's 24 words set a new password"
        : this.first
          ? "your settings, your theme, your vault — behind a password"
          : this.mode === "approve"
            ? "an account of this deck approves the new one"
            : "the new account: its own settings and vault";
    const whyLines = why ? wrapWords(why, w - 4) : [];
    const cardH = 5 + fields.length * 3 + (this.mode === "login" ? 2 : 1) + (iconRoom ? 4 : 0) + (whyLines.length ? whyLines.length + 1 : 0);
    const x = Math.floor((W - w) / 2) + shake;
    let y = Math.max(1, Math.floor((H - cardH - 6) / 2));
    const p = Math.min(1, (ui.now - this.shownAt) / 600);
    if (p < 1) ui.animate(30);

    const mark = ui.theme.glyphs.mark;
    ui.gradientText(Math.floor((W - 12) / 2), y, `${mark} ICEBREAKER`, ui.theme.gradient, BOLD, (ui.now / 8000) % 1);
    ui.animate(200);
    y += 2;
    const title = this.first
      ? "first start · make your account"
      : this.mode === "login"
        ? "deck locked · authenticate"
        : this.mode === "recover"
          ? "forgot password · recovery key"
          : this.mode === "open"
            ? "open a vault · a USB key, another computer"
            : this.mode === "approve" && this.pending
              ? "a vault from elsewhere · approve it"
              : this.mode === "approve"
            ? "new account · step 1 of 2"
            : "new account · step 2 of 2";
    ui.textCenter({ x: 0, y, w: W, h: 1 }, y, p < 1 ? decrypt(title, p, ui.now) : title, { fg: c.muted });
    y += 2;
    const boxTitle = this.mode === "open" ? "OPEN A VAULT" : this.mode === "recover" ? "RECOVERY" : this.first ? "FIRST ACCOUNT" : this.mode === "login" ? "ACCESS" : "NEW ACCOUNT";
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
    // what this step is for: wrapped, never cut (the card grew by its extra lines)
    for (const line of whyLines) ui.text(ix, cy++, line, { fg: c.subtle, bg: c.panel }, iw);
    if (whyLines.length) cy++;
    const labels: Record<string, string> = {
      path: "THE VAULT'S FOLDER (~/… or /Volumes/…)",
      user: this.mode === "new" ? "NEW ACCOUNT NAME" : this.mode === "approve" ? "AN ACCOUNT OF THIS DECK" : "ACCOUNT",
      words: "RECOVERY KEY (24 words)",
      pass: this.mode === "new" ? "ITS PASSWORD (8+ characters)" : this.mode === "recover" ? "NEW PASSWORD (8+ characters)" : "PASSWORD",
      pass2: "THE PASSWORD AGAIN",
    };
    for (const f of fields) {
      // the recovery key shows as you type it from the paper (its end, when it's longer than the box)
      // the vault's folder: typed, or chosen in the file browser (the button, ctrl+O, enter when empty)
      const browse = f === "path" && !!this.deck.platform.files;
      this.input(ui, { x: ix, y: cy, w: browse ? iw - 10 : iw, h: 2 }, labels[f], this.fields[f as TextField], this.field === f, () => (this.field = f));
      if (browse) ui.button(ix + iw - 9, cy + 1, "browse", () => this.browse(), { tip: "choose the folder · ctrl+O" });
      cy += 3;
    }
    if (this.mode === "login") {
      const on = this.field === "remember";
      const end = checkbox(ui, ix, cy, this.remember, { label: "remember me", hot: on, bg: c.panel, onClick: () => ((this.field = "remember"), this.toggleRemember()), tip: "fill in the account name next time" });
      if (on) ui.text(end + 2, cy, "space", { fg: c.faint, bg: c.panel });
      cy += 2;
    }
    if (this.granted) ui.textCenter(card, cy, `access granted · welcome, ${this.granted.user}`, { fg: c.success, bg: c.panel, attrs: BOLD });
    else if (this.busy) ui.textCenter(card, cy, `${ui.spinner()} ${this.mode === "new" ? "making the account…" : this.mode === "recover" ? "opening the vault…" : "verifying…"}`, { fg: c.accent, bg: c.panel });
    else {
      const label = this.mode === "login" || this.mode === "open" ? "jack in ⏎" : this.mode === "approve" ? "continue ⏎" : this.mode === "recover" ? "new password ⏎" : "create ⏎";
      ui.button(card.x + Math.floor((card.w - strWidth(label) - 2) / 2), cy, label, () => void this.submit());
    }
    // under the card: the other ways in / go back
    const back = () => this.setMode(this.first ? "new" : "login");
    const links: { label: string; tip: string; go: () => void; faint?: boolean }[] = [];
    if (this.mode === "login") {
      links.push({ label: "+ new account", tip: "an account of its own: settings, theme, vault", go: () => this.setMode("approve") });
      if (this.canOpen) links.push({ label: "open a vault", tip: "from a USB key or another computer, plain or encrypted: its name and password", go: () => this.setMode("open") });
      if (this.canRecover) links.push({ label: "forgot password?", tip: "with your encrypted vault's recovery key (24 words)", go: () => this.setMode("recover"), faint: true });
    } else if (this.mode === "open") {
      if (this.canRecover) links.push({ label: "forgot its password? (recovery key)", tip: "an encrypted vault's 24 words set a new password", go: () => {
        this.withPath = true; // kept by setMode("recover"): the folder is asked (and kept) too
        this.setMode("recover", ["path", "user"]);
      } });
      links.push({ label: this.first ? "‹ make a new account instead" : "‹ back to the login", tip: "esc", go: back });
    } else if (this.first && this.mode === "new") {
      if (this.canOpen) links.push({ label: "or open a vault you already have", tip: "from a USB key or another computer: its name and password", go: () => this.setMode("open") });
    } else links.push({ label: this.first ? "‹ make a new account instead" : "‹ back to the login", tip: "esc", go: back });
    let ly = card.y + card.h + 1;
    for (const l of links) {
      const lx = Math.floor((W - strWidth(l.label)) / 2);
      const hot = ui.hovered({ x: lx, y: ly, w: strWidth(l.label), h: 1 });
      ui.text(lx, ly, l.label, { fg: hot ? c.accent : l.faint ? c.faint : c.subtle, attrs: hot ? BOLD : 0 });
      ui.hit({ x: lx, y: ly, w: strWidth(l.label), h: 1 }, { onClick: l.go, tip: l.tip });
      ly++;
    }
    y = ly + 1;
    if (this.error) ui.textCenter({ x: 0, y, w: W, h: 1 }, y, `⚠ ${this.error}`, { fg: c.error });
    if (this.fails >= 5 && this.mode === "login")
      ui.textCenter({ x: 0, y: y + 1, w: W, h: 1 }, y + 1, "forgot it? forgot password? (an encrypted vault's recovery key) — or remove that account from accounts.json (see README)", { fg: c.faint });
    const keys = this.mode === "login" ? `tab next field · enter unlock · ${IS_MAC ? "⌘Q" : "alt+F4"} quit` : this.first ? "tab next field · enter create" : "tab next field · enter next · esc back";
    ui.textCenter({ x: 0, y: H - 2, w: W, h: 1 }, H - 2, this.field === "path" ? `${keys} · ctrl+O browse` : keys, { fg: c.subtle });
    // always in sight, in both languages (nobody is logged in yet: no language to pick)
    ui.textCenter({ x: 0, y: H - 4, w: W, h: 1 }, H - 4, "⚠ test software, never audited · store nothing sensitive · back up your vault", { fg: c.warning });
    ui.textCenter({ x: 0, y: H - 3, w: W, h: 1 }, H - 3, "logiciel de test, jamais audité · n'y mets rien de sensible · sauvegarde ton vault", { fg: c.warning });
    // the file browser, over the login page
    if (this.browser) {
      this.browser.render(ui, { x: 0, y: 0, w: W, h: H });
      if (this.browser.done) this.browser = null;
    }
  }

  /** A field: its label on one line, the box on the next (the box: ui/field.ts). */
  private input(ui: UI, r: Rect, label: string, field: Field, focused: boolean, focus: () => void): void {
    const c = ui.c;
    ui.text(r.x, r.y, label, { fg: focused ? c.accent : c.subtle, bg: c.panel, attrs: focused ? BOLD : 0 });
    // (no caret while the file browser is open over it: its own field has it)
    field.render(ui, { x: r.x, y: r.y + 1, w: r.w, h: 1 }, { focused: focused && !this.busy && !this.browser, active: focused });
    ui.hit({ x: r.x, y: r.y, w: r.w, h: 2 }, { onClick: focus });
  }
}

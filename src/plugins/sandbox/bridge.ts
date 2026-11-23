import { NONE } from "../../core/color";
import type { Rect } from "../../core/grid";
import { rawPageKey, type Action, type KeyInput, type MouseInput } from "../../core/input";
import type { Deck } from "../../deck";
import type { App } from "../../apps/types";
import type { Command, ShellContext } from "../../shell/types";
import type { MenuEntry, UI } from "../../ui/ui";
import type { WidgetContext, WidgetSpec } from "../../widgets/types";
import type { IcebreakerAPI, PluginManifest, PluginModule } from "../api";
import { UNTOUCHED, type Frame, type FromModule, type MenuLine, type Target, type ToModule } from "./protocol";
import SandboxWorker from "./worker?worker&inline";

/**
 * THE SANDBOX, the deck's side (docs/SANDBOX.md). A module from the STORE or
 * the vault runs in its own Worker (sandbox/worker.ts); this is everything it
 * can reach: the very same `ib` the module would have had (its permissions,
 * the untrusted shell, the names it may not take), call by call, through a
 * fixed list of what may be called. Its pages and widgets are frames it draws
 * in its Worker, copied here; their clicks, keys and wheel go back as messages;
 * a command on one of its click areas runs as the module, never as you.
 *
 * The Worker is made from a blob, so the page's Content-Security-Policy is its
 * own; and it has no native bridge, no page, no network functions.
 */
export function sandboxed(deck: Deck, code: string, manifest: PluginManifest): PluginModule {
  let box: Sandbox | null = null;
  return {
    async activate(ib) {
      box = new Sandbox(deck, ib, manifest);
      await box.start(code);
    },
    async deactivate() {
      await box?.stop();
      box = null;
    },
  };
}

/** What the module may call on its `ib` (data in, data out). Everything else stays in its Worker or isn't there yet. */
const CALLS = new Set([
  "apps.open",
  "vault.read", "vault.exists", "vault.write", "vault.append", "vault.mkdir", "vault.modified", "vault.readBytes", "vault.writeBytes", "vault.list",
  "shell.run",
  "net.get",
  "ui.notify", "ui.alert", "ui.say", "ui.confirm", "ui.prompt", "ui.choose", "ui.pickFolder", "ui.pickFile",
  "storage.get", "storage.set",
  "settings.set",
  "stats.define", "stats.set", "stats.add", "stats.get", "stats.series", "stats.list", "stats.remove",
  "modules.call",
  "ai.ask",
  "media.status", "media.control", "media.player.scan", "media.player.load", "media.player.control", "media.player.status",
  "google.status", "google.connect", "google.disconnect", "google.calendar", "google.cache.read", "google.cache.write",
  "audio.now", "audio.sample", "audio.drop", "audio.schedule", "audio.stop", "audio.decode", "audio.encode", "audio.encoders",
]);

/** What goes back to the module: data only — JSON's, plus bytes and sound (typed arrays, ArrayBuffers) as they are. */
function toData(v: unknown): unknown {
  if (v === undefined) return undefined;
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return v;
  if (Array.isArray(v)) return v.map((x) => toData(x) ?? null);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype)
    return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && typeof x !== "function").map(([k, x]) => [k, toData(x)]));
  return JSON.parse(JSON.stringify(v) ?? "null");
}

/** keys a page of the module never takes: the deck's own (shortcuts, esc, tab, F-keys) */
function deckKey(k: KeyInput): boolean {
  return k.ctrl || k.meta || k.key === "esc" || k.key === "tab" || /^f\d+$/.test(k.key);
}

const plainMouse = (m: MouseInput | undefined, r: Rect) => (m ? { ...m, x: m.x - r.x, y: m.y - r.y, fx: m.fx !== undefined ? m.fx - r.x : undefined } : undefined);
/** a key event as data (the deck's KeyInput is already plain) */
const plainKey = (k: KeyInput) => ({ ...k });

class Sandbox {
  private readonly worker: Worker;
  private readonly frames = new Map<string, Frame>();
  private readonly titles = new Map<string, { title?: string; status?: string }>();
  private sessions = new Map<number, ShellContext & { done: (code: number) => void }>();
  private sid = 0;
  private menuRid = 0;
  private menus = new Map<number, { r: Rect; x: number; y: number }>();
  private nextInst = 0;
  private sentTheme: unknown = null;
  private notesKey = "";
  private ready: { ok: () => void; no: (e: Error) => void } | null = null;
  private logged = 0;

  constructor(
    private readonly deck: Deck,
    private readonly ib: IcebreakerAPI,
    private readonly manifest: PluginManifest,
  ) {
    this.worker = new SandboxWorker();
    this.worker.onmessage = (ev: MessageEvent<FromModule>) => void this.receive(ev.data);
    this.worker.onerror = (ev) => {
      this.ready?.no(new Error(ev.message || "the module's sandbox failed"));
      this.deck.log.add("error", `[${manifest.id}] ${ev.message}`);
    };
  }

  private send(m: ToModule): void {
    this.worker.postMessage(m);
  }

  start(code: string): Promise<void> {
    const notes = this.notes();
    // you silence it (`audio stop`, the ♪ in the status bar): it hears it, so its song stops too
    if ((this.manifest.permissions ?? []).includes("audio")) {
      try {
        this.ib.audio.onStop(() => this.send({ t: "audioStop" }));
      } catch {
        /* not granted: it has no sound to stop */
      }
    }
    this.sentTheme = this.deck.theme;
    this.send({ t: "load", code, manifest: JSON.parse(JSON.stringify(this.manifest)), version: this.ib.version, audio: this.ib.audio.available(), theme: JSON.parse(JSON.stringify(this.deck.theme)), notes: notes.notes, notesError: notes.error, settings: { ...((this.deck.settings.data.moduleSettings ?? {})[this.manifest.id] ?? {}) } });
    return new Promise((ok, no) => {
      this.ready = { ok, no };
      setTimeout(() => no(new Error("the module took more than 10 s to start")), 10_000);
    });
  }

  async stop(): Promise<void> {
    this.send({ t: "stop" });
    // its deactivate gets a moment, then the Worker goes, whatever it does
    await new Promise((r) => setTimeout(r, 200));
    this.worker.terminate();
    for (const finish of [...this.closeWaits.values()]) finish(true); // nobody left to say no
    for (const s of this.sessions.values()) s.done(130);
    this.sessions.clear();
  }

  /** the notes list, if the module may read the vault (ib.vault.notes is synchronous in the API) */
  private notes(): { notes: string[] | null; error: string } {
    try {
      return { notes: this.ib.vault.notes(), error: "" };
    } catch (e) {
      return { notes: null, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** before each frame: what the module reads synchronously, if it changed */
  private refresh(): void {
    if (this.deck.theme !== this.sentTheme) {
      this.sentTheme = this.deck.theme;
      this.send({ t: "theme", theme: JSON.parse(JSON.stringify(this.deck.theme)) });
    }
    const key = `${this.deck.vault.entries.length}|${this.deck.vault.root}`;
    if (key !== this.notesKey) {
      this.notesKey = key;
      const n = this.notes();
      this.send({ t: "notes", notes: n.notes, notesError: n.error });
    }
  }

  // ── messages from the module ────────────────────────────────────────────

  private async receive(m: FromModule): Promise<void> {
    switch (m.t) {
      case "ready": this.ready?.ok(); this.ready = null; return;
      case "closing": this.closeWaits.get(m.id)?.(m.ok !== false); return;
      case "failed": this.ready?.no(new Error(m.error)); this.ready = null; return;
      case "log":
        // a module can't flood the log (and the memory with it)
        if (++this.logged <= 200) this.deck.log.add("error", `[${this.manifest.id}] ${String(m.text).slice(0, 2000)}`);
        return;
      case "redraw": this.deck.requestFrame(); return;
      case "rpc": {
        const name = m.path.join(".");
        try {
          if (!CALLS.has(name)) throw new Error(`${name} isn't available to modules in the sandbox`);
          let fn: unknown = this.ib;
          let self: unknown = null;
          for (const p of m.path) {
            self = fn;
            fn = (fn as Record<string, unknown>)?.[p];
          }
          if (typeof fn !== "function") throw new Error(`${name} isn't a function`);
          let value = await (fn as (...a: unknown[]) => unknown).apply(self, m.args);
          // what isn't data (an app object…) doesn't cross
          if (name === "apps.open") value = !!value;
          this.send({ t: "rpc", id: m.id, ok: true, value: toData(value) });
        } catch (e) {
          this.send({ t: "rpc", id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }
      case "register": return this.register(m.what, m.spec);
      case "streamReq": {
        // its own audio node in the deck, and a port to it handed to its Worker (core/audiostream.ts):
        // only with the "audio" permission as it is NOW (asked through its own `ib`: one you took away
        // says so — the manifest alone kept it playing); what the port carries is checked by the node
        try {
          await this.ib.audio.now();
          this.deck.access.note(this.manifest.id, "audio", ""); // the access journal: it plays sound
          const port = await this.deck.mixer.openStream(this.manifest.id);
          this.worker.postMessage({ t: "stream", id: m.id, port } satisfies ToModule, [port]);
        } catch (e) {
          this.send({ t: "stream", id: m.id, error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }
      case "frame": {
        // a frame is cells for a rectangle: sizes that are numbers, arrays that hold them
        const cells = m.w * m.h;
        if (!Number.isInteger(m.w) || !Number.isInteger(m.h) || m.w < 1 || m.h < 1 || cells > 1_000_000 || !Array.isArray(m.hits) || m.hits.length > 5000) return;
        if (!m.same && !(m.ch instanceof Uint32Array && m.fg instanceof Int32Array && m.bg instanceof Int32Array && m.attr instanceof Uint8Array && m.ch.length >= cells && m.fg.length >= cells && m.bg.length >= cells && m.attr.length >= cells)) return;
        const before = this.frames.get(m.inst);
        if (m.same && before) this.frames.set(m.inst, { ...before, hits: m.hits, wake: m.wake, caret: m.caret });
        else this.frames.set(m.inst, m);
        this.titles.set(m.inst, { title: m.title, status: m.status });
        if (!m.same) this.deck.requestFrame();
        return;
      }
      case "out": {
        const s = this.sessions.get(m.sid);
        if (m.err) s?.err(m.text);
        else s?.out(m.text);
        return;
      }
      case "clear": this.sessions.get(m.sid)?.shell.clear(); return;
      case "read": {
        const s = this.sessions.get(m.sid);
        // what it asks in the shell says who is asking (it could ask "your password")
        const label = String(m.label ?? "");
        const value = s ? await s.read(label.startsWith("[") ? label : `[${this.manifest.id}] ${label}`, m.opts) : null;
        this.send({ t: "readReply", sid: m.sid, rid: m.rid, value });
        return;
      }
      case "done": {
        const s = this.sessions.get(m.sid);
        if (m.error) s?.err(`${this.manifest.id}: ${m.error}\n`);
        s?.done(m.code);
        this.sessions.delete(m.sid);
        return;
      }
      case "menu": {
        const at = this.menus.get(m.rid);
        this.menus.delete(m.rid);
        if (!at || !m.lines.length) return;
        this.deck.workspace.openMenu(this.menuOf(m.rid, m.lines), at.x, at.y);
        this.deck.requestFrame();
        return;
      }
    }
  }

  private menuOf(rid: number, lines: MenuLine[]): MenuEntry[] {
    return lines.map((l, i) =>
      l.sep ? "-" : { label: l.label, hint: l.hint, danger: l.danger, disabled: l.disabled, run: () => (l.cmd ? void this.ib.shell.run(l.cmd) : this.send({ t: "menuRun", rid, line: i })) },
    );
  }

  /** What the module registers goes through its real `ib` (every check of the deck applies). */
  private register(what: string, s: Record<string, unknown>): void {
    try {
      if (what === "command") {
        const name = String(s.name);
        const cmd: Command = {
          ...(s as unknown as Command),
          name,
          complete: Array.isArray(s.complete) ? () => s.complete as string[] : (s.complete as Command["complete"]),
          run: (ctx) => this.run(name, ctx),
        };
        this.ib.commands.register(cmd);
      } else if (what === "app") {
        const kind = String(s.kind);
        this.ib.apps.register({ kind, title: String(s.title ?? kind), description: s.description as string | undefined, icon: s.icon as string | undefined, launcher: s.launcher as boolean | undefined, rawKeys: s.rawKeys === true, create: (_d, args) => new ModuleApp(this, kind, args, s.rawKeys === true) });
      } else if (what === "action") {
        const id = String(s.id);
        this.ib.palette.register({ id, title: String(s.title ?? id), hint: s.hint as string | undefined, group: s.group as string | undefined, key: s.key as string | undefined, run: () => this.send({ t: "paletteRun", id }) });
      } else if (what === "widget") this.ib.widgets.register(this.widget(s));
    } catch (e) {
      this.deck.log.add("error", `[${this.manifest.id}] ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private widget(s: Record<string, unknown>): WidgetSpec {
    const id = String(s.id);
    const target = (popup: boolean, key?: string): Target => ({ kind: popup ? "popup" : "widget", id, key });
    const inst = (popup: boolean, key?: string) => `${popup ? "p" : "w"}:${id}:${key ?? ""}`;
    const popup = s.popup as (Record<string, unknown> & { hasKeys?: boolean; hasText?: boolean; hasAction?: boolean }) | undefined;
    return {
      id,
      title: String(s.title ?? id),
      description: s.description as string | undefined,
      size: (s.size as { w: number; h: number }) ?? { w: 3, h: 2 },
      min: s.min as { w: number; h: number } | undefined,
      max: s.max as { w: number; h: number } | undefined,
      frameless: s.frameless as boolean | undefined,
      clickActivates: s.clickActivates as boolean | undefined,
      picker: s.picker as boolean | undefined,
      render: (ui, r, ctx) => this.draw(ui, r, inst(false, ctx.key), target(false, ctx.key), ctx.focused),
      onKey: s.hasKeys ? (k: KeyInput, ctx: WidgetContext) => (deckKey(k) ? false : (this.send({ t: "key", inst: inst(false, ctx.key), target: target(false, ctx.key), k: plainKey(k) }), true)) : undefined,
      activate: s.hasActivate ? (ctx: WidgetContext) => this.send({ t: "widgetActivate", id, key: ctx.key }) : undefined,
      popup: popup
        ? {
            title: popup.title as string | undefined,
            size: popup.size as { w: number; h: number } | undefined,
            hint: popup.hint as string | undefined,
            render: (ui, r, ctx) => this.draw(ui, r, inst(true, ctx.key), target(true, ctx.key), ctx.focused),
            onKey: popup.hasKeys ? (k, ctx) => (deckKey(k) ? false : (this.send({ t: "key", inst: inst(true, ctx.key), target: target(true, ctx.key), k: plainKey(k) }), true)) : undefined,
            onText: popup.hasText ? (t, ctx) => (this.send({ t: "text", inst: inst(true, ctx.key), target: target(true, ctx.key), text: t }), true) : undefined,
            onAction: popup.hasAction ? (a, ctx) => (a === "back" ? false : (this.send({ t: "action", inst: inst(true, ctx.key), target: target(true, ctx.key), a }), true)) : undefined,
          }
        : undefined,
    };
  }

  // ── its commands ───────────────────────────────────────────────────────

  private run(name: string, ctx: ShellContext): Promise<number> {
    const sid = ++this.sid;
    return new Promise((done) => {
      this.sessions.set(sid, Object.assign(Object.create(ctx) as ShellContext, { done }) as ShellContext & { done: (code: number) => void });
      ctx.signal.addEventListener("abort", () => this.send({ t: "abort", sid }));
      this.send({ t: "run", sid, name, args: ctx.args, stdin: ctx.stdin, isTTY: ctx.isTTY, cwd: ctx.cwd });
    });
  }

  // ── its frames ─────────────────────────────────────────────────────────

  newInst(): string {
    return `a:${++this.nextInst}`;
  }

  create(inst: string, kind: string, args?: unknown): void {
    this.send({ t: "create", inst, kind, args: args === undefined ? undefined : JSON.parse(JSON.stringify(args)) });
  }

  close(inst: string): void {
    this.send({ t: "close", inst });
    this.frames.delete(inst);
  }

  /**
   * Its tab is closing: the module's page answers (its close() can ask "save?" and say no).
   * A module that doesn't answer in 2 minutes (stuck, gone) lets it close.
   */
  askClose(inst: string): Promise<boolean> {
    const id = ++this.closeIds;
    return new Promise((done) => {
      const timer = setTimeout(() => finish(true), 120_000);
      const finish = (ok: boolean) => {
        clearTimeout(timer);
        this.closeWaits.delete(id);
        if (ok) this.frames.delete(inst);
        done(ok);
      };
      this.closeWaits.set(id, finish);
      this.send({ t: "closing", inst, id });
    });
  }
  private closeIds = 0;
  private closeWaits = new Map<number, (ok: boolean) => void>();

  title(inst: string): { title?: string; status?: string } {
    return this.titles.get(inst) ?? {};
  }

  send2(m: ToModule): void {
    this.send(m);
  }

  /**
   * Ask the module for this frame (it answers within a frame), and draw the
   * last one it sent: its cells over what's here, its click areas here.
   */
  draw(ui: UI, r: Rect, inst: string, target: Target, focused: boolean): void {
    this.refresh();
    this.send({ t: "render", inst, target, w: r.w, h: r.h, focused, mouse: { x: ui.mouse.x - r.x, y: ui.mouse.y - r.y }, now: ui.now });
    const f = this.frames.get(inst);
    if (!f) return void ui.text(r.x + 1, r.y, ui.spinner(), { fg: ui.c.muted });
    const g = ui.grid;
    if (f.ch && f.fg && f.bg && f.attr) {
      for (let y = 0; y < Math.min(f.h, r.h); y++) {
        for (let x = 0; x < Math.min(f.w, r.w); x++) {
          const gx = r.x + x, gy = r.y + y;
          if (!g.inClip(gx, gy)) continue;
          const i = y * f.w + x, j = gy * g.cols + gx;
          if (f.ch[i] !== UNTOUCHED) {
            g.ch[j] = f.ch[i];
            g.attr[j] = f.attr[i];
          }
          if (f.fg[i] !== NONE) g.fg[j] = f.fg[i];
          if (f.bg[i] !== NONE) g.bg[j] = f.bg[i];
        }
      }
    }
    for (const h of f.hits) {
      // its click areas stay inside its own rectangle (never over the deck's buttons)
      const hx = Math.max(0, Math.floor(Number(h.rect?.x) || 0)), hy = Math.max(0, Math.floor(Number(h.rect?.y) || 0));
      const rect = { x: hx + r.x, y: hy + r.y, w: Math.min(Math.floor(Number(h.rect?.w) || 0), r.w - hx), h: Math.min(Math.floor(Number(h.rect?.h) || 0), r.h - hy) };
      if (rect.w <= 0 || rect.h <= 0) continue;
      const send = (kind: "click" | "double" | "drag" | "up" | "right", m: MouseInput) => this.send({ t: "hit", inst, id: h.id, kind, m: JSON.parse(JSON.stringify(plainMouse(m, r) ?? {})) });
      ui.hit(rect, {
        // a command on the module's area runs as the module (untrusted), never as you
        onClick: h.cmd ? () => void this.ib.shell.run(h.cmd!) : h.click ? (m) => send("click", m) : undefined,
        onDouble: h.double ? (m) => send("double", m) : undefined,
        onDrag: h.drag ? (m) => send("drag", m) : undefined,
        onUp: h.up ? (m) => send("up", m) : undefined,
        onRight: h.right ? (m) => send("right", m) : undefined,
        onWheel: h.wheel ? (delta, m) => this.send({ t: "hit", inst, id: h.id, kind: "wheel", delta, m: JSON.parse(JSON.stringify(plainMouse(m, r) ?? {})) }) : undefined,
        menu: h.menu
          ? () => {
              const rid = ++this.menuRid;
              this.menus.set(rid, { r, x: ui.mouse.x, y: ui.mouse.y });
              this.send({ t: "menuReq", inst, id: h.id, rid });
              return []; // it opens when the module answers
            }
          : undefined,
        tip: h.cmd ? `${h.tip ?? ""}${h.tip ? "\n" : ""}${h.cmd}` : h.tip,
      });
    }
    if (Number.isFinite(f.wake)) ui.animate(f.wake);
    if (f.caret && focused) ui.cursor(f.caret.x + r.x, f.caret.y + r.y);
  }
}

/** One of the module's pages, as the deck sees it: its frames, its keys sent over. */
class ModuleApp implements App {
  readonly key: string;
  private readonly inst: string;

  constructor(
    private readonly box: Sandbox,
    readonly kind: string,
    args?: unknown,
    /** its page plays the keyboard (App.rawKeys) */
    readonly rawKeys = false,
  ) {
    this.key = kind;
    this.inst = box.newInst();
    box.create(this.inst, kind, args);
  }

  title(): string {
    return this.box.title(this.inst).title ?? this.kind;
  }
  status(): string {
    return this.box.title(this.inst).status ?? "";
  }
  render(ui: UI, r: Rect, focused: boolean): void {
    this.box.draw(ui, r, this.inst, { kind: "app" }, focused);
  }
  onKey(k: KeyInput): boolean {
    // a page that plays the keyboard (App.rawKeys) keeps some of the deck's keys (core/input.ts
    // rawPageKey: ⌘Z, ⌘S, Tab / ⇧Tab, F1–F8, ⌘ ← → — BreakerMED's undo, save, tracks, octave, positions)
    const own = this.rawKeys && rawPageKey(k);
    if (deckKey(k) && !own) return false;
    this.box.send2({ t: "key", inst: this.inst, target: { kind: "app" }, k: plainKey(k) });
    return true;
  }
  onText(text: string): boolean {
    this.box.send2({ t: "text", inst: this.inst, target: { kind: "app" }, text });
    return true;
  }
  onAction(a: Action): boolean {
    if (a === "back") return false;
    this.box.send2({ t: "action", inst: this.inst, target: { kind: "app" }, a });
    return true;
  }
  /** its own close() first (it can ask "save?" and keep the tab): the tab waits for its answer */
  close(): Promise<boolean> {
    return this.box.askClose(this.inst);
  }
}

/// <reference lib="webworker" />
/**
 * THE SANDBOX, the module's side (docs/SANDBOX.md). A module from the STORE or
 * the vault runs here, in its own Worker: no page, no deck, no native bridge,
 * no network of its own. Its `ib` is a copy of the real one whose every call
 * is a message to the deck (sandbox/bridge.ts), which checks it against the
 * module's permissions exactly as before.
 *
 * Drawing: the module draws with a real `UI` (the same kit) into a grid of its
 * own; the cells it touched and its click areas go to the deck, which copies
 * them into its place. Clicks, keys and the wheel come back as messages.
 */
import { NONE } from "../../core/color";
import { Grid, type Rect } from "../../core/grid";
import type { Theme } from "../../core/theme";
import { UI, type Hit, type MenuEntry } from "../../ui/ui";
import { resolvePath } from "../../vault/paths";
import * as lib from "../lib";
import { AudioStream } from "../../core/audiostream";
import { UNTOUCHED, type FromModule, type HitInfo, type MenuLine, type Target, type ToModule } from "./protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;

/**
 * Before any module code: no way out of here but the messages. The deck's own
 * bridge (the native side) is reached through fetch and XHR in a webview: they
 * go, with everything else that talks to the network or starts more code.
 */
function closeTheDoors(): void {
  const gone = ["fetch", "XMLHttpRequest", "WebSocket", "WebSocketStream", "EventSource", "Worker", "SharedWorker", "importScripts", "indexedDB", "caches", "BroadcastChannel", "WebTransport", "RTCPeerConnection", "webkitRTCPeerConnection", "RTCDataChannel", "Notification", "FontFace", "WebAssembly"];
  const holders: object[] = [scope];
  for (let p = Object.getPrototypeOf(scope); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) holders.push(p);
  for (const name of gone) {
    for (const h of holders) {
      try {
        if (Object.prototype.hasOwnProperty.call(h, name)) delete (h as Record<string, unknown>)[name];
      } catch {
        /* not configurable: hidden below */
      }
    }
    try {
      Object.defineProperty(scope, name, { value: undefined, writable: false, configurable: false });
    } catch {
      /* already gone */
    }
  }
}

const post = (m: FromModule, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

// ── calls to the deck ─────────────────────────────────────────────────────

let rpcId = 0;
const waiting = new Map<number, { ok: (v: unknown) => void; no: (e: Error) => void }>();
function call(path: string[], args: unknown[]): Promise<unknown> {
  const id = ++rpcId;
  post({ t: "rpc", id, path, args: strip(args) as unknown[] });
  return new Promise((ok, no) => waiting.set(id, { ok, no }));
}
/** only data crosses: functions (callbacks, signals) are left out */
function strip(v: unknown): unknown {
  if (typeof v === "function") return undefined;
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === "object" && !(v instanceof ArrayBuffer) && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x !== "function").map(([k, x]) => [k, strip(x)]));
  }
  return v;
}
const rpc = (...path: string[]) => (...args: unknown[]) => call(path, args);
const notYet = (what: string) => () => {
  throw new Error(`${what} isn't available to modules in the sandbox yet (docs/SANDBOX.md)`);
};

// ── what the deck tells us ─────────────────────────────────────────────────

let theme: Theme;
let notes: string[] | null = null;
let notesError = "";
let settings: Record<string, unknown> = {};
let audio = false;
/** ib.audio.stream(): the deck hands over a port to the module's own audio node */
let streamId = 0;
const streamWaits = new Map<number, { ok: (s: AudioStream) => void; no: (e: Error) => void }>();
function openStream(): Promise<AudioStream> {
  const id = ++streamId;
  post({ t: "streamReq", id });
  return new Promise((ok, no) => streamWaits.set(id, { ok, no }));
}
/** what the module asked to hear when the user silences it */
const audioStops = new Set<() => void>();
let mod: { activate?: (ib: unknown) => unknown; deactivate?: () => unknown } | null = null;

// ── what the module registers ──────────────────────────────────────────────

interface AppLike {
  kind?: string;
  title?(): string;
  status?(): string;
  render(ui: UI, r: Rect, focused: boolean): void;
  onKey?(k: unknown): boolean;
  onText?(t: string): boolean;
  onAction?(a: string): boolean;
  close?(): unknown;
}
interface WidgetLike {
  id: string;
  render(ui: UI, r: Rect, ctx: unknown): void;
  onKey?(k: unknown, ctx: unknown): boolean;
  activate?(ctx: unknown): void;
  popup?: { title?: string; size?: unknown; hint?: string; render(ui: UI, r: Rect, ctx: unknown): void; onKey?(k: unknown, ctx: unknown): boolean; onText?(t: string, ctx: unknown): boolean; onAction?(a: string, ctx: unknown): boolean };
}
const commands = new Map<string, { run(ctx: unknown): unknown }>();
const appSpecs = new Map<string, { create(deck: unknown, args?: unknown): AppLike }>();
const apps = new Map<string, AppLike>();
const actions = new Map<string, { run(): unknown }>();
const widgets = new Map<string, WidgetLike>();

/** the plain parts of a spec (what the deck shows and checks) */
function plain(spec: object, keys: string[]): Record<string, unknown> {
  const s = spec as Record<string, unknown>;
  return Object.fromEntries(keys.filter((k) => s[k] !== undefined && typeof s[k] !== "function").map((k) => [k, s[k]]));
}

function makeIb(manifest: unknown, version: string): unknown {
  return Object.freeze({
    version,
    manifest,
    commands: {
      register(cmd: Record<string, unknown>) {
        commands.set(String(cmd.name), cmd as { run(ctx: unknown): unknown });
        const spec = plain(cmd, ["name", "aliases", "summary", "usage", "man", "examples", "interactive"]);
        // a completion list is sent as it is now
        if (typeof cmd.complete === "function") spec.complete = (cmd.complete as () => string[])();
        else if (cmd.complete) spec.complete = cmd.complete;
        post({ t: "register", what: "command", spec });
      },
    },
    apps: {
      register(spec: Record<string, unknown>) {
        appSpecs.set(String(spec.kind), spec as { create(deck: unknown, args?: unknown): AppLike });
        post({ t: "register", what: "app", spec: plain(spec, ["kind", "title", "description", "icon", "launcher", "rawKeys"]) });
      },
      open: rpc("apps", "open"),
    },
    palette: {
      register(a: Record<string, unknown>) {
        actions.set(String(a.id), a as { run(): unknown });
        post({ t: "register", what: "action", spec: plain(a, ["id", "title", "hint", "group", "key"]) });
      },
    },
    widgets: {
      register(spec: WidgetLike & Record<string, unknown>) {
        widgets.set(spec.id, spec);
        const s = plain(spec, ["id", "title", "description", "size", "min", "max", "frameless", "clickActivates", "picker"]);
        s.hasKeys = typeof spec.onKey === "function";
        s.hasActivate = typeof spec.activate === "function";
        if (spec.popup) s.popup = { ...plain(spec.popup, ["title", "size", "hint"]), hasKeys: !!spec.popup.onKey, hasText: !!spec.popup.onText, hasAction: !!spec.popup.onAction };
        post({ t: "register", what: "widget", spec: s });
      },
    },
    vault: {
      read: rpc("vault", "read"),
      exists: rpc("vault", "exists"),
      write: rpc("vault", "write"),
      append: rpc("vault", "append"),
      mkdir: rpc("vault", "mkdir"),
      modified: rpc("vault", "modified"),
      readBytes: rpc("vault", "readBytes"),
      list: rpc("vault", "list"),
      writeBytes: rpc("vault", "writeBytes"),
      notes: () => {
        if (notes === null) throw new Error(notesError || "needs the vault:read permission");
        return [...notes];
      },
    },
    shell: { run: rpc("shell", "run") },
    // the internet, one approved host at a time, through the deck (the Worker itself has none)
    net: { get: rpc("net", "get") },
    ui: {
      notify: (...a: unknown[]) => void call(["ui", "notify"], a).catch((e) => console.warn(String(e))),
      alert: (...a: unknown[]) => void call(["ui", "alert"], a).catch((e) => console.warn(String(e))),
      say: (...a: unknown[]) => void call(["ui", "say"], a).catch((e) => console.warn(String(e))),
      confirm: rpc("ui", "confirm"),
      prompt: rpc("ui", "prompt"),
      choose: rpc("ui", "choose"),
      pickFolder: rpc("ui", "pickFolder"),
      pickWhen: rpc("ui", "pickWhen"),
      pickFile: rpc("ui", "pickFile"),
      pickFileText: rpc("ui", "pickFileText"),
      pickFileBytes: rpc("ui", "pickFileBytes"),
      fullWindow: rpc("ui", "fullWindow"),
      theme: () => theme,
      redraw: () => post({ t: "redraw" }),
    },
    storage: { get: rpc("storage", "get"), set: rpc("storage", "set") },
    settings: {
      get: (key: string) => settings[key],
      set: (key: string, value: unknown) => ((settings[key] = value), void call(["settings", "set"], [key, value])),
      register: notYet("ib.settings.register"),
      onChange: notYet("ib.settings.onChange"),
    },
    stats: {
      define: rpc("stats", "define"),
      set: rpc("stats", "set"),
      add: rpc("stats", "add"),
      get: rpc("stats", "get"),
      series: rpc("stats", "series"),
      list: rpc("stats", "list"),
      remove: rpc("stats", "remove"),
      onChange: notYet("ib.stats.onChange"),
    },
    modules: { call: (m: string, n: string, ...a: unknown[]) => call(["modules", "call"], [m, n, ...a]), expose: notYet("ib.modules.expose"), has: notYet("ib.modules.has"), list: notYet("ib.modules.list"), installed: notYet("ib.modules.installed") },
    catalog: { list: notYet("ib.catalog"), get: notYet("ib.catalog"), kinds: notYet("ib.catalog") },
    ai: { ready: notYet("ib.ai"), problem: notYet("ib.ai"), ask: (prompt: string, o?: object) => call(["ai", "ask"], [prompt, o]), session: notYet("ib.ai.session"), vaultTools: notYet("ib.ai.vaultTools") },
    media: {
      available: notYet("ib.media.available"),
      status: rpc("media", "status"),
      control: rpc("media", "control"),
      player: { available: notYet("ib.media.player.available"), scan: rpc("media", "player", "scan"), load: rpc("media", "player", "load"), control: rpc("media", "player", "control"), status: rpc("media", "player", "status") },
    },
    google: { available: notYet("ib.google.available"), status: rpc("google", "status"), setup: notYet("ib.google.setup"), connect: rpc("google", "connect"), disconnect: rpc("google", "disconnect"), calendar: rpc("google", "calendar"), cache: { read: rpc("google", "cache", "read"), write: rpc("google", "cache", "write") } },
    backgrounds: { register: notYet("ib.backgrounds") },
    // functions can't cross into the deck: a sandboxed module's changes aren't ⌘Z steps (yet)
    history: { record: () => {} },
    // its sound is played by the deck (core/mixer.ts): this Worker has none of its own
    audio: { available: () => audio, stream: openStream, onStop: (fn: () => void) => (audioStops.add(fn), () => void audioStops.delete(fn)), now: rpc("audio", "now"), sample: rpc("audio", "sample"), drop: rpc("audio", "drop"), schedule: rpc("audio", "schedule"), stop: rpc("audio", "stop"), decode: rpc("audio", "decode"), encode: rpc("audio", "encode"), encoders: rpc("audio", "encoders") },
    lib,
  });
}

// ── drawing ────────────────────────────────────────────────────────────────

interface Slot {
  grid: Grid;
  ui: UI;
  prev: { ch: Uint32Array; fg: Int32Array; bg: Int32Array; attr: Uint8Array } | null;
  hits: Hit[];
  menus: Map<number, MenuEntry[]>;
}
const slots = new Map<string, Slot>();

function slotFor(inst: string, w: number, h: number): Slot {
  let s = slots.get(inst);
  if (!s || s.grid.cols !== w || s.grid.rows !== h) {
    s = { grid: new Grid(Math.max(1, w), Math.max(1, h)), ui: s?.ui ?? new UI(), prev: null, hits: [], menus: new Map() };
    slots.set(inst, s);
  }
  return s;
}

function ctxFor(target: Target, focused: boolean, inst: string): Record<string, unknown> {
  const key = target.kind === "app" ? undefined : target.key;
  return { focused, key, close: () => post({ t: "redraw" }), inst };
}

function draw(m: Extract<ToModule, { t: "render" }>): void {
  const s = slotFor(m.inst, m.w, m.h);
  const ui = s.ui;
  ui.begin(s.grid, theme, m.now, m.mouse);
  // untouched until drawn: the deck keeps what's under those cells
  s.grid.ch.fill(UNTOUCHED);
  s.grid.fg.fill(NONE);
  s.grid.bg.fill(NONE);
  s.grid.attr.fill(0);
  const r = { x: 0, y: 0, w: m.w, h: m.h };
  let title: string | undefined, status: string | undefined;
  try {
    if (m.target.kind === "app") {
      const app = apps.get(m.inst);
      if (!app) return;
      app.render(ui, r, m.focused);
      title = app.title?.();
      status = app.status?.();
    } else {
      const w = widgets.get(m.target.id);
      const ctx = ctxFor(m.target, m.focused, m.inst);
      if (m.target.kind === "widget") w?.render(ui, r, ctx);
      else w?.popup?.render(ui, r, ctx);
    }
  } catch (e) {
    ui.text(0, 0, `⚠ ${e instanceof Error ? e.message : String(e)}`, { fg: theme.c.error }, m.w);
  }
  s.hits = ui.hits;
  const hits: HitInfo[] = ui.hits.map((h, id) => ({
    id,
    rect: h.rect,
    click: !!h.onClick,
    double: !!h.onDouble,
    drag: !!h.onDrag,
    up: !!h.onUp,
    wheel: !!h.onWheel,
    right: !!h.onRight,
    menu: !!h.menu,
    cmd: h.cmd,
    tip: h.tip,
  }));
  const g = s.grid;
  const same = !!s.prev && eq(s.prev.ch, g.ch) && eq(s.prev.fg, g.fg) && eq(s.prev.bg, g.bg) && eq(s.prev.attr, g.attr);
  const base = { t: "frame" as const, inst: m.inst, w: m.w, h: m.h, hits, wake: ui.wakeIn, caret: ui.caret, title, status };
  if (same) return post({ ...base, same: true });
  const copy = { ch: g.ch.slice(), fg: g.fg.slice(), bg: g.bg.slice(), attr: g.attr.slice() };
  s.prev = { ch: g.ch.slice(), fg: g.fg.slice(), bg: g.bg.slice(), attr: g.attr.slice() };
  post({ ...base, same: false, ...copy }, [copy.ch.buffer, copy.fg.buffer, copy.bg.buffer, copy.attr.buffer]);
}

function eq(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ── menus ──────────────────────────────────────────────────────────────────

const menuRuns = new Map<number, MenuEntry[]>();
function menuLines(entries: MenuEntry[]): MenuLine[] {
  return entries.map((e) => (e === "-" ? { label: "", sep: true } : { label: e.label, hint: e.hint, danger: e.danger, disabled: e.disabled, cmd: e.cmd }));
}

// ── commands ───────────────────────────────────────────────────────────────

const runs = new Map<number, { abort: AbortController; reads: Map<number, (v: string | null) => void> }>();
async function runCommand(m: Extract<ToModule, { t: "run" }>): Promise<void> {
  const cmd = commands.get(m.name);
  const abort = new AbortController();
  const reads = new Map<number, (v: string | null) => void>();
  runs.set(m.sid, { abort, reads });
  let rid = 0;
  const ctx = {
    args: m.args,
    stdin: m.stdin,
    isTTY: m.isTTY,
    cwd: m.cwd,
    env: {},
    signal: abort.signal,
    out: (text: string) => post({ t: "out", sid: m.sid, text }),
    err: (text: string) => post({ t: "out", sid: m.sid, text, err: true }),
    resolve: (p: string) => resolvePath(m.cwd, p),
    read: (label: string, opts: Record<string, unknown> = {}) => {
      const id = ++rid;
      post({ t: "read", sid: m.sid, rid: id, label, opts: strip(opts) as Record<string, unknown> });
      return new Promise<string | null>((ok) => reads.set(id, ok));
    },
    shell: { run: (line: string) => call(["shell", "run"], [line]), cd: () => {}, clear: () => post({ t: "clear", sid: m.sid }), history: () => [] },
  };
  try {
    const code = cmd ? await cmd.run(ctx) : 127;
    post({ t: "done", sid: m.sid, code: typeof code === "number" ? code : 0 });
  } catch (e) {
    post({ t: "done", sid: m.sid, code: 1, error: e instanceof Error ? e.message : String(e) });
  } finally {
    runs.delete(m.sid);
  }
}

// ── the messages ───────────────────────────────────────────────────────────

const target = (m: { inst: string; target: Target }) => {
  if (m.target.kind === "app") return { app: apps.get(m.inst) };
  const w = widgets.get(m.target.id);
  return { w, ctx: ctxFor(m.target, true, m.inst), popup: m.target.kind === "popup" };
};

scope.onmessage = async (ev: MessageEvent<ToModule>) => {
  const m = ev.data;
  try {
    switch (m.t) {
      case "load": {
        theme = m.theme as Theme;
        notes = m.notes;
        notesError = m.notesError;
        settings = m.settings;
        audio = !!m.audio;
        closeTheDoors();
        const url = URL.createObjectURL(new Blob([m.code], { type: "text/javascript" }));
        try {
          mod = (await import(/* @vite-ignore */ url)) as typeof mod;
        } finally {
          URL.revokeObjectURL(url);
        }
        if (typeof mod?.activate !== "function") throw new Error("main must export function activate(ib)");
        await mod.activate(makeIb(m.manifest, m.version));
        post({ t: "ready" });
        return;
      }
      case "rpc": {
        const w = waiting.get(m.id);
        waiting.delete(m.id);
        if (m.ok) w?.ok(m.value);
        else w?.no(new Error(m.error));
        return;
      }
      case "theme": theme = m.theme as Theme; return;
      case "notes": notes = m.notes; notesError = m.notesError; return;
      case "settings": settings = m.settings; return;
      case "create": {
        const spec = appSpecs.get(m.kind);
        if (spec) apps.set(m.inst, spec.create(undefined, m.args));
        return;
      }
      case "close": {
        await apps.get(m.inst)?.close?.();
        apps.delete(m.inst);
        slots.delete(m.inst);
        return;
      }
      case "closing": {
        // its page's close() decides (false: it stays — "save?" answered cancel)
        let ok = true;
        try {
          ok = (await apps.get(m.inst)?.close?.()) !== false;
        } catch {
          ok = true; // a close() that throws doesn't keep the tab hostage
        }
        if (ok) (apps.delete(m.inst), slots.delete(m.inst));
        post({ t: "closing", id: m.id, ok });
        return;
      }
      case "render": return draw(m);
      case "hit": {
        const h = slots.get(m.inst)?.hits[m.id];
        const ms = m.m as never;
        if (m.kind === "click") h?.onClick?.(ms);
        else if (m.kind === "double") h?.onDouble?.(ms);
        else if (m.kind === "drag") h?.onDrag?.(ms);
        else if (m.kind === "up") h?.onUp?.(ms);
        else if (m.kind === "right") h?.onRight?.(ms);
        else if (m.kind === "wheel") h?.onWheel?.(m.delta ?? 0, ms);
        return post({ t: "redraw" });
      }
      case "key": {
        const x = target(m);
        if ("app" in x) x.app?.onKey?.(m.k);
        else if (x.popup) x.w?.popup?.onKey?.(m.k, x.ctx);
        else x.w?.onKey?.(m.k, x.ctx);
        return post({ t: "redraw" });
      }
      case "text": {
        const x = target(m);
        if ("app" in x) x.app?.onText?.(m.text);
        else if (x.popup) x.w?.popup?.onText?.(m.text, x.ctx);
        return post({ t: "redraw" });
      }
      case "action": {
        const x = target(m);
        if ("app" in x) x.app?.onAction?.(m.a);
        else if (x.popup) x.w?.popup?.onAction?.(m.a, x.ctx);
        return post({ t: "redraw" });
      }
      case "menuReq": {
        const entries = slots.get(m.inst)?.hits[m.id]?.menu?.() ?? [];
        menuRuns.set(m.rid, entries);
        return post({ t: "menu", rid: m.rid, lines: menuLines(entries) });
      }
      case "menuRun": {
        const e = menuRuns.get(m.rid)?.[m.line];
        menuRuns.delete(m.rid);
        if (e && e !== "-" && e.run) await e.run();
        return post({ t: "redraw" });
      }
      case "paletteRun": await actions.get(m.id)?.run(); return post({ t: "redraw" });
      case "widgetActivate": widgets.get(m.id)?.activate?.({ focused: true, key: m.key }); return post({ t: "redraw" });
      case "run": return void runCommand(m);
      case "readReply": runs.get(m.sid)?.reads.get(m.rid)?.(m.value); return;
      case "abort": runs.get(m.sid)?.abort.abort(); return;
      case "stop": await mod?.deactivate?.(); return;
      case "stream": {
        const w = streamWaits.get(m.id);
        streamWaits.delete(m.id);
        if (!w) return;
        if (m.port) AudioStream.open(m.port).then(w.ok, w.no);
        else w.no(new Error(m.error ?? "no sound stream"));
        return;
      }
      case "audioStop": for (const fn of audioStops) await fn(); return post({ t: "redraw" });
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (m.t === "load") post({ t: "failed", error });
    else post({ t: "log", text: error });
  }
};

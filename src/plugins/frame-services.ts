/**
 * THE FRAME, CALLABLE LIKE A MODULE. The parts of the deck that aren't modules
 * (the tree, the terminal, the shell, the theme, HOME, the side panel, tabs,
 * notes, sounds, THE MENU, the shortcuts) expose functions the same way modules do, so anything can
 * drive them with one line:
 *
 *   const tree = ib.use("tree");          // in a module
 *   await tree.reveal("notes/ideas.md");
 *   await ib.use("terminal").run("git status");
 *   const { accent } = await ib.use("theme").colors();
 *
 *   deck.use("home").add("clock")         // in the deck's own code
 *   modules call tree reveal notes/ideas.md   // in the shell
 *
 * `modules api` lists every function with one line of doc. Things that act on
 * your computer ask for a permission in the module's plugin.json ("terminal").
 * They're always on (the frame can't be switched off).
 */
import { mix } from "../core/color";
import type { Deck } from "../deck";
import { q } from "../ui/ui";
import { isTagColor } from "../vault/marks";
import type { Caller, ServiceSpec } from "./services";
import { trusted } from "../shell/origin";
import { DECK_KEYS, keysOf, menuKeyOf } from "../core/shortcuts";
import { quickItems } from "../workspace/quickmenu";
import { isFolded, type FrameId } from "../workspace/layout/arrange";
import { statusOrder } from "../workspace/statusbar";
import { stealth } from "../core/stealth";
import { trashItems } from "../shell/commands/trash";

const hexOf = (n: number) => `#${(n & 0xffffff).toString(16).padStart(6, "0")}`;

/** The frame's parts (callable like modules, provided by the deck itself). */
export const FRAME_PARTS = new Set(["tree", "terminal", "shell", "theme", "home", "panel", "tabs", "notes", "sound", "menu", "keys", "deck", "frames", "statusbar", "log", "trash"]);

export function frameServices(deck: Deck): Record<string, Record<string, ServiceSpec>> {
  const ws = () => deck.workspace;
  const settingOf = (key: string) => key.split(".").reduce<unknown>((o, k) => (o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k) ? (o as Record<string, unknown>)[k] : undefined), deck.settings.data);
  // A function that runs a command line: called by a module, the line runs as that module
  // (its origin: privileged commands refused, its permissions — shell/origin.ts); called by
  // the deck's own code or your `modules call`, as you. Every argument is quoted: a ";" in
  // one can never start another command.
  const run = (c: Caller | undefined, l: string) => (!l ? 0 : c?.origin ? deck.shell.runUntrusted(l, c.origin) : deck.act(l));
  // (the shell asks every module's line for "shell" itself: shell/exec.ts)
  const line = (doc: string, make: (...a: any[]) => string, needs: ServiceSpec["needs"] = "shell"): ServiceSpec => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
    doc,
    needs,
    fn: (...a) => run(undefined, make(...a)),
    by: (c: Caller) => (...a) => run(c, make(...a)),
  });
  /** a STORE / vault module that calls: its name, to sign what it shows you (null: the deck's own, or you) */
  const signer = (c: Caller): string | null => (c.origin && !trusted(c.origin) ? (deck.plugins.list().find((p) => p.manifest.id === c.id)?.manifest.name ?? c.id) : null);
  /** your real terminal, for a STORE / vault module: each command is shown to you first (plugins/host.ts gate) */
  const typed = (c: Caller, text: string, enter: boolean) => async () => {
    if (c.origin && !trusted(c.origin)) await deck.plugins.gateById(c.id, "terminal", "", text);
    deck.access.note(c.id, "terminal", text.trim().split(/\s+/)[0] ?? "");
    if (enter) ws().showShellTab("term");
    ws().sysTerm?.write(enter ? `${text}\r` : text);
  };
  return {
    tree: {
      reveal: { doc: "reveal(path) → opens its folders and selects it in the tree", needs: "shell", fn: (path: string) => ws().sidebar.reveal(String(path)) },
      filter: { doc: 'filter(["red", "blue"]) → the tree shows only those colours; [] = everything', needs: "shell", fn: (cs: string[] | string | null) => ws().sidebar.setFilter((Array.isArray(cs) ? cs : cs ? [cs] : []).filter(isTagColor)) },
      selected: { doc: 'selected() → the path selected in the tree (or null) (needs "vault:read")', needs: "vault:read", fn: () => ws().sidebar.selectedPath() },
      toggle: { doc: "toggle() → shows / hides the tree", needs: "shell", fn: () => ws().toggleSidebar() },
    },
    terminal: {
      run: { doc: 'run(command) → types it in your system terminal and presses enter (needs "terminal": a STORE / vault module\'s command is shown to you first)', needs: "terminal", fn: (cmd: string) => { ws().showShellTab("term"); ws().sysTerm?.write(`${String(cmd)}\r`); }, by: (c: Caller) => (cmd: string) => typed(c, String(cmd), true)() },
      write: { doc: 'write(text) → types text in your system terminal, no enter (needs "terminal")', needs: "terminal", fn: (text: string) => ws().sysTerm?.write(String(text)), by: (c: Caller) => (text: string) => typed(c, String(text), false)() },
      open: { doc: "open() → shows the shell panel on your system terminal", needs: "shell", fn: () => ws().showShellTab("term") },
      new: { doc: "new() → one more terminal tab", needs: "shell", fn: () => ws().newTerminal() },
    },
    shell: {
      run: line("run(line) → runs an ICEBREAKER command (`open notes/a.md`, `theme e-ink`…) — as the module that calls it: what modules may not run stays refused", (l: string) => String(l)),
      show: { doc: "show() → opens the shell panel", needs: "shell", fn: () => ws().toggleShell(true) },
      hide: { doc: "hide() → folds the shell panel away", needs: "shell", fn: () => ws().toggleShell(false) },
    },
    theme: {
      current: { doc: "current() → the theme's name", fn: () => deck.theme.name },
      list: { doc: "list() → every theme's name", fn: () => deck.themes.list().map((t) => t.name) },
      set: { doc: "set(name) → switches theme (true if it exists)", needs: "shell", fn: (name: string) => deck.setTheme(String(name)) },
      colors: { doc: "colors() → the theme's colours as #rrggbb: { bg, fg, accent, accentAlt, panel, muted, success, warning, error… }", fn: () => Object.fromEntries(Object.entries(deck.theme.c).filter(([, v]) => typeof v === "number").map(([k, v]) => [k, hexOf(v as number)])) },
      mix: { doc: 'mix("#ff0000", "#0000ff", 0.5) → a colour between two (#rrggbb)', fn: (a: string, b: string, k: number) => hexOf(mix(parseInt(String(a).slice(1), 16), parseInt(String(b).slice(1), 16), Number(k))) },
    },
    home: {
      add: line("add(widgetId) → puts a widget on HOME (a page with room)", (id: string) => `home add ${q(String(id))}`),
      remove: line("remove(widgetId) → takes it off HOME", (id: string) => `home rm ${q(String(id))}`),
      page: line("page(n) → shows HOME page n (1, 2…)", (n: number) => `home page ${Number(n) || 1}`),
      edit: line("edit(on) → edit mode on / off", (on = true) => (on ? "home edit" : "home done")),
      link: line("link(label, command, icon?) → a 1×1 shortcut square on HOME (the deck's own code only: a module can't plant a command)", (label: string, cmd: string, icon = "◆") => `home link add ${q(String(label))} ${q(String(cmd))} ${q(String(icon))}`),
    },
    panel: {
      add: line("add(widgetId) → a widget in the side panel (at the end)", (id: string) => `panel add ${q(String(id))}`),
      remove: line("remove(widgetId) → out of the side panel", (id: string) => `panel rm ${q(String(id))}`),
      show: line("show(on) → the side panel shown / hidden", (on = true) => (on ? "panel show" : "panel hide")),
    },
    tabs: {
      list: { doc: "list() → [{ n, title, kind }] the open tabs", fn: () => ws().tabs.slice(0, ws().tabCount).map((t, i) => ({ n: i + 1, title: t.title(), kind: t.kind })) },
      go: { doc: "go(n) → shows tab n", needs: "shell", fn: (n: number) => ws().switchTab(Number(n) - 1) },
      open: { doc: 'open(app) → opens an app ("weather", "todo"…)', needs: "shell", fn: (kind: string) => !!deck.openApp(String(kind)) },
    },
    notes: {
      open: { doc: "open(path) → opens a note in a tab", needs: "shell", fn: (path: string) => deck.openFile(String(path)) },
      current: { doc: 'current() → the path of the note shown (or null) (needs "vault:read")', needs: "vault:read", fn: () => (ws().activeApp?.kind === "note" ? ws().activeApp!.key.slice(5) : null) },
      new: { doc: 'new(folder?) → a new note (asks its title)', needs: "shell", fn: (folder?: string) => deck.newNote(folder ?? "notes") },
    },
    sound: {
      play: { doc: 'play(name) → one of the UI sounds: move, open, confirm, back, success, error, notify, alert, tick, select…', needs: "notify", fn: (name: string) => deck.sound.play(name as never) },
    },
    menu: {
      open: { doc: "open() → THE MENU (search everything, menu keys)", needs: "shell", fn: () => void ws().menu() },
      items: { doc: "items() → [{ key, label, from }] every quick key on THE MENU", fn: () => quickItems(deck).map(({ key, label, from }) => ({ key, label, from })) },
      add: line("add(key, command) → ⌘K, then key runs the command (the deck's own code only: a module can't plant a command)", (key: string, cmd: string) => `menu add ${q(String(key))} ${q(String(cmd))}`),
    },
    keys: {
      list: { doc: "list() → [{ id, keys, menuKey, what }] every deck shortcut, with the user's changes", fn: () => DECK_KEYS.map((s) => ({ id: s.id, keys: keysOf(s, deck.settings.data.keyOverrides), menuKey: menuKeyOf(s, deck.settings.data.menu?.keys), what: s.what })) },
      run: {
        doc: 'run(id) → does what a deck shortcut does ("tree", "home", "menu"…) — for a module, as that module: what only you may do stays refused',
        needs: "shell",
        fn: (id: string) => { const s = DECK_KEYS.find((x) => x.id === String(id)); if (s) ws().runShortcut(s); return !!s; },
        // a module's call runs the shortcut's command as that module (`keys.run("lock")` logged you
        // out: `logout` is yours only); a shortcut that has no command isn't for a STORE / vault module
        by: (c: Caller) => async (id: string) => {
          const s = DECK_KEYS.find((x) => x.id === String(id));
          if (!s) return false;
          if (!c.origin) return ws().runShortcut(s), true;
          if (s.cmd) return (await run(c, s.cmd)) === 0;
          if (!trusted(c.origin)) throw new Error(`keys.run: "${s.id}" has no command a module can run`);
          return ws().runShortcut(s), true;
        },
      },
      bind: line('bind(keys, command) → one of the user\'s shortcuts ("ctrl+shift+1") (the deck\'s own code only: a module can\'t plant a command)', (keys: string, cmd: string) => `bind ${q(String(keys))} ${q(String(cmd))}`),
    },
    // the frames around the page (0.7): the same words as `frame`, so ⌘Z and the log see them
    frames: {
      fold: line("fold(frame) → folds the tree, the panel or the shell into a thin strip", (f: string) => `frame fold ${q(String(f))}`),
      unfold: line("unfold(frame) → opens it again", (f: string) => `frame unfold ${q(String(f))}`),
      solo: line("solo() → the page alone: the tree, the panel and the shell away (again: they come back)", () => "frame solo"),
      move: line('move(frame, side) → the tree, the panel or the shell along "left" · "right" · "top" · "bottom"', (f: string, side: string) => `frame move ${q(String(f))} ${q(String(side))}`),
      folded: { doc: 'folded() → the frames folded right now: ["tree", "shell"…]', fn: () => (Object.entries({ tree: "vault", panel: "panel", shell: "shell" }) as [string, FrameId][]).filter(([, id]) => isFolded(ws().arrangement, id)).map(([n]) => n) },
      isSolo: { doc: "isSolo() → true when the page is alone (▣)", fn: () => ws().solo },
    },
    statusbar: {
      items: { doc: "items() → the status bar's items, in order (the hidden ones left out)", fn: () => statusOrder(deck.settings.data.statusBar).filter((x) => !(deck.settings.data.statusBar?.hidden ?? []).includes(x)) },
      move: line('move(item, where) → "left" · "right" · a place (1 = first)', (item: string, where: string | number) => `statusbar move ${q(String(item))} ${q(String(where))}`),
      hide: line("hide(item) → off the bar", (item: string) => `statusbar hide ${q(String(item))}`),
      show: line("show(item) → back on the bar", (item: string) => `statusbar show ${q(String(item))}`),
      reset: line("reset() → the default bar", () => "statusbar reset"),
    },
    log: {
      // what you typed and what happened: yours to read — a module needs "shell" (it sees your commands)
      tail: { doc: 'tail(n?) → the last n lines of the log (default 20): [{ at, kind, text }] (needs "shell")', needs: "shell", fn: (n = 20) => deck.log.list.slice(-Math.max(1, Math.min(1000, Number(n) || 20))).map((e) => ({ at: e.at, kind: e.kind, text: e.text })) },
    },
    trash: {
      list: { doc: 'list() → [{ n, name, from, at }] what\'s in the trash (needs "vault:read")', needs: "vault:read", fn: async () => (await trashItems(deck)).map((it, i) => ({ n: i + 1, name: it.name, from: it.from, at: it.at.getTime() })) },
      restore: line("restore(n | name) → back where it was (the deck's own code and you only: a module can't run trash)", (what: string | number) => `trash restore ${q(String(what))}`, "vault:write"),
    },
    deck: {
      stealth: { doc: "stealth() → true while stealth mode keeps the deck offline (100 % local)", fn: () => stealth.on },
      // (a STORE / vault module's are signed with its name, like ib.ui.notify / alert)
      alert: { doc: 'alert(title, body?) → calls the user the way they chose (Settings → NOTIFICATIONS: screen, sound, notification center, voice) (needs "notify")', needs: "notify", fn: (title: string, body = "") => deck.alert(String(title), String(body)), by: (c: Caller) => (title: string, body = "") => deck.alert(signer(c) ? `${signer(c)} (module) — ${String(title)}` : String(title), String(body)) },
      notify: { doc: 'notify(text, kind?) → a toast ("info" · "success" · "warning" · "error") (needs "notify")', needs: "notify", fn: (text: string, kind?: "info" | "success" | "warning" | "error") => deck.notify(String(text), kind), by: (c: Caller) => (text: string, kind?: "info" | "success" | "warning" | "error") => deck.notify(signer(c) ? `${signer(c)}: ${String(text)}` : String(text), kind) },
      say: { doc: 'say(text, topic?) → the voice says it, if that topic may speak (Settings → VOICE) (needs "notify")', needs: "notify", fn: (text: string, topic = "modules") => deck.speak(topic as never, String(text)), by: (c: Caller) => (text: string, topic = "modules") => deck.speak((signer(c) ? "modules" : topic) as never, String(text)) },
      setting: {
        doc: 'setting(key) → a setting\'s value ("appearance.theme", "user.handle"…) — a STORE / vault module reads how the deck looks and sounds, not where you are, your vault\'s place, your keys or your module list',
        fn: (key: string) => settingOf(String(key)),
        by: (c: Caller) => (key: string) => {
          const k = String(key);
          if (c.origin && !trusted(c.origin) && !/^(appearance|fx|sound|editor|journal|boot|notifications|voice|user\.(handle|language|locale))(\.|$)/.test(k)) throw new Error(`deck.setting: "${k}" isn't for modules`);
          return settingOf(k);
        },
      },
    },
  };
}

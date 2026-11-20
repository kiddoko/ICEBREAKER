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
import { DECK_KEYS, keysOf, menuKeyOf } from "../core/shortcuts";
import { quickItems } from "../workspace/quickmenu";

const hexOf = (n: number) => `#${(n & 0xffffff).toString(16).padStart(6, "0")}`;

/** The frame's parts (callable like modules, provided by the deck itself). */
export const FRAME_PARTS = new Set(["tree", "terminal", "shell", "theme", "home", "panel", "tabs", "notes", "sound", "menu", "keys", "deck"]);

export function frameServices(deck: Deck): Record<string, Record<string, ServiceSpec>> {
  const ws = () => deck.workspace;
  const settingOf = (key: string) => key.split(".").reduce<unknown>((o, k) => (o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k) ? (o as Record<string, unknown>)[k] : undefined), deck.settings.data);
  // A function that runs a command line: called by a module, the line runs as that module
  // (its origin: privileged commands refused, its permissions — shell/origin.ts); called by
  // the deck's own code or your `modules call`, as you. Every argument is quoted: a ";" in
  // one can never start another command.
  const run = (c: Caller | undefined, l: string) => (!l ? 0 : c?.origin ? deck.shell.runUntrusted(l, c.origin) : deck.act(l));
  const line = (doc: string, make: (...a: any[]) => string, needs?: ServiceSpec["needs"]): ServiceSpec => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
    doc,
    needs,
    fn: (...a) => run(undefined, make(...a)),
    by: (c: Caller) => (...a) => run(c, make(...a)),
  });
  return {
    tree: {
      reveal: { doc: "reveal(path) → opens its folders and selects it in the tree", fn: (path: string) => ws().sidebar.reveal(String(path)) },
      filter: { doc: 'filter(["red", "blue"]) → the tree shows only those colours; [] = everything', fn: (cs: string[] | string | null) => ws().sidebar.setFilter((Array.isArray(cs) ? cs : cs ? [cs] : []).filter(isTagColor)) },
      selected: { doc: "selected() → the path selected in the tree (or null)", fn: () => ws().sidebar.selectedPath() },
      toggle: { doc: "toggle() → shows / hides the tree", fn: () => ws().toggleSidebar() },
    },
    terminal: {
      run: { doc: 'run(command) → types it in your system terminal and presses enter (needs "terminal")', needs: "terminal", fn: (cmd: string) => { ws().showShellTab("term"); ws().sysTerm?.write(`${String(cmd)}\r`); } },
      write: { doc: 'write(text) → types text in your system terminal, no enter (needs "terminal")', needs: "terminal", fn: (text: string) => ws().sysTerm?.write(String(text)) },
      open: { doc: "open() → shows the shell panel on your system terminal", fn: () => ws().showShellTab("term") },
      new: { doc: "new() → one more terminal tab", fn: () => ws().newTerminal() },
    },
    shell: {
      run: line("run(line) → runs an ICEBREAKER command (`open notes/a.md`, `theme e-ink`…) — as the module that calls it: what modules may not run stays refused", (l: string) => String(l)),
      show: { doc: "show() → opens the shell panel", fn: () => ws().toggleShell(true) },
      hide: { doc: "hide() → folds the shell panel away", fn: () => ws().toggleShell(false) },
    },
    theme: {
      current: { doc: "current() → the theme's name", fn: () => deck.theme.name },
      list: { doc: "list() → every theme's name", fn: () => deck.themes.list().map((t) => t.name) },
      set: { doc: "set(name) → switches theme (true if it exists)", fn: (name: string) => deck.setTheme(String(name)) },
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
      go: { doc: "go(n) → shows tab n", fn: (n: number) => ws().switchTab(Number(n) - 1) },
      open: { doc: 'open(app) → opens an app ("weather", "todo"…)', fn: (kind: string) => !!deck.openApp(String(kind)) },
    },
    notes: {
      open: { doc: "open(path) → opens a note in a tab", fn: (path: string) => deck.openFile(String(path)) },
      current: { doc: "current() → the path of the note shown (or null)", fn: () => (ws().activeApp?.kind === "note" ? ws().activeApp!.key.slice(5) : null) },
      new: { doc: 'new(folder?) → a new note (asks its title)', fn: (folder?: string) => deck.newNote(folder ?? "notes") },
    },
    sound: {
      play: { doc: 'play(name) → one of the UI sounds: move, open, confirm, back, success, error, notify, alert, tick, select…', fn: (name: string) => deck.sound.play(name as never) },
    },
    menu: {
      open: { doc: "open() → THE MENU (search everything, menu keys)", fn: () => void ws().menu() },
      items: { doc: "items() → [{ key, label, from }] every quick key on THE MENU", fn: () => quickItems(deck).map(({ key, label, from }) => ({ key, label, from })) },
      add: line("add(key, command) → ⌘K, then key runs the command (the deck's own code only: a module can't plant a command)", (key: string, cmd: string) => `menu add ${q(String(key))} ${q(String(cmd))}`),
    },
    keys: {
      list: { doc: "list() → [{ id, keys, menuKey, what }] every deck shortcut, with the user's changes", fn: () => DECK_KEYS.map((s) => ({ id: s.id, keys: keysOf(s, deck.settings.data.keyOverrides), menuKey: menuKeyOf(s, deck.settings.data.menu?.keys), what: s.what })) },
      run: { doc: 'run(id) → does what a deck shortcut does ("tree", "home", "menu"…)', fn: (id: string) => { const s = DECK_KEYS.find((x) => x.id === String(id)); if (s) ws().runShortcut(s); return !!s; } },
      bind: line('bind(keys, command) → one of the user\'s shortcuts ("ctrl+shift+1") (the deck\'s own code only: a module can\'t plant a command)', (keys: string, cmd: string) => `bind ${q(String(keys))} ${q(String(cmd))}`),
    },
    deck: {
      alert: { doc: "alert(title, body?) → calls the user the way they chose (Settings → NOTIFICATIONS: screen, sound, notification center, voice)", fn: (title: string, body = "") => deck.alert(String(title), String(body)) },
      notify: { doc: 'notify(text, kind?) → a toast ("info" · "success" · "warning" · "error")', fn: (text: string, kind?: "info" | "success" | "warning" | "error") => deck.notify(String(text), kind) },
      say: { doc: "say(text, topic?) → the voice says it, if that topic may speak (Settings → VOICE)", fn: (text: string, topic = "modules") => deck.speak(topic as never, String(text)) },
      setting: {
        doc: 'setting(key) → a setting\'s value ("appearance.theme", "user.handle"…) — a STORE / vault module reads how the deck looks and sounds, not where you are, your vault\'s place, your keys or your module list',
        fn: (key: string) => settingOf(String(key)),
        by: (c: Caller) => (key: string) => {
          const k = String(key);
          if (c.origin && c.origin.grants !== "all" && !/^(appearance|fx|sound|editor|journal|boot|notifications|voice|user\.(handle|language|locale))(\.|$)/.test(k)) throw new Error(`deck.setting: "${k}" isn't for modules`);
          return settingOf(k);
        },
      },
    },
  };
}

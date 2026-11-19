/**
 * THE FRAME, CALLABLE LIKE A MODULE. The parts of the deck that aren't modules
 * (the tree, the terminal, the shell, the theme, HOME, the side panel, tabs,
 * notes, sounds) expose functions the same way modules do, so anything can
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
import type { ServiceSpec } from "./services";

const hexOf = (n: number) => `#${(n & 0xffffff).toString(16).padStart(6, "0")}`;

export function frameServices(deck: Deck): Record<string, Record<string, ServiceSpec>> {
  const ws = () => deck.workspace;
  return {
    tree: {
      reveal: { doc: "reveal(path) → opens its folders and selects it in the tree", fn: (path: string) => ws().sidebar.reveal(String(path)) },
      filter: { doc: 'filter(colour | null) → the tree (and NEXUS) show only that colour ("red"…), null = everything', fn: (c: string | null) => ws().sidebar.setFilter(c && isTagColor(c) ? c : null) },
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
      run: { doc: "run(line) → runs an ICEBREAKER command (any: `open notes/a.md`, `theme e-ink`…)", fn: (line: string) => deck.act(String(line)) },
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
      add: { doc: "add(widgetId) → puts a widget on HOME (a page with room)", fn: (id: string) => deck.act(`home add ${String(id)}`) },
      remove: { doc: "remove(widgetId) → takes it off HOME", fn: (id: string) => deck.act(`home rm ${String(id)}`) },
      page: { doc: "page(n) → shows HOME page n (1, 2…)", fn: (n: number) => deck.act(`home page ${Number(n)}`) },
      edit: { doc: "edit(on) → edit mode on / off", fn: (on = true) => deck.act(on ? "home edit" : "home done") },
      link: { doc: 'link(label, command, icon?) → a 1×1 shortcut square on HOME', fn: (label: string, cmd: string, icon = "◆") => deck.act(`home link add ${q(String(label))} ${q(String(cmd))} ${q(String(icon))}`) },
    },
    panel: {
      add: { doc: "add(widgetId) → a widget in the side panel (at the end)", fn: (id: string) => deck.act(`panel add ${String(id)}`) },
      remove: { doc: "remove(widgetId) → out of the side panel", fn: (id: string) => deck.act(`panel rm ${String(id)}`) },
      show: { doc: "show(on) → the side panel shown / hidden", fn: (on = true) => deck.act(on ? "panel show" : "panel hide") },
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
    deck: {
      notify: { doc: 'notify(text, kind?) → a toast ("info" · "success" · "warning" · "error")', fn: (text: string, kind?: "info" | "success" | "warning" | "error") => deck.notify(String(text), kind) },
      say: { doc: "say(text, topic?) → the voice says it, if that topic may speak (Settings → VOICE)", fn: (text: string, topic = "modules") => deck.speak(topic as never, String(text)) },
      setting: { doc: 'setting(key) → a setting\'s value ("appearance.theme", "user.handle"…)', fn: (key: string) => String(key).split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], deck.settings.data) },
    },
  };
}

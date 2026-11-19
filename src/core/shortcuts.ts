/**
 * Every keyboard shortcut of the deck, in one table: the SHORTCUTS page
 * (ctrl+/) shows it, searchable, and the manual points to it. When you add a
 * shortcut in the code, add its line here.
 *
 * Keys are written the Windows/Linux way ("ctrl+shift+n"); on a Mac, ctrl is
 * ⌘ (see core/input.ts), and `display` turns them into ⌘⇧N.
 *
 * Your own shortcuts live in settings.json → keys ({ "ctrl+shift+1": "open notes/ideas.md" })
 * and run a shell command (`bind` / `unbind`).
 */
import { IS_MAC } from "./input";

export interface Shortcut {
  keys: string;
  what: string;
  cat: string;
  /** what a click on the line runs */
  cmd?: string;
  /** the deck runs `cmd` for these keys by itself (the table is the binding: no code elsewhere) */
  global?: boolean;
}

export const SHORTCUT_CATEGORIES = ["everywhere", "panes & tabs", "notes", "home", "shell", "lists & pages", "gamepad", "yours"] as const;

export const SHORTCUTS: Shortcut[] = [
  // everywhere
  { keys: "ctrl+k", what: "command palette: search everything", cat: "everywhere", cmd: "palette" },
  { keys: "ctrl+/", what: "this page: every shortcut", cat: "everywhere", cmd: "shortcuts" },
  { keys: "f1", what: "the manual", cat: "everywhere", cmd: "launch help" },
  { keys: "ctrl+,", what: "settings", cat: "everywhere", cmd: "settings" },
  { keys: "ctrl+shift+h", what: "HOME", cat: "everywhere", cmd: "home" },
  { keys: "h", what: "HOME, when you're not typing", cat: "everywhere" },
  { keys: "ctrl+shift+m", what: "MODULES, every module", cat: "everywhere", cmd: "modules" },
  { keys: "ctrl+space", what: "LINK, the AI chat (UPLINK)", cat: "everywhere", cmd: "launch link" },
  { keys: "ctrl+j", what: "today's journal", cat: "everywhere", cmd: "today" },
  { keys: "ctrl+shift+l", what: "lock the deck (log out)", cat: "everywhere", cmd: "lock" },
  { keys: "ctrl+shift+e", what: "NEXUS, the vault as a place", cat: "everywhere", cmd: "nexus", global: true },
  { keys: "ctrl+shift+a", what: "the action wheel (gamepad: hold RB)", cat: "everywhere", cmd: "wheel", global: true },
  { keys: "ctrl+shift+backspace", what: "the TRASH page", cat: "everywhere", cmd: "trash open", global: true },
  { keys: "ctrl+= · ctrl+- · ctrl+0", what: "interface bigger · smaller · 100 %", cat: "everywhere" },
  { keys: "f11", what: "fullscreen", cat: "everywhere", cmd: "fullscreen" },
  { keys: "shift+esc", what: "close the tab and show the one before it (HOME stays)", cat: "everywhere" },
  { keys: "esc", what: "back to the page (from the tree or the shell); closes NEXUS, STORE, MODULES, settings", cat: "everywhere" },
  { keys: "1…9", what: "go to that tab (when you're not typing)", cat: "panes & tabs" },
  { keys: "right-click · menu key · shift+f10", what: "the menu of the thing under the mouse (or the selected one): rename, pin, colour, copy, paste…", cat: "everywhere" },

  // panes & tabs
  { keys: "tab", what: "next thing on the screen: widget, card, line", cat: "panes & tabs" },
  { keys: "shift+tab", what: "next part of the screen: tree → deck → shell", cat: "panes & tabs" },
  { keys: IS_MAC ? "ctrl+alt+←↑↓→" : "alt+←↑↓→", what: "move to the pane in that direction", cat: "panes & tabs" },
  { keys: "ctrl+tab · ctrl+shift+tab", what: "next · previous tab", cat: "panes & tabs" },
  { keys: IS_MAC ? "ctrl+1…9" : "alt+1…9 · ctrl+1…9", what: "go to tab 1…9", cat: "panes & tabs" },
  { keys: "ctrl+w", what: "close the tab", cat: "panes & tabs" },
  { keys: "ctrl+b", what: "show / hide the file tree", cat: "panes & tabs" },
  { keys: "ctrl+shift+b", what: "show / hide the side panel (widgets on the right)", cat: "panes & tabs", cmd: "panel", global: true },
  { keys: "ctrl+shift+u", what: "show / hide the macro buttons above the terminal", cat: "panes & tabs", cmd: "macro toggle", global: true },
  { keys: "ctrl+`", what: "show / focus the shell (again: hide it)", cat: "panes & tabs" },
  { keys: "f12", what: "shell tabs: ibsh → system terminal → history", cat: "panes & tabs" },

  // notes
  { keys: "ctrl+n", what: "new note", cat: "notes", },
  { keys: "ctrl+shift+n", what: "new folder", cat: "notes" },
  { keys: "ctrl+s", what: "save (notes also save themselves)", cat: "notes" },
  { keys: "ctrl+enter · ctrl+click", what: "follow the [[link]] under the cursor", cat: "notes" },
  { keys: "tab · shift+tab", what: "indent · unindent (shift+tab leaves the note when there's nothing to unindent)", cat: "notes" },
  { keys: "ctrl+z · ctrl+shift+z", what: "undo · redo", cat: "notes" },
  { keys: "n · r", what: "in the tree: new note here · rescan the vault", cat: "notes" },
  { keys: "f2", what: "in the tree: rename", cat: "notes" },
  { keys: "delete · ctrl+backspace", what: "in the tree: move to the trash (asks first)", cat: "notes" },
  { keys: "p", what: "in the tree: pin / unpin", cat: "notes" },
  { keys: "drag", what: "in the tree: onto a folder to move it there (files from the Finder / Explorer are copied in)", cat: "notes" },
  { keys: "wheel", what: "over the tree: file by file, each one shown at once", cat: "notes" },

  // home
  { keys: "←↑↓→ · tab", what: "choose a widget", cat: "home" },
  { keys: "enter", what: "open the widget's pop-up", cat: "home" },
  { keys: "e · right-click", what: "edit mode (arrows move, shift+arrows resize, a add, x remove; drag a widget onto the side panel)", cat: "home", cmd: "home edit" },
  { keys: "[ · ]", what: "previous · next HOME page", cat: "home" },
  { keys: "m", what: "MODULES", cat: "home", cmd: "modules" },

  // shell
  { keys: "tab", what: "complete a command or a path", cat: "shell" },
  { keys: "→", what: "accept the grey suggestion", cat: "shell" },
  { keys: "↑ · ↓", what: "history", cat: "shell" },
  { keys: "ctrl+c · ctrl+l", what: "cancel · clear", cat: "shell" },
  { keys: "!cmd", what: "run one system command (in ibsh)", cat: "shell" },

  // lists & pages
  { keys: "↑↓ · enter", what: "move · open / do", cat: "lists & pages" },
  { keys: "pageup · pagedown · home · end", what: "jump", cat: "lists & pages" },
  { keys: "type", what: "in a list with a search field: filter", cat: "lists & pages" },
  { keys: "space · x · s", what: "MODULES: switch on/off · remove · store", cat: "lists & pages" },

  // gamepad
  { keys: "d-pad · left stick", what: "move", cat: "gamepad" },
  { keys: "A · B", what: "confirm · back", cat: "gamepad" },
  { keys: "Y · X", what: "palette · on-screen keyboard", cat: "gamepad" },
  { keys: "LB · RB", what: "previous · next tab", cat: "gamepad" },
  { keys: "hold RB", what: "the action wheel: point a stick, let go to run it; LB turns the page", cat: "gamepad", cmd: "wheel" },
  { keys: "select · start", what: "next pane · HOME", cat: "gamepad" },
];

/** "ctrl+shift+n" → "⌘⇧N" on a Mac, "Ctrl+Shift+N" elsewhere. */
export function displayKeys(keys: string): string {
  return keys
    .split(" · ")
    .map((combo) =>
      combo
        .split("+")
        .map((p, i, all) => {
          const last = i === all.length - 1 && all.length > 1;
          if (IS_MAC) {
            const m: Record<string, string> = { ctrl: "⌘", alt: "⌥", shift: "⇧", meta: "⌃" };
            if (m[p] && !last) return m[p];
          } else {
            const m: Record<string, string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Win" };
            if (m[p] && !last) return `${m[p]}+`;
          }
          return p.length === 1 ? p.toUpperCase() : p === "esc" ? "Esc" : p === "tab" ? "Tab" : p === "enter" ? "Enter" : /^f\d+$/.test(p) ? p.toUpperCase() : p;
        })
        .join(""),
    )
    .join(" · ");
}

/** A key combo as the user writes it ("Cmd+Shift+1", "⌘⇧1", "ctrl+shift+1") → "ctrl+shift+1". */
export function normalizeCombo(s: string): string | null {
  const t = s.toLowerCase().replace(/\s+/g, "").replace(/⌘|cmd|command/g, "ctrl+").replace(/⌥|option|opt/g, "alt+").replace(/⇧/g, "shift+").replace(/\+\+/g, "+");
  const parts = t.split("+").filter(Boolean);
  const key = parts.pop();
  if (!key) return null;
  const mods = new Set(parts);
  if (![...mods].every((m) => ["ctrl", "alt", "shift", "meta"].includes(m))) return null;
  if (!mods.size && key.length === 1) return null; // a bare letter would eat your typing
  return [...["ctrl", "alt", "shift", "meta"].filter((m) => mods.has(m)), key].join("+");
}

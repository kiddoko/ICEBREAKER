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
  /** a deck shortcut you can rebind (Settings → KEYS, SHORTCUTS page): its stable name */
  id?: string;
  what: string;
  cat: string;
  /** what a click on the line runs */
  cmd?: string;
  /** the deck runs `cmd` for these keys by itself (the table is the binding: no code elsewhere) */
  global?: boolean;
  /** its key on THE MENU (⌘K, then this key, enter): its default */
  menuKey?: string;
  /** a short name (THE MENU, Settings → KEYS) */
  short?: string;
}

export const SHORTCUT_CATEGORIES = ["everywhere", "panes & tabs", "notes", "home", "shell", "lists & pages", "gamepad", "yours"] as const;

export const SHORTCUTS: Shortcut[] = [
  // everywhere — the letter says what it does (H home, M modules, E explore, U uplink, L lock…)
  { id: "menu", keys: "ctrl+k", what: "THE MENU: search everything, or a key + enter (m ⏎ = MODULES)", cat: "everywhere", cmd: "menu", global: true, short: "THE MENU" },
  { keys: "shift shift", what: "THE MENU too: shift twice, quickly — works anywhere, even while typing", cat: "everywhere" },
  { id: "shortcuts", keys: "ctrl+/", what: "this page: every shortcut", cat: "everywhere", cmd: "shortcuts", global: true, menuKey: "/", short: "shortcuts" },
  { id: "help", keys: "f1", what: "the manual", cat: "everywhere", cmd: "launch help", global: true, menuKey: "?", short: "manual" },
  { id: "settings", keys: "ctrl+,", what: "settings", cat: "everywhere", cmd: "settings", global: true, menuKey: ",", short: "settings" },
  { id: "home", keys: "ctrl+shift+h", what: "HOME", cat: "everywhere", cmd: "home", global: true, menuKey: "h", short: "HOME" },
  { keys: "h", what: "HOME, when you're not typing", cat: "everywhere" },
  { id: "modules", keys: "ctrl+shift+m", what: "MODULES, every module", cat: "everywhere", cmd: "modules", global: true, menuKey: "m", short: "MODULES" },
  { id: "nexus", keys: "ctrl+shift+e", what: "NEXUS: explore the vault", cat: "everywhere", cmd: "nexus", global: true, menuKey: "e", short: "NEXUS" },
  { id: "uplink", keys: "ctrl+shift+u · ctrl+space", what: "UPLINK: the AI chat", cat: "everywhere", cmd: "launch link", global: true, menuKey: "u", short: "UPLINK" },
  { id: "journal", keys: "ctrl+j", what: "the journal, open at today", cat: "everywhere", cmd: "journal", global: true, menuKey: "j", short: "journal" },
  { id: "fx", keys: "ctrl+shift+f", what: "the effects panel (bloom, scanlines…)", cat: "everywhere", cmd: "view fx", global: true, menuKey: "f", short: "effects" },
  { id: "trash", keys: "ctrl+shift+backspace", what: "the TRASH page", cat: "everywhere", cmd: "trash open", global: true, menuKey: "x", short: "trash" },
  { id: "lock", keys: "ctrl+shift+l", what: "log out: back to the login page", cat: "everywhere", cmd: "logout", global: true, menuKey: "l", short: "log out" },
  { keys: "ctrl+= · ctrl+- · ctrl+0", what: "interface bigger · smaller · 100 %", cat: "everywhere" },
  { id: "fullscreen", keys: "f11", what: "fullscreen", cat: "everywhere", cmd: "fullscreen", global: true, menuKey: "F", short: "fullscreen" },
  { id: "back", keys: "shift+esc", what: "close the tab and show the one before it (HOME stays)", cat: "everywhere", global: true, menuKey: "q", short: "close, go back" },
  { keys: "esc", what: "back to the page (from the tree or the shell); on HOME, with nothing to close, opens the ◆ ICEBREAKER menu", cat: "everywhere" },
  { id: "deck-menu", keys: "f10", what: IS_MAC ? "the ◆ ICEBREAKER menu" : "the ◆ ICEBREAKER menu (alt alone too)", cat: "everywhere", global: true, short: "◆ menu" },
  { keys: "1…9", what: "go to that tab (when you're not typing)", cat: "panes & tabs" },
  { keys: "right-click · menu key · shift+f10", what: "the menu of the thing under the mouse (or the selected one): rename, pin, colour, copy, paste…", cat: "everywhere" },

  // panes & tabs
  { keys: "tab", what: "next thing on the screen: widget, card, line", cat: "panes & tabs" },
  { keys: "f6 · shift+f6 · shift+tab", what: "next · previous part of the screen: page → panel → shell → tree", cat: "panes & tabs" },
  { keys: IS_MAC ? "ctrl+alt+←↑↓→" : "alt+←↑↓→", what: IS_MAC ? "move to the pane in that direction" : "move to the pane in that direction (not in a page that plays the keyboard: esc first)", cat: "panes & tabs" },
  { id: "tab-next", keys: "ctrl+tab", what: "next tab", cat: "panes & tabs", cmd: "tab next", global: true, menuKey: "]", short: "next tab" },
  { id: "tab-prev", keys: "ctrl+shift+tab", what: "previous tab", cat: "panes & tabs", cmd: "tab prev", global: true, menuKey: "[", short: "previous tab" },
  { keys: IS_MAC ? "ctrl+1…9" : "alt+1…9 · ctrl+1…9", what: "go to tab 1…9", cat: "panes & tabs" },
  { id: "tab-close", keys: "ctrl+w", what: "close the tab", cat: "panes & tabs", cmd: "tab close", global: true, menuKey: "w", short: "close the tab" },
  { id: "tree", keys: "ctrl+shift+t · ctrl+b", what: "show / hide the file tree", cat: "panes & tabs", global: true, menuKey: "t", short: "file tree" },
  { id: "panel", keys: "ctrl+shift+p", what: "show / hide the side panel (widgets on the right)", cat: "panes & tabs", cmd: "panel", global: true, menuKey: "p", short: "side panel" },
  { id: "shell", keys: "ctrl+`", what: "show / focus the shell (again: hide it)", cat: "panes & tabs", global: true, menuKey: "s", short: "shell" },
  { id: "shell-new", keys: "ctrl+shift+`", what: "a new shell tab: ibsh or one of your shells (the « + » menu)", cat: "panes & tabs", cmd: "term menu", global: true },
  { id: "shell-tabs", keys: "f12", what: "shell tabs: your terminals → the ibsh tabs → log", cat: "panes & tabs", global: true },
  { id: "macros", keys: "ctrl+shift+k", what: "show / hide the macro buttons above the terminal", cat: "panes & tabs", cmd: "macro toggle", global: true, menuKey: "k", short: "macros" },

  // notes
  { id: "new-note", keys: "ctrl+n", what: "new note", cat: "notes", global: true, menuKey: "n", short: "new note" },
  { id: "new-folder", keys: "ctrl+shift+n", what: "new folder", cat: "notes", global: true, menuKey: "N", short: "new folder" },
  { keys: "ctrl+s", what: "save (notes also save themselves)", cat: "notes" },
  { keys: "ctrl+shift+s", what: "save as: a copy under another name (save as <path>)", cat: "notes" },
  { keys: "ctrl+enter · ctrl+click", what: "follow the [[link]] under the cursor", cat: "notes" },
  { keys: "tab · shift+tab", what: "indent · unindent (shift+tab leaves the note when there's nothing to unindent)", cat: "notes" },
  { keys: "ctrl+z · ctrl+shift+z · ctrl+y", what: "undo · redo — anything: settings, widgets moved, trash, renames, new notes (in a note: the typing first) · `undo list`", cat: "everywhere" },
  { keys: "n · r", what: "in the tree: new note here · rescan the vault", cat: "notes" },
  { keys: "f2", what: "in the tree: rename", cat: "notes" },
  { keys: "delete · ctrl+backspace", what: "in the tree: move to the trash (asks first) — ⌘⌫ is Delete everywhere on a Mac", cat: "notes" },
  { keys: "p", what: "in the tree: pin / unpin", cat: "notes" },
  { keys: "drag", what: "in the tree: onto a folder to move it there (files from the Finder / Explorer are copied in)", cat: "notes" },
  { keys: "wheel", what: "over the tree: file by file, each one shown at once", cat: "notes" },
  { keys: "shift+↑ · shift+↓", what: "in the tree: file by file, each one shown at once (like shift + wheel)", cat: "notes" },
  { keys: IS_MAC ? "alt+backspace" : "ctrl+backspace", what: "delete the whole previous word (notes and text fields)", cat: "notes" },

  // home
  { keys: "←↑↓→ · tab", what: "choose a widget", cat: "home" },
  { keys: "enter", what: "open the widget's pop-up", cat: "home" },
  { keys: "ctrl+e · e · ✎ edit", what: "edit mode (arrows move, shift+arrows resize, a add, x remove; drag a widget onto the side panel)", cat: "home", cmd: "home edit" },
  { keys: "[ · ]", what: "previous · next HOME page", cat: "home" },
  { keys: "m", what: "MODULES", cat: "home", cmd: "modules" },

  // shell
  { keys: "tab", what: "complete a command or a path", cat: "shell" },
  { keys: "→", what: "accept the grey suggestion", cat: "shell" },
  { keys: "↑ · ↓", what: "history", cat: "shell" },
  { keys: IS_MAC ? "ctrl+x · meta+c" : "ctrl+c", what: "stop the command running, or the question it asks (^C)", cat: "shell" },
  { keys: "ctrl+l", what: "clear the screen", cat: "shell" },
  { keys: "drag · ctrl+c", what: "select text with the mouse (double-click: a word, triple-click: a line), then copy it — ctrl+c with nothing selected still stops", cat: "shell" },
  { keys: "!cmd", what: "run one system command (in ibsh)", cat: "shell" },

  // lists & pages
  { keys: "↑↓ · enter", what: "move · open / do", cat: "lists & pages" },
  { keys: "double-click · middle-click · shift+click", what: "the tree: a note opens in the tab you're on (in place of the note there) · in a new tab", cat: "lists & pages" },
  { keys: "mouse back / forward · shift + them", what: "like a browser: the note this tab showed before / after · the tab before / after (a two-finger swipe on a trackpad too)", cat: "panes & tabs" },
  { keys: "pageup · pagedown · home · end", what: "jump", cat: "lists & pages" },
  { keys: "type", what: "in a list with a search field: filter", cat: "lists & pages" },
  { keys: "space · x · s", what: "MODULES: switch on/off · remove · store", cat: "lists & pages" },
  { keys: "letters · digits · alt+any key", what: "a page that plays the keyboard (a piano, a tracker, a game) keeps them all, alt+arrows too, like an editor keeps the arrows", cat: "lists & pages" },
  { keys: "esc", what: "leave a page that plays the keyboard: the tree takes the keys back (a click brings them back)", cat: "lists & pages" },

  // gamepad
  { keys: "d-pad · left stick", what: "move", cat: "gamepad" },
  { keys: "A · B", what: "confirm · back", cat: "gamepad" },
  { keys: "Y · X", what: "THE MENU · on-screen keyboard", cat: "gamepad" },
  { keys: "LB · RB", what: "previous · next tab", cat: "gamepad" },
  { keys: "hold RB", what: "THE MENU: the stick chooses, let go to run it (or d-pad + A)", cat: "gamepad", cmd: "menu" },
  { keys: "select · start", what: "next pane · HOME", cat: "gamepad" },
];

/** "ctrl+shift+n" → "⌘⇧N" on a Mac, "Ctrl+Shift+N" elsewhere. */
export function displayKeys(keys: string): string {
  return keys
    .split(" · ")
    .map((combo) =>
      combo.startsWith(MENU) ? displayMenuKey(combo.slice(MENU.length)) : combo
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
          const named: Record<string, string> = IS_MAC
            ? { esc: "Esc", tab: "Tab", enter: "↩", backspace: "⌫", delete: "⌦", space: "Space", up: "↑", down: "↓", left: "←", right: "→" }
            : { esc: "Esc", tab: "Tab", enter: "Enter", backspace: "Backspace", delete: "Del", space: "Space", up: "↑", down: "↓", left: "←", right: "→" };
          return p.length === 1 ? p.toUpperCase() : named[p] ?? (/^f\d+$/.test(p) ? p.toUpperCase() : p);
        })
        .join(""),
    )
    .join(" · ");
}

/** A key combo as the user writes it ("Cmd+Shift+1", "⌘⇧1", "ctrl+shift+1") → "ctrl+shift+1". */
export function normalizeCombo(s: string): string | null {
  // a key on THE MENU: "menu g", "≡g", "≡ g" (and "space g", its name before 0.3.2)
  const onMenu = /^\s*(?:menu|space|≡|␣)\s*(\S)\s*$/i.exec(s);
  if (onMenu) return `menu ${onMenu[1]}`;
  const t = s.toLowerCase().replace(/\s+/g, "").replace(/⌘|cmd|command/g, "ctrl+").replace(/⌥|option|opt/g, "alt+").replace(/⇧/g, "shift+").replace(/\+\+/g, "+");
  const parts = t.split("+").filter(Boolean);
  const key = parts.pop();
  if (!key) return null;
  const mods = new Set(parts);
  if (![...mods].every((m) => ["ctrl", "alt", "shift", "meta"].includes(m))) return null;
  if (!mods.size && key.length === 1) return null; // a bare letter would eat your typing
  return [...["ctrl", "alt", "shift", "meta"].filter((m) => mods.has(m)), key].join("+");
}

/** The deck's rebindable shortcuts (they have an id). */
export const DECK_KEYS = SHORTCUTS.filter((s) => s.id);

/** A shortcut's keys now: yours (Settings → KEYS) or its default. "" = switched off. */
export function keysOf(s: Shortcut, overrides: Record<string, string> | undefined): string {
  return s.id && overrides && s.id in overrides ? overrides[s.id] : s.keys;
}

/** The deck shortcut a key combo triggers (with your changes), if any. */
export function shortcutFor(combo: string, overrides: Record<string, string> | undefined): Shortcut | undefined {
  return DECK_KEYS.find((s) => s.global && keysOf(s, overrides).split(" · ").includes(combo));
}

// ── keys on THE MENU ─────────────────────────────────────────────────────────
// THE MENU (workspace/quickmenu.ts, ⌘K or ⇧⇧) shows a key next to the things you
// use most: type it, enter, done (m ⏎ = MODULES). The deck's keys are in the table
// above (`menuKey`); you change them in Settings → KEYS (settings.menu.keys: id →
// key, "" = none). Your own are in settings.keys as "menu <key>" → a command.

/** "menu g": one of yours on THE MENU */
export const MENU = "menu ";

/** A shortcut's key on THE MENU now (yours or its default). "" = none. */
export function menuKeyOf(s: Shortcut, over: Record<string, string> | undefined): string {
  return s.id && over && s.id in over ? over[s.id] : s.menuKey ?? "";
}

export interface MenuKeyEntry {
  key: string;
  label: string;
  /** a deck shortcut… */
  shortcut?: Shortcut;
  /** …or one of your commands */
  cmd?: string;
}

/** Every key on THE MENU: the deck's, then yours (yours win a clash). */
export function menuKeyEntries(over: Record<string, string> | undefined, mine: Record<string, string> | undefined): MenuKeyEntry[] {
  const out = new Map<string, MenuKeyEntry>();
  for (const s of DECK_KEYS) {
    const key = menuKeyOf(s, over);
    if (key) out.set(key, { key, label: s.short ?? s.what, shortcut: s });
  }
  for (const [combo, cmd] of Object.entries(mine ?? {})) if (combo.startsWith(MENU)) out.set(combo.slice(MENU.length), { key: combo.slice(MENU.length), label: cmd, cmd });
  return [...out.values()];
}

/** How a key on THE MENU reads: "≡ h". */
export function displayMenuKey(key: string): string {
  return key ? `≡ ${key}` : "";
}

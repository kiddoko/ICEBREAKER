/**
 * THE macOS MENU BAR's deck items (src-tauri/src/lib.rs mac_menu): each id the menu sends,
 * and what it does here. A fixed table — the menu never runs a command line of its own.
 * Edit's cut / copy / paste / undo are the system's (core/input.ts gets them as events).
 */
import type { Deck } from "../deck";
import { ctrlKey } from "../core/input";

export function macMenuActions(deck: Deck): Record<string, () => void> {
  const ws = () => deck.workspace;
  const act = (line: string) => () => void deck.act(line);
  return {
    whatsnew: () => ws().whatsNew(),
    update: act("update"),
    settings: act("settings"),
    logout: act("logout"),
    "note.new": () => void deck.newNote(),
    "folder.new": () => void deck.newFolder(),
    terminal: act("term open"),
    journal: () => void deck.openJournal(new Date()),
    find: () => deck.actions.get("notes.find")?.run(),
    palette: () => void ws().menu(),
    "tab.close": act("tab close"),
    selectall: () => deck.key(ctrlKey("a")),
    "zoom.in": () => deck.zoom(1),
    "zoom.out": () => deck.zoom(-1),
    "zoom.reset": () => deck.zoom(0),
    tree: () => ws().toggleSidebar(),
    panel: act("panel"),
    shell: () => ws().focusShell(),
    fx: () => ws().fxPanel(),
    "tab.next": act("tab next"),
    "tab.prev": act("tab prev"),
    home: () => deck.openApp("home"),
    manual: act("manual"),
    shortcuts: () => deck.openApp("shortcuts"),
    tour: act("tour"),
  };
}

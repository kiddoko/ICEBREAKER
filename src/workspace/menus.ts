/**
 * THE RIGHT-CLICK MENUS of the frame: a tab, a terminal tab, the shell panel,
 * a macro button, and the editing lines (copy, paste…) every text field adds.
 * Workspace.openMenu shows them; the lines run shell commands where they can.
 */
import { KeyCapture } from "./keycapture";
import { addToMenu } from "./quickmenu";
import { t } from "../core/i18n";
import { IS_MAC } from "../core/input";
import { q, type MenuEntry, type MenuItem } from "../ui/ui";
import { readClipboard } from "../core/clipboard";
import type { Workspace } from "./workspace";
import { CANCEL_KEY } from "../shell/shell";
import { APP_VERSION } from "../plugins/host";

/** Right-click on a macro button. */
export function macroMenu(ws: Workspace, i: number): MenuEntry[] {
  const m = ws.deck.settings.data.shell.macros[i];
  if (!m) return [];
  return [
    { label: t("Run"), cmd: `macro run ${q(m.label)}`, hint: m.cmd },
    { label: t("Set shortcut…"), tip: t("a key that runs it"), run: () => ws.push(new KeyCapture(ws.deck, t("A key for the macro “{name}”", { name: m.label }), [`macro run ${q(m.label)}`])) },
    { label: t("Add to THE MENU…"), tip: t("give it a key on THE MENU (⌘K)"), run: () => addToMenu(ws.deck, m.label, `macro run ${q(m.label)}`) },
    { label: t("Edit…"), run: () => void editMacro(ws, i), hint: "shift+click" },
    "-",
    { label: t("Hide macros"), tip: t("⌗ or ⌘⇧K brings them back"), cmd: "macro hide" },
    { label: t("Remove"), tip: t("this macro goes (⌘Z brings it back)"), cmd: `macro rm ${q(m.label)}`, danger: true },
  ];
}

export async function editMacro(ws: Workspace, i: number): Promise<void> {
  const list = [...ws.deck.settings.data.shell.macros];
  const cur = list[i];
  const label = await ws.deck.prompt(i < 0 ? "New macro — button label" : "Label (empty = delete this macro)", { initial: cur?.label ?? "", placeholder: "deploy" });
  if (label === null) return;
  if (!label.trim()) {
    if (cur) void ws.deck.act(`macro rm ${q(cur.label)}`);
    return;
  }
  const cmd = await ws.deck.prompt(`Command for "${label.trim()}" — {name} asks for a value`, { initial: cur?.cmd ?? "", placeholder: "git pull && npm run build" });
  if (!cmd?.trim()) return;
  if (cur && cur.label !== label.trim()) await ws.deck.act(`macro rm ${q(cur.label)}`);
  void ws.deck.act(`macro add ${q(label.trim())} ${q(cmd.trim())}`);
}

/** copy / cut / paste / select all, sent to whatever has the focus. */
export function editMenu(ws: Workspace, opts: { copy?: boolean; cut?: boolean; selectAll?: boolean } = {}): MenuEntry[] {
  const m = IS_MAC ? "⌘" : "ctrl+";
  const key = (letter: string) => () =>
    ws.routeKey({ key: letter, code: `Key${letter.toUpperCase()}`, ctrl: true, alt: false, shift: false, meta: false, combo: `ctrl+${letter}`, rawCtrl: !IS_MAC, rawMeta: IS_MAC }, false);
  const out: MenuEntry[] = [];
  if (opts.copy !== false) out.push({ label: t("Copy"), run: key("c"), hint: `${m}C` });
  if (opts.cut !== false) out.push({ label: t("Cut"), run: key("x"), hint: `${m}X` });
  out.push({ label: t("Paste"), run: async () => { const txt = await readClipboard(); if (txt) ws.handleText(txt); else ws.notify(t("the clipboard is empty (or can't be read)"), "warning"); }, hint: `${m}V` });
  if (opts.selectAll !== false) out.push({ label: t("Select all"), run: key("a"), hint: `${m}A` });
  return out;
}

/** Right-click on a terminal tab. */
/** Right-click on a shell tab (a terminal or an ibsh): rename, a new one, restart, close. */
export function shellTabMenu(ws: Workspace, e: { kind: "term" | "ibsh"; i: number }): MenuEntry[] {
  const n = ws.shellEntries().findIndex((x) => x.kind === e.kind && x.i === e.i) + 1;
  return [
    { label: t("Rename…"), run: () => ws.renameShellTab(e), hint: "term rename" },
    { label: t("New tab…"), tip: t("ibsh or one of your shells · ctrl+shift+`"), run: () => void ws.newShellMenu() },
    ...(e.kind === "term"
      ? [
          { label: t("Restart"), tip: t("start this shell again"), run: () => { ws.termIndex = e.i; void ws.deck.act("term restart"); } },
          { label: t("Open in a tab"), run: () => { ws.termIndex = e.i; void ws.deck.act("term max"); } },
        ]
      : []),
    "-",
    { label: t("Close"), cmd: `term close ${n}`, danger: true, disabled: ws.shellEntries().length < 2 },
  ];
}

/** "Move to ▸" for a frame (the tree, the panel, the shell): along a side of the screen, or folded. */
export function frameMenu(frame: "tree" | "panel" | "shell"): MenuEntry[] {
  const sides: [string, string][] = [["left", t("the left")], ["right", t("the right")], ["top", t("the top")], ["bottom", t("the bottom")]];
  return [
    { label: t("Move to"), tip: t("this frame along a side of the screen (⌘Z undoes it)"), sub: sides.map(([side, label]) => ({ label, cmd: `frame move ${frame} ${side}` })) },
    { label: t("Fold"), cmd: `frame fold ${frame}`, tip: t("a thin strip with its name: a click opens it again") },
    { label: t("Layout…"), tip: t("ready-made layouts"), sub: [...["classic", "shell-right", "panel-left", "tree-bottom"].map((p) => ({ label: p, cmd: `layout preset ${p}` })), { label: t("back to the classic layout"), cmd: "layout reset" }] },
  ];
}

/** Right-click in the shell panel. */
export function shellMenu(ws: Workspace): MenuEntry[] {
  const term = ws.shellTab === "term" && ws.termAvailable;
  const items: MenuEntry[] = term
    ? [
        { label: t("Copy"), run: () => void ws.terminal.copySelection(), hint: IS_MAC ? "⌘C" : "ctrl+shift+C", disabled: !ws.terminal.hasSelection() },
        ...editMenu(ws, { copy: false, cut: false, selectAll: false }),
        { label: t("Select all"), run: () => ws.terminal.selectAll(), hint: IS_MAC ? "⌘A" : "" },
        "-",
      ]
    : [
        // ibsh: what the mouse selected in its output, and its ^C
        { label: t("Copy"), run: () => void ws.deck.shell.copySelection(), hint: IS_MAC ? "⌘C" : "ctrl+C", disabled: !ws.deck.shell.hasSelection() },
        ...(ws.deck.shell.waiting || ws.deck.shell.exec.running ? [{ label: t("Stop the command"), run: () => ws.deck.shell.cancel(), hint: CANCEL_KEY } as MenuItem] : []),
        ...editMenu(ws, { copy: false, cut: false, selectAll: false }),
        { label: t("Select all"), run: () => ws.deck.shell.selectAll() },
        "-",
      ];
  if (term) items.push({ label: t("Clear"), run: () => void ws.terminal.onKey({ key: "l", code: "KeyL", ctrl: true, alt: false, shift: false, meta: false, combo: "ctrl+l", rawCtrl: true, rawMeta: false }), hint: "ctrl+L" });
  else if (ws.shellTab === "ibsh") items.push({ label: t("Clear"), cmd: "clear" });
  items.push(
    { label: t("New terminal"), cmd: "term new" },
    ...(ws.shownEntry ? [{ label: t("Rename…"), run: () => ws.renameShellTab(ws.shownEntry!) } as MenuItem] : []),
    { label: t("Scripts"), tip: t("your saved scripts"), cmd: "script menu" },
    "-",
    { label: ws.shellMax ? t("Restore") : t("Maximize"), cmd: ws.shellMax ? "term dock" : "term max" },
    ...frameMenu("shell"),
    { label: t("Hide"), cmd: "term hide", hint: "ctrl+`" },
  );
  return items;
}

/** the deck menu's title (the top bar lights its logo while it's open) */
export const DECK_MENU_TITLE = () => `icebreaker ${APP_VERSION}`;

/**
 * "◆ icebreaker ▾", the top row's left corner (0.8: there is no menu bar): the deck's own menu,
 * like the apple on a Mac — the deck's places first (each opens as a tab, one click), then what's
 * new, updates, the setup, the tour, log out, quit.
 */
export function deckMenu(_ws: Workspace): MenuEntry[] {
  const k = (mac: string, other: string) => (IS_MAC ? mac : other);
  return [
    { label: `▦ ${t("modules")}`, cmd: "launch modules", hint: k("⌘⇧M", "ctrl+shift+M"), tip: t("every app and module: open, switch on or off") },
    { label: `⬡ ${t("store")}`, cmd: "store", tip: t("modules and themes to install, from GitHub") },
    { label: "◎ nexus", cmd: "launch explorer", hint: k("⌘⇧E", "ctrl+shift+E"), tip: t("NEXUS: your vault as a 3D map") },
    { label: `⚙ ${t("settings")}`, cmd: "settings", hint: k("⌘,", "ctrl+,"), tip: t("theme, effects, keys, AI, privacy…") },
    { label: `? ${t("help")}`, cmd: "manual", hint: "F1", tip: t("the manual, the shortcuts, the tour") },
    "-",
    { label: `✦ ${t("What's new")}`, cmd: "changelog" },
    { label: `⇡ ${t("Check for updates")}`, cmd: "update" },
    "-",
    { label: `⚙ ${t("Setup again")}`, cmd: "setup", tip: t("the first-run questions, to change your answers") },
    { label: `◉ ${t("Guided tour")}`, cmd: "tour" },
    "-",
    { label: `⏻ ${t("Log out")}`, cmd: "logout", hint: IS_MAC ? "⌘⇧L" : "ctrl+shift+L", danger: true },
    { label: `✕ ${t("Quit ICEBREAKER")}`, cmd: "quit", hint: IS_MAC ? "⌘Q" : "alt+F4" },
  ];
}

/** Right-click on a tab. */
export function tabMenu(ws: Workspace, i: number): MenuEntry[] {
  const app = ws.tabs[i];
  const note = app?.kind === "note" ? app.key.slice(5) : "";
  const items: MenuEntry[] = [
    // HOME is pinned: it can't be closed
    { label: t("Close"), cmd: `tab close ${i + 1}`, hint: IS_MAC ? "⌘W" : "ctrl+W", disabled: app?.kind === "home", tip: app?.kind === "home" ? t("HOME is pinned: always the first tab") : undefined },
    // (within the tab's own frame: the other frames' tabs aren't "others" here)
    { label: t("Close others"), cmd: `tab close others ${i + 1}`, disabled: ws.tabs.length < 2 },
    { label: t("Close tabs to the right"), cmd: `tab close right ${i + 1}`, disabled: i >= ws.tabs.length - 1 },
  ];
  // into another frame (Refonte UI 3b): the tree's, the panel's, the shell's, or back to the page's
  if (i < ws.tabCount) {
    const at = ws.placeOf(i);
    const to: [string, string][] = [["main", t("the page's frame")], ["tree", t("the tree's frame")], ["panel", t("the panel's frame")], ["shell", t("the shell's frame")]];
    items.push({ label: t("Move to"), sub: to.filter(([k]) => (k === "tree" ? "vault" : k) !== at).map(([k, label]) => ({ label, cmd: `tab move ${i + 1} ${k}` })) });
  }
  if (note) {
    const pinned = (ws.deck.settings.data.favorites ?? []).some((f) => f.target === note);
    const doc = app as { save?: () => Promise<void>; dirty?: () => boolean };
    items.push(
      "-",
      { label: t("Save"), cmd: `save ${q("/" + note)}`, hint: IS_MAC ? "⌘S" : "ctrl+S", disabled: !doc.dirty?.() },
      { label: t("Reveal in tree"), cmd: `tree reveal ${q("/" + note)}` },
      { label: pinned ? t("Unpin") : t("Pin"), cmd: `${pinned ? "unpin" : "pin"} ${q("/" + note)}` },
      { label: t("Copy path"), cmd: `copy path ${q("/" + note)}` },
    );
  }
  return items;
}

/** Close every tab `which` says, right to left (a tab can refuse: unsaved). */
export async function closeMany(ws: Workspace, which: (i: number) => boolean): Promise<void> {
  const keep = ws.tabs[ws.active];
  for (let j = ws.tabs.length - 1; j >= 0; j--) if (which(j) && ws.tabs[j].kind !== "home") await ws.closeTab(j);
  const i = keep ? ws.tabs.indexOf(keep) : -1;
  if (i >= 0) ws.switchTab(i);
}

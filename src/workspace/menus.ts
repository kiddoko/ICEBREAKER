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
import { copyToClipboard, readClipboard } from "../core/clipboard";
import type { Workspace } from "./workspace";

/** Right-click on a macro button. */
export function macroMenu(ws: Workspace, i: number): MenuEntry[] {
  const m = ws.deck.settings.data.shell.macros[i];
  if (!m) return [];
  return [
    { label: t("Run"), run: () => void ws.runMacro(m), hint: m.cmd },
    { label: t("Set shortcut…"), tip: t("a key that runs it"), run: () => ws.push(new KeyCapture(ws.deck, t("A key for the macro “{name}”", { name: m.label }), [`macro run ${q(m.label)}`])) },
    { label: t("Add to THE MENU…"), tip: t("give it a key on THE MENU (⌘K)"), run: () => addToMenu(ws.deck, m.label, `macro run ${q(m.label)}`) },
    { label: t("Edit…"), run: () => void editMacro(ws, i), hint: "shift+click" },
    "-",
    { label: t("Hide macros"), tip: t("⌗ or ⌘⇧K brings them back"), cmd: "macro hide" },
    { label: t("Delete"), tip: t("goes to the trash — ⌘Z or the TRASH page brings it back"), cmd: `macro rm ${q(m.label)}`, danger: true },
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
export function termTabMenu(ws: Workspace, i: number): MenuEntry[] {
  return [
    { label: t("Rename…"), run: () => ws.renameTerminal(i), hint: "term rename" },
    { label: t("New terminal"), cmd: "term new" },
    { label: t("Restart"), tip: t("start this shell again"), run: () => { ws.termIndex = i; void ws.deck.act("term restart"); } },
    { label: t("Open in a tab"), run: () => { ws.termIndex = i; void ws.deck.act("term max"); } },
    "-",
    { label: t("Close"), cmd: `term close ${i + 1}`, danger: true, disabled: ws.terms.length < 2 },
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
    : [...editMenu(ws), "-"];
  if (term) items.push({ label: t("Clear"), run: () => void ws.terminal.onKey({ key: "l", code: "KeyL", ctrl: true, alt: false, shift: false, meta: false, combo: "ctrl+l", rawCtrl: true, rawMeta: false }), hint: "ctrl+L" });
  else if (ws.shellTab === "ibsh") items.push({ label: t("Clear"), cmd: "clear" });
  items.push(
    { label: t("New terminal"), cmd: "term new" },
    ...(term ? [{ label: t("Rename…"), run: () => ws.renameTerminal() } as MenuItem] : []),
    { label: t("Scripts"), tip: t("your saved scripts"), cmd: "script menu" },
    "-",
    { label: ws.shellMax ? t("Restore") : t("Maximize"), cmd: ws.shellMax ? "term dock" : "term max" },
    { label: t("Hide"), cmd: "term hide", hint: "ctrl+`" },
  );
  return items;
}

/** Right-click on a tab of the top bar. */
export function tabMenu(ws: Workspace, i: number): MenuEntry[] {
  const app = ws.tabs[i];
  const note = app?.kind === "note" ? app.key.slice(5) : "";
  const items: MenuEntry[] = [
    { label: t("Close"), cmd: `tab close ${i + 1}`, hint: IS_MAC ? "⌘W" : "ctrl+W" },
    { label: t("Close others"), run: () => closeMany(ws, (j) => j !== i), disabled: ws.tabs.length < 2 },
    { label: t("Close tabs to the right"), run: () => closeMany(ws, (j) => j > i), disabled: i >= ws.tabs.length - 1 },
  ];
  if (note) {
    const pinned = (ws.deck.settings.data.favorites ?? []).some((f) => f.target === note);
    const doc = app as { save?: () => Promise<void>; dirty?: () => boolean };
    items.push(
      "-",
      { label: t("Save"), run: () => void doc.save?.().then(() => ws.deck.notify(`saved ${note}`, "success")), hint: IS_MAC ? "⌘S" : "ctrl+S", disabled: !doc.dirty?.() },
      { label: t("Reveal in tree"), run: () => { if (!ws.sidebarVisible) ws.toggleSidebar(); ws.sidebar.reveal(note); ws.focus = "sidebar"; } },
      { label: pinned ? t("Unpin") : t("Pin"), cmd: `${pinned ? "unpin" : "pin"} ${q("/" + note)}` },
      { label: t("Copy path"), run: () => (copyToClipboard(note), ws.notify(t("path copied"))) },
    );
  }
  return items;
}

/** Close every tab `which` says, right to left (a tab can refuse: unsaved). */
export async function closeMany(ws: Workspace, which: (i: number) => boolean): Promise<void> {
  const keep = ws.tabs[ws.active];
  for (let j = ws.tabs.length - 1; j >= 0; j--) if (which(j)) await ws.closeTab(j);
  const i = keep ? ws.tabs.indexOf(keep) : -1;
  if (i >= 0) ws.switchTab(i);
}

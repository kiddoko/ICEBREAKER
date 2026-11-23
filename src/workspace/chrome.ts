/**
 * THE FRAME AROUND THE PAGE: the top bar (the deck menu, UPLINK, the clock), the status bar, the
 * shell panel at the bottom (its tabs, the macro buttons, the terminal / ibsh /
 * LOG), the hover tip and the voice's subtitles. Workspace.render calls these;
 * they read the workspace, they don't own any state.
 */
import { mix } from "../core/color";
import { t } from "../core/i18n";
import { BOLD, type Rect } from "../core/grid";
import { IS_MAC } from "../core/input";
import { osKeys } from "../core/keyhints";
import { strWidth } from "../core/unicode";
import { inside, q, type Hit, type UI } from "../ui/ui";
import { Bar, GAP, INSET } from "../ui/layout";
import { Osk } from "./overlays";
import { SystemTerminal, terminalKeysHint } from "../shell/systerm";
import type { ShellTab, Workspace } from "./workspace";
import { chipStyle, drawChip, placeChips, tabbedBox } from "./tabstrip";
import { DECK_MENU_TITLE, editMacro, macroMenu, shellMenu, termTabMenu } from "./menus";

/**
 * The shell panel: tabs on its top border (your terminals [+] │ ibsh · history ·
 * errors), the window-style buttons on the right, the macro row above a system
 * terminal, then the shell itself. Its top border drags to resize.
 */
export function renderShellPanel(ws: Workspace, ui: UI, r: Rect, body: Rect, fixed: boolean): void {
  const d = ws.deck;
  ws.rects.shell = r;
  const shellFocused = ws.focus === "shell" && !ws.topModal;
  const c = ui.c;
  if (!ws.shellTabChosen && ws.termAvailable) ws.shellTab = "term";
  if (ws.shellTab === "term" && !ws.termAvailable) ws.shellTab = "ibsh";
  // its tabs on its top border, like every frame (tabstrip.ts): your terminals [+] · ibsh · log.
  // The panel's buttons (scripts, hide, maximize) sit apart, on the right of the same row.
  const si = tabbedBox(ui, r, { focused: shellFocused });
  // a tab moved here (tab move <n> shell) may be the one shown instead of the terminals
  const moved = ws.shownIn("shell");
  if (ws.termAvailable && !ws.terms.length) ws.terms.push(new SystemTerminal(d));
  const tabs: [ShellTab, string, number][] = [
    ...(ws.termAvailable ? ws.terms.map((tm, i) => ["term", tm.name, i] as [ShellTab, string, number]) : []),
    ["ibsh", "ibsh", -1],
    // the log: everything that happened, filtered as you like; blinks red while errors are unread
    ["log", d.log.unseenErrors ? `⚠ ${t("log")} ${d.log.unseenErrors}` : d.log.unseen ? `${t("log")} •${d.log.unseen}` : t("log"), -1],
  ];
  // the panel's buttons on the right, like a program window's: one icon in a little square each
  const buttons: [string, string, string][] = [
    ...(ws.shellTab === "term" && ws.termAvailable && d.settings.data.shell.macrosShown === false ? [["⌗", "macro show", t("show the macros · macro show")] as [string, string, string]] : []),
    ["≡", "script menu", t("your scripts · script new <name>")],
    ["─", "term hide", t("hide the shell · ctrl+` brings it back")],
    ["□", "term max", t("maximize: the shell becomes a big tab (term dock puts it back)")],
  ];
  let bxr = r.x + r.w - INSET;
  for (const [icon, cmd, tip] of [...buttons].reverse()) {
    const br = { x: bxr - 3, y: r.y, w: 3, h: 1 };
    if (br.x < r.x + r.w / 2) break;
    const hot = ui.hovered(br);
    ui.text(br.x, r.y, ` ${icon} `, { fg: hot ? c.bg : c.fg, bg: hot ? (cmd === "term hide" ? c.warning : c.accent) : mix(c.panel, c.fg, 0.14) });
    ui.hit(br, { cmd, tip });
    bxr = br.x - 1;
  }
  // the tabs: a name above, a half-block bar on the frame's line
  let tx = r.x + INSET;
  let lastGroup = "";
  for (const [id, label, ti] of tabs) {
    const group = id === "term" ? "term" : "deck";
    if (lastGroup && group !== lastGroup) tx += 1; // your terminals, then the deck's own
    lastGroup = group;
    const on = !moved && id === ws.shellTab && (ti < 0 || ti === ws.termIndex);
    const icon = id === "term" ? "❯" : id === "ibsh" ? ui.theme.glyphs.mark : id === "log" ? "≣" : "";
    const closable = id === "term" && on && ws.terms.length > 1;
    const text = ` ${icon && !label.startsWith("⚠") ? `${icon} ` : ""}${label} ${closable ? "× " : ""}`;
    const rect = { x: tx, y: r.y, w: strWidth(text), h: 2 };
    if (rect.x + rect.w > bxr) break;
    const alarm = id === "log" && d.log.unseenErrors > 0;
    if (alarm) ui.animate(400);
    const blink = alarm && Math.floor(ui.now / 400) % 2 === 0;
    const hot = ui.hovered(rect);
    const st = chipStyle(ui, on, shellFocused, hot);
    const style = alarm ? { fg: blink ? c.panel : c.error, bg: blink ? c.error : st.bg, attrs: BOLD } : { ...st, attrs: on ? BOLD : 0 };
    drawChip(ui, tx, r.y, rect.w, style.bg);
    ui.text(tx, r.y, text, style);
    ui.hit(rect, { onClick: () => (moved && ws.showIn("shell", null), ti >= 0 && (ws.termIndex = ti), ws.showShellTab(id)), menu: ti >= 0 ? () => termTabMenu(ws, ti) : undefined, tip: id === "term" ? `right-click: rename, close… · term rename <name> · F12 next tab\n${ws.terms[ti]?.shellName ?? ""}: your real shell, with ICEBREAKER's commands added (ib <cmd> forces one)` : id === "ibsh" ? "ICEBREAKER's own shell: works on the vault, rm goes to .trash · F12 next tab" : "the log: what you typed, what clicks ran, errors, messages, debug — tick what you want to see · log" });
    // the terminal shown, when there are several: its × is part of its tab
    if (closable) {
      const xr = { x: tx + rect.w - GAP, y: r.y, w: GAP, h: 1 };
      ui.text(xr.x, r.y, "×", { fg: ui.hovered(xr) ? c.error : style.fg, bg: style.bg, attrs: BOLD });
      ui.hit(xr, { cmd: "term close", tip: t("close this terminal") });
    }
    tx += rect.w + INSET;
    // [+] a new terminal, right after the last one
    // (only where it fits before the panel's buttons: a narrow shell — on the right — keeps `term new`)
    if (id === "term" && ti === ws.terms.length - 1 && tx + 3 <= bxr) {
      const pr = { x: tx, y: r.y, w: 3, h: 1 };
      ui.text(tx, r.y, " + ", { fg: ui.hovered(pr) ? c.bg : c.accent, bg: ui.hovered(pr) ? c.accent : mix(c.panel, c.accent, 0.1), attrs: BOLD });
      ui.hit(pr, { cmd: "term new", tip: t("another terminal · term new") });
      tx += 4;
    }
  }
  // the tabs moved here, after the shell's own
  tx = placeChips(ws, ui, tx, r.y, bxr, "shell", shellFocused);
  // drag the top border to resize: the free part of the tabs' row, and the frame's line under it
  // (`fixed`: maximized, or not along the bottom — its height isn't this border's to change)
  const handle = { x: tx + 2, y: r.y, w: fixed ? 0 : Math.max(0, bxr - 1 - tx - 2), h: 2 };
  ui.hit(handle, {
    onClick: () => {},
    onDrag: (m) => {
      const fromBottom = body.y + body.h - m.y;
      ws.shellRatio = Math.max(0.15, Math.min(0.8, fromBottom / body.h));
    },
    tip: t("drag: resize"),
    cursor: "row-resize",
  });
  // under the pointer: its line lit, a ↕ in the middle (like the borders between frames)
  if (handle.w > 0 && ui.hovered(handle)) {
    const line = { x: handle.x, y: r.y + 1, w: handle.w, h: 1 };
    ui.tint(line, c.accent);
    ui.text(line.x + Math.floor(line.w / 2), line.y, "↕", { fg: c.panel, bg: c.accent, attrs: BOLD });
  }
  if (moved) return void ui.clip(si, () => moved.render(ui, si, shellFocused));
  // the shell's own menu first: what's drawn on it (macros, the terminal) registers after and wins the right-click
  ui.hit(si, { menu: () => shellMenu(ws) });
  // macro bar above the system terminal (one free row under the tabs)
  let termR = si;
  const macrosShown = d.settings.data.shell.macrosShown !== false;
  if (ws.shellTab === "term" && ws.termAvailable && si.h > 6 && macrosShown) {
    const my = si.y + 1;
    termR = { ...si, y: si.y + 3, h: si.h - 3 };
    // ◂ first: folds the macros away (⌗ on the panel's top brings them back)
    const fold = { x: si.x, y: my, w: 3, h: 1 };
    ui.text(fold.x, my, " ◂ ", { fg: ui.hovered(fold) ? c.bg : c.subtle, bg: ui.hovered(fold) ? c.accent : c.highlight, attrs: BOLD });
    ui.hit(fold, { cmd: "macro hide", tip: t("hide the macros · macro show brings them back") });
    let bx = si.x + 4;
    d.settings.data.shell.macros.forEach((m, i) => {
      const label = ` ${m.label} `;
      const rect = { x: bx, y: my, w: strWidth(label), h: 1 };
      if (bx + rect.w > si.x + si.w - 4) return;
      const hot = ui.hovered(rect);
      const bound = Object.entries(d.settings.data.keys ?? {}).find(([, cmd]) => cmd.split(/\s*;\s*/).includes(`macro run ${q(m.label)}`))?.[0];
      ui.text(bx, my, label, hot ? { fg: c.panel, bg: c.accent, attrs: BOLD } : { fg: c.fg, bg: c.highlight });
      ui.hit(rect, {
        onClick: (mi) => void (mi.shift ? editMacro(ws, i) : ws.runMacro(m)),
        tip: `${m.cmd}${bound ? `\n⌨ ${bound}` : ""}\n${t("right-click: shortcut, edit, remove")}`,
        menu: () => macroMenu(ws, i),
      });
      bx += rect.w + 1;
    });
    const plus = { x: bx, y: my, w: 3, h: 1 };
    ui.text(bx, my, " + ", { fg: ui.hovered(plus) ? c.accent : c.subtle, bg: c.highlight, attrs: BOLD });
    ui.hit(plus, { onClick: () => void editMacro(ws, -1), tip: "new macro · or: macro add <label> <command>" });
  }
  ui.clip(si, () => {
    if (ws.shellTab === "term") ws.terminal.render(ui, termR, shellFocused);
    else if (ws.shellTab === "log") ws.logPane.render(ui, si);
    else d.shell.render(ui, si, shellFocused);
  });
}

/** After ~0.6 s on something clickable: its shell command and a tip. */
export function renderTip(ws: Workspace, ui: UI, _screen: Rect): void {
  ws.tipWant = null;
  // (a tab dragged over the panel showed a widget's tip over the drop box)
  if (ws.isDragging) return;
  const { x, y } = ui.mouse;
  let h: Hit | undefined;
  for (let i = ui.hits.length - 1; i >= 0; i--) {
    const it = ui.hits[i];
    if (!inside(it.rect, x, y) || !(it.onClick || it.onDrag || it.cmd || it.tip)) continue;
    h = it.cmd || it.tip ? it : undefined;
    break;
  }
  const key = h ? `${h.rect.x},${h.rect.y},${h.rect.w},${h.cmd ?? ""},${h.tip ?? ""}` : "";
  if (key !== ws.tip.key) {
    ws.tip = { key, since: ui.now };
    ws.tipHidden = false;
  }
  if (!h || ws.tipHidden) return;
  // the deck shows it above the grid (ui/tipview.ts): to the pixel, crisp, gone when the pointer moves
  ws.tipWant = { key, content: { text: h.tip ? osKeys(h.tip) : undefined, cmd: h.cmd } };
}

/**
 * The top bar, one row: "◆ ICEBREAKER ▾" — the deck's menu (modules, the store, NEXUS,
 * settings, the manual, updates, log out: workspace/menus.ts deckMenu) — and on the
 * right UPLINK ■ and the clock. The tabs aren't here any more: each frame has its own,
 * on its border (tabstrip.ts).
 */
export function renderTopBar(ws: Workspace, ui: UI, r: Rect): void {
  const c = ui.c;
  const d = ws.deck;
  ui.fill(r, { bg: c.panelAlt });
  // the logo is the deck's menu (like the apple on a Mac); a narrow window keeps just its mark
  const logo = ` ${r.w < 60 ? ui.theme.glyphs.mark : `${ui.theme.glyphs.mark} ICEBREAKER`} ▾ `;
  const logoRect = { x: r.x, y: r.y, w: strWidth(logo), h: 1 };
  const menuOpen = ws.overlays.some((o) => !o.done && (o as { title?: string }).title === DECK_MENU_TITLE());
  const hot = ui.hovered(logoRect) || menuOpen;
  if (hot) ui.fill(logoRect, { bg: c.highlight });
  ui.gradientText(r.x + INSET, r.y, logo.trim().slice(0, -2), ui.theme.gradient, BOLD, (ui.now / 8000) % 1);
  ui.text(r.x + logoRect.w - GAP, r.y, "▾", { fg: hot ? c.accent : c.subtle, bg: hot ? c.highlight : c.panelAlt });
  ui.hit(logoRect, { onClick: () => ws.openDeckMenu(), tip: t("the deck's menu: modules, store, NEXUS, settings, log out…") });

  const now = new Date();
  const time = now.toLocaleTimeString(d.settings.data.user.locale || undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString(d.settings.data.user.locale || undefined, { weekday: "short", day: "numeric", month: "short" });
  ui.animate(1000 - now.getMilliseconds());
  // UPLINK ■: green when the AI is there and answering, amber while it thinks, red when it's off
  // (the provider and the model are in its tip); narrow: the ■ alone, the time without seconds
  const narrow = r.w < 70;
  // the AI is reading a note right now (ai/tools.ts): said here for a moment, whatever page is in front
  const reading = d.ai.reading && d.ai.reading.until > Date.now() ? d.ai.reading.what : "";
  if (reading) ui.animate(500);
  const ai = narrow ? "■" : "UPLINK ■";
  const right = narrow ? ` ${ai}  ${time.slice(0, 5)} ` : ` ${ai}  │  ${date}  ${time} `;
  const rx = r.x + r.w - strWidth(right);
  if (rx <= logoRect.x + logoRect.w) return;
  // " uplink ■  │  date  time", each part once (drawn over each other, `debug layout` saw an overlap)
  const lamp = !d.ai.ready ? c.error : d.ai.busy > 0 ? c.warning : c.success;
  let lx = ui.text(rx, r.y, " ", { bg: c.panelAlt });
  if (!narrow) lx = ui.text(lx, r.y, "uplink ", { fg: d.ai.ready ? c.fg : c.muted, bg: c.panelAlt, attrs: BOLD });
  lx = ui.text(lx, r.y, "■", { fg: lamp, bg: c.panelAlt });
  ui.text(lx, r.y, right.slice(1 + ai.length), { fg: c.muted, bg: c.panelAlt });
  // "◈ reads notes/ideas.md", left of UPLINK, while the AI reads (as much of the name as fits)
  if (reading) {
    const room = rx - (logoRect.x + logoRect.w) - GAP * 2;
    const label = `◈ ${t("the AI reads")} ${reading}`;
    if (room >= 12) ui.textRight(rx - GAP, r.y, strWidth(label) > room ? `${label.slice(0, Math.max(0, room - 1))}…` : label, { fg: c.warning, bg: c.panelAlt, attrs: BOLD });
  }
  const who = `${d.ai.provider.label}`;
  ui.hit({ x: rx, y: r.y, w: strWidth(ai) + 2, h: 1 }, d.ai.ready ? { cmd: "link", tip: `UPLINK: ${who}${d.ai.busy > 0 ? ` · ${t("thinking…")}` : ""}\nctrl+space · or \`chat\` right here in the shell` } : { cmd: "settings", tip: `UPLINK ${t("off")}: ${d.ai.problem ?? ""}` });
}

/** What the voice says, in a small sci-fi box bottom-right (voice.subtitles). */
export function renderSubtitles(ws: Workspace, ui: UI, W: number, H: number): void {
  const sub = ws.deck.voice.subtitle;
  if (!sub || ws.deck.settings.data.voice.subtitles === false) return;
  const c = ui.c;
  const w = Math.min(46, W - 4);
  const words = sub.text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const wd of words) {
    if (strWidth(line + " " + wd) > w - 9 && line) (lines.push(line), (line = wd));
    else line = line ? `${line} ${wd}` : wd;
  }
  lines.push(line);
  const shown = lines.slice(0, 3);
  const h = shown.length + 2;
  const r = { x: W - w - 2, y: H - h - 2, w, h };
  ui.box(r, { title: "VOICE", focused: true, bg: c.panelAlt });
  // a click on it: stop talking
  ui.hit(r, { onClick: () => ws.deck.voice.stop(), tip: t("click: stop reading"), block: true });
  // a little orbit spinning, the AI thinking out loud
  const spin = ui.now / 120;
  const orbit = ["◜", "◝", "◞", "◟"];
  ui.text(r.x + 2, r.y + 1, orbit[Math.floor(spin) % 4], { fg: c.accent, attrs: BOLD, bg: c.panelAlt });
  ui.text(r.x + 3, r.y + 1, orbit[Math.floor(spin + 2) % 4], { fg: c.accentAlt, bg: c.panelAlt });
  const wave = "▁▂▃▅▃▂";
  ui.text(r.x + 2, r.y + 2, [...Array(3)].map((_, i) => wave[Math.floor(spin + i * 2) % wave.length]).join(""), { fg: c.accent, bg: c.panelAlt });
  // the words type in
  const typed = Math.floor((ui.now - sub.at) / 28);
  let left = typed;
  shown.forEach((l, i) => {
    const part = l.slice(0, Math.max(0, left));
    left -= l.length + 1;
    ui.text(r.x + 7, r.y + 1 + i, part, { fg: c.fg, bg: c.panelAlt }, w - 9);
  });
  ui.animate(60);
}

/**
 * Full screen on a MacBook: the rows behind the camera notch. Nothing is written
 * there (the top bar already says ICEBREAKER): only the deck's own background,
 * so the screen is the deck's from edge to edge, no black band.
 */
export function renderNotchBand(ui: UI, r: Rect): void {
  ui.fill(r, { bg: ui.c.bg });
}

export function renderStatusBar(ws: Workspace, ui: UI, r: Rect): void {
  const c = ui.c;
  const d = ws.deck;
  ui.fill(r, { bg: c.statusBg });
  // a frame showing a tab moved there speaks for that page
  const page = ws.focus === "main" ? ws.activeApp : ws.focusedPage;
  const pane = page ? page.kind : ws.focus === "main" ? "deck" : ws.focus === "sidebar" ? "vault" : ws.focus === "panel" ? "panel" : "shell";
  const status = page && ws.focus !== "main" ? osKeys(page.status?.() ?? "")
    : ws.focus === "shell" && ws.shellTab === "term" && ws.termAvailable
    ? `${ws.sysTerm?.shellName ?? "terminal"} · ${terminalKeysHint()} · ⇧⇧ menu · F12 tabs`
    : ws.focus === "shell" ? d.shell.status() : ws.focus === "sidebar" ? "enter open · n new note · r rescan" : ws.focus === "panel" ? t("e edit · a add a widget · right-click: move, remove · ⌘⇧P hide") : osKeys(ws.activeApp?.status?.() ?? "");

  // right side: each with its priority — when the bar is too narrow, the least important go
  // first (ui/layout.ts Bar), the keys on the left shrink (cut with …): nothing overlaps
  const parts: { text: string; fg: number; cmd?: string; tip?: string; priority: number }[] = [];
  if (d.settings.data.privacy.stealth) parts.push({ text: `◉ ${t("stealth")}`, fg: c.success, cmd: "stealth", tip: t("100 % local: no internet · stealth off"), priority: 9 });
  if (d.voice.speaking) parts.push({ text: `◖ ${t("voice")}`, fg: c.accentAlt, cmd: "voice stop", tip: t("speaking · click to stop"), priority: 8 });
  if (d.gamepad.connected) parts.push({ text: "◈ pad", fg: c.success, priority: 4 });
  if (ws.terminalOn) parts.push(ws.shellVisible ? { text: "▾ shell", fg: c.muted, cmd: "term hide", tip: "fold the shell away · ctrl+`", priority: 6 } : { text: "▴ shell", fg: c.accent, cmd: "term show", tip: "bring the shell back · ctrl+`", priority: 6 });
  parts.push({ text: "⌨", fg: ws.overlays.some((o) => o instanceof Osk) ? c.accent : c.muted, cmd: "osk", tip: "on-screen keyboard · pad: X", priority: 2 });
  parts.push({ text: "✦ fx", fg: c.accentAlt, cmd: "view fx", tip: "bloom, scanlines… · `fx` in the shell", priority: 3 });
  // a module playing sound of its own (ib.audio): its name, one click silences it
  for (const id of d.mixer.playing()) parts.push({ text: `♪ ${d.plugins.list().find((p) => p.manifest.id === id)?.manifest.name ?? id}`, fg: c.accent, cmd: `audio stop ${id}`, tip: t("a module is playing sound · click to stop it"), priority: 7 });
  const muted = !!d.settings.data.sound.muted;
  parts.push({ text: muted ? "⊘ mute" : "♪", fg: muted ? c.error : c.muted, cmd: "mute", tip: muted ? t("muted: click to hear things again") : t("mute everything (sounds, voice, alerts)"), priority: muted ? 7 : 3 });
  parts.push({ text: "☾", fg: c.muted, cmd: "screensaver", tip: t("screensaver now (any key brings you back)"), priority: 1 });
  if (d.settings.data.appearance.showFps) parts.push({ text: `${d.loop.fps}fps ${d.loop.frameMs.toFixed(1)}ms`, fg: c.subtle, priority: 2 });
  parts.push({ text: `${IS_MAC ? "⌘K" : "^K"} ${t("menu")}`, fg: c.muted, cmd: "menu", priority: 9 });
  parts.push({ text: `F1 ${t("help")}`, fg: c.muted, cmd: "manual", priority: 5 });
  // the two side frames' switches, last on the right: the tree (left, ◧) and the panel (right, ◨)
  parts.push({ text: `◧ ${t("tree")}`, fg: d.workspace.sidebarVisible ? c.accent : c.muted, cmd: "view sidebar", tip: `${t("the file tree on the left · view sidebar")} · ${IS_MAC ? "⌘B" : "ctrl+B"}`, priority: 8 });
  parts.push({ text: `◨ ${t("panel")}`, fg: d.settings.data.panel?.shown ? c.accent : c.muted, cmd: "panel", tip: `${t("the side panel: widgets always in view · panel")} · ${IS_MAC ? "⌘⇧P" : "ctrl+shift+P"}`, priority: 8 });

  // the things touch: each right part carries its own "│ " and spaces
  const bar = new Bar(ui, r.x, r.y, r.x + r.w, 0);
  const label = ` ${pane.toLowerCase()} `;
  bar.item(strWidth(label) + 1, (x) => {
    const e = ui.text(x, r.y, label, { fg: c.panel, bg: c.accent, attrs: BOLD });
    ui.text(e, r.y, "", { fg: c.accent, bg: c.statusBg });
  }, { priority: 10 });
  if (status) bar.text(` ${status} `, { fg: c.statusFg, bg: c.statusBg }, { priority: 1, fit: 12 });
  for (const p of parts) {
    const w = strWidth(p.text);
    bar.item(w + 3, (rx) => {
      ui.text(rx, r.y, "│ ", { fg: c.faint, bg: c.statusBg });
      // the whole cell is the button (the separator and the spaces around the text too):
      // a one-character button like ◨ is hard to hit otherwise
      const cell = { x: rx, y: r.y, w: w + 3, h: 1 };
      const hot = !!p.cmd && ui.hovered(cell);
      if (hot) ui.fill({ x: rx + 1, y: r.y, w: w + 2, h: 1 }, { bg: c.highlight });
      ui.text(rx + 2, r.y, p.text, { fg: hot ? c.accent : p.fg, bg: hot ? c.highlight : c.statusBg });
      if (p.cmd) ui.hit(cell, { cmd: p.cmd, tip: p.tip });
    }, { side: "right", priority: p.priority });
  }
  bar.draw();
}

/**
 * Edit mode, impossible to miss: one band across the top of the page AND the
 * side panel (they're edited together), gently pulsing, with the keys and a
 * way out.
 */
export function editBand(ws: Workspace, ui: UI, page: Rect, panel: Rect | null): void {
  const c = ui.c;
  // across the page and the panel when they sit side by side on the same top line (wherever
  // the panel is: right, left — frame move panel left); otherwise across the page alone
  const beside = !!panel && panel.y === page.y;
  const left = beside ? Math.min(page.x, panel!.x) : page.x;
  const right = beside ? Math.max(page.x + page.w, panel!.x + panel!.w) : page.x + page.w;
  const band = { x: left, y: page.y, w: right - left, h: 1 };
  const pulse = 0.75 + 0.25 * Math.sin(ui.now / 400);
  const bg = mix(c.bg, c.accent, pulse);
  ui.fill(band, { bg });
  const done = ` ✓ ${t("done")} `;
  const dr = { x: band.x + band.w - strWidth(done) - 1, y: band.y, w: strWidth(done), h: 1 };
  ui.text(band.x + 1, band.y, ` ✎ ${t("EDIT MODE")} · ${t("HOME and the panel")} · ${t("drag to move · the corner ◢ or shift+arrows resize · a add · x remove · ⌘Z undo")}`, { fg: c.panel, bg, attrs: BOLD }, dr.x - band.x - 2);
  ui.text(dr.x, dr.y, done, { fg: ui.hovered(dr) ? c.accent : c.fg, bg: ui.hovered(dr) ? c.panel : c.panelAlt, attrs: BOLD });
  ui.hit(dr, { onClick: () => void (ws.editing = false), tip: "esc · e" });
  ui.animate(60);
}

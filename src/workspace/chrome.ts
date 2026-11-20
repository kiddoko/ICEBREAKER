/**
 * THE FRAME AROUND THE PAGE: the top bar (tabs, buttons), the status bar, the
 * shell panel at the bottom (its tabs, the macro buttons, the terminal / ibsh /
 * LOG), the hover tip and the voice's subtitles. Workspace.render calls these;
 * they read the workspace, they don't own any state.
 */
import { mix } from "../core/color";
import { t } from "../core/i18n";
import { BOLD, type Rect } from "../core/grid";
import { IS_MAC } from "../core/input";
import { strWidth } from "../core/unicode";
import { inside, q, type Hit, type UI } from "../ui/ui";
import { Osk } from "./overlays";
import { SystemTerminal } from "../shell/systerm";
import type { ShellTab, Workspace } from "./workspace";
import { editMacro, macroMenu, shellMenu, tabMenu, termTabMenu } from "./menus";

/**
 * The shell panel: tabs on its top border (your terminals [+] │ ibsh · history ·
 * errors), the window-style buttons on the right, the macro row above a system
 * terminal, then the shell itself. Its top border drags to resize.
 */
export function renderShellPanel(ws: Workspace, ui: UI, r: Rect, body: Rect, max: boolean): void {
  const d = ws.deck;
  ws.rects.shell = r;
  const shellFocused = ws.focus === "shell" && !ws.topModal;
  const c = ui.c;
  if (!ws.shellTabChosen && ws.termAvailable) ws.shellTab = "term";
  if (ws.shellTab === "term" && !ws.termAvailable) ws.shellTab = "ibsh";
  const si = ui.box(r, { focused: shellFocused });
  // tabs on the top border, drawn as chips: your terminals │ ibsh · history · errors.
  // The panel's buttons (scripts, hide, maximize) sit apart, on the right.
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
  let bxr = r.x + r.w - 2;
  for (const [icon, cmd, tip] of [...buttons].reverse()) {
    const br = { x: bxr - 3, y: r.y, w: 3, h: 1 };
    if (br.x < r.x + r.w / 2) break;
    const hot = ui.hovered(br);
    ui.text(br.x, r.y, ` ${icon} `, { fg: hot ? c.bg : c.fg, bg: hot ? (cmd === "term hide" ? c.warning : c.accent) : mix(c.panel, c.fg, 0.14) });
    ui.hit(br, { cmd, tip });
    bxr = br.x - 1;
  }
  // the tabs, as chips: your terminals [+] │ ibsh · history · errors
  const chipBg = mix(c.panel, c.accent, 0.1);
  const chip = (x: number, text: string, style: { fg: number; bg: number; attrs?: number }) => (ui.text(x, r.y, text, style), strWidth(text));
  let tx = r.x + 2;
  let lastGroup = "";
  for (const [id, label, ti] of tabs) {
    const group = id === "term" ? "term" : "deck";
    if (lastGroup && group !== lastGroup) (ui.text(tx, r.y, "│", { fg: c.faint, bg: c.panel }), (tx += 2));
    lastGroup = group;
    const on = id === ws.shellTab && (ti < 0 || ti === ws.termIndex);
    const icon = id === "term" ? "❯" : id === "ibsh" ? ui.theme.glyphs.mark : id === "log" ? "≣" : "";
    const text = ` ${icon && !label.startsWith("⚠") ? `${icon} ` : ""}${label} `;
    const rect = { x: tx, y: r.y, w: strWidth(text), h: 1 };
    if (rect.x + rect.w > bxr) break;
    const alarm = id === "log" && d.log.unseenErrors > 0;
    if (alarm) ui.animate(400);
    const blink = alarm && Math.floor(ui.now / 400) % 2 === 0;
    const onBg = shellFocused ? c.accent : mix(c.accent, c.panel, 0.35);
    const style = alarm
      ? { fg: blink ? c.panel : c.error, bg: blink ? c.error : chipBg, attrs: BOLD }
      : on
        ? { fg: c.bg, bg: onBg, attrs: BOLD }
        : { fg: ui.hovered(rect) ? c.accent : c.fg, bg: chipBg };
    tx += chip(tx, text, style);
    ui.hit(rect, { onClick: () => (ti >= 0 && (ws.termIndex = ti), ws.showShellTab(id)), menu: ti >= 0 ? () => termTabMenu(ws, ti) : undefined, tip: id === "term" ? `right-click: rename, close… · term rename <name> · F12 next tab\n${ws.terms[ti]?.shellName ?? ""}: your real shell, with ICEBREAKER's commands added (ib <cmd> forces one)` : id === "ibsh" ? "ICEBREAKER's own shell: works on the vault, rm goes to .trash · F12 next tab" : "the log: what you typed, what clicks ran, errors, messages, debug — tick what you want to see · log" });
    // the terminal shown, when there are several: its × is part of its chip
    if (id === "term" && on && ws.terms.length > 1) {
      const xr = { x: tx, y: r.y, w: 2, h: 1 };
      tx += chip(tx, "× ", { fg: ui.hovered(xr) ? c.error : c.bg, bg: onBg, attrs: BOLD });
      ui.hit(xr, { cmd: "term close", tip: t("close this terminal") });
    }
    tx += 1;
    // [+] a new terminal, right after the last one
    if (id === "term" && ti === ws.terms.length - 1) {
      const pr = { x: tx, y: r.y, w: 3, h: 1 };
      tx += chip(tx, " + ", { fg: ui.hovered(pr) ? c.bg : c.accent, bg: ui.hovered(pr) ? c.accent : chipBg, attrs: BOLD }) + 1;
      ui.hit(pr, { cmd: "term new", tip: t("another terminal · term new") });
    }
  }
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
  // drag the top border to resize
  const handle = { x: tx + 2, y: r.y, w: max ? 0 : Math.max(0, r.x + r.w - 30 - tx), h: 1 };
  ui.hit(handle, {
    onClick: () => {},
    onDrag: (m) => {
      const fromBottom = body.y + body.h - m.y;
      ws.shellRatio = Math.max(0.15, Math.min(0.8, fromBottom / body.h));
    },
  });
}

/** After ~0.6 s on something clickable: its shell command and a tip. */
export function renderTip(ws: Workspace, ui: UI, screen: Rect): void {
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
  const wait = 650 - (ui.now - ws.tip.since);
  if (wait > 0) return ui.animate(wait);
  const c = ui.c;
  const lines: { t: string; fg: number; attrs?: number }[] = [];
  if (h.cmd) lines.push({ t: `❯ ${h.cmd}`, fg: c.accent, attrs: BOLD });
  if (h.tip) for (const l of h.tip.split("\n")) lines.push({ t: l, fg: c.muted });
  const w = Math.min(screen.w - 2, Math.max(...lines.map((l) => strWidth(l.t))) + 4);
  const hgt = lines.length + 2;
  let bx = Math.min(x + 2, screen.w - w - 1);
  let by = y + 1;
  if (by + hgt > screen.h - 1) by = Math.max(0, y - hgt);
  if (bx < 0) bx = 0;
  ui.box({ x: bx, y: by, w, h: hgt }, { bg: c.panelAlt, border: "single" });
  lines.forEach((l, i) => ui.text(bx + 2, by + 1 + i, l.t, { fg: l.fg, bg: c.panelAlt, attrs: l.attrs }, w - 4));
}

export function renderTopBar(ws: Workspace, ui: UI, r: Rect): void {
  const c = ui.c;
  const d = ws.deck;
  ui.fill(r, { bg: c.panelAlt });
  let x = ui.text(r.x, r.y, " ", { bg: c.panelAlt });
  // a narrow window (or a big interface scale): the logo keeps just its mark
  x = ui.gradientText(x, r.y, r.w < 90 ? ui.theme.glyphs.mark : `${ui.theme.glyphs.mark} ICEBREAKER`, ui.theme.gradient, BOLD, (ui.now / 8000) % 1);
  x += 2;

  // right side first, so tabs know how much room they have
  const now = new Date();
  const time = now.toLocaleTimeString(d.settings.data.user.locale || undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString(d.settings.data.user.locale || undefined, { weekday: "short", day: "numeric", month: "short" });
  ui.animate(1000 - now.getMilliseconds());
  // narrow (small window, big interface scale): the right side shrinks so the tabs keep room
  const narrow = r.w < 110;
  const ai = d.ai.ready ? (narrow ? ui.theme.glyphs.mark : `${ui.theme.glyphs.mark} ${d.ai.provider.label}`) : narrow ? "○" : `○ ${t("offline")}`;
  // settings stay one click away whatever is open
  const gear = narrow ? " ⚙ " : ` ⚙ ${t("settings")} `;
  const right = narrow ? ` ${ai} ${time.slice(0, 5)} ` : ` ${ai}  │  ${date}  ${time} `;
  // log out, at the very end of the bar: back to the login page
  const off = narrow ? " ⏻ " : ` ⏻ ${t("log out")} `;
  const ox = r.x + r.w - strWidth(off);
  const rx = ox - strWidth(right);
  const gx = rx - strWidth(gear) - 1;
  const gearRect = { x: gx, y: r.y, w: strWidth(gear), h: 1 };
  const gearHot = ui.hovered(gearRect) || ws.activeApp?.kind === "settings";
  ui.text(gx, r.y, gear, { fg: gearHot ? c.panel : c.muted, bg: gearHot ? c.accent : c.highlight });
  ui.hit(gearRect, { cmd: "settings", tip: "ctrl+, · or `config list` in the shell" });
  // the places you go all the time, one click away
  let nx = gx - 1;
  const nav: [string, string, string, string][] = [
    ["modules", `▦ ${t("modules")}`, "launch modules", "all apps and modules · m on HOME"],
    ["store", `⇣ ${t("store")}`, "store", "modules and themes from GitHub · store in the shell"],
    ["explorer", `⬡ ${t("nexus")}`, "launch explorer", "the vault in 3D · explore in the shell"],
  ];
  // a narrow window: the buttons shrink to their icon so the tabs keep their room
  const tabsW = ws.tabs.slice(0, ws.tabCount).reduce((n, tb, i) => n + strWidth(` ${i + 1}:${tb.title().toLowerCase()} `) + 1, 0) + 4;
  const navW = nav.filter(([k]) => d.apps.get(k)).reduce((n, [, label]) => n + strWidth(label) + 3, 0);
  const compact = x + tabsW > gx - navW;
  for (const [kind, full, cmd, tip] of nav) {
    if (!d.apps.get(kind)) continue; // its module is off or removed
    const label = compact ? full.split(" ")[0] : full;
    const lw = strWidth(label) + 2;
    nx -= lw;
    ui.button(nx, r.y, label, () => {}, { quiet: true, selected: ws.activeApp?.kind === kind, cmd, tip: compact ? `${full.slice(2)} · ${tip}` : tip });
    nx -= 1;
  }
  ui.text(rx, r.y, right, { fg: c.muted, bg: c.panelAlt });
  ui.text(rx + 1, r.y, ai, { fg: d.ai.ready ? c.accent : c.error, bg: c.panelAlt });
  ui.hit({ x: rx, y: r.y, w: strWidth(ai) + 2, h: 1 }, d.ai.ready ? { cmd: "link", tip: "ctrl+space · or `chat` right here in the shell" } : { cmd: "settings", tip: `AI offline: ${d.ai.problem ?? ""}` });
  const offRect = { x: ox, y: r.y, w: strWidth(off), h: 1 };
  const offHot = ui.hovered(offRect);
  ui.text(ox, r.y, off, { fg: offHot ? c.panel : c.error, bg: offHot ? c.error : mix(c.error, c.panelAlt, 0.82), attrs: BOLD });
  ui.hit(offRect, { cmd: "logout", tip: t("log out: back to the login page · ⌘⇧L") });

  // the button-pages (NEXUS, STORE…) have no tab: their button lights up instead
  renderTabs(ws, ui, { x, y: r.y, w: Math.max(0, nx - x - 1), h: 1 });
}

/**
 * The tabs, like a browser's: wide when there are few, narrower as more open
 * (never below a minimum). When even that doesn't fit, the last chip is
 * "▾ +N": a menu of the tabs that didn't fit. The tab shown is always visible.
 * Each tab: its number, its name (cut with … if needed), and × to close it.
 */
export function renderTabs(ws: Workspace, ui: UI, r: Rect): void {
  const c = ui.c;
  const n = ws.tabCount;
  const MAXW = 18, MINW = 8;
  const plusW = 3; // "+" (open anything) at the end
  const avail = r.w - plusW;
  let tabW = n ? Math.max(MINW, Math.min(MAXW, Math.floor(avail / n) - 1)) : MAXW;
  // which tabs get a chip: all of them, or as many as fit (the shown one always among them)
  let shown = Array.from({ length: n }, (_, i) => i);
  const moreW = 7;
  if (n * (tabW + 1) > avail) {
    tabW = MINW;
    const fit = Math.max(1, Math.floor((avail - moreW) / (tabW + 1)));
    shown = shown.slice(0, fit);
    const act = Math.min(ws.active, n - 1);
    if (act >= fit) shown[fit - 1] = act;
  }
  const hidden = Array.from({ length: n }, (_, i) => i).filter((i) => !shown.includes(i));
  const nameOf = (i: number) => `${i + 1}:${ws.tabs[i].title().toLowerCase()}`;
  let x = r.x;
  for (const i of shown) {
    const rect = { x, y: r.y, w: tabW, h: 1 };
    const isActive = i === ws.active;
    const hot = ui.hovered(rect);
    const style = isActive ? { fg: c.panel, bg: c.accent, attrs: BOLD } : { fg: hot ? c.fg : c.muted, bg: hot ? c.highlight : mix(c.panelAlt, c.fg, 0.05) };
    // " 3:name…   × " — the × keeps a space on each side, away from the edge
    ui.fill(rect, { bg: style.bg });
    // not saved yet: a red dot before the name (it goes once saved — ⌘S, the toolbar, right-click)
    const unsaved = !!ws.tabs[i].dirty?.();
    if (unsaved) ui.text(x + 1, r.y, "●", { fg: c.error, bg: style.bg, attrs: BOLD });
    ui.text(x + (unsaved ? 3 : 1), r.y, nameOf(i), style, tabW - (unsaved ? 7 : 5));
    const closeX = x + tabW - 3;
    const closeHot = ui.hovered({ x: closeX, y: r.y, w: 2, h: 1 });
    ui.text(closeX, r.y, isActive || hot ? "×" : " ", { fg: closeHot ? c.error : isActive ? c.panel : c.subtle, bg: style.bg, attrs: closeHot ? BOLD : 0 });
    ui.hit(rect, { cmd: `tab ${i + 1}`, tip: `${ws.tabs[i].title()}\n${IS_MAC ? `⌘${i + 1}` : `ctrl+${i + 1}`} · ${t("right-click: close others…")}`, menu: () => tabMenu(ws, i) });
    ui.hit({ x: closeX - 1, y: r.y, w: 3, h: 1 }, { cmd: `tab close ${i + 1}`, tip: t("close · ctrl+w · shift+esc") });
    x += tabW + 1;
  }
  // the tabs that didn't fit: a menu
  if (hidden.length) {
    const label = ` ▾ +${hidden.length} `;
    const rect = { x, y: r.y, w: strWidth(label), h: 1 };
    const hot = ui.hovered(rect);
    ui.text(x, r.y, label, { fg: hot ? c.panel : c.accent, bg: hot ? c.accent : c.highlight, attrs: BOLD });
    ui.hit(rect, {
      onClick: () => ws.openMenu(hidden.map((i) => ({ label: nameOf(i), cmd: `tab ${i + 1}`, hint: i < 9 ? (IS_MAC ? `⌘${i + 1}` : `ctrl+${i + 1}`) : "" })), rect.x, r.y + 1, t("more tabs")),
      tip: t("{n} more tabs: click for the list", { n: hidden.length }),
    });
    x += rect.w + 1;
  }
  if (x + 1 < r.x + r.w + plusW) {
    const pr = { x, y: r.y, w: 1, h: 1 };
    ui.text(x, r.y, "+", { fg: ui.hovered(pr) ? c.accent : c.subtle, bg: c.panelAlt, attrs: BOLD });
    ui.hit(pr, { cmd: "palette", tip: t("open anything · ctrl+k") });
  }
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
  const pane = ws.focus === "main" ? (ws.activeApp?.kind ?? "deck") : ws.focus === "sidebar" ? "vault" : ws.focus === "panel" ? "panel" : "shell";
  let x = ui.text(r.x, r.y, ` ${pane.toUpperCase()} `, { fg: c.panel, bg: c.accent, attrs: BOLD });
  x = ui.text(x, r.y, "", { fg: c.accent, bg: c.statusBg });
  const status = ws.focus === "shell" && ws.shellTab === "term" && ws.termAvailable
    ? `${ws.sysTerm?.shellName ?? "terminal"} · ctrl = Control (nano: ctrl+X quits) · ⌘C ⌘V copy/paste · ⇧⇧ menu · F12 tabs`
    : ws.focus === "shell" ? d.shell.status() : ws.focus === "sidebar" ? "enter open · n new note · r rescan" : ws.focus === "panel" ? t("e edit · a add a widget · right-click: move, remove · ⌘⇧P hide") : (ws.activeApp?.status?.() ?? "");

  // right side
  const parts: { text: string; fg: number; cmd?: string; tip?: string }[] = [];
  if (d.settings.data.privacy.stealth) parts.push({ text: `◉ ${t("stealth")}`, fg: c.success, cmd: "stealth", tip: t("100 % local: no internet · stealth off") });
  if (d.voice.speaking) parts.push({ text: `◖ ${t("voice")}`, fg: c.accentAlt, cmd: "voice stop", tip: t("speaking · click to stop") });
  if (d.gamepad.connected) parts.push({ text: "◈ pad", fg: c.success });
  if (ws.terminalOn) parts.push(ws.shellVisible ? { text: "▾ shell", fg: c.muted, cmd: "term hide", tip: "fold the shell away · ctrl+`" } : { text: "▴ shell", fg: c.accent, cmd: "term show", tip: "bring the shell back · ctrl+`" });
  parts.push({ text: "⌨", fg: ws.overlays.some((o) => o instanceof Osk) ? c.accent : c.muted, cmd: "osk", tip: "on-screen keyboard · pad: X" });
  parts.push({ text: "✦ fx", fg: c.accentAlt, cmd: "view fx", tip: "bloom, scanlines… · `fx` in the shell" });
  // a module playing sound of its own (ib.audio): its name, one click silences it
  for (const id of d.mixer.playing()) parts.push({ text: `♪ ${d.plugins.list().find((p) => p.manifest.id === id)?.manifest.name ?? id}`, fg: c.accent, cmd: `audio stop ${id}`, tip: t("a module is playing sound · click to stop it") });
  const muted = !!d.settings.data.sound.muted;
  parts.push({ text: muted ? "⊘ mute" : "♪", fg: muted ? c.error : c.muted, cmd: "mute", tip: muted ? t("muted: click to hear things again") : t("mute everything (sounds, voice, alerts)") });
  parts.push({ text: "☾", fg: c.muted, cmd: "screensaver", tip: t("screensaver now (any key brings you back)") });
  if (d.settings.data.appearance.showFps) parts.push({ text: `${d.loop.fps}fps ${d.loop.frameMs.toFixed(1)}ms`, fg: c.subtle });
  parts.push({ text: `${IS_MAC ? "⌘K" : "^K"} ${t("menu")}`, fg: c.muted, cmd: "menu" });
  parts.push({ text: `F1 ${t("help")}`, fg: c.muted, cmd: "manual" });
  // the side panel's switch: always the last thing on the right
  parts.push({ text: `◧ ${t("panel")}`, fg: d.settings.data.panel?.shown ? c.accent : c.muted, cmd: "panel", tip: `${t("the side panel: widgets always in view · panel")} · ${IS_MAC ? "⌘⇧P" : "ctrl+shift+P"}` });
  const rightW = parts.reduce((s, p) => s + strWidth(p.text) + 3, 0);
  let rx = r.x + r.w - rightW;
  ui.text(x + 1, r.y, status, { fg: c.statusFg, bg: c.statusBg }, Math.max(0, rx - x - 3));
  for (const p of parts) {
    const w = strWidth(p.text);
    ui.text(rx, r.y, "│ ", { fg: c.faint, bg: c.statusBg });
    // the whole cell is the button (the separator and the spaces around the text too):
    // a one-character button like ◧ is hard to hit otherwise
    const cell = { x: rx, y: r.y, w: w + 3, h: 1 };
    const hot = !!p.cmd && ui.hovered(cell);
    if (hot) ui.fill({ x: rx + 1, y: r.y, w: w + 2, h: 1 }, { bg: c.highlight });
    ui.text(rx + 2, r.y, p.text, { fg: hot ? c.accent : p.fg, bg: hot ? c.highlight : c.statusBg });
    if (p.cmd) ui.hit(cell, { cmd: p.cmd, tip: p.tip });
    rx += w + 3;
  }
}

/**
 * Edit mode, impossible to miss: one band across the top of the page AND the
 * side panel (they're edited together), gently pulsing, with the keys and a
 * way out.
 */
export function editBand(ws: Workspace, ui: UI, page: Rect, panel: Rect | null): void {
  const c = ui.c;
  const right = panel ? panel.x + panel.w : page.x + page.w;
  const band = { x: page.x, y: page.y, w: right - page.x, h: 1 };
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

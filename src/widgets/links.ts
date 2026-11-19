import { mix } from "../core/color";
import type { Rect } from "../core/grid";
import { FileBrowser } from "../workspace/filebrowser";
import type { UI } from "../ui/ui";
import { strWidth, truncate } from "../core/unicode";
import { BOLD } from "../core/grid";
import { t } from "../core/i18n";
import type { Deck } from "../deck";
import { q } from "../ui/ui";
import type { WidgetSpec } from "./types";

/**
 * Shortcut widgets: 1×1 on HOME (never bigger, never smaller), each one opens
 * anything — a module, a note, a folder, a page, a macro, any command — and
 * wears the icon of what it opens. Kept in settings (home.links); each becomes
 * a widget `link.<id>`.
 *
 *   home link new                      the picker (also: + widget → Shortcut)
 *   home link add <label> "<cmd>" [icon]
 *   home link rm <label> · home links
 */
export interface HomeLink {
  id: string;
  label: string;
  icon: string;
  cmd: string;
}

/** What a square opens — shown on it, so you know before you click. */
export type LinkKind = "module" | "folder" | "file" | "page" | "macro" | "command";

/** A square's kind, from the command it runs. */
export function kindOf(l: HomeLink): LinkKind {
  const c = l.cmd.trim();
  if (/^explore\b/.test(c)) return "folder";
  if (/^open\b/.test(c)) return "file";
  if (/^launch\b/.test(c) || / open$/.test(c)) return "module";
  if (/^macro run\b/.test(c)) return "macro";
  if (/^(home|nexus|modules|store|settings|shortcuts|trash open|journal)$/.test(c)) return "page";
  return "command";
}

const KIND: Record<LinkKind, { word: string; short: string; color: (c: UI["c"]) => number }> = {
  module: { word: "MODULE", short: "MOD", color: (c) => c.accent },
  folder: { word: "FOLDER", short: "DIR", color: (c) => c.warning },
  file: { word: "FILE", short: "FILE", color: (c) => c.accentAlt },
  page: { word: "PAGE", short: "PAGE", color: (c) => c.info },
  macro: { word: "MACRO", short: "MAC", color: (c) => c.success },
  command: { word: "COMMAND", short: "CMD", color: (c) => c.subtle },
};

/** The folder a folder square opens ("explore notes/projects" → "notes/projects"). */
const folderOf = (l: HomeLink) => l.cmd.replace(/^explore\s+/, "").replace(/^"(.*)"$/, "$1").replace(/^\//, "");

/** where each square was drawn last (its folder browser opens under it) */
const drawnAt = new Map<string, Rect>();

/** A square's size in HOME units: 1 column wide, 2 rows high — about square on screen. */
const SQUARE = { w: 1, h: 2 };

/** The entry of the widget picker: choosing it asks what to link (it's never placed itself). */
export const NEW_LINK = "link.new";

export const links = (deck: Deck): HomeLink[] => deck.settings.data.home.links ?? [];

const unregister = new Map<string, () => void>();

/** One widget per link (and the "new" entry of the picker). Call after any change. */
export function syncLinkWidgets(deck: Deck): void {
  const want = new Set(links(deck).map((l) => `link.${l.id}`));
  for (const [id, off] of unregister) if (!want.has(id)) (off(), unregister.delete(id));
  if (!deck.widgets.get(NEW_LINK))
    deck.widgets.register({
      id: NEW_LINK,
      title: "Shortcut",
      description: "one square that opens anything: a module, a note, a folder, a page, a macro, a command",
      size: SQUARE,
      min: SQUARE,
      max: SQUARE,
      render: () => {},
    });
  // squares made before they were square (1×1): 1×2 now
  const placed = deck.settings.data.home.widgets;
  if (placed.some((p) => p.id.startsWith("link.") && p.h < SQUARE.h)) deck.settings.set("home.widgets", placed.map((p) => (p.id.startsWith("link.") && p.h < SQUARE.h ? { ...p, h: SQUARE.h } : p)));
  for (const l of links(deck)) {
    const id = `link.${l.id}`;
    unregister.get(id)?.();
    unregister.set(id, deck.widgets.register(linkSpec(l)));
  }
}

function linkSpec(l: HomeLink): WidgetSpec {
  const kind = kindOf(l);
  return {
    id: `link.${l.id}`,
    title: l.label,
    description: `${KIND[kind].word.toLowerCase()} · ${l.cmd}`,
    size: SQUARE,
    min: SQUARE,
    max: SQUARE,
    picker: false,
    clickActivates: true,
    frameless: true,
    // a folder opens its little browser under the square; the rest run their command
    activate: ({ deck }) => {
      if (kind === "folder") deck.workspace.push(new FileBrowser(deck, { source: "vault", start: folderOf(l), title: `▣ ${l.label}`, anchor: drawnAt.get(l.id) }));
      else void deck.act(l.cmd);
    },
    render(ui, slot, { focused }) {
      const c = ui.c;
      // truly square on screen: cells are taller than wide (ui.cellAspect = width / height),
      // so the tile is as many columns as it is rows ÷ the aspect, centred in its slot
      const r = squareIn(slot, ui.cellAspect);
      drawnAt.set(l.id, r);
      const hot = ui.hovered(r);
      const col = KIND[kind].color(c);
      const bg = focused ? mix(c.panel, col, 0.2) : hot ? mix(c.panel, col, 0.12) : mix(c.panel, col, 0.05);
      ui.fill(r, { bg });
      const st = { bg };
      const tip = `${l.label} — ${t(KIND[kind].word.toLowerCase())}\n${kind === "folder" ? t("click: browse it here") : l.cmd}`;
      if (r.h < 3) {
        // a flat chip (rows not stretched): the kind, the icon and the name on one line
        ui.text(r.x, r.y, "▌", { fg: col, ...st });
        ui.text(r.x + 1, r.y, truncate(`${l.icon} ${l.label}`, r.w - 1), { fg: hot || focused ? c.fg : col, attrs: BOLD, ...st });
      } else {
        // the kind on top, the icon in the middle, the name at the bottom
        // the kind on a band of its colour across the top
        ui.fill({ x: r.x, y: r.y, w: r.w, h: 1 }, { bg: mix(bg, col, 0.35) });
        const word = strWidth(t(KIND[kind].word)) <= r.w - 2 ? t(KIND[kind].word) : KIND[kind].short;
        ui.textCenter(r, r.y, truncate(word, r.w), { fg: c.fg, bg: mix(bg, col, 0.35), attrs: BOLD });
        const mid = r.y + Math.max(1, Math.floor((r.h - 1) / 2));
        ui.textCenter(r, mid, kind === "folder" ? `${l.icon}▾` : l.icon, { fg: hot || focused ? c.fg : col, attrs: BOLD, ...st });
        ui.textCenter(r, r.y + r.h - 1, truncate(l.label, r.w), { fg: hot || focused ? c.fg : c.muted, ...st });
      }
      ui.hit(r, kind === "folder" ? { tip } : { cmd: l.cmd, tip });
    },
  };
}

/** Add a link and put its widget on HOME. */
export function addLink(deck: Deck, label: string, cmd: string, icon: string): HomeLink {
  const all = links(deck);
  const base = label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "link";
  let id = base;
  for (let n = 2; all.some((l) => l.id === id); n++) id = `${base}-${n}`;
  const l = { id, label, icon: [...(icon || "◆")][0], cmd };
  deck.settings.set("home.links", [...all, l]);
  syncLinkWidgets(deck);
  return l;
}

export function removeLink(deck: Deck, label: string): boolean {
  const all = links(deck);
  const l = all.find((x) => x.label === label || x.id === label);
  if (!l) return false;
  void deck.act(`home rm link.${l.id}`);
  deck.settings.set("home.links", all.filter((x) => x !== l));
  syncLinkWidgets(deck);
  return true;
}

/** The picker: what kind of thing, then which one. Resolves with the new link (placed on HOME). */
export async function newLinkFlow(deck: Deck): Promise<void> {
  const kinds = [
    { label: t("a module"), hint: "launch …" },
    { label: t("a note"), hint: "open …" },
    { label: t("a folder"), hint: "explore …" },
    { label: t("a page"), hint: "nexus, settings, trash…" },
    { label: t("a macro"), hint: "macro run …" },
    { label: t("any command"), hint: "❯" },
  ];
  const k = await deck.choose(t("A shortcut to…"), kinds);
  if (k === null) return;
  let pick: { label: string; cmd: string; icon: string } | null = null;
  if (k === 0) {
    const apps = deck.apps.list().filter((a) => a.launcher || deck.apps.sourceOf(a.kind) !== "core");
    const mods = deck.plugins.list().filter((p) => p.active);
    const opts = mods.map((p) => {
      const app = apps.find((a) => deck.apps.sourceOf(a.kind) === p.manifest.id);
      return { label: p.manifest.name, icon: p.manifest.icon ?? app?.icon ?? "▦", cmd: app ? `launch ${app.kind}` : `${p.manifest.id} open` };
    });
    const i = await deck.choose(t("Which module?"), opts.map((o) => ({ label: `${o.icon}  ${o.label}`, hint: o.cmd })));
    if (i !== null) pick = opts[i];
  } else if (k === 1 || k === 2) {
    const dirs = k === 2;
    const entries = deck.vault.entries.filter((e) => e.isDir === dirs && !e.path.startsWith(".") && (dirs || /\.md$/i.test(e.name)));
    const i = await deck.choose(dirs ? t("Which folder?") : t("Which note?"), entries.map((e) => ({ label: e.path, hint: "" })));
    if (i !== null) {
      const e = entries[i];
      const custom = deck.marks.iconOf(e.path);
      pick = dirs ? { label: e.name, cmd: `explore ${q(e.path)}`, icon: custom ?? "▣" } : { label: e.name.replace(/\.md$/i, ""), cmd: `open ${q(e.path)}`, icon: custom ?? "≡" };
    }
  } else if (k === 3) {
    const pages = [
      { label: "HOME", cmd: "home", icon: "⌂" },
      { label: "NEXUS", cmd: "nexus", icon: "⬡" },
      { label: "MODULES", cmd: "modules", icon: "▦" },
      { label: "STORE", cmd: "store", icon: "⇣" },
      { label: "SETTINGS", cmd: "settings", icon: "⚙" },
      { label: "SHORTCUTS", cmd: "shortcuts", icon: "⌨" },
      { label: "TRASH", cmd: "trash open", icon: "⌫" },
      { label: "JOURNAL", cmd: "journal", icon: "✎" },
    ];
    const i = await deck.choose(t("Which page?"), pages.map((p) => ({ label: `${p.icon}  ${p.label}`, hint: p.cmd })));
    if (i !== null) pick = pages[i];
  } else if (k === 4) {
    const macros = deck.settings.data.shell.macros;
    if (!macros.length) return deck.notify(t("no macros yet: macro add <label> <command>"));
    const i = await deck.choose(t("Which macro?"), macros.map((m) => ({ label: m.label, hint: m.cmd })));
    if (i !== null) pick = { label: macros[i].label, cmd: `macro run ${q(macros[i].label)}`, icon: "⌗" };
  } else {
    const cmd = await deck.prompt(t("The command"), { placeholder: "todo add \"…\" · cal today · git status" });
    if (!cmd?.trim()) return;
    const label = await deck.prompt(t("Its name"), { initial: cmd.trim().split(/\s+/)[0] });
    if (!label?.trim()) return;
    pick = { label: label.trim(), cmd: cmd.trim(), icon: "❯" };
  }
  if (!pick) return;
  const l = addLink(deck, pick.label, pick.cmd, pick.icon);
  void deck.act(`home add link.${l.id}`);
}

/**
 * The biggest on-screen square inside `slot` (in cells), centred. aspect = cell
 * width / cell height (about 0.5). Cells are whole, so not every size can be a
 * true square: from the tallest down, the first size within 6 % of square wins
 * (else the closest one).
 */
export function squareIn(slot: { x: number; y: number; w: number; h: number }, aspect: number): { x: number; y: number; w: number; h: number } {
  const a = aspect > 0 ? aspect : 0.5;
  let best = { w: slot.w, h: Math.max(1, Math.min(slot.h, Math.round(slot.w * a))), err: Infinity };
  for (let h = slot.h; h >= 1; h--) {
    const w = Math.round(h / a);
    if (w < 1 || w > slot.w) continue;
    const err = Math.abs(w * a - h) / h;
    if (err < best.err) best = { w, h, err };
    if (err <= 0.06) {
      best = { w, h, err };
      break;
    }
  }
  return { x: slot.x + Math.floor((slot.w - best.w) / 2), y: slot.y + Math.floor((slot.h - best.h) / 2), w: best.w, h: best.h };
}

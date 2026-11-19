import { mix } from "../core/color";
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
 *   home link new                      the picker (also: + widget → Shortcut 1×1)
 *   home link add <label> "<cmd>" [icon]
 *   home link rm <label> · home links
 */
export interface HomeLink {
  id: string;
  label: string;
  icon: string;
  cmd: string;
}

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
      title: "Shortcut 1×1",
      description: "one square that opens anything: a module, a note, a folder, a page, a macro, a command",
      size: { w: 1, h: 1 },
      min: { w: 1, h: 1 },
      max: { w: 1, h: 1 },
      render: () => {},
    });
  for (const l of links(deck)) {
    const id = `link.${l.id}`;
    unregister.get(id)?.();
    unregister.set(id, deck.widgets.register(linkSpec(l)));
  }
}

function linkSpec(l: HomeLink): WidgetSpec {
  return {
    id: `link.${l.id}`,
    title: l.label,
    description: l.cmd,
    size: { w: 1, h: 1 },
    min: { w: 1, h: 1 },
    max: { w: 1, h: 1 },
    picker: false,
    clickActivates: true,
    activate: ({ deck }) => void deck.act(l.cmd),
    render(ui, r, { deck, focused }) {
      const c = ui.c;
      const hot = ui.hovered(r);
      if (hot || focused) ui.fill(r, { bg: mix(c.panel, c.accent, focused ? 0.18 : 0.1) });
      const st = hot || focused ? { bg: mix(c.panel, c.accent, focused ? 0.18 : 0.1) } : {};
      const mid = r.y + Math.max(0, Math.floor((r.h - (r.h >= 3 ? 2 : 1)) / 2));
      ui.textCenter(r, mid, l.icon, { fg: c.accent, attrs: BOLD, ...st });
      if (r.h >= 3) ui.textCenter(r, mid + 1, l.label, { fg: hot || focused ? c.fg : c.muted, ...st });
      ui.hit(r, { cmd: l.cmd, tip: `${l.label}\n${l.cmd}` });
      void deck;
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

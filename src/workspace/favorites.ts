/**
 * PINNED — notes, folders and modules one click away: at the top of the file
 * tree, in the "pinned" HOME widget, and on a key if you want one.
 *
 *   pin notes/ideas.md            a note
 *   pin projects                  a folder (opens in NEXUS)
 *   pin todo                      a module
 *   pin journal --key ctrl+shift+j
 *   unpin todo · pin ls
 *
 * Saved in settings.json → favorites.
 */
import { t } from "../core/i18n";
import { fmt } from "../core/ansi";
import { normalizeCombo } from "../core/shortcuts";
import type { Deck } from "../deck";
import type { Command } from "../shell/types";
import { q } from "../ui/ui";
import type { WidgetSpec } from "../widgets/types";
import { mix } from "../core/color";
import { BOLD } from "../core/grid";

/**
 * One list for everything you keep one click away — pins. A pin is a note, a
 * folder, a module, a page, a macro or any command; it shows at the top of the
 * tree, in the "pinned" widget, and "Add to HOME" puts it on HOME as a square
 * (widgets/links.ts: each pin can be a square, `link.<id>`). Unpinning takes its
 * squares off too. (Before 0.4.1 squares had their own list: home.links, moved here.)
 */
export type PinKind = "note" | "folder" | "module" | "page" | "macro" | "command";

export interface Favorite {
  kind: PinKind;
  /** vault path, module/app id, or the command itself */
  target: string;
  label: string;
  /** its square's name on HOME (link.<id>) — made from the label when missing */
  id?: string;
  icon?: string;
  /** what it runs, when it isn't the usual for its kind */
  cmd?: string;
}

export const favIcon = (f: Favorite) => f.icon ?? (f.kind === "note" ? "✎" : f.kind === "folder" ? "▸" : f.kind === "module" ? "▦" : f.kind === "macro" ? "⚡" : f.kind === "page" ? "◇" : "❯");

/** A pin's id: the one it was given, else one made from its kind and target (stable). */
export const pinId = (f: Favorite): string => f.id ?? `${f.kind}-${f.target}`.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");

/** The command a favorite runs. */
export function favCommand(deck: Deck, f: Favorite): string {
  if (f.cmd) return f.cmd;
  if (f.kind === "note") return `open ${q(f.target)}`;
  if (f.kind === "folder") return `explore ${q(f.target)}`;
  if (f.kind === "macro" || f.kind === "page" || f.kind === "command") return f.target;
  // a module: its app if it has one, else its own `open`
  const app = deck.apps.list().find((a) => a.kind === f.target || deck.apps.sourceOf(a.kind) === f.target);
  return app ? `launch ${app.kind}` : `${f.target} open`;
}

export const favorites = (deck: Deck): Favorite[] => deck.settings.data.favorites ?? [];

/** What a typed target is: a note, a folder, or a module. */
function resolve(deck: Deck, raw: string): Favorite | null {
  const v = deck.vault;
  const path = raw.replace(/^\/+/, "").replace(/\/+$/, "");
  const md = path.endsWith(".md") ? path : `${path}.md`;
  if (v.entries.some((e) => !e.isDir && e.path === md)) return { kind: "note", target: md, label: md.split("/").pop()!.replace(/\.md$/, "") };
  if (v.isDir(path)) return { kind: "folder", target: path, label: `${path.split("/").pop()}/` };
  const mod = deck.plugins.list().find((p) => p.manifest.id === raw.toLowerCase() || p.manifest.name.toLowerCase() === raw.toLowerCase());
  if (mod) return { kind: "module", target: mod.manifest.id, label: mod.manifest.name };
  const app = deck.apps.get(raw.toLowerCase());
  if (app) return { kind: "module", target: app.kind, label: app.title.toLowerCase() };
  return null;
}

export const pinCommand: Command = {
  name: "pin",
  aliases: ["fav"],
  summary: "pin a note, a folder or a module: top of the tree, the pinned widget, a key",
  usage: "pin                         list\npin <note | folder | module> [--key ctrl+shift+1]\nunpin <same>",
  examples: [
    ["pin notes/ideas.md", "a note at the top of the tree"],
    ["pin projects", "a folder (opens in NEXUS)"],
    ["pin todo --key ctrl+shift+t", "a module, on a key"],
  ],
  complete: "path",
  run(ctx) {
    const d = ctx.deck;
    const list = favorites(d);
    const args = [...ctx.args];
    let key: string | undefined;
    const ki = args.indexOf("--key");
    if (ki >= 0) [, key] = args.splice(ki, 2);
    const raw = args.join(" ").trim();
    if (!raw || raw === "ls") {
      if (!list.length) return ctx.out(fmt.dim("nothing pinned — pin notes/ideas.md, pin projects, pin todo\n")), 0;
      for (const f of list) ctx.out(`${favIcon(f)} ${fmt.bold(f.label.padEnd(20))} ${fmt.dim(favCommand(d, f))}\n`);
      return 0;
    }
    const f = resolve(d, raw);
    if (!f) return ctx.err(`pin: "${raw}" is no note, folder or module here\n`), 1;
    if (!list.some((x) => x.kind === f.kind && x.target === f.target)) d.settings.set("favorites", [...list, f]);
    ctx.out(`${fmt.yellow("★")} ${favIcon(f)} ${f.label}\n`);
    if (key) {
      const combo = normalizeCombo(key);
      if (!combo) return ctx.err(`pin: "${key}" isn't a key combo (ctrl+shift+1, alt+t…)\n`), 1;
      d.settings.set("keys", { ...(d.settings.data.keys ?? {}), [combo]: favCommand(d, f) });
      ctx.out(fmt.dim(`  on ${combo}\n`));
    }
    return 0;
  },
};

export const unpinCommand: Command = {
  name: "unpin",
  summary: "take a note, folder or module off the pinned list",
  usage: "unpin <note | folder | module>",
  complete: "path",
  run(ctx) {
    const d = ctx.deck;
    const raw = ctx.args.join(" ").trim();
    const f = resolve(d, raw);
    const list = favorites(d);
    const next = list.filter((x) => !(f ? x.kind === f.kind && x.target === f.target : x.label === raw || x.target === raw));
    if (next.length === list.length) return ctx.err(`unpin: "${raw}" isn't pinned (pin ls)\n`), 1;
    // one ⌘Z brings the pin and its squares back
    d.history.group(`unpin ${raw}`, () => {
      d.settings.set("favorites", next);
      unplaceSquares(d, list.filter((x) => !next.includes(x)));
    });
    ctx.out(`${fmt.dim("☆")} ${raw}\n`);
    return 0;
  },
};

/** A pin gone: its squares leave HOME too. */
export function unplaceSquares(deck: Deck, gone: Favorite[]): void {
  const ids = new Set(gone.map((f) => `link.${pinId(f)}`));
  const placed = deck.settings.data.home.widgets;
  if (placed.some((p) => ids.has(p.id))) deck.settings.set("home.widgets", placed.filter((p) => !ids.has(p.id)));
}

/** The pinned things as tiles on HOME. */
export const pinnedWidget: WidgetSpec = {
  id: "pinned",
  title: "pinned",
  description: "your pins: notes, folders, modules, pages, macros, commands — pin <thing> adds one",
  size: { w: 4, h: 3 },
  min: { w: 2, h: 1 },
  render(ui, r, { deck }) {
    const c = ui.c;
    const list = favorites(deck);
    if (!list.length) return void ui.textFit(r.x + 1, r.y, [t("nothing pinned yet — p in the tree, or pin <note|folder|module>"), t("nothing pinned yet — p in the tree"), t("no pins yet")], { fg: c.muted }, r.w - 2);
    // tiles, several per row when there's room
    const tileW = Math.max(14, Math.min(24, Math.floor((r.w - 1) / Math.max(1, Math.floor((r.w - 1) / 18)))));
    const perRow = Math.max(1, Math.floor((r.w - 1) / tileW));
    list.forEach((f, i) => {
      const x = r.x + 1 + (i % perRow) * tileW, y = r.y + Math.floor(i / perRow);
      if (y >= r.y + r.h) return;
      const rect = { x, y, w: tileW - 1, h: 1 };
      const hot = ui.hovered(rect);
      if (hot) ui.fill(rect, { bg: mix(c.accent, c.bg, 0.8) });
      const st = hot ? { bg: mix(c.accent, c.bg, 0.8) } : {};
      ui.text(x, y, favIcon(f), { fg: c.accent, ...st });
      ui.text(x + 2, y, f.label, { fg: hot ? c.fg : c.subtle, attrs: hot ? BOLD : 0, ...st }, tileW - 3);
      ui.hit(rect, { cmd: favCommand(deck, f), tip: favCommand(deck, f) });
    });
  },
};

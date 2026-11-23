/**
 * THE CATALOG — everything the deck can do, in one list of blocks.
 *
 * It holds nothing of its own: it reads the registries that already exist
 * (commands, THE MENU's actions, shortcuts, settings, the functions modules
 * expose, widgets, apps, themes, modules) and describes each thing the same
 * way — what it is, who provides it, one line of doc, and how to call it from
 * the shell or from a module. So anything can be found, read and used from
 * anywhere:
 *
 *   CATALOG page (`catalog`)          browse, search, run, change a setting
 *   `catalog [kind] [words]`        the same in the shell (`--json` for scripts)
 *   ib.catalog.list("function")     the same in a module
 *   deck.catalog.list()             the same in the deck's own code
 */
import type { Deck } from "../deck";
import { t } from "./i18n";
import { displayKeys, keysOf, menuKeyOf, SHORTCUTS } from "./shortcuts";
import { kindOf } from "./prefs";
import { FRAME_PARTS } from "../plugins/frame-services";
import { API_DOCS } from "../plugins/apidocs";

export const BLOCK_KINDS = ["command", "action", "shortcut", "setting", "function", "api", "widget", "app", "theme", "module"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export interface Block {
  kind: BlockKind;
  /** unique within its kind: "todo", "appearance.theme", "todo.add"… */
  id: string;
  /** what people see */
  name: string;
  /** one line: what it does */
  doc: string;
  /** who provides it: "core" or a module's id */
  from: string;
  /** how to use it by hand or from a script: a shell line, or ib.use(…) */
  call?: string;
  /** settings: the value now; shortcuts: the keys */
  value?: string;
  /** what enter does on the CATALOG page (run it, open it…) */
  run?: () => void | Promise<void>;
}

/** Plain data for scripts and modules (no functions). */
export type BlockInfo = Omit<Block, "run">;

export class Catalog {
  constructor(private readonly deck: Deck) {}

  /** Every block (of one kind), optionally filtered by words. */
  list(kind?: BlockKind, words = ""): Block[] {
    const all = kind ? this.of(kind) : BLOCK_KINDS.flatMap((k) => this.of(k));
    const q = words.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return q.length ? all.filter((b) => q.every((w) => `${b.kind} ${b.id} ${b.name} ${b.doc} ${b.from}`.toLowerCase().includes(w))) : all;
  }

  get(kind: BlockKind, id: string): Block | undefined {
    return this.of(kind).find((b) => b.id === id);
  }

  /** The same, as plain JSON (ib.catalog, `catalog --json`). */
  info(kind?: BlockKind, words = ""): BlockInfo[] {
    return this.list(kind, words).map(({ run: _run, ...b }) => b);
  }

  /** How many of each kind. */
  counts(): Record<BlockKind, number> {
    return Object.fromEntries(BLOCK_KINDS.map((k) => [k, this.of(k).length])) as Record<BlockKind, number>;
  }

  private of(kind: BlockKind): Block[] {
    const d = this.deck;
    switch (kind) {
      case "command":
        return d.commands.all().map((c) => ({ kind, id: c.name, name: c.name, doc: c.summary ?? "", from: c.source ?? "core", call: c.name, value: c.usage?.split("\n")[0], run: () => void d.act(`${c.name} -h`) }));
      case "action":
        return d.actions.list().map((a) => ({ kind, id: a.id, name: a.title, doc: a.hint ? `${a.group ?? ""} · ${a.hint}` : a.group ?? "", from: d.actions.sourceOf(a.id) ?? "core", value: a.key ? `≡ ${a.key}` : undefined, run: () => void a.run() }));
      case "shortcut": {
        const over = d.settings.data.keyOverrides;
        const menu = d.settings.data.menu?.keys;
        const deckKeys = SHORTCUTS.map((s, i) => {
          const keys = keysOf(s, over);
          const mk = menuKeyOf(s, menu);
          return { kind, id: s.id ?? `fixed.${i}`, name: t(s.what), doc: `${t(s.cat)}${mk ? ` · ≡ ${mk}` : ""}`, from: "core", value: keys ? displayKeys(keys) : t("off"), call: s.id ? `keys set ${s.id} <keys>` : undefined, run: s.id ? () => d.workspace.runShortcut(s) : undefined } satisfies Block;
        });
        const mine = Object.entries(d.settings.data.keys ?? {}).map(([combo, cmd]) => ({ kind, id: `yours.${combo}`, name: cmd, doc: t("yours"), from: "you", value: displayKeys(combo), call: `bind "${combo}" "${cmd}"`, run: () => void d.act(cmd) }) satisfies Block);
        return [...deckKeys, ...mine];
      }
      case "setting":
        return d.prefs
          .rows()
          .filter((r) => r.label && !r.head && kindOf(r) !== "keys")
          .map((r) => ({ kind, id: r.key ?? r.label, name: t(r.label), doc: kindOf(r), from: r.from, value: t(r.value()), call: r.cmd?.() ?? (r.key ? `config get ${r.key}` : undefined), run: () => void r.change?.(1) }));
      case "function":
        return d.services.list().map((s) => ({ kind, id: `${s.module}.${s.name}`, name: `${s.module}.${s.name}`, doc: s.doc, from: FRAME_PARTS.has(s.module) ? "core" : s.module, value: s.needs ? `needs ${s.needs}` : undefined, call: `modules call ${s.module} ${s.name}` }));
      case "api":
        // what a module's code reaches without a command: ib.ui (talk to the user), ib.lib (the UI kit)
        return API_DOCS.map(([name, doc]) => ({ kind, id: name, name, doc, from: "core", call: name.startsWith("ib.ui.") || /^ib\.lib\.[a-z]/.test(name) ? `${name}(…)` : name }));
      case "widget":
        return d.widgets.list().map((w) => ({ kind, id: w.id, name: w.title, doc: w.description ?? "", from: w.source, call: `home add ${w.id}`, run: () => void d.act(`home add ${w.id}`) }));
      case "app":
        return d.apps.list().map((a) => ({ kind, id: a.kind, name: a.title, doc: a.description ?? "", from: d.apps.sourceOf(a.kind) ?? "core", call: `launch ${a.kind}`, run: () => void d.openApp(a.kind) }));
      case "theme":
        return d.themes.list().map((th) => ({ kind, id: th.name, name: th.name, doc: th.description ?? "", from: "core", value: th.name === d.theme.name ? t("in use") : undefined, call: `theme set ${th.name}`, run: () => void d.act(`theme set ${th.name}`) }));
      case "module":
        return d.plugins.list().map((p) => ({ kind, id: p.manifest.id, name: p.manifest.name, doc: p.manifest.description ?? "", from: p.manifest.core ? "core" : p.manifest.id, value: p.active ? t("on") : t("off"), call: `plugin ${p.active ? "disable" : "enable"} ${p.manifest.id}`, run: () => void d.openApp("modules") }));
    }
  }
}

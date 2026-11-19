import { BOLD, type Rect } from "../core/grid";
import { strWidth } from "../core/unicode";
import type { TagColor } from "../vault/marks";
import type { FilterBar } from "./filterbar";
import type { UI } from "./ui";

/** One step of the path shown at the top left (the first one is the page's chip). */
export interface Crumb {
  label: string;
  go?: () => void;
  tip?: string;
}

/** A button of the toolbar at the top right. */
export interface PageTool {
  label: string;
  run: () => unknown;
  tip: string;
}

/**
 * THE top of a full page (NEXUS, MODULES, and any page of that kind to come),
 * always the same two lines so every page looks the same:
 *
 *    ◈ vault / notes / ideas              12 nodes  [ + note ] [ ⌕ ] [ : ]
 *   ⌕ / search                                      ■ ■ □ □ ■ □ □ □
 *
 * Line 1: where you are (the first crumb is the page's chip), a count, the tools.
 * Line 2: the FilterBar (search + colours). Returns the first free row under it.
 */
export function pageBar(ui: UI, r: Rect, o: { crumbs: Crumb[]; info?: string; tools?: PageTool[]; filter?: FilterBar; counts?: Partial<Record<TagColor, number>> }): number {
  const c = ui.c;
  let bx = r.x + 1;
  o.crumbs.forEach((cr, i) => {
    const last = i === o.crumbs.length - 1;
    if (i) bx = ui.text(bx, r.y, " / ", { fg: c.subtle });
    const x0 = bx;
    bx = i === 0 ? ui.text(bx, r.y, ` ${cr.label} `, { fg: c.panel, bg: c.accent, attrs: BOLD }) : ui.text(bx, r.y, cr.label, { fg: last ? c.accent : c.muted, attrs: last ? BOLD : 0 });
    if (cr.go) ui.hit({ x: x0, y: r.y, w: bx - x0, h: 1 }, { onClick: cr.go, tip: cr.tip });
  });
  // the tools, right to left, all drawn by ui.button (one look for every button)
  let tx = r.x + r.w - 1;
  for (const tool of [...(o.tools ?? [])].reverse()) {
    const w = strWidth(` ${tool.label} `);
    tx -= w;
    if (tx <= bx + 1) break;
    ui.button(tx, r.y, tool.label, () => void tool.run(), { tip: tool.tip });
    tx -= 1;
  }
  if (o.info && tx - o.info.length - 2 > bx) ui.textRight(tx - 1, r.y, `${o.info} `, { fg: c.subtle });
  o.filter?.render(ui, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: 1 }, o.counts);
  return r.y + 2;
}

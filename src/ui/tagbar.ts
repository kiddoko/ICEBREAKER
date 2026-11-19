import { mix } from "../core/color";
import { t } from "../core/i18n";
import { TAG_NAMES, tagRGB, type TagColor } from "../vault/marks";
import type { UI } from "./ui";

/**
 * A row of the 8 colour squares (like above the tree): ■ some have it, □ none
 * yet, ▣ the one shown. A click runs `cmdFor(colour | null)`. Drawn so it ends
 * at `right`; returns where it starts.
 */
export function drawTagBar(ui: UI, right: number, y: number, current: TagColor | null, counts: Partial<Record<TagColor, number>>, cmdFor: (c: TagColor | null) => string): number {
  const c = ui.c;
  const w = TAG_NAMES.length * 2 + (current ? 3 : 0);
  let x = right - w;
  const start = x;
  for (const tc of TAG_NAMES) {
    const on = current === tc;
    const n = counts[tc] ?? 0;
    const rect = { x, y, w: 2, h: 1 };
    const hot = ui.hovered(rect);
    ui.text(x, y, on ? "▣" : n ? "■" : "□", { fg: n || on || hot ? tagRGB(tc) : mix(tagRGB(tc), c.bg, 0.45), bg: on || hot ? c.highlight : undefined });
    ui.hit(rect, { cmd: cmdFor(on ? null : tc), tip: `${t(tc)} · ${n}\n${on ? t("click: show everything") : t("click: show only this colour")}` });
    x += 2;
  }
  if (current) {
    const xr = { x, y, w: 3, h: 1 };
    ui.text(x, y, " × ", { fg: ui.hovered(xr) ? c.error : c.subtle });
    ui.hit(xr, { cmd: cmdFor(null), tip: t("show everything") });
  }
  return start;
}

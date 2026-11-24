import { mix, type RGB } from "../color";
import type { KeycapLook } from "../keycap";
import type { PadLook } from "../padglyphs";
import { bool, color, int, num } from "./fields";
import { type Component, contrastRule, defineComponent, type FloorColors } from "./registry";

/**
 * The components a theme can restyle today (milestone 1: the keys and the pad's buttons).
 * Each is a TOML table of the same name ([keys], [pad]) and a `theme set` prefix (keys.radius).
 * The next ones (frame, tabs, button, checkbox…) join this list in milestone 3.
 */

/** a key's face when the theme leaves it to the deck: a raised tone of the panel, a touch of accent */
export function keyFace(c: { accent: RGB; fg: RGB; panel: RGB }): RGB {
  return mix(mix(c.panel, c.fg, 0.13), c.accent, 0.14);
}

/** HOW A KEY LOOKS — every shortcut sits on one (core/keycap.ts draws it) */
export const KEYS = defineComponent<KeycapLook>({
  id: "keys",
  since: 2,
  label: "keys",
  group: "shape",
  doc: "the key every shortcut sits on",
  fields: {
    radius: num(0, 0.5, 0.17, "corners, as a share of the cell's height (0: square)"),
    border: int(0, 4, 1, "outline, in device pixels (0: none)"),
    lip: num(0, 0.3, 0.12, "depth: the darker bottom, as a share of the cell's height (0: flat)"),
    shine: int(0, 3, 1, "the lighter line along the top, in device pixels (0: none)"),
    reach: num(0, 0.5, 0.42, "how far a key reaches into the spaces beside it, as a share of a cell's width"),
    top: num(0, 0.3, 0.1, "room above the key, as a share of the cell's height"),
    bottom: num(0, 0.3, 0.06, "room below the key, as a share of the cell's height"),
    face: color(null, "the key's face: a #hex, a [palette] name, or auto (from the theme's colours)"),
    bold: bool(true, "the key's text in bold"),
  },
  floor: [
    // a shortcut's text must read on its key (§ 3): a face too close to the text goes back to auto
    contrastRule<KeycapLook>(["face"], 4.5, (look: KeycapLook, c: FloorColors) => [c.fg, look.face ?? keyFace(c)]),
  ],
});

/** HOW THE PAD'S BUTTONS LOOK (core/padglyphs.ts) — their colours (A green…) stay the pad maker's */
export const PAD = defineComponent<PadLook>({
  id: "pad",
  since: 2,
  label: "pad buttons",
  group: "shape",
  doc: "the gamepad buttons shown beside a shortcut",
  fields: {
    inkDark: color(0x101018, "the letter on a light button"),
    inkLight: color(0xffffff, "the letter on a dark button"),
    psBody: color(0x1d1c26, "a PlayStation button's body"),
    ring: num(0, 1, 0.5, "how strongly the ring round a PlayStation button shows"),
    weight: int(100, 900, 800, "the letters' weight"),
    size: num(0.5, 1, 0.86, "the icon's size, as a share of the cell's height"),
  },
  floor: [],
});

/** every component, in the order the studio and the docs list them */
export const COMPONENTS: Component<object>[] = [KEYS as unknown as Component<object>, PAD as unknown as Component<object>];

export function component(id: string): Component<object> | undefined {
  return COMPONENTS.find((c) => c.id === id);
}

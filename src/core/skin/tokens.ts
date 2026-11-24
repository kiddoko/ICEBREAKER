import type { RGB } from "../color";

/**
 * NAMED COLOURS the widgets used to write as raw hex (themes v2, milestone 1). Same values as
 * before — nothing changes on screen — but each now has a name a theme will be able to set
 * (schema 2, milestone 2: a [tokens] table). Add one here rather than a hex in a widget.
 */
export const TOKENS = {
  /** rain, cold temperatures (weather widget and pop-up) */
  rain: 0x7fb4ea as RGB,
  /** heat: the warm end of a temperature bar */
  heat: 0xffcf5a as RGB,
  /** the moon's lit face on a light theme */
  moonPaper: 0xf3eddf as RGB,
  /** the moon's lit face on a dark theme, mixed with the text colour */
  moonGlow: 0xf4ecd8 as RGB,
  /** the moon's night sky on a light theme */
  moonNight: 0x14161c as RGB,
} as const;

/**
 * Which drawing a calendar widget uses for its size — measured on the sizes HOME really gives
 * (a 2×2 is about 22 × 5 cells on a big screen, 13 × 3 on a small one). Pure: tests/calsizes.test.ts.
 */

/** 7 columns of 3 cells (" 23") */
export const WEEK_W = 21;

/**
 * The month: "month" when its title, the weekdays and every week fit; "week" (the title, the
 * weekdays, today's week) when only one week does; "today" (today in words, its events) below.
 */
export function monthShape(w: number, h: number, weeks: number): "month" | "week" | "today" {
  if (w < WEEK_W || h < 3) return "today";
  return h >= 2 + weeks ? "month" : "week";
}

/**
 * This week: "columns" (a column a day, events written in it) when each column holds a title
 * (9 cells); "strip" (the 7 days in a row, today lit, a dot on the busy ones, today's events
 * under it); "today" below.
 */
export function weekShape(w: number, h: number): "columns" | "strip" | "today" {
  if (w < WEEK_W || h < 2) return "today";
  return Math.floor(w / 7) >= 9 && h >= 3 ? "columns" : "strip";
}

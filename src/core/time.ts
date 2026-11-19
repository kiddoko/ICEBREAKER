/**
 * How long ago something happened, for lists and widgets.
 *   ago(t)        "now" · "5m" · "3h" · "2d"       (compact: widgets, NEXUS)
 *   ago(t, true)  "1 min" · "5 min" · "3 h" · "2 d" (spelled out: the trash)
 * `at` is a time in ms since the epoch (Date.now(), a file's mtime).
 */
export function ago(at: number, long = false): string {
  const s = (Date.now() - at) / 1000;
  if (long) return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

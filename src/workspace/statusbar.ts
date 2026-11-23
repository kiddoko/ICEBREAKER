/**
 * The status bar's right side, yours to arrange (Settings → appearance, right-click on an
 * item, drag one sideways, `statusbar …`): which items, in which order. Pure — the drawing is
 * in chrome.ts renderStatusBar.
 *
 *   home  ↑↓ select · enter open …   │ ◉ stealth │ ◧ ▾ ◨ ▣ │ ✦ fx │ ♪ │ ⌨ │ ☾ │ ⌘K menu │ F1 help
 *                                              └ tree shell panel solo: four items, in one group
 *
 * Items sit in groups, like tabs: an item joined to the one on its left shares its group (no │
 * between them). The four frame switches start as one group; any item can join its left
 * neighbour or stand alone (right-click, `statusbar join | alone <item>`), and each moves alone.
 */

/** every item the bar can show, in the default order, with what it is (menus, `statusbar`) */
export const STATUS_ITEMS: readonly { id: string; about: string }[] = [
  { id: "stealth", about: "stealth mode (only while it's on)" },
  { id: "voice", about: "the voice speaking (only while it speaks)" },
  { id: "audio", about: "a module playing sound (only while it plays)" },
  { id: "pad", about: "a gamepad (only when one is plugged)" },
  { id: "tree", about: "◧ the file tree, shown or hidden" },
  { id: "shell", about: "▾ the shell, shown or hidden" },
  { id: "panel", about: "◨ the side panel, shown or hidden" },
  { id: "solo", about: "▣ the page alone (the others folded away)" },
  { id: "fx", about: "the effects' panel" },
  { id: "mute", about: "mute everything" },
  { id: "osk", about: "the on-screen keyboard" },
  { id: "screensaver", about: "the screensaver" },
  { id: "fps", about: "frames per second (Settings → appearance: show fps)" },
  { id: "menu", about: "THE MENU" },
  { id: "help", about: "the manual" },
];
export const STATUS_IDS: readonly string[] = STATUS_ITEMS.map((i) => i.id);

/**
 * The items shown, in order: yours (unknown ids and doubles dropped), the ones you never placed
 * at their default place, minus the hidden ones.
 */
export function statusOrder(cfg: { order?: unknown; hidden?: unknown } | undefined): string[] {
  // "frames" (0.7.0: the four switches were one item) is the four of them now, at its place
  const old = (list: unknown[]): unknown[] => list.flatMap((x): unknown[] => (x === "frames" ? [...FRAME_IDS] : [x]));
  const hidden = new Set(Array.isArray(cfg?.hidden) ? old(cfg.hidden).filter((x): x is string => typeof x === "string") : []);
  const mine = Array.isArray(cfg?.order) ? [...new Set(old(cfg.order).filter((x): x is string => typeof x === "string" && STATUS_IDS.includes(x)))] : [];
  const out = [...mine];
  // a new item (or one never placed): after its default neighbour on the left
  STATUS_IDS.forEach((id, k) => {
    if (out.includes(id)) return;
    const before = STATUS_IDS.slice(0, k).reverse().find((b) => out.includes(b));
    out.splice(before ? out.indexOf(before) + 1 : 0, 0, id);
  });
  return out.filter((id) => !hidden.has(id));
}

/** `id` moved to position `to` among the shown ones (0 = first). The new full order. */
export function moveStatusItem(shown: readonly string[], id: string, to: number): string[] {
  const from = shown.indexOf(id);
  if (from < 0) return [...shown];
  const out = shown.filter((x) => x !== id);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, id);
  return out;
}

/** the frame switches, four items (one group by default) */
export const FRAME_IDS: readonly string[] = ["tree", "shell", "panel", "solo"];
/** the items that start joined to the one on their left */
const JOINED_BY_DEFAULT = new Set(["shell", "panel", "solo"]);

/** The status bar's groups: which items are joined to the one on their left. */
export interface StatusGroups {
  /** joined to their left neighbour, yours */
  joined?: string[];
  /** joined by default, set apart by you */
  alone?: string[];
}

/** `id` shares the group of the item on its left (no │ between them). */
export function joinedLeft(cfg: StatusGroups | undefined, id: string): boolean {
  if (cfg?.joined?.includes(id)) return true;
  return JOINED_BY_DEFAULT.has(id) && !cfg?.alone?.includes(id);
}

/** `id` joins its left neighbour (true) or stands alone (false): the new groups. */
export function setJoined(cfg: StatusGroups | undefined, id: string, on: boolean): Required<StatusGroups> {
  const joined = new Set(cfg?.joined ?? []), alone = new Set(cfg?.alone ?? []);
  joined.delete(id);
  alone.delete(id);
  if (on && !JOINED_BY_DEFAULT.has(id)) joined.add(id);
  if (!on && JOINED_BY_DEFAULT.has(id)) alone.add(id);
  return { joined: [...joined], alone: [...alone] };
}

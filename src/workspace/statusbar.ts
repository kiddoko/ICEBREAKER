/**
 * The status bar's right side, yours to arrange (Settings → appearance, right-click on an
 * item, drag one sideways, `statusbar …`): which items, in which order. Pure — the drawing is
 * in chrome.ts renderStatusBar.
 *
 *   home  ↑↓ select · enter open …   │ ◉ stealth │ ◧ ▾ ◨ ▣ │ ✦ fx │ ♪ │ ⌨ │ ☾ │ ⌘K menu │ F1 help
 *                                              └ frames: the tree, the shell, the panel, the page alone
 */

/** every item the bar can show, in the default order, with what it is (menus, `statusbar`) */
export const STATUS_ITEMS: readonly { id: string; about: string }[] = [
  { id: "stealth", about: "stealth mode (only while it's on)" },
  { id: "voice", about: "the voice speaking (only while it speaks)" },
  { id: "audio", about: "a module playing sound (only while it plays)" },
  { id: "pad", about: "a gamepad (only when one is plugged)" },
  { id: "frames", about: "the frames' switches: tree, shell, panel, the page alone" },
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
  const hidden = new Set(Array.isArray(cfg?.hidden) ? cfg.hidden.filter((x): x is string => typeof x === "string") : []);
  const mine = Array.isArray(cfg?.order) ? [...new Set(cfg.order.filter((x): x is string => typeof x === "string" && STATUS_IDS.includes(x)))] : [];
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

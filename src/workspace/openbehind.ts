/**
 * The shell maximized (a big ibsh tab) keeps the keyboard: a page that a command typed there
 * opens (`med new`, `todo open`) comes in as a tab behind it, instead of taking the screen
 * and the keys while you're still typing. A short window after each enter covers pages that
 * open a moment later (a sandboxed module's page comes from its worker).
 */

/** how long after enter in the maximized shell a page still opens behind it */
export const KEEP_KEYS_MS = 4000;

export function opensBehind(o: { now: number; keepUntil: number; focus: string; activeKind: string | undefined; newKind: string }): boolean {
  if (o.now >= o.keepUntil || o.focus !== "main") return false;
  return o.activeKind === "ibsh" && o.newKind !== "ibsh";
}

/**
 * Does a key keep that window open? Only one typed in the maximized shell itself: a key for a
 * dialog or ⌘K's list, or anywhere else, means the next page is one you chose to see (a click
 * ends the window too: Workspace.handleMouse).
 */
export function keyKeepsBehind(o: { modal: boolean; focus: string; activeKind: string | undefined }): boolean {
  return !o.modal && o.focus === "main" && o.activeKind === "ibsh";
}

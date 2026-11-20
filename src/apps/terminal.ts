import type { Rect } from "../core/grid";
import { IS_MAC, type Action, type KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { SystemTerminal, terminalKeysHint } from "../shell/systerm";
import type { UI } from "../ui/ui";
import type { App, AppSpec } from "./types";

let opened = 0;

/**
 * A system terminal as a tab of the main window (`term open`): the same
 * engine as the shell panel's, with the whole page to itself. Closing the tab
 * ends its shell.
 */
export class TerminalApp implements App {
  readonly kind = "terminal";
  readonly key: string;
  readonly term: SystemTerminal;

  /** moved back to the shell panel: closing the tab must not kill it */
  docked = false;
  constructor(deck: Deck, term?: SystemTerminal) {
    this.key = `terminal:${++opened}`;
    this.term = term ?? new SystemTerminal(deck);
  }
  title(): string {
    return this.term.name;
  }
  status(): string {
    // a Mac keeps the deck's ⌘ shortcuts (⌘W closes the tab); elsewhere every ctrl key is the shell's
    return `${terminalKeysHint()} · ${IS_MAC ? "⌘W closes it (and its shell) · " : ""}term dock puts it back in the panel`;
  }
  onKey(k: KeyInput): boolean {
    return this.term.onKey(k);
  }
  onText(t: string): boolean {
    return this.term.onText(t);
  }
  onAction(a: Action): boolean {
    return this.term.onAction(a);
  }
  close(): boolean {
    if (!this.docked) this.term.dispose();
    return true;
  }
  render(ui: UI, r: Rect, focused: boolean): void {
    this.term.render(ui, r, focused);
    dockButton(ui, r);
  }
}

export const terminalSpec: AppSpec = {
  kind: "terminal",
  title: "Terminal",
  description: "your system shell in a tab of its own",
  icon: "❯",
  create: (deck) => new TerminalApp(deck),
};

/** ibsh as a big tab (⤢ maximize on the ibsh panel tab). */
export class IbshApp implements App {
  readonly kind = "ibsh";
  readonly key = "ibsh";
  constructor(private readonly deck: Deck) {}
  title(): string {
    return "ibsh";
  }
  status(): string {
    return `${this.deck.shell.status()} · term dock: back to the panel`;
  }
  onKey(k: KeyInput): boolean {
    return this.deck.shell.onKey(k);
  }
  onText(t: string): boolean {
    return this.deck.shell.onText(t);
  }
  onAction(a: Action): boolean {
    return this.deck.shell.onAction(a);
  }
  render(ui: UI, r: Rect, focused: boolean): void {
    this.deck.shell.render(ui, r, focused);
    dockButton(ui, r);
  }
}

/** ⤓ dock, top-right of a maximized shell: back into the bottom panel. */
function dockButton(ui: UI, r: Rect): void {
  const label = " ⤓ dock ";
  const rect = { x: r.x + r.w - label.length - 1, y: r.y, w: label.length, h: 1 };
  if (rect.x < r.x) return;
  const hot = ui.hovered(rect);
  ui.text(rect.x, rect.y, label, { fg: hot ? ui.c.panel : ui.c.accent, bg: hot ? ui.c.accent : ui.c.highlight });
  ui.hit(rect, { cmd: "term dock", tip: "back into the bottom panel" });
}

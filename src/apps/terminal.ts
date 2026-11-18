import type { Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { SystemTerminal } from "../shell/systerm";
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

  constructor(deck: Deck) {
    this.key = `terminal:${++opened}`;
    this.term = new SystemTerminal(deck);
  }
  title(): string {
    return this.term.shellName;
  }
  status(): string {
    return "ctrl = Control · ⌘ shortcuts stay the deck's · ⌘W closes the tab (and its shell)";
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
    this.term.dispose();
    return true;
  }
  render(ui: UI, r: Rect, focused: boolean): void {
    this.term.render(ui, r, focused);
  }
}

export const terminalSpec: AppSpec = {
  kind: "terminal",
  title: "Terminal",
  description: "your system shell in a tab of its own",
  icon: "❯",
  create: (deck) => new TerminalApp(deck),
};

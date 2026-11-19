import type { Action, KeyInput } from "../core/input";
import type { Rect } from "../core/grid";
import type { Deck } from "../deck";
import type { MenuEntry, UI } from "../ui/ui";

/**
 * An App is anything that lives in a tab: the note editor, the journal, the
 * AI chat, sysmon, plugin screens…
 *
 * Only `title` and `render` are required. Input goes, in order, to
 * onKey (raw keys) → onAction (semantic: up/confirm/back…, also from the
 * gamepad). Return true when you used the event.
 */
export interface App {
  /** Kind id, e.g. "note", "journal". */
  readonly kind: string;
  /** Unique identity: opening something already open focuses the existing tab. */
  readonly key: string;
  title(): string;
  render(ui: UI, rect: Rect, focused: boolean): void;
  onKey?(k: KeyInput): boolean;
  onText?(text: string): boolean;
  onAction?(a: Action): boolean;
  /** Text for the status bar when this app is focused. */
  status?(): string;
  /** Unsaved changes (shows ● in the tab). */
  dirty?(): boolean;
  /**
   * Right-click on an empty spot of the page (or the menu key / shift+F10).
   * Things drawn with `ui.hit(rect, { menu })` get their own menu first.
   */
  menu?(): MenuEntry[];
  /** Called before closing; return false to cancel. */
  close?(): Promise<boolean> | boolean;
}

export interface AppSpec {
  kind: string;
  /** Shown in the palette and on the home screen. */
  title: string;
  description?: string;
  /** One or two characters, e.g. "✎". */
  icon?: string;
  /** Show a tile on the home screen. */
  launcher?: boolean;
  create(deck: Deck, args?: unknown): App;
}

/** An entry of THE MENU (Ctrl+K). */
export interface PaletteAction {
  id: string;
  title: string;
  /** Shown on the right, e.g. "ctrl+j". */
  hint?: string;
  group?: string;
  /** a key on THE MENU (space, then this key) — only if nothing else has it */
  key?: string;
  run(): void | Promise<void>;
}

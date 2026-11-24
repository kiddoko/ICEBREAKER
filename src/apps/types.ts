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
  /** ⌘C ⌘X ⌘V ⌘A (ctrl elsewhere) come to onKey as keys — ⌘V first as a key, then its text to onText. */
  clipboardKeys?: boolean;
  /** A key let go (only for a page that plays the keyboard, rawKeys: a tracker's note off). */
  onKeyUp?(k: KeyInput): void;
  onText?(text: string): boolean;
  onAction?(a: Action): boolean;
  /**
   * Every key as a key, never as text, while this page is in front: letters, digits and
   * space come to onKey with their place on the keyboard (`code`: KeyZ is Z on QWERTY, W on
   * AZERTY) and `repeat` when held. For a piano, a game. onText gets nothing then.
   */
  rawKeys?: boolean;
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
  /**
   * A file of a kind its module opens (plugin.json `opens`), opened while this page is already
   * open — from the tree, NEXUS or `open <file>`. A new page gets it in its args instead: `{ file }`.
   */
  openFile?(path: string): void;
}

export interface AppSpec {
  kind: string;
  /** Shown in the palette and on the home screen. */
  title: string;
  description?: string;
  /** One or two characters, e.g. "✎". */
  icon?: string;
  /** Its pages play the keyboard (App.rawKeys). */
  rawKeys?: boolean;
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

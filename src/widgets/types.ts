import type { Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import type { UI } from "../ui/ui";

/**
 * A widget is a small live panel on the HOME grid: clock, weather, calendar…
 * Core and plugins register them the same way (`ib.widgets.register(spec)`).
 *
 * The HOME grid is 12 columns wide; one row unit is 2 text rows. Sizes are in
 * those units. `render` gets the inside of the widget's frame (the frame and
 * title are drawn for you) and is called every frame the widget is visible —
 * keep it cheap, and ask for the next frame with `ui.animate(ms)` if it moves.
 */
export interface WidgetSpec {
  /** Unique id. Plugin widgets are prefixed with the plugin id: "weather2.radar". */
  id: string;
  /** Shown on the frame and in the "add widget" list. */
  title: string;
  description?: string;
  /** Default size in grid units (w: 1-12 columns, h: row units of 2 text rows). */
  size: { w: number; h: number };
  /** Smallest size that still makes sense. */
  min?: { w: number; h: number };
  /** One click anywhere on it runs `activate` (a shortcut square), instead of just selecting it. */
  clickActivates?: boolean;
  /** Biggest size it may take (a shortcut square: 1×1). */
  max?: { w: number; h: number };
  render(ui: UI, rect: Rect, ctx: WidgetContext): void;
  /** Enter pressed while the widget is selected (outside edit mode), when it has no pop-up. */
  activate?(ctx: WidgetContext): void;
  /**
   * Enter / double-click opens this pop-up: more of the widget (add a city,
   * another quote…). It gets a "open <module>" button when `open` is set.
   */
  popup?: WidgetPopupSpec;
  /** false: not offered in the "add widget" list (another widget shows it, e.g. the core calendar draws CALENDAR's month). */
  picker?: boolean;
  /** The command that opens the module this widget belongs to ("todo open", "cal open"). */
  open?: string;
}

export interface WidgetPopupSpec {
  title?: string;
  /** inside size in cells (default 60 × 14) */
  size?: { w: number; h: number };
  /** keys shown in the footer, e.g. "a add · x remove" */
  hint?: string;
  render(ui: UI, rect: Rect, ctx: PopupContext): void;
  onKey?(k: KeyInput, ctx: PopupContext): boolean;
  onText?(t: string, ctx: PopupContext): boolean;
  onAction?(a: Action, ctx: PopupContext): boolean;
}

export interface PopupContext extends WidgetContext {
  close(): void;
}

export interface WidgetContext {
  deck: Deck;
  /** The widget is selected on a focused HOME. */
  focused: boolean;
}

/** Where a widget sits on the grid (saved in settings.json → home.widgets). */
export interface WidgetPlacement {
  id: string;
  /** HOME page (0 = first). */
  page?: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class WidgetRegistry {
  private specs = new Map<string, WidgetSpec & { source: string }>();

  register(spec: WidgetSpec, source = "core"): () => void {
    this.specs.set(spec.id, { ...spec, source });
    return () => {
      if (this.specs.get(spec.id)?.source === source) this.specs.delete(spec.id);
    };
  }

  unregisterSource(source: string): void {
    for (const [id, s] of this.specs) if (s.source === source) this.specs.delete(id);
  }

  get(id: string): WidgetSpec | undefined {
    return this.specs.get(id);
  }

  list(): (WidgetSpec & { source: string })[] {
    return [...this.specs.values()];
  }
}

/**
 * Every built-in HOME widget, with its pop-up: the core ones (builtin.ts), the
 * extras (extra.ts), then the pop-ups (popups.ts) — put together here so those
 * files don't import each other in a circle.
 */
import { CORE_WIDGETS } from "./builtin";
import { EXTRA_WIDGETS } from "./extra";
import { withPopups } from "./popups";
import type { WidgetSpec } from "./types";

export const BUILTIN_WIDGETS: WidgetSpec[] = withPopups([...CORE_WIDGETS, ...EXTRA_WIDGETS]);

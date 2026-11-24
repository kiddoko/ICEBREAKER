/**
 * Everything exposed to plugins as `ib.lib`. Plugins written in plain JS
 * can't `import` from the app, so the useful building blocks are passed in.
 */
// ── THE UI KIT (docs/UI_KIT.md): use these, don't redraw your own — every module then looks
// and behaves like the deck (one field, one checkbox, one slider…)
/** THE one-line text field: search, prompt, password, "add…" (icon, placeholder, mask, onSubmit / onChange) */
export { Field } from "../ui/field";
/** checkbox [■] · choice ‹ value › · tabs · BOX_ON / BOX_OFF (☑ ☐ in plain text) */
export { checkbox, choice, tabs, BOX_ON, BOX_OFF } from "../ui/controls";
/** the spacing rules (docs/LAYOUT.md): Row lays things out GAP apart and never past its end; Bar drops the
 * least important first; stack shares a frame's rows; cards reflow; sizeClass says how big a frame is */
export { Row, INSET, GAP, LABEL, SECTION, Bar, stack, cards, sizeClass, atLeast, type SizeClass, type StackPart } from "../ui/layout";
export { ChatView } from "../ui/chatview";
/** the multi-line editor (notes); for one line, Field */
export { TextEditor } from "../ui/editor";
export { ListView } from "../ui/list";
/** the search + colours bar every list of things uses (MODULES, NEXUS, the file browser) */
export { FilterBar } from "../ui/filterbar";
/** the wheel / trackpad feel of a ring of things (MODULES, NEXUS) */
export { WheelSpin, ring } from "../ui/wheelspin";
// a widget placed several times: each copy its own settings (ctx.key)
export { setWidgetSetting, widgetConfig } from "../widgets/instances";
export { Glide } from "../ui/glide";
export { slider } from "../ui/slider";
export { bigText, ICE_ART } from "../ui/bigtext";
export { inset, split, q } from "../ui/ui";
export { parseFlags } from "../shell/parser";
export { fmt } from "../core/ansi";
export { gradient, hex, mix } from "../core/color";
export { BOLD, DIM, ITALIC, UNDERLINE, STRIKE } from "../core/grid";
export { strWidth, truncate, padEnd, fitHints } from "../core/unicode";
export { fuzzyFilter } from "../core/fuzzy";
export { t, lang, addTranslations, dateLocale } from "../core/i18n";
export { sparkline, formatStat, dayKey } from "../core/stats";
/** the one way to read a day ("tomorrow", "fri", "24/12"…) and a time ("18:00", "9h"): parseDay, parseTime, ymd, addDays, startOfDay, WEEKDAYS */
export * as dates from "../core/dates";
/** a dialog's buttons (a widget's pop-up, a page's own box): bottom right, the way out on the left, Yes / OK on the right */
export { dialogButtons, YES, NO, OK, CANCEL, CLOSE, type DialogButton } from "../ui/dialog";

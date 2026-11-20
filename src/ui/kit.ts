/**
 * THE UI KIT — every reusable piece of the deck's interface, in one place
 * (docs/UI_KIT.md). The deck's own pages and every module use these; nothing
 * redraws its own field, box, slider, list or browser. Change one here and the
 * whole deck (and every module) changes with it.
 *
 * Modules get the same pieces as `ib.lib.*` (src/plugins/lib.ts) and the dialogs
 * as `ib.ui.*` (confirm, prompt, choose, pickFolder, pickFile).
 *
 *   on the UI object (ui.*)       button · text · box · fill · bar · chart · spinner · hit · cursor
 *   Field                         one-line text field (search, prompt, password, "add…")
 *   TextEditor                    the multi-line editor (notes, help)
 *   checkbox · choice · tabs      [■] · ‹ value › · a row of tabs   (+ BOX_ON / BOX_OFF in text)
 *   slider · askNumber            ━━━━╸── 80%  (drag, wheel, ←→, double-click to type)
 *   ListView                      a scrolling, selectable list (mouse, keys, gamepad, drag)
 *   FilterBar · colourSquares     search + colour tags (MODULES, NEXUS, the file browser)
 *   pageBar                       a page's header line: where you are, tools, its filter
 *   FileBrowser · pickFile · pickFolder   the one file browser (the vault, or the computer)
 *   Row · INSET · GAP · LABEL · SECTION   the spacing rules and a row that keeps them (docs/LAYOUT.md)
 *   Bar · stack · cards · sizeClass      a row that drops the least important first, sections down a frame,
 *                                        cards that reflow, a frame's size in four steps (docs/LAYOUT.md)
 *   wrapWords · truncate · strWidth · padEnd   text that fits (core/unicode.ts)
 *   dialogs (deck.*)              confirm · prompt · choose · recoveryWords · notify
 */
export { Field, type FieldOptions, type FieldDraw } from "./field";
export { TextEditor } from "./editor";
export { checkbox, choice, tabs, BOX_ON, BOX_OFF, type CheckboxOptions, type ChoiceOptions, type TabsOptions } from "./controls";
export { slider, askNumber } from "./slider";
export { ListView } from "./list";
export { FilterBar, colourSquares } from "./filterbar";
export { pageBar } from "./pagebar";
export { FileBrowser, pickFile, pickFolder } from "../workspace/filebrowser";
export { Row, INSET, GAP, LABEL, SECTION, Bar, stack, cards, sizeClass, atLeast, type SizeClass, type StackPart } from "./layout";
export { wrapWords, truncate, strWidth, padEnd } from "../core/unicode";

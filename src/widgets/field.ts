import { BOLD } from "../core/grid";
import type { KeyInput } from "../core/input";
import { strWidth } from "../core/unicode";
import type { UI } from "../ui/ui";

/** A one-line text field for pop-ups (typed text arrives through onText). */
export class Field {
  text = "";
  onText(t: string): void {
    this.text += t.replace(/[\r\n]/g, "");
  }
  onKey(k: KeyInput): boolean {
    if (k.combo === "backspace") return (this.text = this.text.slice(0, -1)), true;
    if (k.combo === "ctrl+u") return (this.text = ""), true;
    return false;
  }
  render(ui: UI, x: number, y: number, w: number, placeholder: string): void {
    const c = ui.c;
    ui.fill({ x, y, w, h: 1 }, { bg: c.highlight });
    ui.text(x + 1, y, "❯", { fg: c.accent, bg: c.highlight, attrs: BOLD });
    ui.text(x + 3, y, this.text || placeholder, { fg: this.text ? c.fg : c.faint, bg: c.highlight }, w - 4);
    ui.cursor(x + 3 + Math.min(strWidth(this.text), w - 5), y);
  }
}


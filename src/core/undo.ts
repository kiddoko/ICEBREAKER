/**
 * The undo history: ⌘Z / ctrl+Z undoes the last thing you did, wherever it was
 * (a setting, a widget moved on HOME or the panel, a file sent to the trash, a
 * rename, a new note…), ⌘⇧Z / ctrl+shift+Z / ctrl+Y does it again.
 *
 * Whoever changes something records how to take it back:
 *
 *   deck.history.record({ label: "theme", undo: () => …, redo: () => … })
 *
 * The settings store records every setting it changes (core/settings.ts), the
 * vault its trash and renames (vault/vault.ts). A text editor keeps its own
 * history (ui/editor.ts) and gets ⌘Z first while you type in it.
 *
 * Things done while undoing aren't recorded (no loops). Changes to the same
 * thing in a quick row (a slider dragged, a widget dragged) are one step.
 */

export interface UndoStep {
  /** what it was, for the toast: "↶ theme" */
  label: string;
  undo(): void | Promise<void>;
  redo?(): void | Promise<void>;
  /** same key within `mergeMs` of the last step: merged into it (the first undo stays) */
  key?: string;
}

interface Entry extends UndoStep {
  at: number;
}

export class UndoHistory {
  private done: Entry[] = [];
  private undone: Entry[] = [];
  private paused = 0;
  private grouping: Entry[] | null = null;
  private groupLabel = "";
  max = 200;
  mergeMs = 1500;
  /** told about every change (the toast, the debug log) */
  onChange?: () => void;

  /** Remember how to take something back. Ignored while undoing/redoing. */
  record(step: UndoStep): void {
    if (this.paused) return;
    const now = Date.now();
    if (this.grouping) {
      this.grouping.push({ ...step, at: now });
      return;
    }
    const last = this.done[this.done.length - 1];
    if (step.key && last?.key === step.key && now - last.at < this.mergeMs) {
      // a row of changes to one thing: keep the oldest undo, the newest redo
      last.redo = step.redo;
      last.at = now;
    } else {
      this.done.push({ ...step, at: now });
      if (this.done.length > this.max) this.done.shift();
    }
    this.undone = [];
    this.onChange?.();
  }

  /** Several changes as one step (a theme switch brings its own effects). */
  group<T>(label: string, fn: () => T): T {
    if (this.grouping || this.paused) return fn();
    const steps = this.openGroup(label);
    try {
      return fn();
    } finally {
      this.closeGroup(steps);
    }
  }

  /** The same for work that takes a moment (several commands in a row: a widget moved to the panel). */
  async groupAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (this.grouping || this.paused) return fn();
    const steps = this.openGroup(label);
    try {
      return await fn();
    } finally {
      this.closeGroup(steps);
    }
  }

  private openGroup(label: string): Entry[] {
    const steps: Entry[] = [];
    this.grouping = steps;
    this.groupLabel = label;
    return steps;
  }

  private closeGroup(steps: Entry[]): void {
    this.grouping = null;
    if (steps.length === 1) this.record({ ...steps[0], label: this.groupLabel || steps[0].label });
    else if (steps.length) {
      this.record({
        label: this.groupLabel,
        undo: async () => { for (const s of [...steps].reverse()) await s.undo(); },
        redo: steps.every((s) => s.redo) ? async () => { for (const s of steps) await s.redo!(); } : undefined,
      });
    }
  }

  /** Run without recording (loading, automatic changes). */
  quiet<T>(fn: () => T): T {
    this.paused++;
    try {
      return fn();
    } finally {
      this.paused--;
    }
  }

  async quietAsync<T>(fn: () => Promise<T>): Promise<T> {
    this.paused++;
    try {
      return await fn();
    } finally {
      this.paused--;
    }
  }

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.some((e) => e.redo);
  }

  /** The last steps, newest first (the `undo list` command). */
  list(n = 20): { label: string; at: number }[] {
    return this.done.slice(-n).reverse().map(({ label, at }) => ({ label, at }));
  }

  /** Take the last step back. Returns its label, or undefined if there was nothing. */
  async undo(): Promise<string | undefined> {
    const e = this.done.pop();
    if (!e) return undefined;
    await this.quietAsync(async () => e.undo());
    this.undone.push(e);
    this.onChange?.();
    return e.label;
  }

  async redo(): Promise<string | undefined> {
    while (this.undone.length) {
      const e = this.undone.pop()!;
      if (!e.redo) continue;
      await this.quietAsync(async () => e.redo!());
      this.done.push({ ...e, at: 0 }); // at 0: never merged with what comes next
      this.onChange?.();
      return e.label;
    }
    return undefined;
  }

  clear(): void {
    this.done = [];
    this.undone = [];
    this.onChange?.();
  }
}

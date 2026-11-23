/**
 * THE log of everything that happens on the deck, shown in the shell's LOG
 * tab with filters (you pick what you want to see):
 *
 *   cmd     a command you typed in ibsh
 *   action  a command run by a click (the mouse teaches the command line), with its output
 *   error   something went wrong (with its code, E101…: see core/errors.ts)
 *   notify  a message the deck showed you (a toast)
 *   debug   what modules and the deck report for developers (`deck.debug`,
 *           `ib.debug`); `debug on` adds the deck's own events (slow frames,
 *           pages opened, settings changed)
 *   access  a module, the AI or your real terminal used a permission (core/access.ts:
 *           who, which one, on what — a note's name, never what it says)
 *
 * Writing to it: `deck.log.add(kind, text, { detail, code, source })`.
 * Reading it: `deck.log.list` (oldest first), `log tail` in the shell.
 */
import { redact } from "./redact";

export type LogKind = "cmd" | "action" | "error" | "notify" | "debug" | "access";

/** The kinds in the order the filter shows them, with their glyph. */
export const LOG_KINDS: { kind: LogKind; label: string; glyph: string }[] = [
  { kind: "cmd", label: "commands", glyph: "❯" },
  { kind: "action", label: "clicks", glyph: "◂" },
  { kind: "error", label: "errors", glyph: "⚠" },
  { kind: "notify", label: "messages", glyph: "✉" },
  { kind: "debug", label: "debug", glyph: "⚙" },
  { kind: "access", label: "access", glyph: "◈" },
];

export const isLogKind = (s: string): s is LogKind => LOG_KINDS.some((k) => k.kind === s);

export interface LogEntry {
  id: number;
  at: number;
  kind: LogKind;
  /** one line: the command, the message, the error's title */
  text: string;
  /** more lines under it (a click's output, an error's details) */
  detail?: string;
  /** an error's code (E101…) */
  code?: string;
  /** who said it (a module's id for debug lines) */
  source?: string;
  /** the command failed (exit code ≠ 0) */
  failed?: boolean;
}

/** ANSI colours out (the log stores plain text, it draws its own colours), secrets masked (core/redact.ts). */
/** how much of an entry's detail is masked again with each new piece (EventLog.append): longer than any key or 24 words */
const APPEND_LOOKBACK = 4096;

const plain = (s: string) => redact(s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ""));

export class EventLog {
  readonly list: LogEntry[] = [];
  /** entries nobody has looked at (the tab shows •n); debug lines don't count */
  unseen = 0;
  /** errors nobody has looked at (the tab blinks red) */
  unseenErrors = 0;
  /** `debug on`: the deck logs its own events too */
  debugOn = false;
  private next = 1;
  /** called after each new entry (the deck redraws) */
  onAdd: (e: LogEntry) => void = () => {};

  add(kind: LogKind, text: string, o: { detail?: string; code?: string; source?: string; failed?: boolean } = {}): LogEntry {
    const e: LogEntry = { id: this.next++, at: Date.now(), kind, text: plain(text).trim(), ...o, detail: o.detail ? plain(o.detail) : undefined };
    // the same line again within a second (a stuck loop, a double click): just once
    const last = this.list[this.list.length - 1];
    if (last && last.kind === kind && last.text === e.text && e.at - last.at < 1000) return last;
    this.list.push(e);
    if (this.list.length > 1000) this.list.shift();
    if (kind !== "debug" && kind !== "access") this.unseen++;
    if (kind === "error") this.unseenErrors++;
    this.onAdd(e);
    return e;
  }

  /** More output for an entry (a click's command still running). */
  append(e: LogEntry, more: string): void {
    // masked with what came just before: a key printed in two pieces is still one key.
    // Only the end is looked at again (the rest was masked already): a long output stays
    // fast instead of being masked from its first line at every piece.
    const old = e.detail ?? "";
    const cut = Math.max(0, old.length - APPEND_LOOKBACK);
    e.detail = old.slice(0, cut) + plain(old.slice(cut) + more);
    this.onAdd(e);
  }

  /** Empty the log (only these kinds, if given). */
  clear(kinds?: LogKind[]): void {
    const keep = kinds ? this.list.filter((e) => !kinds.includes(e.kind)) : [];
    this.list.length = 0;
    this.list.push(...keep);
    this.unseen = this.unseenErrors = 0;
  }

  seen(): void {
    this.unseen = this.unseenErrors = 0;
  }
}

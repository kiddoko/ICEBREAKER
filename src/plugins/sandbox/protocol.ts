/**
 * The messages between a sandboxed module (its Worker: sandbox/worker.ts) and the
 * deck (sandbox/bridge.ts). docs/SANDBOX.md.
 *
 * Everything that crosses is plain data: no function, no handle. A module's
 * callbacks stay in its Worker and are named by ids (a hit area, a menu line, a
 * command run); the deck's stay in the deck.
 */
import type { Rect } from "../../core/grid";

/** A cell nobody drew in this frame (the deck keeps what's under it). */
export const UNTOUCHED = 0x110000;

/** What the deck knows about one clickable area of a frame. */
export interface HitInfo {
  id: number;
  rect: Rect;
  click: boolean;
  double: boolean;
  drag: boolean;
  up: boolean;
  wheel: boolean;
  right: boolean;
  menu: boolean;
  /** a command: the deck runs it as the module (untrusted), never as you */
  cmd?: string;
  tip?: string;
}

export interface Frame {
  t: "frame";
  inst: string;
  w: number;
  h: number;
  /** nothing changed since the last frame of this instance (cells not sent) */
  same: boolean;
  ch?: Uint32Array;
  fg?: Int32Array;
  bg?: Int32Array;
  attr?: Uint8Array;
  hits: HitInfo[];
  /** ui.animate: the next frame in this many ms (Infinity: none asked) */
  wake: number;
  caret: { x: number; y: number } | null;
  title?: string;
  status?: string;
}

/** What a frame is of: an app instance, a widget on HOME / the panel, a widget's pop-up. */
export type Target = { kind: "app" } | { kind: "widget"; id: string; key?: string } | { kind: "popup"; id: string; key?: string };

export interface MenuLine {
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  cmd?: string;
  /** "-" a separator */
  sep?: boolean;
}

/** Worker → deck */
export type FromModule =
  | { t: "ready" }
  | { t: "failed"; error: string }
  | { t: "rpc"; id: number; path: string[]; args: unknown[] }
  | { t: "register"; what: "command"; spec: Record<string, unknown> }
  | { t: "register"; what: "app"; spec: Record<string, unknown> }
  | { t: "register"; what: "action"; spec: Record<string, unknown> }
  | { t: "register"; what: "widget"; spec: Record<string, unknown> }
  | Frame
  | { t: "redraw" }
  | { t: "out"; sid: number; text: string; err?: boolean }
  | { t: "clear"; sid: number }
  | { t: "read"; sid: number; rid: number; label: string; opts: Record<string, unknown> }
  | { t: "done"; sid: number; code: number; error?: string }
  | { t: "menu"; rid: number; lines: MenuLine[] }
  | { t: "log"; text: string };

/** Deck → worker */
export type ToModule =
  | { t: "load"; code: string; manifest: unknown; version: string; theme: unknown; notes: string[] | null; notesError: string; settings: Record<string, unknown> }
  | { t: "rpc"; id: number; ok: boolean; value?: unknown; error?: string }
  | { t: "theme"; theme: unknown }
  | { t: "notes"; notes: string[] | null; notesError: string }
  | { t: "settings"; settings: Record<string, unknown> }
  | { t: "create"; inst: string; kind: string; args?: unknown }
  | { t: "close"; inst: string }
  | { t: "render"; inst: string; target: Target; w: number; h: number; focused: boolean; mouse: { x: number; y: number }; now: number }
  | { t: "hit"; inst: string; id: number; kind: "click" | "double" | "drag" | "up" | "wheel" | "right"; m: unknown; delta?: number }
  | { t: "key"; inst: string; target: Target; k: unknown }
  | { t: "text"; inst: string; target: Target; text: string }
  | { t: "action"; inst: string; target: Target; a: string }
  | { t: "menuReq"; inst: string; id: number; rid: number }
  | { t: "menuRun"; rid: number; line: number }
  | { t: "paletteRun"; id: string }
  | { t: "widgetActivate"; id: string; key?: string }
  | { t: "run"; sid: number; name: string; args: string[]; stdin: string; isTTY: boolean; cwd: string }
  | { t: "readReply"; sid: number; rid: number; value: string | null }
  | { t: "abort"; sid: number }
  | { t: "stop" };

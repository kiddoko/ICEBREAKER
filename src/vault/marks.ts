import { hex, type RGB } from "../core/color";
import { normalize } from "./paths";
import type { Vault } from "./vault";

/**
 * Colour tags (like Ableton: red, orange…) and custom icons on files and
 * folders. They live in the vault, so they travel with it:
 *   .icebreaker/tags.json   { "notes/ideas.md": "red", "projects": "cyan" }
 *   .icebreaker/icons.json  { "notes/ideas.md": "★" }
 * Renames and moves carry them along; the trash drops them.
 */

export const TAG_COLORS = {
  red: "#ff4d5e",
  orange: "#ff9a3c",
  yellow: "#ffd84a",
  green: "#5be37d",
  cyan: "#3ee6e6",
  blue: "#4d8dff",
  purple: "#a66bff",
  pink: "#ff6bc8",
} as const;
export type TagColor = keyof typeof TAG_COLORS;
export const TAG_NAMES = Object.keys(TAG_COLORS) as TagColor[];
export const isTagColor = (s: string): s is TagColor => s in TAG_COLORS;
export const tagRGB = (c: TagColor): RGB => hex(TAG_COLORS[c]);

/** Glyphs offered in the icon menu (any character works with `icon <path> <glyph>`). */
export const ICON_CHOICES = ["★", "♥", "◆", "●", "▲", "■", "✚", "✦", "⚑", "⚡", "☀", "☾", "♪", "✎", "⌘", "⚙", "☢", "☠", "♞", "⌬", "∿", "λ", "❯", "▣"];

const TAGS = ".icebreaker/tags.json";
const ICONS = ".icebreaker/icons.json";

export class Marks {
  tags: Record<string, TagColor> = {};
  icons: Record<string, string> = {};
  /** bumps on every change (the tree redraws) */
  version = 0;
  private loadedFor: string | null = null;

  constructor(private readonly vault: Vault) {
    vault.events.on("rescanned", () => void this.load());
    vault.events.on("renamed", ({ from, to }) => this.move(from, to));
    vault.events.on("trashed", ({ path }) => this.drop(path));
  }

  /** Read both files (once per vault). */
  async load(force = false): Promise<void> {
    const root = this.vault.root;
    if (!root || (!force && this.loadedFor === root)) return;
    this.loadedFor = root;
    this.tags = await this.readJson(TAGS, (v) => typeof v === "string" && isTagColor(v));
    this.icons = await this.readJson(ICONS, (v) => typeof v === "string" && v.length > 0);
    this.version++;
  }

  private async readJson<T>(file: string, ok: (v: unknown) => boolean): Promise<Record<string, T>> {
    let text = "";
    try {
      if (!(await this.vault.exists(file))) return {};
      text = await this.vault.read(file);
      const raw = JSON.parse(text) as Record<string, unknown>;
      const out: Record<string, T> = {};
      for (const [k, v] of Object.entries(raw ?? {})) if (ok(v)) out[normalize(k)] = v as T;
      return out;
    } catch {
      // a broken file would be overwritten by the next change: keep a copy first
      if (text) await this.vault.write(`${file}.broken`, text).catch(() => {});
      return {};
    }
  }

  private async save(which: "tags" | "icons"): Promise<void> {
    this.version++;
    const data = which === "tags" ? this.tags : this.icons;
    const sorted = Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
    await this.vault.write(which === "tags" ? TAGS : ICONS, JSON.stringify(sorted, null, 2) + "\n");
  }

  tagOf(path: string): TagColor | undefined {
    return this.tags[normalize(path)];
  }

  iconOf(path: string): string | undefined {
    return this.icons[normalize(path)];
  }

  async setTag(path: string, color: TagColor | null): Promise<void> {
    const p = normalize(path);
    if (color) this.tags[p] = color;
    else delete this.tags[p];
    await this.save("tags");
  }

  async setIcon(path: string, glyph: string | null): Promise<void> {
    const p = normalize(path);
    // one character (an emoji, a box-drawing glyph…), never a word
    const g = glyph ? [...glyph.trim()][0] : "";
    if (g) this.icons[p] = g;
    else delete this.icons[p];
    await this.save("icons");
  }

  /** Everything tagged `color`, sorted (folders first). */
  tagged(color: TagColor): string[] {
    return Object.entries(this.tags)
      .filter(([, c]) => c === color)
      .map(([p]) => p)
      .sort((a, b) => Number(this.vault.isDir(b)) - Number(this.vault.isDir(a)) || a.localeCompare(b));
  }

  /** How many things each colour has. */
  counts(): Record<TagColor, number> {
    const n = Object.fromEntries(TAG_NAMES.map((c) => [c, 0])) as Record<TagColor, number>;
    for (const c of Object.values(this.tags)) n[c]++;
    return n;
  }

  private move(from: string, to: string): void {
    const f = normalize(from);
    const t = normalize(to);
    let tags = false;
    let icons = false;
    const shift = (map: Record<string, string>) => {
      let hit = false;
      for (const k of Object.keys(map)) {
        if (k !== f && !k.startsWith(f + "/")) continue;
        map[t + k.slice(f.length)] = map[k];
        delete map[k];
        hit = true;
      }
      return hit;
    };
    tags = shift(this.tags);
    icons = shift(this.icons);
    if (tags) void this.save("tags");
    if (icons) void this.save("icons");
  }

  private drop(path: string): void {
    const p = normalize(path);
    const strip = (map: Record<string, string>) => {
      let hit = false;
      for (const k of Object.keys(map)) if (k === p || k.startsWith(p + "/")) (delete map[k], (hit = true));
      return hit;
    };
    if (strip(this.tags)) void this.save("tags");
    if (strip(this.icons)) void this.save("icons");
  }
}

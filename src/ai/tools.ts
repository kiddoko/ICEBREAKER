import type { Vault } from "../vault/vault";
import { isDeckPath, normalize } from "../vault/paths";
import type { ToolSpec } from "./types";

/**
 * What the AI may read by itself (`ai.reads`, Settings → PERMISSIONS):
 *   nothing  no note at all — only what you type
 *   given    the notes you gave it: named in what you typed, piped to it, or in front
 *   all      your whole vault (list, search, read)
 */
export interface AiReads {
  level: () => "nothing" | "given" | "all";
  /** the notes you gave it in this conversation (paths) */
  given: () => string[];
  /** a note is being read: the access journal, the voyant in the top bar */
  onRead?: (path: string) => void;
}

/**
 * The notes you gave the AI: the ones named in what you typed (a path, or a note's name of
 * three letters or more as a whole word) and the one in front. Names only: nothing is read here.
 */
export function givenNotes(vault: Pick<Vault, "markdown">, texts: string[], front?: string | null): string[] {
  const said = texts.join("\n").toLowerCase();
  const out = new Set<string>();
  if (front) out.add(normalize(front));
  if (said.trim()) {
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // a whole word, never a piece of one ("n" isn't in "reading", "ideas" isn't "idea")
    const word = (x: string) => new RegExp(`(^|[^\\p{L}\\p{N}_/.-])${esc(x)}($|[^\\p{L}\\p{N}_/-])`, "u");
    for (const e of vault.markdown()) {
      const path = e.path.toLowerCase();
      const bare = path.replace(/\.md$/, "");
      const name = bare.slice(bare.lastIndexOf("/") + 1);
      // its path (with or without .md), or its name when it's three letters or more
      if (word(path).test(said) || (bare.length >= 3 && word(bare).test(said)) || (name.length >= 3 && word(name).test(said))) out.add(e.path);
    }
  }
  return [...out].filter((p) => !isDeckPath(p));
}

const NOT_ALLOWED = "The user hasn't allowed the AI to read notes by itself (Settings → PERMISSIONS → What the AI may read). Work with what they typed.";
const notGiven = (path: string) => `The user hasn't given you ${path}. You may read only the notes they named, piped or have in front (Settings → PERMISSIONS → What the AI may read): ask them to name it.`;

/**
 * Tools that let the AI work with the vault. Reading follows `reads` (the whole vault when it
 * isn't given: a module's own tools, under its own permissions); writing always
 * goes through `confirm`, which shows the user exactly what will change.
 */
export function vaultTools(vault: Vault, confirm: (title: string, detail: string) => Promise<boolean>, reads?: AiReads): ToolSpec[] {
  const level = () => reads?.level() ?? "all";
  /** the notes it may see now: null = every one */
  const visible = (): Set<string> | null => (level() === "all" ? null : new Set(level() === "given" ? reads!.given().map(normalize) : []));
  return [
    {
      name: "list_notes",
      description: "List note paths in the vault (Markdown files), optionally only inside one folder. Returns one path per line.",
      inputSchema: {
        type: "object",
        properties: { folder: { type: "string", description: 'Folder to list, e.g. "journal". Omit for the whole vault.' } },
      },
      run: async (input) => {
        if (level() === "nothing") return NOT_ALLOWED;
        const only = visible();
        const folder = typeof input.folder === "string" ? normalize(input.folder) : "";
        const paths = vault
          .markdown()
          .map((e) => e.path)
          .filter((p) => (!folder || p.startsWith(folder + "/")) && (!only || only.has(p)));
        if (only && paths.length === 0) return "(the user gave you no note here — you may read only the ones they named, piped or have in front)";
        if (paths.length === 0) return "(no notes)";
        const shown = paths.slice(0, 500);
        return shown.join("\n") + (paths.length > shown.length ? `\n… and ${paths.length - shown.length} more` : "");
      },
    },
    {
      name: "search_notes",
      description: "Case-insensitive full-text search across all notes. Returns matching lines as path:line: text.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text to look for." },
          max_results: { type: "integer", description: "Maximum number of matching lines (default 50)." },
        },
        required: ["query"],
      },
      run: async (input) => {
        const q = String(input.query).toLowerCase();
        const max = typeof input.max_results === "number" ? Math.min(200, input.max_results) : 50;
        if (level() === "nothing") return NOT_ALLOWED;
        const only = visible();
        const files = vault.markdown().map((e) => e.path).filter((p) => !only || only.has(p));
        // a search reads every note it looks in: one line in the journal, not thousands
        reads?.onRead?.(only ? `search in ${files.length} given note${files.length === 1 ? "" : "s"}` : "search in every note");
        const contents = await vault.readMany(files);
        const hits: string[] = [];
        files.forEach((path, i) => {
          (contents[i] ?? "").split("\n").forEach((line, n) => {
            if (hits.length < max && line.toLowerCase().includes(q)) hits.push(`${path}:${n + 1}: ${line.trim().slice(0, 200)}`);
          });
        });
        return hits.length ? hits.join("\n") : "no matches";
      },
    },
    {
      name: "read_note",
      description: "Read the full Markdown content of a note.",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string", description: 'Vault-relative path, e.g. "journal/2026-11-17.md".' } },
        required: ["path"],
      },
      run: async (input) => {
        // the deck's own folder (other modules' data, the shell history…) isn't notes
        if (isDeckPath(String(input.path))) throw new Error(".icebreaker/ is the deck's own folder, not notes");
        if (level() === "nothing") return NOT_ALLOWED;
        const only = visible();
        if (only && !only.has(normalize(String(input.path)))) return notGiven(String(input.path));
        reads?.onRead?.(normalize(String(input.path)));
        const text = await vault.read(String(input.path));
        return text.length > 100_000 ? text.slice(0, 100_000) + "\n…[truncated]" : text;
      },
    },
    {
      name: "write_note",
      description:
        "Create, overwrite or append to a note. The user must approve every write. Prefer 'append' for journal entries.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Vault-relative path ending in .md" },
          content: { type: "string", description: "Markdown to write." },
          mode: { type: "string", enum: ["create", "overwrite", "append"], description: "create fails if the note exists." },
        },
        required: ["path", "content", "mode"],
      },
      run: async (input) => {
        const path = normalize(String(input.path));
        const content = String(input.content);
        const mode = String(input.mode);
        if (!path.endsWith(".md")) throw new Error("only .md notes can be written");
        // however it's written (".ICEBREAKER" is the same folder on a Mac or on Windows)
        if (isDeckPath(path)) throw new Error(".icebreaker/ is the deck's own folder, not notes");
        const exists = await vault.exists(path);
        if (mode === "create" && exists) throw new Error(`${path} already exists — use append or overwrite`);
        // what you approve is what's written: the start, and how much more there is
        const all = content.split("\n");
        const preview = all.slice(0, 12).join("\n") + (all.length > 12 ? `\n… ${all.length - 12} more lines (${content.length} characters in all)` : "");
        const ok = await confirm(`AI wants to ${mode} ${path}`, preview);
        if (!ok) return "The user declined this write.";
        if (mode === "append") await vault.append(path, content);
        else await vault.write(path, content);
        return `ok: ${mode} ${path} (${content.length} chars)`;
      },
    },
  ];
}

import type { Vault } from "../vault/vault";
import { isDeckPath, normalize } from "../vault/paths";
import type { ToolSpec } from "./types";

/**
 * Tools that let the AI work with the vault. Reading is free; writing always
 * goes through `confirm`, which shows the user exactly what will change.
 */
export function vaultTools(vault: Vault, confirm: (title: string, detail: string) => Promise<boolean>): ToolSpec[] {
  return [
    {
      name: "list_notes",
      description: "List note paths in the vault (Markdown files), optionally only inside one folder. Returns one path per line.",
      inputSchema: {
        type: "object",
        properties: { folder: { type: "string", description: 'Folder to list, e.g. "journal". Omit for the whole vault.' } },
      },
      run: async (input) => {
        const folder = typeof input.folder === "string" ? normalize(input.folder) : "";
        const paths = vault
          .markdown()
          .map((e) => e.path)
          .filter((p) => !folder || p.startsWith(folder + "/"));
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
        const files = vault.markdown().map((e) => e.path);
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

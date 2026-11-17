import { demoVault } from "./demo-vault";
import type { Platform, SystemStats, VaultEntry } from "./types";

/**
 * Browser platform for `npm run dev` without Tauri.
 * The vault is a Map persisted in localStorage — good enough to work on the UI.
 */
export function createWebPlatform(): Platform {
  const KEY = "icebreaker.web-vault";
  const files = new Map<string, { content: string; modified: number }>();
  const dirs = new Set<string>([""]);

  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Record<string, { content: string; modified: number }> | null;
    if (saved) for (const [p, f] of Object.entries(saved)) files.set(p, f);
  } catch {
    /* corrupted storage: start fresh */
  }
  if (files.size === 0) for (const [p, c] of Object.entries(demoVault())) files.set(p, { content: c, modified: Date.now() });

  const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
  const addParents = (p: string) => {
    for (let d = parentOf(p); d; d = parentOf(d)) dirs.add(d);
  };
  for (const p of files.keys()) addParents(p);

  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(files)));
    } catch {
      /* quota exceeded: keep in memory */
    }
  };
  const entry = (path: string): VaultEntry => {
    const f = files.get(path);
    return { path, name: path.split("/").pop() ?? path, isDir: !f, size: f?.content.length ?? 0, modified: f?.modified ?? Date.now() };
  };
  const notFound = (p: string) => new Error(`no such file or directory: ${p}`);

  let cpu = 12;
  const boot = Date.now();

  return {
    kind: "web",
    vault: {
      mount: async () => "browser://demo-vault",
      defaultPath: async () => "browser://demo-vault",
      list: async (dir) => {
        if (!dirs.has(dir)) throw notFound(dir);
        const all = [...dirs, ...files.keys()].filter((p) => p !== "" && parentOf(p) === dir);
        return all.map(entry);
      },
      // like the Rust side: tool folders (.icebreaker, .trash…) are not part of the index
      walk: async () =>
        [...dirs].filter(Boolean).map(entry).concat([...files.keys()].map(entry)).filter((e) => !e.path.split("/").some((p) => p.startsWith("."))),
      read: async (p) => {
        const f = files.get(p);
        if (!f) throw notFound(p);
        return f.content;
      },
      readMany: async (ps) => ps.map((p) => files.get(p)?.content ?? null),
      write: async (p, content) => {
        files.set(p, { content, modified: Date.now() });
        addParents(p);
        persist();
      },
      mkdir: async (p) => {
        dirs.add(p);
        addParents(p);
      },
      trash: async (p) => {
        const dest = `.trash/${Date.now()}-${p.split("/").pop()}`;
        for (const [k, v] of [...files]) {
          if (k === p || k.startsWith(p + "/")) {
            files.delete(k);
            files.set(dest + k.slice(p.length), v);
          }
        }
        for (const d of [...dirs]) if (d === p || d.startsWith(p + "/")) dirs.delete(d);
        persist();
        return dest;
      },
      rename: async (from, to) => {
        for (const [k, v] of [...files]) {
          if (k === from || k.startsWith(from + "/")) {
            files.delete(k);
            files.set(to + k.slice(from.length), v);
            addParents(to + k.slice(from.length));
          }
        }
        if (dirs.delete(from)) dirs.add(to);
        persist();
      },
      exists: async (p) => files.has(p) || dirs.has(p),
    },
    config: {
      read: async (name) => localStorage.getItem(`icebreaker.${name}`),
      write: async (name, content) => localStorage.setItem(`icebreaker.${name}`, content),
    },
    system: {
      stats: async (): Promise<SystemStats> => {
        cpu = Math.max(2, Math.min(95, cpu + (Math.random() - 0.5) * 14));
        const cores = Array.from({ length: navigator.hardwareConcurrency || 4 }, () => Math.max(0, Math.min(100, cpu + (Math.random() - 0.5) * 30)));
        return {
          cpu, cores,
          memUsed: 6.1e9 + Math.random() * 2e8, memTotal: 16e9, swapUsed: 0, swapTotal: 0,
          uptime: (Date.now() - boot) / 1000, host: "browser", os: navigator.platform || "web",
          kernel: "n/a", cpuBrand: "virtual cpu", processes: 1, arch: "wasm-ish",
        };
      },
    },
    envApiKey: async () => null,
    window: {
      setFullscreen: async (on) => {
        if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen().catch(() => {});
        if (!on && document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      },
      isFullscreen: async () => !!document.fullscreenElement,
      quit: async () => window.close(),
    },
  };
}

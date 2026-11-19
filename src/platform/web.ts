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
            addParents(dest + k.slice(p.length));
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
      // like the desktop app: device.json is the deck's, the rest the unlocked account's
      read: async (name) => (name === "device.json" ? localStorage.getItem("icebreaker.device.json") : webSession() ? localStorage.getItem(`icebreaker.${webSession()}.${name}`) : null),
      write: async (name, content) => {
        if (name === "device.json") return localStorage.setItem("icebreaker.device.json", content);
        if (!webSession()) throw new Error("locked: log in first");
        localStorage.setItem(`icebreaker.${webSession()}.${name}`, content);
      },
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
    account: webAccount(),
    dev: {
      factoryReset: async () => {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith("icebreaker"));
        keys.forEach((k) => localStorage.removeItem(k));
        return [`${keys.length} browser storage keys cleared`];
      },
      restart: async () => location.reload(),
    },
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

/**
 * Browser preview only: same contract as the desktop accounts, with PBKDF2
 * (600 000 rounds, WebCrypto) in localStorage, the unlocked account in
 * sessionStorage (it survives a reload, like the desktop app's). The desktop
 * app uses Argon2id and keeps the session on the native side.
 */
type WebAccount = { id: string; user: string; salt: string; hash: string };
const SESSION = "icebreaker.session";
/** the unlocked account's id (the browser preview's config files are kept per account) */
export const webSession = (): string | null => sessionStorage.getItem(SESSION);

function webAccount(): Platform["account"] {
  const KEY = "icebreaker.accounts";
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
  const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const derive = async (pw: string, salt: Uint8Array<ArrayBuffer>) => {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 600_000 }, key, 256));
  };
  const norm = (u: string) => u.trim().toLowerCase();
  const load = (): WebAccount[] => {
    try {
      const list = JSON.parse(localStorage.getItem(KEY) ?? "null") as WebAccount[] | null;
      if (list) return list;
      // the single account of older previews
      const old = JSON.parse(localStorage.getItem("icebreaker.account") ?? "null") as Omit<WebAccount, "id"> | null;
      return old ? [{ ...old, id: slug(old.user, []) }] : [];
    } catch {
      return [];
    }
  };
  const save = (list: WebAccount[]) => localStorage.setItem(KEY, JSON.stringify(list));
  const slug = (u: string, taken: string[]) => {
    const base = norm(u).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "user";
    let id = base;
    for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
    return id;
  };
  const find = async (user: string, pw: string): Promise<WebAccount | null> => {
    const a = load().find((x) => norm(x.user) === norm(user));
    const h = await derive(pw, a ? unb64(a.salt) : new Uint8Array(16));
    if (!a) return null;
    const want = unb64(a.hash);
    let diff = h.length ^ want.length;
    for (let i = 0; i < h.length; i++) diff |= h[i] ^ (want[i] ?? 0);
    return diff === 0 ? a : null;
  };
  const check = (user: string, pw: string) => {
    if (!user.trim() || [...user.trim()].length > 64) throw new Error("the account name must be 1–64 characters");
    if (pw.length < 8) throw new Error("the password must be at least 8 characters");
  };
  const current = () => load().find((a) => a.id === webSession()) ?? null;
  return {
    status: async () => current()?.user ?? null,
    session: async () => {
      const a = current();
      return a ? { id: a.id, user: a.user } : null;
    },
    count: async () => load().length,
    create: async (user, pw, approver, approverPw) => {
      const list = load();
      if (list.length && !(await find(approver ?? "", approverPw ?? ""))) throw new Error("an account of this deck must approve it (its name and password)");
      check(user, pw);
      if (list.some((a) => norm(a.user) === norm(user))) throw new Error("there's already an account with that name");
      const id = slug(user, list.map((a) => a.id));
      const salt = crypto.getRandomValues(new Uint8Array(16));
      save([...list, { id, user: user.trim(), salt: b64(salt), hash: b64(await derive(pw, salt)) }]);
      // the first account keeps what the preview had (settings from before accounts)
      if (!list.length) for (const n of ["settings.json", "secrets.json"]) {
        const v = localStorage.getItem(`icebreaker.${n}`);
        if (v !== null && localStorage.getItem(`icebreaker.${id}.${n}`) === null) localStorage.setItem(`icebreaker.${id}.${n}`, v);
      }
      sessionStorage.setItem(SESSION, id);
      return { id, user: user.trim() };
    },
    verify: async (user, pw) => {
      const a = await find(user, pw);
      if (a) sessionStorage.setItem(SESSION, a.id);
      return !!a;
    },
    lock: async () => sessionStorage.removeItem(SESSION),
    change: async (pw, user, npw) => {
      const me = current();
      if (!me || !(await find(me.user, pw))) throw new Error("wrong password");
      check(user, npw);
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const hash = b64(await derive(npw, salt));
      save(load().map((a) => (a.id === me.id ? { ...a, user: user.trim(), salt: b64(salt), hash } : a)));
    },
    remove: async (pw) => {
      const me = current();
      if (!me || !(await find(me.user, pw))) throw new Error("wrong password");
      save(load().filter((a) => a.id !== me.id));
      sessionStorage.removeItem(SESSION);
    },
  };
}

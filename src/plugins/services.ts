/**
 * MODULES TALK TO EACH OTHER. A module exposes functions under its id
 * (`ib.modules.expose("add", fn)` → "todo.add"); any module — built-in or
 * downloaded — calls them (`await ib.modules.call("todo", "add", "walk the dog")`).
 *
 * A function can say which permission its callers need ("vault:write" to
 * write a note, "ai" to talk to the AI…): calling it is no way around the
 * permissions a module declared. When a module is switched off, its functions
 * go with it; `call` then fails with a clear message (check `has` first).
 *
 * The shell sees the same thing: `modules api` lists every function,
 * `modules call todo add "walk the dog"` calls one.
 */
import type { Origin } from "../shell/origin";
import type { Permission } from "./api";

/** Who calls a function: a module (its permissions, and the origin its lines run with) or the deck itself. */
export interface Caller {
  id: string;
  permissions: ReadonlySet<Permission> | "all";
  /** every module has one (shell/origin.ts); the deck's own code and your typing have none */
  origin?: Origin;
}

export interface ServiceSpec {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (...args: any[]) => unknown;
  /** one line: what it does and its arguments — shown by `modules api` */
  doc?: string;
  /** the permission a caller needs */
  needs?: Permission;
  /**
   * For a function that runs a command line or changes what runs: the function to call
   * for THIS caller (used instead of `fn`), so a module's call runs as that module —
   * never as you (plugins/frame-services.ts).
   */
  by?: (caller: Caller) => (...args: any[]) => unknown; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** What `use(module)` gives back: any function name, called with any arguments, as a Promise. */
export type ModuleProxy = Record<string, (...args: any[]) => Promise<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ServiceInfo {
  module: string;
  name: string;
  doc: string;
  needs?: Permission;
}

export class ServiceRegistry {
  private byModule = new Map<string, Map<string, ServiceSpec>>();

  expose(module: string, name: string, spec: ServiceSpec | ServiceSpec["fn"]): void {
    if (!/^[a-z][\w-]*$/i.test(name)) throw new Error(`modules.expose: "${name}" isn't a function name`);
    const s = typeof spec === "function" ? { fn: spec } : spec;
    let m = this.byModule.get(module);
    if (!m) this.byModule.set(module, (m = new Map()));
    m.set(name, s);
  }

  exposeAll(module: string, specs: Record<string, ServiceSpec>): void {
    for (const [name, s] of Object.entries(specs)) this.expose(module, name, s);
  }

  unregisterSource(module: string): void {
    this.byModule.delete(module);
  }

  has(module: string, name?: string): boolean {
    const m = this.byModule.get(module);
    return !!m && (name === undefined || m.has(name));
  }

  list(module?: string): ServiceInfo[] {
    const out: ServiceInfo[] = [];
    for (const [mod, fns] of this.byModule) {
      if (module && mod !== module) continue;
      for (const [name, s] of fns) out.push({ module: mod, name, doc: s.doc ?? "", needs: s.needs });
    }
    return out.sort((a, b) => a.module.localeCompare(b.module) || a.name.localeCompare(b.name));
  }

  /** Call module.name(...args) on behalf of `caller` (its permissions are checked). */
  /**
   * A module's functions as an object: `use("tree").reveal("notes/a.md")` is
   * `call(caller, "tree", "reveal", ["notes/a.md"])`. Every function returns a
   * Promise (the module may be async, or switched off meanwhile).
   */
  proxy<T = ModuleProxy>(caller: Caller, module: string): T {
    return new Proxy({}, {
      get: (_t, name) => (typeof name === "string" && name !== "then" ? (...args: unknown[]) => this.call(caller, module, name, args) : undefined),
    }) as T;
  }

  async call(caller: Caller, module: string, name: string, args: unknown[]): Promise<unknown> {
    const m = this.byModule.get(module);
    if (!m) throw new Error(`module "${module}" isn't on, or exposes nothing (modules api)`);
    const s = m.get(name);
    if (!s) throw new Error(`module "${module}" has no "${name}" — it has: ${[...m.keys()].join(", ") || "nothing"}`);
    if (s.needs && caller.permissions !== "all" && !caller.permissions.has(s.needs) && caller.id !== module)
      throw new Error(`"${module}.${name}" needs the "${s.needs}" permission in ${caller.id}'s plugin.json`);
    return await (s.by ? s.by(caller) : s.fn)(...args);
  }
}

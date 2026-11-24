/**
 * `ib.use("terminal").run("git status")` in a sandboxed module: each function of the proxy is
 * `ib.modules.call(module, name, …args)` — the deck checks it the same way (permissions, who
 * may call what). It was documented (docs/PLUGINS.md) but missing in the Worker: « ib.use is
 * not a function » (Windows bench 24/11).
 */
export function useProxy(module: string, call: (module: string, name: string, args: unknown[]) => Promise<unknown>): Record<string, (...args: unknown[]) => Promise<unknown>> {
  const target = String(module);
  return new Proxy({} as Record<string, (...args: unknown[]) => Promise<unknown>>, {
    get(_o, name) {
      // not a promise (`await ib.use("x")` gives the proxy), nothing hidden behind a symbol
      if (typeof name !== "string" || name === "then") return undefined;
      return (...args: unknown[]) => call(target, name, args);
    },
  });
}

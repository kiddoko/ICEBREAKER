import type { AppSpec, PaletteAction } from "./types";

/**
 * Keyed registry that remembers who registered what ("core" or a plugin id),
 * so a plugin's contributions can be removed when it's disabled.
 */
class Registry<T> {
  private items = new Map<string, { item: T; source: string }>();

  constructor(private readonly keyOf: (item: T) => string) {}

  register(item: T, source = "core"): void {
    this.items.set(this.keyOf(item), { item, source });
  }

  unregisterSource(source: string): void {
    for (const [k, v] of this.items) if (v.source === source) this.items.delete(k);
  }

  get(key: string): T | undefined {
    return this.items.get(key)?.item;
  }

  list(): T[] {
    return [...this.items.values()].map((v) => v.item);
  }
}

export class AppRegistry extends Registry<AppSpec> {
  constructor() {
    super((s) => s.kind);
  }
}

export class ActionRegistry extends Registry<PaletteAction> {
  constructor() {
    super((a) => a.id);
  }
}

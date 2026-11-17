/** Minimal typed event emitter. `on` returns an unsubscribe function. */
export class Emitter<Events extends Record<string, unknown>> {
  private handlers: { [K in keyof Events]?: Set<(payload: Events[K]) => void> } = {};

  on<K extends keyof Events>(event: K, fn: (payload: Events[K]) => void): () => void {
    (this.handlers[event] ??= new Set()).add(fn);
    return () => this.handlers[event]?.delete(fn);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.handlers[event]?.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[events] handler for "${String(event)}" failed`, err);
      }
    });
  }
}

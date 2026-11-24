/**
 * Calls that must reach the native side in the order they were made. Each `invoke` is its own
 * request: Tauri may run two at once, and on Windows they arrived out of order — `ib ls` in a
 * PowerShell tab printed rows 1, 4, 2, and row 3 came after the end mark and was lost. Each
 * call here starts only once the one before it has answered (or failed).
 */
export function inOrder<A extends unknown[]>(call: (...args: A) => Promise<unknown>): (...args: A) => Promise<void> {
  let last: Promise<unknown> = Promise.resolve();
  return (...args: A) => {
    const next = last.then(() => call(...args)).then(
      () => {},
      () => {},
    );
    last = next;
    return next;
  };
}

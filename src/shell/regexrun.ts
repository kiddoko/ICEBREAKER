/**
 * `grep`'s matching, away from the deck's thread. A pattern like `(a+)+$` on a long line takes
 * seconds inside one RegExp call (catastrophic backtracking): nothing can stop it there, so the
 * deck froze (11.5 s on the Windows bench) and ctrl+C couldn't act. In a worker it can be
 * stopped: by ctrl+C, or after `timeoutMs`. Where there's no Worker (the tests), it runs here,
 * a file at a time.
 */

export interface LineHit {
  /** which file, which line (0-based) */
  f: number;
  i: number;
  /** where the pattern is on that line (for the highlight), when asked */
  spans: [number, number][];
}

export type GrepResult = { hits: LineHit[] } | { stopped: "timeout" | "interrupted" };

interface Job {
  source: string;
  flags: string;
  invert: boolean;
  spans: boolean;
  texts: string[];
}

/** The matching itself — the same code in the worker and here. */
function match(job: Job): LineHit[] {
  const re = new RegExp(job.source, job.flags.replace("g", ""));
  const all = new RegExp(job.source, job.flags.replace("g", "") + "g");
  const hits: LineHit[] = [];
  job.texts.forEach((text, f) => {
    text.split("\n").forEach((line, i) => {
      if (re.test(line) === job.invert) return;
      const spans: [number, number][] = [];
      if (job.spans && !job.invert) {
        all.lastIndex = 0;
        for (let m = all.exec(line); m; m = all.exec(line)) {
          if (m[0] === "") {
            all.lastIndex++;
            continue;
          }
          spans.push([m.index, m.index + m[0].length]);
        }
      }
      hits.push({ f, i, spans });
    });
  });
  return hits;
}

/** the worker: `match` and nothing else, as text (exported for the test that runs it alone) */
export const WORKER_SRC = `const match = ${match.toString()};\nonmessage = (e) => postMessage(match(e.data));`;

export async function grepLines(
  texts: string[],
  re: RegExp,
  opts: { invert?: boolean; spans?: boolean; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<GrepResult> {
  const job: Job = { source: re.source, flags: re.flags, invert: !!opts.invert, spans: !!opts.spans, texts };
  if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL?.createObjectURL !== "function") {
    // (no worker: a pause between files lets ctrl+C through, at least between them)
    const hits: LineHit[] = [];
    for (let f = 0; f < texts.length; f++) {
      if (opts.signal?.aborted) return { stopped: "interrupted" };
      for (const h of match({ ...job, texts: [texts[f]] })) hits.push({ ...h, f });
      if (f % 50 === 49) await new Promise((r) => setTimeout(r, 0));
    }
    return { hits };
  }
  const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
  const worker = new Worker(url);
  try {
    return await new Promise<GrepResult>((resolve, reject) => {
      const timer = setTimeout(() => resolve({ stopped: "timeout" }), opts.timeoutMs ?? 5000);
      const stop = () => resolve({ stopped: "interrupted" });
      opts.signal?.addEventListener("abort", stop, { once: true });
      worker.onmessage = (e: MessageEvent<LineHit[]>) => (clearTimeout(timer), opts.signal?.removeEventListener("abort", stop), resolve({ hits: e.data }));
      worker.onerror = (e) => (clearTimeout(timer), reject(new Error(e.message || "grep: the search failed")));
      if (opts.signal?.aborted) return stop();
      worker.postMessage(job);
    });
  } finally {
    worker.terminate();
    URL.revokeObjectURL(url);
  }
}

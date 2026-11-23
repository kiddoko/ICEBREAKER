/**
 * Fuzzy matching for the command palette and "did you mean…?".
 * Letters of the query must appear in order; consecutive letters and
 * word starts score higher. Returns -1 when it doesn't match.
 */
export function fuzzyScore(query: string, target: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const qc of q) {
    if (qc === " ") continue;
    const found = t.indexOf(qc, ti);
    if (found === -1) return -1;
    const wordStart = found === 0 || /[\s/_\-.:]/.test(t[found - 1]);
    streak = found === ti ? streak + 1 : 0;
    score += 1 + streak * 2 + (wordStart ? 3 : 0) - Math.min(3, (found - ti) * 0.1);
    ti = found + 1;
  }
  return score - target.length * 0.01;
}

export function fuzzyFilter<T>(query: string, items: T[], text: (item: T) => string, limit = 200): T[] {
  if (!query.trim()) return items.slice(0, limit);
  return items
    .map((item) => ({ item, s: fuzzyScore(query, text(item)) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.item);
}

/**
 * Edit distance where two swapped letters count as one change (Damerau, "optimal string
 * alignment"), for "command not found — did you mean…": `hlep` is one step from help, two from grep.
 */
export function levenshtein(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** The closest name to a mistyped one (at most 2 changes), preferring one made of the same letters. */
export function didYouMean(typed: string, names: string[]): string | undefined {
  const letters = (s: string) => [...s].sort().join("");
  const best = names
    .map((n) => ({ n, d: levenshtein(typed, n) - (letters(n) === letters(typed) ? 0.5 : 0) }))
    .sort((a, b) => a.d - b.d || a.n.length - b.n.length)[0];
  return best && best.d <= 2 ? best.n : undefined;
}

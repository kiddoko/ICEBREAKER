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

/** Classic edit distance, for "command not found — did you mean…". */
export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

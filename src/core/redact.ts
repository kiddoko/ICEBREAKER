/**
 * Secrets out of what the deck keeps: the LOG tab (core/eventlog.ts), the error log
 * (core/errors.ts), the console and the shell's history (shell/shell.ts keepInHistory).
 *
 * The LOG keeps what you typed and what commands printed — and a module with the
 * "shell" permission can read its last lines (`ib.log.tail`). A password or a key
 * typed by mistake on the command line (a prompt that had closed, a paste in the
 * wrong place) must not stay there. Masked prompts never reach the log at all; this
 * is the net under them.
 *
 * What is masked:
 *   · API keys and tokens by their shape (sk-…, ghp_…, xoxb-…, AKIA…, a JWT, Bearer …)
 *   · `password=…`, `token: …`, `api_key=…`, `--password …`
 *   · a recovery key: 12 or more short lowercase words in a row, nothing else between
 *     them (the 24 words, or a part of them). Ordinary sentences have capitals,
 *     punctuation, numbers or long words somewhere; a phrase of 12+ bare words that
 *     happens to be prose is masked too — better a line too many.
 */

export const MASK = "[redacted]";

/** Keys and tokens by their shape. */
const TOKEN = /\b(sk-[a-z0-9_-]{8,}|ghp_[a-z0-9]{8,}|gh[ousr]_[a-z0-9]{8,}|github_pat_[a-z0-9_]{8,}|xox[abprs]-[a-z0-9-]{8,}|AKIA[0-9A-Z]{12,}|AIza[0-9a-z_-]{20,}|ya29\.[0-9a-z_-]{10,}|eyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}(\.[a-z0-9_-]+)?)/gi;
/** "Bearer abc…" in a header that was printed */
const BEARER = /\b(bearer)\s+[a-z0-9._~+/=-]{8,}/gi;
/** password=x, token: x, "api_key": "x", --password x */
const NAMED = /(\b(?:password|passwd|passphrase|pwd|token|secret|api[_-]?key|access[_-]?key|client[_-]?secret|refresh[_-]?token)\b["']?\s*[=:]\s*["']?|--(?:password|passwd|token|secret|api-?key)[=\s]+["']?)([^\s"',;]+)/gi;
/** 12+ bare lowercase words of 3 to 8 letters (BIP39 words are all like that) */
const PHRASE = /(?<![\p{L}\p{N}])(?:[a-z]{3,8}[ \t]+){11,}[a-z]{3,8}(?![\p{L}\p{N}])/gu;

/** The text with every secret it shows replaced by [redacted]. */
export function redact(text: string): string {
  if (!text) return text;
  return text
    .replace(TOKEN, MASK)
    .replace(BEARER, `$1 ${MASK}`)
    .replace(NAMED, (_m, name: string) => `${name}${MASK}`)
    .replace(PHRASE, MASK);
}

/** Does the text show a secret? (the shell then keeps the line out of its history) */
export function looksSecret(text: string): boolean {
  return redact(text) !== text;
}

/** An error or anything else, as text with its secrets masked (for console.error / warn). */
export function redactAny(x: unknown): string {
  if (x instanceof Error) return redact(`${x.name}: ${x.message}${x.stack ? `\n${x.stack}` : ""}`);
  return redact(typeof x === "string" ? x : (() => { try { return JSON.stringify(x) ?? String(x); } catch { return String(x); } })());
}

/**
 * The console masks secrets too (the web inspector, a crash copied into an issue): every
 * console.log / info / warn / error / debug of the page goes through redact. Called once,
 * first thing (main.ts). Strings and errors come out as masked text; numbers and booleans as they are.
 */
export function guardConsole(c: Pick<Console, "log" | "info" | "warn" | "error" | "debug"> = console): void {
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    const orig = c[level].bind(c);
    c[level] = (...args: unknown[]) => orig(...args.map((a) => (typeof a === "number" || typeof a === "boolean" || a == null ? a : redactAny(a))));
  }
}

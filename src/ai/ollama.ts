import type { ChatHandlers, ChatSession, Provider, SessionOptions } from "./types";

/**
 * Local open-source models through Ollama (https://ollama.com) — fully
 * offline, nothing leaves your machine.
 *
 *   ollama pull llama3.1
 *   config set ai.provider ollama
 *   config set ai.ollamaModel llama3.1
 *
 * Tool use (letting the model read your vault) isn't wired for Ollama yet:
 * local chat works, vault tools are Claude-only for now.
 */
/** The models this Ollama has pulled (for the settings' list); [] when it doesn't answer within 1.5 s. */
export async function ollamaModels(host: string): Promise<string[]> {
  if (!host) return [];
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 1500);
    const res = await fetch(`${host.replace(/\/$/, "")}/api/tags`, { signal: ctl.signal });
    clearTimeout(timer);
    const j = (await res.json()) as { models?: { name?: string }[] };
    return (j.models ?? []).map((m) => m.name ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

export class OllamaProvider implements Provider {
  readonly id = "ollama" as const;

  constructor(
    private readonly host: string,
    private readonly model: string,
  ) {}

  get label(): string {
    return `${this.model} (local)`;
  }

  readiness(): { ok: true } | { ok: false; reason: string } {
    if (!this.host) return { ok: false, reason: "no Ollama host set (`config set ai.ollamaHost http://localhost:11434`)" };
    return { ok: true };
  }

  createSession(opts: SessionOptions): ChatSession {
    return new OllamaSession(this.host.replace(/\/$/, ""), this.model, opts.system);
  }
}

interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

class OllamaSession implements ChatSession {
  private history: OllamaMessage[] = [];

  constructor(
    private readonly host: string,
    private readonly model: string,
    private readonly system: string,
  ) {}

  reset(): void {
    this.history = [];
  }

  async send(text: string, h: ChatHandlers, signal?: AbortSignal): Promise<void> {
    this.history.push({ role: "user", content: text });
    let res: Response;
    try {
      res = await fetch(`${this.host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, stream: true, messages: [{ role: "system", content: this.system }, ...this.history] }),
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw new Error("aborted");
      throw new Error(`can't reach Ollama at ${this.host} — is it running? (${e instanceof Error ? e.message : e})`);
    }
    if (!res.ok || !res.body) throw new Error(`Ollama error ${res.status}: ${await res.text().catch(() => "")}`);

    // The response is newline-delimited JSON, one chunk per line.
    let answer = "";
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const chunk = JSON.parse(line) as { message?: { content?: string }; error?: string };
        if (chunk.error) throw new Error(`Ollama: ${chunk.error}`);
        const delta = chunk.message?.content ?? "";
        if (delta) {
          answer += delta;
          h.onText(delta);
        }
      }
    }
    this.history.push({ role: "assistant", content: answer });
  }
}

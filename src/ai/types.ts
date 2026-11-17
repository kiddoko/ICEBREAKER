/**
 * Provider-neutral AI interfaces. Apps and plugins only see these, so the
 * same code works with Claude (cloud) or a local open-source model (Ollama).
 */

/** A tool the model may call (e.g. read a note). */
export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema of the input object. */
  inputSchema: Record<string, unknown>;
  run(input: Record<string, unknown>): Promise<string>;
}

export interface ChatHandlers {
  onText(delta: string): void;
  /** Summarized reasoning, when the model shares it. */
  onThinking?(delta: string): void;
  onToolCall?(name: string, input: Record<string, unknown>): void;
  onToolResult?(name: string, output: string, isError: boolean): void;
}

export interface ChatSession {
  /** Send a user message and stream the answer (including any tool calls). */
  send(text: string, handlers: ChatHandlers, signal?: AbortSignal): Promise<void>;
  /** Forget the conversation. */
  reset(): void;
}

export interface SessionOptions {
  system: string;
  tools?: ToolSpec[];
}

export interface Provider {
  readonly id: "claude-code" | "anthropic" | "ollama";
  /** Short label for status bars: "claude-opus-5-5". */
  readonly label: string;
  /** Can it be used right now (key present, host set)? Returns a reason if not. */
  readiness(): { ok: true } | { ok: false; reason: string };
  createSession(opts: SessionOptions): ChatSession;
}

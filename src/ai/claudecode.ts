import type { Platform } from "../platform/types";
import type { ChatHandlers, ChatSession, Provider, SessionOptions } from "./types";

type CC = NonNullable<Platform["claudeCode"]>;

/**
 * Claude through the user's own Claude Code CLI (`claude -p`), so chats count
 * against their Claude plan (Pro/Max 5-hour limits) instead of API tokens.
 *
 *   1. install Claude Code and run `claude` once to log in
 *   2. config set ai.provider claude-code
 *
 * The CLI runs in the vault folder with read-only tools (Read, Glob, Grep):
 * the model can read notes but never writes them. ICEBREAKER's own JS tools
 * (`ToolSpec`) aren't passed through — the CLI's tools replace them.
 */
export class ClaudeCodeProvider implements Provider {
  readonly id = "claude-code" as const;

  constructor(
    private readonly cc: CC | undefined,
    /** Path of the CLI, found at startup (null = not installed). */
    private readonly exe: string | null,
    private readonly model: string,
  ) {}

  get label(): string {
    return `claude code${this.model ? ` · ${this.model}` : ""}`;
  }

  readiness(): { ok: true } | { ok: false; reason: string } {
    if (!this.cc) return { ok: false, reason: "Claude Code only works in the desktop app" };
    if (!this.exe) return { ok: false, reason: "Claude Code CLI not found — install it, run `claude` once to log in, then reboot the deck" };
    return { ok: true };
  }

  createSession(opts: SessionOptions): ChatSession {
    if (!this.cc) throw new Error("Claude Code unavailable");
    return new ClaudeCodeSession(this.cc, this.model, opts.system);
  }
}

interface Block {
  type: string;
  id?: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

class ClaudeCodeSession implements ChatSession {
  /** The CLI's session id: passed back with --resume so the conversation continues. */
  private sessionId: string | null = null;

  constructor(
    private readonly cc: CC,
    private readonly model: string,
    private readonly system: string,
  ) {}

  reset(): void {
    this.sessionId = null;
  }

  async send(text: string, h: ChatHandlers, signal?: AbortSignal): Promise<void> {
    const id = crypto.randomUUID();
    const onAbort = () => void this.cc.cancel(id);
    signal?.addEventListener("abort", onAbort);
    const toolNames = new Map<string, string>();
    let streamed = false; // got text through partial-message deltas
    let failure: string | null = null;
    let gotResult = false;

    const onLine = (line: string) => {
      let m: Record<string, any>;
      try {
        m = JSON.parse(line);
      } catch {
        return;
      }
      if (typeof m.session_id === "string") this.sessionId = m.session_id;
      switch (m.type) {
        case "stream_event": {
          const ev = m.event;
          if (ev?.type === "content_block_delta") {
            if (ev.delta?.type === "text_delta") {
              streamed = true;
              h.onText(ev.delta.text);
            } else if (ev.delta?.type === "thinking_delta") h.onThinking?.(ev.delta.thinking);
          }
          break;
        }
        case "assistant":
          for (const b of (m.message?.content ?? []) as Block[]) {
            if (b.type === "tool_use") {
              toolNames.set(b.id ?? "", b.name ?? "tool");
              h.onToolCall?.(b.name ?? "tool", b.input ?? {});
            } else if (b.type === "text" && !streamed && b.text) h.onText(b.text);
          }
          streamed = false; // next assistant message streams afresh
          break;
        case "user":
          for (const b of (m.message?.content ?? []) as Block[]) {
            if (b.type !== "tool_result") continue;
            const out = typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? "");
            h.onToolResult?.(toolNames.get(b.tool_use_id ?? "") ?? "tool", out, !!b.is_error);
          }
          break;
        case "result":
          gotResult = true;
          if (m.is_error) failure = String(m.result ?? m.subtype ?? "Claude Code error");
          break;
      }
    };

    try {
      const r = await this.cc.run({ id, prompt: text, system: this.system, resume: this.sessionId, model: this.model }, onLine);
      if (signal?.aborted) return;
      if (failure) throw new Error(failure);
      if (r.code !== 0 && !gotResult) throw new Error(r.stderr.trim().split("\n").slice(-3).join(" ") || `claude exited with code ${r.code}`);
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

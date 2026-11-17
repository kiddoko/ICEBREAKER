import Anthropic from "@anthropic-ai/sdk";
import type { ChatHandlers, ChatSession, Provider, SessionOptions, ToolSpec } from "./types";

/**
 * Claude, through the official Anthropic SDK.
 *
 * The SDK runs inside the app's webview. `dangerouslyAllowBrowser` is the
 * SDK's guard against shipping *your* key in a public website; here the key is
 * the user's own, stored on their machine, and only ever sent to
 * api.anthropic.com (the app's CSP blocks every other host).
 */

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const MAX_TOOL_ROUNDS = 16;

export class AnthropicProvider implements Provider {
  readonly id = "anthropic" as const;
  private client: Anthropic | null;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly effort: Effort,
  ) {
    this.client = apiKey ? new Anthropic({ apiKey, dangerouslyAllowBrowser: true }) : null;
  }

  get label(): string {
    return this.model;
  }

  readiness(): { ok: true } | { ok: false; reason: string } {
    if (!this.apiKey) return { ok: false, reason: "no API key — run `config key` or set ANTHROPIC_API_KEY" };
    return { ok: true };
  }

  createSession(opts: SessionOptions): ChatSession {
    if (!this.client) throw new Error(this.apiKey ? "client unavailable" : "no Anthropic API key configured (`config key`)");
    return new AnthropicSession(this.client, this.model, this.effort, opts);
  }
}

class AnthropicSession implements ChatSession {
  /**
   * The conversation exactly as the API returned it (thinking + tool blocks
   * included). We only ever append to it — never rewrite earlier turns.
   */
  private history: Anthropic.Beta.BetaMessageParam[] = [];

  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
    private readonly effort: Effort,
    private readonly opts: SessionOptions,
  ) {}

  reset(): void {
    this.history = [];
  }

  async send(text: string, h: ChatHandlers, signal?: AbortSignal): Promise<void> {
    this.history.push({ role: "user", content: text });
    const tools = this.opts.tools ?? [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const stream = this.client.beta.messages.stream(
        {
          model: this.model,
          max_tokens: 64000,
          // If a safety classifier declines, the API retries on a fallback model by itself.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive", display: "summarized" },
          output_config: { effort: this.effort },
          cache_control: { type: "ephemeral" },
          system: this.opts.system,
          tools: tools.map(toApiTool),
          messages: this.history,
        },
        { signal },
      );

      try {
        for await (const event of stream) {
          if (event.type !== "content_block_delta") continue;
          if (event.delta.type === "text_delta") h.onText(event.delta.text);
          else if (event.delta.type === "thinking_delta") h.onThinking?.(event.delta.thinking);
        }
      } catch (err) {
        throw new Error(describeError(err));
      }

      const msg = await stream.finalMessage();
      this.history.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });

      if (msg.stop_reason === "refusal") {
        h.onText("\n\n[the model declined to answer this request]");
        return;
      }
      const toolUses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (msg.stop_reason === "max_tokens" && toolUses.length) {
        throw new Error("the answer was cut off in the middle of a tool call (max_tokens)");
      }
      if (msg.stop_reason !== "tool_use" || toolUses.length === 0) return;

      // Run every requested tool, then send all results back in ONE user message.
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const tool = tools.find((t) => t.name === use.name);
        const input = (use.input ?? {}) as Record<string, unknown>;
        h.onToolCall?.(use.name, input);
        let output: string;
        let isError = false;
        try {
          if (!tool) throw new Error(`unknown tool ${use.name}`);
          validateInput(tool, input);
          output = await tool.run(input);
        } catch (e) {
          output = e instanceof Error ? e.message : String(e);
          isError = true;
        }
        h.onToolResult?.(use.name, output, isError);
        results.push({ type: "tool_result", tool_use_id: use.id, content: output, is_error: isError });
      }
      this.history.push({ role: "user", content: results });
    }
    h.onText("\n\n[stopped: too many tool calls in a row]");
  }
}

function toApiTool(t: ToolSpec): Anthropic.Beta.BetaTool {
  return {
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
    // Stream tool input as it is generated; we validate it ourselves (validateInput).
    eager_input_streaming: true,
  };
}

/** With eager input streaming the API doesn't validate tool input — we check required fields and types. */
function validateInput(tool: ToolSpec, input: Record<string, unknown>): void {
  const schema = tool.inputSchema as { required?: string[]; properties?: Record<string, { type?: string; enum?: unknown[] }> };
  for (const key of schema.required ?? []) {
    if (input[key] === undefined) throw new Error(`invalid input: missing "${key}"`);
  }
  for (const [key, spec] of Object.entries(schema.properties ?? {})) {
    const v = input[key];
    if (v === undefined) continue;
    if (spec.type === "string" && typeof v !== "string") throw new Error(`invalid input: "${key}" must be a string`);
    if (spec.type === "integer" && !Number.isInteger(v)) throw new Error(`invalid input: "${key}" must be an integer`);
    if (spec.enum && !spec.enum.includes(v)) throw new Error(`invalid input: "${key}" must be one of ${spec.enum.join(", ")}`);
  }
}

/** Friendly messages for the errors people actually hit. */
export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "invalid API key (401) — set a new one with `config key`";
  if (err instanceof Anthropic.PermissionDeniedError) return "this API key can't use this model (403)";
  if (err instanceof Anthropic.NotFoundError) return "model not found (404) — check `config get ai.model`";
  if (err instanceof Anthropic.RateLimitError) return "rate limited (429) — wait a moment and retry";
  if (err instanceof Anthropic.BadRequestError) return `bad request (400): ${err.message}`;
  if (err instanceof Anthropic.APIUserAbortError) return "aborted";
  if (err instanceof Anthropic.APIConnectionError) return "can't reach api.anthropic.com — are you offline?";
  if (err instanceof Anthropic.APIError) return `API error ${err.status ?? ""}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

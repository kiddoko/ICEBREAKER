import { isLocalUrl, stealth } from "../core/stealth";
import type { SettingsStore } from "../core/settings";
import { AnthropicProvider } from "./anthropic";
import { ClaudeCodeProvider } from "./claudecode";
import type { Platform } from "../platform/types";
import { OllamaProvider } from "./ollama";
import type { ChatHandlers, ChatSession, Provider, SessionOptions } from "./types";

export type { ChatHandlers, ChatSession, Provider, SessionOptions, ToolSpec } from "./types";

/**
 * Picks the AI provider from settings (`ai.provider`) and hands out sessions.
 * Rebuilt lazily whenever the relevant settings change.
 */
export class AIManager {
  private cached: Provider | null = null;
  envKey: string | null = null;
  /** Set at startup by the Deck: the platform's Claude Code bridge and where the CLI lives. */
  claudeCode: Platform["claudeCode"];
  claudeCodePath: string | null = null;
  /** Called when the AI changed files in the vault (the deck rescans). */
  onVaultWrite?: () => void;
  /** how many answers are being written right now (the uplink widget animates) */
  busy = 0;

  constructor(private readonly settings: SettingsStore) {
    settings.onChange((path) => {
      if (path.startsWith("ai.")) this.cached = null;
    });
  }

  /** Call after changing the API key. */
  refresh(): void {
    this.cached = null;
  }

  get provider(): Provider {
    if (!this.cached) {
      const ai = this.settings.data.ai;
      this.cached =
        ai.provider === "ollama"
          ? new OllamaProvider(ai.ollamaHost, ai.ollamaModel)
          : ai.provider === "claude-code"
            ? new ClaudeCodeProvider(this.claudeCode, this.claudeCodePath, ai.claudeCodeModel, ai.allowWrites, () => this.onVaultWrite?.())
            : new AnthropicProvider(this.settings.secrets.anthropicApiKey || this.envKey || "", ai.model, ai.effort);
    }
    return this.cached;
  }

  get ready(): boolean {
    return this.readiness().ok;
  }

  /** Human-readable reason when not ready. */
  get problem(): string | null {
    const r = this.readiness();
    return r.ok ? null : r.reason;
  }

  /** Stealth mode: only a local model (Ollama on this machine or the local network). */
  private readiness(): { ok: true } | { ok: false; reason: string } {
    if (stealth.on && this.provider.id !== "ollama")
      return { ok: false, reason: "stealth mode: cloud AI is off — use a local model (config set ai.provider ollama)" };
    if (stealth.on && !isLocalUrl(this.settings.data.ai.ollamaHost))
      return { ok: false, reason: "stealth mode: the Ollama host must be on this machine or your local network" };
    return this.provider.readiness();
  }

  session(opts: SessionOptions): ChatSession {
    const r = this.readiness();
    if (!r.ok) throw new Error(r.reason);
    return this.provider.createSession(opts);
  }

  /** One-shot question → full answer (streams through onText if given). */
  async ask(prompt: string, opts: { system?: string; onText?: (d: string) => void; signal?: AbortSignal } = {}): Promise<string> {
    const s = this.session({ system: opts.system ?? "You are a concise assistant inside a terminal. Answer directly; plain text or light Markdown." });
    let out = "";
    const handlers: ChatHandlers = {
      onText: (d) => {
        out += d;
        opts.onText?.(d);
      },
    };
    await s.send(prompt, handlers, opts.signal);
    return out;
  }
}

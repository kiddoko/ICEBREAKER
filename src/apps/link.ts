import type { ChatSession } from "../ai/types";
import { linkSystemPrompt } from "../ai/prompts";
import { vaultTools } from "../ai/tools";
import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { ChatView, type ChatEntry } from "../ui/chatview";
import type { UI } from "../ui/ui";
import { isoDate } from "../vault/paths";
import type { App, AppSpec } from "./types";

/**
 * LINK — chat with the AI. With Claude it can list, search, read and (with
 * your approval) write notes. Conversations are saved as Markdown in
 * chats/ (setting ai.saveChats) so they're part of your vault too.
 *
 * Slash commands: /clear  /save  /help
 */
export class LinkApp implements App {
  readonly kind = "link";
  readonly key = "link";
  private chat = new ChatView("ask anything — your vault is in reach. /help for commands");
  private session: ChatSession | null = null;
  private abort: AbortController | null = null;
  private startedAt = new Date();
  private transcript: string[] = [];

  constructor(
    private readonly deck: Deck,
    initialPrompt?: string,
  ) {
    this.chat.onSubmit = (text) => void this.handle(text);
    this.chat.onCancel = () => this.abort?.abort();
    this.chat.assistantName = deck.ai.provider.label;
    this.greet();
    if (initialPrompt) void this.handle(initialPrompt);
  }

  title(): string {
    return "link";
  }

  status(): string {
    const p = this.deck.ai.provider;
    return this.deck.ai.ready ? `linked · ${p.label}` : `offline · ${this.deck.ai.problem}`;
  }

  private greet(): void {
    const problem = this.deck.ai.problem;
    if (problem) {
      this.chat.push("error", `No neural link: ${problem}.`);
      this.chat.push("info", this.deck.settings.data.ai.provider === "anthropic"
        ? "Get a key at console.anthropic.com, then run `config key` in the shell (or Ctrl+K → “Set API key”).\nPrefer local & offline? Install Ollama and run `config set ai.provider ollama`."
        : "Start Ollama (ollama serve) and pull a model (ollama pull llama3.1).");
    } else {
      this.chat.push("info", `Link established with ${this.deck.ai.provider.label}. Ask about your notes: “what did I write about last week?”`);
    }
  }

  private ensureSession(): ChatSession {
    if (!this.session) {
      const ai = this.deck.ai;
      const toolsEnabled = ai.provider.id === "anthropic";
      this.session = ai.session({
        system: linkSystemPrompt({
          providerId: ai.provider.id,
          handle: this.deck.settings.data.user.handle,
          journalFolder: this.deck.vault.journalFolder,
          today: `${isoDate(new Date())} (${new Date().toLocaleDateString("en", { weekday: "long" })})`,
          toolsEnabled,
          writes: this.deck.settings.data.ai.allowWrites,
        }),
        tools: toolsEnabled ? vaultTools(this.deck.vault, (t, d) => this.deck.confirm(t, d)) : [],
      });
    }
    return this.session;
  }

  private async handle(text: string): Promise<void> {
    if (text.startsWith("/")) return this.slash(text);
    this.deck.voice.stop(); // a new question interrupts the reading
    this.chat.push("user", text);
    this.transcript.push(`## ❯ ${this.deck.settings.data.user.handle}\n\n${text}\n`);

    let session: ChatSession;
    try {
      session = this.ensureSession();
    } catch (e) {
      this.chat.push("error", e instanceof Error ? e.message : String(e));
      return;
    }

    this.chat.busy = true;
    this.chat.busyLabel = "jacked in";
    this.abort = new AbortController();
    let answer: ChatEntry | null = null;
    let thinking: ChatEntry | null = null;
    const redraw = () => this.deck.requestFrame();

    try {
      await session.send(
        text,
        {
          onText: (d) => {
            answer ??= this.chat.push("assistant", "");
            this.chat.append(answer, d);
            redraw();
          },
          onThinking: (d) => {
            thinking ??= this.chat.push("thinking", "");
            this.chat.append(thinking, d);
            this.chat.busyLabel = "thinking";
            redraw();
          },
          onToolCall: (name, input) => {
            const arg = String(input.path ?? input.query ?? input.folder ?? "");
            this.chat.push("tool", `${name}${arg ? ` ${arg}` : ""}`);
            this.chat.busyLabel = name.replace("_", " ");
            // text after a tool call starts a new block
            answer = null;
            thinking = null;
            redraw();
          },
          onToolResult: (_name, output, isError) => {
            if (isError) this.chat.push("error", output);
            redraw();
          },
        },
        this.abort.signal,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.chat.push(msg === "aborted" ? "info" : "error", msg === "aborted" ? "— aborted —" : msg);
    } finally {
      this.chat.busy = false;
      this.abort = null;
      const final = this.chat.entries.filter((e) => e.role === "assistant").pop();
      if (final) this.transcript.push(`## ◆ ${this.deck.ai.provider.label}\n\n${final.text}\n`);
      const v = this.deck.settings.data.voice;
      if (final && answer && v.enabled && v.readAI) this.deck.voice.say(final.text);
      void this.persist();
      redraw();
    }
  }

  private slash(cmd: string): void {
    const [name] = cmd.slice(1).split(/\s+/);
    switch (name) {
      case "clear":
        this.session?.reset();
        this.session = null;
        this.chat.clear();
        this.transcript = [];
        this.startedAt = new Date();
        this.chat.push("info", "context cleared — new conversation");
        break;
      case "save":
        void this.persist(true);
        break;
      default:
        this.chat.push("info", "/clear  new conversation\n/save   save the transcript to chats/ now\nesc     abort the current answer\npgup/pgdn  scroll");
    }
  }

  /** Save the conversation as a Markdown note (chats/YYYY-MM-DD-HHMM.md). */
  private async persist(force = false): Promise<void> {
    if (!this.transcript.length || (!force && !this.deck.settings.data.ai.saveChats)) return;
    const d = this.startedAt;
    const stamp = `${isoDate(d)}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
    const path = `chats/${stamp}.md`;
    const body = `---\ndate: ${isoDate(d)}\nmodel: ${this.deck.ai.provider.label}\ntags: [chat]\n---\n# Link session ${stamp}\n\n${this.transcript.join("\n")}`;
    try {
      await this.deck.vault.write(path, body);
      if (force) this.deck.notify(`saved ${path}`, "success");
    } catch (e) {
      console.error("chat save failed", e);
    }
  }

  onKey(k: KeyInput): boolean {
    if (k.combo === "ctrl+l") {
      this.slash("/clear");
      return true;
    }
    return this.chat.onKey(k);
  }

  onText(t: string): boolean {
    return this.chat.onText(t);
  }

  onAction(a: Action): boolean {
    return this.chat.onAction(a);
  }

  close(): boolean {
    this.abort?.abort();
    return true;
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const ready = this.deck.ai.ready;
    const head = `${ready ? "●" : "○"} ${ready ? "LINKED" : "OFFLINE"} · ${this.deck.ai.provider.label}`;
    ui.text(r.x + 1, r.y, head, { fg: ready ? ui.c.success : ui.c.error, attrs: BOLD });
    if (this.chat.busy) ui.gradientText(r.x + r.w - 14, r.y, "▰▰▰▰▰▰▰▰▰▰▰▰", ui.theme.gradient, 0, (ui.now / 1200) % 1);
    this.chat.render(ui, { x: r.x, y: r.y + 2, w: r.w, h: r.h - 2 }, focused);
  }
}

export const linkSpec: AppSpec = {
  kind: "link",
  title: "Link (AI)",
  description: "chat with Claude about your vault",
  icon: "◆",
  launcher: true,
  create: (deck, args) => new LinkApp(deck, (args as { prompt?: string } | undefined)?.prompt),
};

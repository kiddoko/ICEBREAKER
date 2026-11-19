import type { ChatSession } from "../ai/types";
import { linkSystemPrompt } from "../ai/prompts";
import { vaultTools } from "../ai/tools";
import { BOLD, type Rect } from "../core/grid";
import type { Action, KeyInput } from "../core/input";
import type { Deck } from "../deck";
import { ChatView, type ChatEntry } from "../ui/chatview";
import type { UI } from "../ui/ui";
import { strWidth } from "../core/unicode";
import { t } from "../core/i18n";
import { isoDate } from "../vault/paths";
import type { App, AppSpec } from "./types";

/**
 * LINK — chat with the AI. With Claude it can list, search, read and (with
 * your approval) write notes. Conversations are saved as Markdown in
 * chats/ (setting ai.saveChats) so they're part of your vault too.
 *
 * Slash commands: /clear  /save  /help
 */
/** One conversation: its own chat on screen, AI session and transcript (a tab of UPLINK). */
class Conversation {
  readonly chat = new ChatView("ask anything — your vault is in reach. /help for commands");
  session: ChatSession | null = null;
  abort: AbortController | null = null;
  startedAt = new Date();
  transcript: string[] = [];
  /** the first question, short: the tab's name */
  name = "";
}

export class LinkApp implements App {
  readonly kind = "link";
  readonly key = "link";
  /** the conversation tabs (ctrl+T a new one, ctrl+[ ctrl+] to move, ctrl+shift+W or /close) */
  private convs: Conversation[] = [];
  private cur = 0;

  constructor(
    private readonly deck: Deck,
    initialPrompt?: string,
  ) {
    this.open();
    if (initialPrompt) void this.handle(initialPrompt);
  }

  private get c(): Conversation {
    return this.convs[this.cur];
  }

  /** A new conversation tab, in front. */
  private open(): Conversation {
    const c = new Conversation();
    c.chat.onSubmit = (text) => void this.handle(text, c);
    c.chat.onCancel = () => c.abort?.abort();
    c.chat.assistantName = this.deck.ai.provider.label;
    this.convs.push(c);
    this.cur = this.convs.length - 1;
    this.greet(c);
    this.deck.requestFrame();
    return c;
  }

  /** Close a conversation tab (it was saved in chats/ as it went). The last one only starts over. */
  private closeConv(i = this.cur): void {
    const c = this.convs[i];
    if (!c) return;
    c.abort?.abort();
    void this.persist(c);
    if (this.convs.length === 1) return this.slash("/clear", c);
    this.convs.splice(i, 1);
    this.cur = Math.max(0, Math.min(this.cur > i ? this.cur - 1 : this.cur, this.convs.length - 1));
    this.deck.requestFrame();
  }

  private select(i: number): void {
    this.cur = (i + this.convs.length) % this.convs.length;
    this.deck.sound.play("move");
    this.deck.requestFrame();
  }

  title(): string {
    return "link";
  }

  status(): string {
    const p = this.deck.ai.provider;
    const tabs = this.convs.length > 1 ? ` · ${this.cur + 1}/${this.convs.length}` : "";
    return (this.deck.ai.ready ? `linked · ${p.label}` : `offline · ${this.deck.ai.problem}`) + tabs + " · ctrl+T new conversation";
  }

  private greet(c: Conversation): void {
    const problem = this.deck.ai.problem;
    if (problem) {
      c.chat.push("error", `Uplink down: ${problem}.`);
      c.chat.push("info", this.deck.settings.data.ai.provider === "anthropic"
        ? "Get a key at console.anthropic.com, then run `config key` in the shell (or Ctrl+K → “Set API key”).\nPrefer local & offline? Install Ollama and run `config set ai.provider ollama`."
        : "Start Ollama (ollama serve) and pull a model (ollama pull llama3.1).");
    } else {
      c.chat.push("info", `Link established with ${this.deck.ai.provider.label}. Ask about your notes: “what did I write about last week?”`);
    }
  }

  private ensureSession(c: Conversation): ChatSession {
    if (!c.session) {
      const ai = this.deck.ai;
      const toolsEnabled = ai.provider.id === "anthropic";
      c.session = ai.session({
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
    return c.session;
  }

  private async handle(text: string, c: Conversation = this.c): Promise<void> {
    if (text.startsWith("/")) return this.slash(text, c);
    this.deck.voice.stop(); // a new question interrupts the reading
    c.chat.push("user", text);
    if (!c.name) c.name = text.replace(/\s+/g, " ").trim().slice(0, 24);
    c.transcript.push(`## ❯ ${this.deck.settings.data.user.handle}\n\n${text}\n`);

    let session: ChatSession;
    try {
      session = this.ensureSession(c);
    } catch (e) {
      c.chat.push("error", e instanceof Error ? e.message : String(e));
      return;
    }

    const chat = c.chat;
    chat.busy = true;
    this.deck.ai.busy++;
    chat.busyLabel = "jacked in";
    c.abort = new AbortController();
    let answer: ChatEntry | null = null;
    let thinking: ChatEntry | null = null;
    const redraw = () => this.deck.requestFrame();

    try {
      await session.send(
        text,
        {
          onText: (d) => {
            answer ??= chat.push("assistant", "");
            chat.append(answer, d);
            redraw();
          },
          onThinking: (d) => {
            thinking ??= chat.push("thinking", "");
            chat.append(thinking, d);
            chat.busyLabel = "thinking";
            redraw();
          },
          onToolCall: (name, input) => {
            const arg = String(input.path ?? input.query ?? input.folder ?? "");
            chat.push("tool", `${name}${arg ? ` ${arg}` : ""}`);
            chat.busyLabel = name.replace("_", " ");
            // text after a tool call starts a new block
            answer = null;
            thinking = null;
            redraw();
          },
          onToolResult: (_name, output, isError) => {
            if (isError) chat.push("error", output);
            redraw();
          },
        },
        c.abort.signal,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      chat.push(msg === "aborted" ? "info" : "error", msg === "aborted" ? "— aborted —" : msg);
    } finally {
      chat.busy = false;
      this.deck.ai.busy = Math.max(0, this.deck.ai.busy - 1);
      c.abort = null;
      const final = chat.entries.filter((e) => e.role === "assistant").pop();
      if (final) c.transcript.push(`## ◆ ${this.deck.ai.provider.label}\n\n${final.text}\n`);
      const v = this.deck.settings.data.voice;
      // read aloud only the conversation in front
      if (final && answer && v.enabled && v.readAI && c === this.c) void this.deck.voice.speak(final.text);
      void this.persist(c);
      redraw();
    }
  }

  private slash(cmd: string, c: Conversation = this.c): void {
    const [name] = cmd.slice(1).split(/\s+/);
    switch (name) {
      case "clear":
        c.session?.reset();
        c.session = null;
        c.chat.clear();
        c.transcript = [];
        c.name = "";
        c.startedAt = new Date();
        c.chat.push("info", "context cleared — new conversation");
        break;
      case "new":
        this.open();
        break;
      case "close":
        this.closeConv(this.convs.indexOf(c));
        break;
      case "save":
        void this.persist(c, true);
        break;
      default:
        c.chat.push("info", "/new    a new conversation, in a tab (ctrl+T)\n/close  close this one (ctrl+shift+W)\n/clear  start this one over (ctrl+L)\n/save   save the transcript to chats/ now\nctrl+[ ctrl+]  the conversation before / after · click a tab\nesc     abort the current answer\npgup/pgdn  scroll");
    }
  }

  /** Save the conversation as a Markdown note (chats/YYYY-MM-DD-HHMM.md). */
  private async persist(c: Conversation, force = false): Promise<void> {
    if (!c.transcript.length || (!force && !this.deck.settings.data.ai.saveChats)) return;
    const d = c.startedAt;
    const stamp = `${isoDate(d)}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
    const path = `chats/${stamp}.md`;
    const body = `---\ndate: ${isoDate(d)}\nmodel: ${this.deck.ai.provider.label}\ntags: [chat]\n---\n# ${c.name || `Link session ${stamp}`}\n\n${c.transcript.join("\n")}`;
    try {
      await this.deck.vault.write(path, body);
      if (force) this.deck.notify(`saved ${path}`, "success");
    } catch (e) {
      console.error("chat save failed", e);
    }
  }

  onKey(k: KeyInput): boolean {
    if (k.combo === "ctrl+l") return this.slash("/clear"), true;
    if (k.combo === "ctrl+t") return this.open(), true;
    if (k.combo === "ctrl+shift+w") return this.closeConv(), true;
    if (k.combo === "ctrl+[" || k.combo === "ctrl+]") {
      if (this.convs.length > 1) this.select(this.cur + (k.combo === "ctrl+]" ? 1 : -1));
      return true;
    }
    return this.c.chat.onKey(k);
  }

  onText(t: string): boolean {
    return this.c.chat.onText(t);
  }

  onAction(a: Action): boolean {
    return this.c.chat.onAction(a);
  }

  close(): boolean {
    for (const c of this.convs) c.abort?.abort();
    return true;
  }

  render(ui: UI, r: Rect, focused: boolean): void {
    const ready = this.deck.ai.ready;
    const head = `${ready ? "●" : "○"} ${ready ? "LINKED" : "OFFLINE"} · ${this.deck.ai.provider.label}`;
    ui.text(r.x + 1, r.y, head, { fg: ready ? ui.c.success : ui.c.error, attrs: BOLD });
    if (this.c.chat.busy) ui.gradientText(r.x + r.w - 14, r.y, "▰▰▰▰▰▰▰▰▰▰▰▰", ui.theme.gradient, 0, (ui.now / 1200) % 1);
    this.renderTabs(ui, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: 1 });
    this.c.chat.render(ui, { x: r.x, y: r.y + 2, w: r.w, h: r.h - 2 }, focused);
  }

  /** The conversation tabs: one per conversation, ● while it answers, + for a new one. */
  private renderTabs(ui: UI, r: Rect): void {
    const c = ui.c;
    let x = r.x;
    const right = r.x + r.w - 4;
    // too many to show: start so the one in front is in view
    let first = 0;
    const widthOf = (i: number) => strWidth(this.tabLabel(i)) + 1;
    let used = 0;
    for (let i = this.cur; i >= 0; i--) {
      used += widthOf(i);
      if (used > right - r.x) break;
      first = i;
    }
    if (first > 0) ui.text(x++, r.y, "‹", { fg: c.muted });
    for (let i = first; i < this.convs.length; i++) {
      const label = this.tabLabel(i);
      const w = strWidth(label);
      if (x + w > right) {
        ui.text(right - 1, r.y, "›", { fg: c.muted });
        break;
      }
      const on = i === this.cur;
      ui.text(x, r.y, label, { fg: on ? c.panel : c.muted, bg: on ? c.accent : c.panelAlt, attrs: on ? BOLD : 0 });
      const n = i;
      ui.hit({ x, y: r.y, w, h: 1 }, {
        onClick: () => this.select(n),
        menu: () => [
          { label: t("New conversation"), hint: "ctrl+T", run: () => void this.open() },
          { label: t("Close conversation"), hint: "ctrl+shift+W", run: () => this.closeConv(n) },
        ],
        tip: t("click: this conversation · right-click: close it"),
      });
      x += w + 1;
    }
    ui.button(r.x + r.w - 3, r.y, " + ", () => void this.open(), { tip: t("new conversation (ctrl+T)") });
  }

  private tabLabel(i: number): string {
    const conv = this.convs[i];
    const name = conv.name || t("new");
    return ` ${conv.chat.busy ? "● " : ""}${i + 1} ${name} `;
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

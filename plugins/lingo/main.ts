/**
 * LINGO — an AI language tutor, written as a plugin.
 *
 * It only uses the public plugin API (`ib`), exactly like a plugin you'd
 * drop into .icebreaker/plugins — so it doubles as a real-world example.
 *
 *   lingo                 open the tutor
 *   lingo vocab japanese  print your saved vocabulary
 *
 * New words the tutor introduces are appended to lingo/<language>.md.
 */
import type { ChatEntry, ChatView as ChatViewT } from "../../src/ui/chatview";
import type { ChatSession } from "../../src/ai/types";
import type { App } from "../../src/apps/types";
import type { Action, KeyInput } from "../../src/core/input";
import type { Rect } from "../../src/core/grid";
import type { IcebreakerAPI } from "../../src/plugins/api";
import type { ListView as ListViewT } from "../../src/ui/list";
import type { UI } from "../../src/ui/ui";

const LANGUAGES = ["Japanese", "Spanish", "English", "German", "Italian", "Korean", "Portuguese", "Mandarin Chinese", "French", "Russian", "Arabic"];
const NATIVE = ["French", "English", "Spanish", "German", "Portuguese", "Italian"];
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const MODES: Record<string, string> = {
  conversation: "free conversation about everyday life",
  drill: "vocabulary quiz, one item at a time",
  story: "co-write a short story, one or two sentences each",
  grammar: "one grammar point, then three exercises",
  roleplay: "role-play a situation (ordering food, asking directions…)",
};

interface Choice {
  language: string;
  native: string;
  level: string;
  mode: string;
}

type Field = keyof Choice;

function tutorPrompt(c: Choice): string {
  return `You are LINGO, a warm but demanding language tutor living inside ICEBREAKER, a terminal-styled notes app.
Learner: native ${c.native} speaker learning ${c.language}, level ${c.level} (CEFR). Session mode: ${c.mode} — ${MODES[c.mode]}.

Rules:
- Keep replies short (under 120 words), mostly in ${c.language} at the learner's level, with brief ${c.native} help only when needed.
- If the learner made mistakes, begin with a line starting with "✎" giving the corrected sentence, then one short explanation in ${c.native}.
- For non-Latin scripts, add a romanization in parentheses for new or hard words.
- Always end with a question or a small task so the session keeps moving.
- When you introduce a useful new word or expression, add at the very end a line exactly like:
  VOCAB: <${c.language} word> | <${c.native} translation> | <short example in ${c.language}>
  At most 3 VOCAB lines per reply. Never put anything after the VOCAB lines.`;
}

export function activate(ib: IcebreakerAPI): void {
  const { ChatView, ListView, BOLD, fmt, bigText, strWidth } = ib.lib;

  class LingoApp implements App {
    readonly kind = "lingo";
    readonly key = "lingo";
    private stage: "setup" | "session" = "setup";
    private choice: Choice = { language: "Japanese", native: guessNative(), level: "A1", mode: "conversation" };
    private menu: ListViewT<Field | "start"> = new ListView<Field | "start">();
    private chat: ChatViewT | null = null;
    private session: ChatSession | null = null;
    private abort: AbortController | null = null;
    private saved = 0;

    constructor() {
      this.menu.items = ["language", "native", "level", "mode", "start"];
      this.menu.onActivate = (item) => (item === "start" ? void this.start() : this.cycle(item, 1));
      void ib.storage.get<Choice | null>("last", null).then((c) => {
        if (c) this.choice = { ...this.choice, ...c };
        ib.ui.redraw();
      });
    }

    title(): string {
      return this.stage === "setup" ? "lingo" : `lingo:${this.choice.language.toLowerCase()}`;
    }

    status(): string {
      return this.stage === "setup" ? "↑↓ choose · ←→ change · enter start" : `${this.choice.language} ${this.choice.level} · ${this.choice.mode} · ${this.saved} words saved · /end to stop`;
    }

    private options(f: Field): string[] {
      return f === "language" ? LANGUAGES : f === "native" ? NATIVE : f === "level" ? LEVELS : Object.keys(MODES);
    }

    private cycle(f: Field, dir: number): void {
      const opts = this.options(f);
      const i = opts.indexOf(this.choice[f]);
      this.choice[f] = opts[(i + dir + opts.length) % opts.length];
    }

    private async start(): Promise<void> {
      const problem = ib.ai.problem();
      if (problem) {
        ib.ui.notify(problem, "error");
        return;
      }
      await ib.storage.set("last", this.choice);
      this.stage = "session";
      this.chat = new ChatView(`answer in ${this.choice.language} — /end to stop, /new to restart`);
      this.chat.onSubmit = (t) => void this.send(t);
      this.chat.onCancel = () => this.abort?.abort();
      this.session = ib.ai.session({ system: tutorPrompt(this.choice) });
      void this.send("Let's begin. Greet me and start the session.", true);
    }

    private async send(text: string, hidden = false): Promise<void> {
      if (!this.chat || !this.session) return;
      if (text === "/end") {
        this.stage = "setup";
        this.abort?.abort();
        ib.ui.notify(`session over · ${this.saved} words saved to ${vocabPath(this.choice.language)}`, "success");
        return;
      }
      if (text === "/new") {
        this.session.reset();
        this.chat.clear();
        return void this.send("Let's begin again with a new topic.", true);
      }
      if (!hidden) this.chat.push("user", text);
      this.chat.busy = true;
      this.chat.busyLabel = "tutor is typing";
      this.abort = new AbortController();
      let entry: ChatEntry | null = null;
      try {
        await this.session.send(
          text,
          {
            onText: (d) => {
              entry ??= this.chat!.push("assistant", "");
              this.chat!.append(entry, d);
              ib.ui.redraw();
            },
          },
          this.abort.signal,
        );
        if (entry) await this.harvest(entry);
      } catch (e) {
        this.chat.push("error", e instanceof Error ? e.message : String(e));
      } finally {
        this.chat.busy = false;
        ib.ui.redraw();
      }
    }

    /** Pull VOCAB lines out of the answer and append them to the vault. */
    private async harvest(entry: ChatEntry): Promise<void> {
      const words: string[][] = [];
      entry.text = entry.text
        .split("\n")
        .filter((line) => {
          const m = line.match(/^\s*VOCAB:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*$/);
          if (m) words.push([m[1], m[2], m[3]]);
          return !m;
        })
        .join("\n");
      this.chat?.touch();
      if (!words.length) return;
      const path = vocabPath(this.choice.language);
      if (!(await ib.vault.exists(path))) {
        await ib.vault.write(path, `# ${this.choice.language} vocabulary\n\n| word | meaning | example | added |\n|---|---|---|---|\n`);
      }
      const today = new Date().toISOString().slice(0, 10);
      const esc = (s: string) => s.replace(/\|/g, "\\|");
      await ib.vault.append(path, words.map((w) => `| ${esc(w[0])} | ${esc(w[1])} | ${esc(w[2])} | ${today} |`).join("\n") + "\n");
      this.saved += words.length;
      this.chat?.push("info", `+${words.length} → ${path}: ${words.map((w) => w[0]).join(", ")}`);
    }

    onKey(k: KeyInput): boolean {
      if (this.stage === "session") return this.chat?.onKey(k) ?? false;
      return false;
    }

    onText(t: string): boolean {
      return this.stage === "session" ? (this.chat?.onText(t) ?? false) : false;
    }

    onAction(a: Action): boolean {
      if (this.stage === "session") return this.chat?.onAction(a) ?? false;
      const cur = this.menu.current;
      if ((a === "left" || a === "right") && cur && cur !== "start") {
        this.cycle(cur, a === "left" ? -1 : 1);
        return true;
      }
      return this.menu.onAction(a);
    }

    close(): boolean {
      this.abort?.abort();
      return true;
    }

    render(ui: UI, r: Rect, focused: boolean): void {
      if (this.stage === "session" && this.chat) {
        ui.text(r.x + 1, r.y, `${this.choice.language.toUpperCase()} · ${this.choice.level} · ${this.choice.mode}`, { fg: ui.c.accent, attrs: BOLD });
        ui.textRight(r.x + r.w - 1, r.y, `${this.saved} new words`, { fg: ui.c.subtle });
        this.chat.render(ui, { x: r.x, y: r.y + 2, w: r.w, h: r.h - 2 }, focused);
        return;
      }
      const logo = bigText("LINGO");
      const lw = strWidth(logo[0]);
      logo.forEach((l, i) => ui.gradientText(r.x + Math.floor((r.w - lw) / 2), r.y + 1 + i, l));
      ui.textCenter(r, r.y + 8, "AI language tutor · new words go to your vault", { fg: ui.c.muted });
      const box = { x: r.x + Math.floor((r.w - 48) / 2), y: r.y + 10, w: 48, h: 5 };
      this.menu.render(ui, box, focused, (item, row, selected) => {
        if (item === "start") {
          ui.textCenter(row, row.y, selected ? "▶  START SESSION  ◀" : "start session", { fg: selected ? ui.c.accentAlt : ui.c.muted, attrs: BOLD });
          return;
        }
        ui.text(row.x + 2, row.y, item, { fg: ui.c.subtle });
        const v = this.choice[item];
        ui.textRight(row.x + row.w - 2, row.y, selected ? `◂ ${v} ▸` : v, { fg: selected ? ui.c.accent : ui.c.fg, attrs: selected ? BOLD : 0 });
        ui.hit({ x: row.x + row.w - 22, y: row.y, w: 20, h: 1 }, { onClick: () => this.cycle(item, 1) });
      });
      ui.textCenter(r, box.y + 6, MODES[this.choice.mode], { fg: ui.c.subtle });
    }
  }

  ib.apps.register({
    kind: "lingo",
    title: "Lingo",
    description: "AI language tutor",
    icon: "語",
    launcher: true,
    create: () => new LingoApp(),
  });

  ib.commands.register({
    name: "lingo",
    summary: "AI language tutor (lingo vocab <language> prints saved words)",
    usage: "lingo\nlingo vocab <language>",
    async run(ctx) {
      if (ctx.args[0] === "vocab") {
        const lang = ctx.args.slice(1).join(" ") || "japanese";
        const path = vocabPath(lang);
        if (!(await ib.vault.exists(path))) {
          ctx.err(`no vocabulary yet for ${lang} (${path})\n`);
          return 1;
        }
        const rows = (await ib.vault.read(path)).split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| word"));
        for (const r of rows) {
          const [w, m, , d] = r.split(/\s+\|\s+/).map((s) => s.replace(/^\|\s*|\s*\|$/g, ""));
          ctx.out(`${fmt.magenta(w)}  ${m}  ${fmt.gray(d ?? "")}\n`);
        }
        ctx.out(fmt.dim(`${rows.length} words · ${path}`) + "\n");
        return;
      }
      ib.apps.open("lingo");
    },
  });
}

function vocabPath(language: string): string {
  return `lingo/${language.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
}

function guessNative(): string {
  const lang = (navigator.language || "en").slice(0, 2);
  return { fr: "French", es: "Spanish", de: "German", pt: "Portuguese", it: "Italian" }[lang] ?? "English";
}

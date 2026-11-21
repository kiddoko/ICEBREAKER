/**
 * UPLINK chatbox — a small conversation that lives on HOME or the side panel. The widget
 * shows the last lines; typing while it's chosen, a click on its "type here" line, enter or a
 * double-click open it bigger with the field ready (the letter typed already in it). It's one
 * running conversation (ctrl+l starts a new one); LINK is the full chat app.
 */
import { BOLD } from "../core/grid";
import { t } from "../core/i18n";
import type { Deck } from "../deck";
import type { ChatSession } from "../ai/types";
import { wrapWords } from "../core/unicode";
import { q } from "../ui/ui";
import type { UI } from "../ui/ui";
import { Field } from "../ui/field";
import type { WidgetPopupSpec, WidgetSpec } from "./types";

interface Msg {
  who: "you" | "ai";
  text: string;
}
const chat = { msgs: [] as Msg[], session: null as ChatSession | null, busy: false, error: "" };
const field = new Field({ icon: "❯" });

/** The conversation as styled lines, newest last. */
function lines(ui: UI, w: number): { text: string; fg: number; bold?: boolean }[] {
  const c = ui.c;
  const out: { text: string; fg: number; bold?: boolean }[] = [];
  for (const m of chat.msgs) {
    const prefix = m.who === "you" ? "› " : "◆ ";
    wrapWords(m.text || (chat.busy ? `${ui.spinner()} ${t("processing…")}` : ""), w - 2).forEach((l, i) => out.push({ text: (i ? "  " : prefix) + l, fg: m.who === "you" ? c.accentAlt : c.fg, bold: m.who === "you" && !i }));
  }
  if (chat.error) out.push(...wrapWords(chat.error, w).map((text) => ({ text, fg: c.error })));
  return out;
}

export function sendChat(deck: Deck, text: string): void {
  if (chat.busy || !text.trim()) return;
  try {
    chat.session ??= deck.ai.session({ system: "You are the deck's AI, chatting in a small window on the user's dashboard. Short, direct answers; plain text." });
  } catch (e) {
    chat.error = e instanceof Error ? e.message : String(e);
    return;
  }
  chat.error = "";
  chat.msgs.push({ who: "you", text: text.trim() }, { who: "ai", text: "" });
  const reply = chat.msgs[chat.msgs.length - 1];
  chat.busy = true;
  deck.ai.busy++;
  void chat.session
    .send(text.trim(), { onText: (d) => ((reply.text += d), deck.requestFrame()) })
    .then(() => {
      const v = deck.settings.data.voice;
      if (v.enabled && v.readAI) void deck.voice.speak(reply.text);
    })
    .catch((e) => (chat.error = e instanceof Error ? e.message : String(e)))
    .finally(() => {
      chat.busy = false;
      deck.ai.busy = Math.max(0, deck.ai.busy - 1);
      chat.msgs = chat.msgs.slice(-40);
      deck.requestFrame();
    });
}

function resetChat(): void {
  chat.session?.reset();
  chat.session = null;
  chat.msgs = [];
  chat.error = "";
}

export const chatWidget: WidgetSpec = {
  id: "chat",
  title: "chat",
  description: "a conversation with your AI, right on HOME (UPLINK) — just type",
  size: { w: 4, h: 5 },
  min: { w: 3, h: 2 },
  open: "launch link",
  // typing while it's chosen opens the conversation, the letter already in the field
  onText(s, { deck, key }) {
    if (!deck.ai.ready) return false;
    field.onText(s);
    void deck.act(`widget ${key ?? "chat"}`);
    return true;
  },
  render(ui, r, { deck, key }) {
    const c = ui.c;
    if (chat.busy) ui.animate(80);
    if (!deck.ai.ready) {
      ui.text(r.x + 1, r.y, `○ ${t("uplink offline")}`, { fg: c.error }, r.w - 2);
      ui.text(r.x + 1, r.y + 1, deck.ai.problem ?? "", { fg: c.muted }, r.w - 2);
      return;
    }
    const all = lines(ui, r.w - 2);
    const room = r.h - 1;
    if (!all.length) ui.text(r.x + 1, r.y, t("say something — just type"), { fg: c.faint }, r.w - 2);
    all.slice(-room).forEach((l, i) => ui.text(r.x + 1, r.y + i, l.text, { fg: l.fg, attrs: l.bold ? BOLD : 0 }, r.w - 2));
    const typeRow = { x: r.x, y: r.y + r.h - 1, w: r.w, h: 1 };
    ui.text(r.x + 1, typeRow.y, `› ${field.text || t("type here…")}`, { fg: field.text ? c.fg : c.subtle }, r.w - 2);
    // a click on the line opens the conversation, ready to type (the widget's own hit is under it)
    ui.hit(typeRow, { cmd: `widget ${key ?? "chat"}`, tip: t("type to UPLINK") });
  },
};

export const chatPopup: WidgetPopupSpec = {
  title: "chat",
  size: { w: 76, h: 20 },
  hint: "enter send · ctrl+l new chat · ctrl+s say it",
  render(ui, r, { deck }) {
    const c = ui.c;
    const ok = deck.ai.ready;
    ui.text(r.x + 1, r.y, `${ok ? "●" : "○"} ${deck.ai.provider.label}`, { fg: ok ? c.success : c.error, attrs: BOLD });
    if (chat.msgs.length) ui.button(r.x + r.w - 14, r.y, t("new chat"), () => resetChat(), { tip: "ctrl+l" });
    if (chat.busy) ui.animate(80);
    const all = lines(ui, r.w - 3);
    const room = r.h - 4;
    if (!all.length) ui.text(r.x + 2, r.y + 2, ok ? t("a conversation that stays on HOME; LINK is the full chat") : deck.ai.problem ?? "", { fg: c.faint }, r.w - 4);
    all.slice(-room).forEach((l, i) => ui.text(r.x + 2, r.y + 2 + i, l.text, { fg: l.fg, attrs: l.bold ? BOLD : 0 }, r.w - 3));
    field.render(ui, { x: r.x + 1, y: r.y + r.h - 1, w: r.w - 2, h: 1 }, { focused: true, placeholder: ok ? t("type, enter to send") : t("uplink offline") });
  },
  onText: (s) => (field.onText(s), true),
  onKey: (k, { deck }) => {
    if (k.combo === "ctrl+l") return resetChat(), true;
    const last = [...chat.msgs].reverse().find((m) => m.who === "ai" && m.text);
    if (k.combo === "ctrl+s" && last) return void deck.act(`voice say ${q(last.text.slice(0, 1500))}`), true;
    if (field.onKey(k)) return true;
    if (k.combo === "enter") {
      const text = field.text;
      field.text = "";
      sendChat(deck, text);
      return true;
    }
    return false;
  },
};

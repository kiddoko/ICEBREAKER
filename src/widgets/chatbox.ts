/**
 * UPLINK chatbox — a small conversation that lives on HOME or the side panel. The widget
 * shows the last lines over a field of its own: click it (or choose the widget) and type, enter
 * sends. Enter on an empty field or a double-click opens it bigger (the same conversation). It's one
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
import { INSET } from "../ui/layout";
import type { WidgetPopupSpec, WidgetSpec } from "./types";

interface Msg {
  who: "you" | "ai";
  text: string;
}
const chat = { msgs: [] as Msg[], session: null as ChatSession | null, busy: false, error: "" };
const field = new Field({ icon: "❯" });
/** each copy's field was on screen at its last frame, and how to bring it into view (HOME / the panel scroll to it) */
const fieldShown = new Map<string, boolean>();
const showers = new Map<string, () => void>();

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
  // a field of its own, on its top line: one click and you type there, enter sends. Enter on an
  // empty field, or a double-click, opens the big view — a click never does
  onText(s, { deck, key }) {
    if (!deck.ai.ready) return false;
    field.onText(s);
    // out of view (the widget scrolled away): HOME / the panel scroll to it, you see what you type
    if (!fieldShown.get(key ?? "chat")) showers.get(key ?? "chat")?.();
    return true;
  },
  onKey(k, { deck }) {
    if (!deck.ai.ready) return false;
    if (k.combo === "enter") {
      if (field.empty) return false;
      const text = field.text;
      field.text = "";
      sendChat(deck, text);
      return true;
    }
    // ←→ choose another widget while the field is empty
    if (field.empty && (k.combo === "left" || k.combo === "right")) return false;
    return field.onKey(k);
  },
  render(ui, r, { deck, typing, select, key }) {
    const c = ui.c;
    if (chat.busy) ui.animate(80);
    if (!deck.ai.ready) {
      fieldShown.set(key ?? "chat", false);
      ui.text(r.x + INSET, r.y, `○ ${t("uplink offline")}`, { fg: c.error }, r.w - INSET * 2);
      ui.text(r.x + INSET, r.y + 1, deck.ai.problem ?? "", { fg: c.muted }, r.w - INSET * 2);
      return;
    }
    const w = r.w - INSET * 2;
    const all = lines(ui, w);
    const room = r.h - 1;
    // the field on top (it's in view as soon as the widget's top is: HOME and the panel scroll a
    // chosen widget's top into view), the conversation under it, its newest lines
    if (!all.length && room > 0) ui.text(r.x + INSET, r.y + 1, t("say something — just type"), { fg: c.faint }, w);
    all.slice(-room).forEach((l, i) => ui.text(r.x + INSET, r.y + 1 + i, l.text, { fg: l.fg, attrs: l.bold ? BOLD : 0 }, w));
    const row = { x: r.x, y: r.y, w: r.w, h: 1 };
    if (select) showers.set(key ?? "chat", select);
    // the caret only where you can see the field (cut off, it was drawn over the shell below)
    const shown = ui.grid.inClip(row.x + INSET, row.y);
    fieldShown.set(key ?? "chat", shown);
    const focused = !!typing && shown;
    field.render(ui, row, { focused, placeholder: focused ? t("type, enter to send") : t("type here…") });
    // a click on the field chooses the widget (keys come here) and puts the caret there
    ui.hit(row, {
      onClick: (m) => {
        select?.();
        field.editor.cursor = field.editor.posAt(m.x, m.y);
        field.editor.anchor = null;
      },
      tip: t("type to UPLINK · enter sends"),
    });
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

/**
 * breakerMED — the page. Left: the play sequence and the instruments; right:
 * the block, its tracks side by side, one line a step, the line being heard in
 * the middle while the song plays. Everything it changes goes through a `med`
 * command (commands.ts), so the shell's LOG shows it and keys / macros can
 * reuse it; only the notes played on the keyboard go straight to the sound
 * (a command would add its delay to every key).
 *
 *   enter play the song · ⇧enter play the block · space stop
 *   ↑↓ PgUp PgDn lines · ←→ tracks · the keyboard: a piano (keys.ts)
 *   alt ↑↓ the octave · alt ←→ the instrument
 */
import type { App } from "../../../src/apps/types";
import type { Rect } from "../../../src/core/grid";
import type { Action, KeyInput } from "../../../src/core/input";
import type { IcebreakerAPI } from "../../../src/plugins/api";
import type { UI } from "../../../src/ui/ui";
import type { Engine } from "./engine";
import { pianoKey } from "./keys";
import { hex, noteName, NOTE_OFF, PAULA_CLOCK, periodOf, ptBpmOf, type Song } from "./song";

export interface State {
  song: Song | null;
  path: string;
  /** where the cursor is (and where "play" starts) */
  seq: number;
  line: number;
  track: number;
  /** the instrument the keyboard plays (index) */
  inst: number;
  octave: number;
  error: string;
}

/** a cell's width: "C-3 01 0C20" and 5 more a command page */
const cellW = (pages: number) => 3 + 1 + 2 + pages * 5;
const LEFT = 22;

export function makeApp(ib: IcebreakerAPI, engine: Engine, st: State): App {
  const { BOLD, t, truncate, ListView, mix } = ib.lib;
  const run = (line: string) => void ib.shell.run(line);
  const seqList = new ListView<number>();
  const instList = new ListView<number>();
  seqList.cmdOf = (i) => `med pos ${i}`;
  seqList.onActivate = (i) => run(`med play song ${i}`);
  instList.onSelect = (i) => (st.inst = i);
  instList.onActivate = (i) => preview(st.octave * 12, i);
  /** first track shown (the page scrolls sideways when they don't fit) */
  let firstTrack = 0;

  const preview = (semi: number, inst = st.inst) => {
    const s = st.song;
    const ins = s?.instruments[inst];
    if (!s || !ins || ins.kind === "empty") return;
    const rate = PAULA_CLOCK / periodOf(semi + ins.transpose + s.transpose, ins.finetune);
    void engine.preview(inst, rate).catch((e) => ib.ui.notify(String(e?.message ?? e), "error"));
  };

  const moveLine = (d: number) => {
    const s = st.song;
    if (!s) return;
    const lines = s.blocks[s.sequence[st.seq]]?.lines ?? 64;
    st.line = Math.max(0, Math.min(lines - 1, st.line + d));
  };
  const moveTrack = (d: number) => {
    if (st.song) st.track = Math.max(0, Math.min(st.song.tracks - 1, st.track + d));
  };

  return {
    kind: "breakermed",
    key: "breakermed",
    rawKeys: true,
    title: () => (st.song ? `♫ ${st.path.split("/").pop()}` : "breakerMED"),
    status: () =>
      st.song
        ? `${t("enter play")} · ⇧enter ${t("block")} · ${t("space stop")} · ${t("keys: a piano")} · alt ↑↓ ${t("octave")} ${st.octave} · alt ←→ ${t("instrument")} ${hex(st.inst + 1)}`
        : t("med open <file.med|.mod> — or drop one in the vault"),

    render(ui: UI, r: Rect, focused: boolean) {
      const c = ui.c;
      const s = st.song;
      const now = engine.current();
      if (engine.playing) ui.animate(16);
      // follow the song as it's heard
      if (now) {
        st.seq = now.seq;
        st.line = now.line;
      }
      // ── the top line ──
      const name = s ? s.title || st.path.split("/").pop() || "" : "";
      let x = ui.text(r.x + 1, r.y, "breakerMED", { fg: c.accent, attrs: BOLD });
      if (s) x = ui.text(x + 2, r.y, truncate(name, Math.max(4, r.w - 60)), { fg: c.fg }, r.w - 60);
      if (s) {
        const f = s.flags;
        const bpm = ptBpmOf(s.tempoMode, s.tempo, s.lpb, f.eightChannel, f.hardwareMix);
        const right = `${engine.playing ? (engine.mode === "block" ? "▶ BLOCK" : "▶ SONG") : "■ STOP"}  ${s.tempoMode === "bpm" ? `${s.tempo} BPM` : s.tempoMode === "spd" ? `SPD ${s.tempo}` : `${s.tempo} BPM`} (${bpm.toFixed(0)})  ${t("speed")} ${hex(s.speed)}  ${s.format}  ${engine.paula ? "PAULA" : "SMOOTH"}`;
        ui.textRight(r.x + r.w - 1, r.y, right, { fg: engine.playing ? c.success : c.muted });
      }
      if (!s) {
        ui.textCenter(r, r.y + Math.floor(r.h / 2) - 1, t("no song loaded"), { fg: c.muted });
        ui.textCenter(r, r.y + Math.floor(r.h / 2) + 1, st.error || "med open <file.med | file.mod>", { fg: st.error ? c.error : c.subtle });
        return;
      }
      const body = { x: r.x, y: r.y + 1, w: r.w, h: r.h - 1 };
      // ── left: sequence, instruments ──
      const leftW = Math.min(LEFT, Math.floor(body.w / 3));
      const seqH = Math.max(5, Math.floor(body.h * 0.45));
      const seqBox = ui.box({ x: body.x, y: body.y, w: leftW, h: seqH }, { title: t("SEQUENCE"), focused: false });
      seqList.items = s.sequence.map((_, i) => i);
      if (seqList.selected !== st.seq) seqList.select(st.seq);
      seqList.render(ui, seqBox, false, (i, row, sel) => {
        const b = s.blocks[s.sequence[i]];
        ui.text(row.x, row.y, `${hex(i)} ${hex(s.sequence[i], 3)} ${b?.name ?? ""}`, { fg: sel ? c.accent : c.muted, attrs: sel ? BOLD : 0 }, row.w);
      });
      const instBox = ui.box({ x: body.x, y: body.y + seqH, w: leftW, h: body.h - seqH }, { title: t("INSTRUMENTS"), focused: false });
      instList.items = s.instruments.map((_, i) => i);
      if (instList.selected !== st.inst && st.inst < s.instruments.length) instList.select(st.inst);
      instList.render(ui, instBox, false, (i, row, sel) => {
        const ins = s.instruments[i];
        const empty = ins.kind === "empty";
        const tag = ins.kind === "synth" ? "∿" : ins.kind === "hybrid" ? "≈" : "";
        ui.text(row.x, row.y, `${hex(i + 1)} ${tag}${ins.name || (empty ? "·" : t("(no name)"))}`, { fg: sel ? c.accent : empty ? c.faint : c.fg, attrs: sel ? BOLD : 0 }, row.w);
      });

      // ── right: the block ──
      const blockNo = s.sequence[st.seq] ?? 0;
      const block = s.blocks[blockNo];
      const px = body.x + leftW;
      const inner = ui.box({ x: px, y: body.y, w: body.w - leftW, h: body.h }, { title: `${t("BLOCK")} ${hex(blockNo, 3)}${block?.name ? ` · ${block.name}` : ""} · ${t("line")} ${hex(st.line)}/${hex((block?.lines ?? 1) - 1)}`, focused });
      if (!block) return;
      const cw = cellW(block.pages) + 1;
      const numW = 4;
      const fits = Math.max(1, Math.floor((inner.w - numW) / cw));
      if (st.track < firstTrack) firstTrack = st.track;
      if (st.track >= firstTrack + fits) firstTrack = st.track - fits + 1;
      firstTrack = Math.max(0, Math.min(firstTrack, Math.max(0, s.tracks - fits)));
      // track headers
      const hy = inner.y;
      for (let k = 0; k < fits && firstTrack + k < s.tracks; k++) {
        const tr = firstTrack + k;
        const muted = engine.muted.has(tr);
        const hx = inner.x + numW + k * cw;
        ui.text(hx, hy, `${muted ? "×" : "▪"} ${t("track")} ${tr + 1}`, { fg: muted ? c.faint : tr === st.track ? c.accent : c.subtle, attrs: tr === st.track ? BOLD : 0 }, cw - 1);
        ui.hit({ x: hx, y: hy, w: cw - 1, h: 1 }, { cmd: `med mute ${tr + 1}`, tip: t("mute / unmute this track") });
      }
      // the lines: the cursor's line in the middle
      const rows = inner.h - 1;
      const mid = Math.floor(rows / 2);
      for (let k = 0; k < rows; k++) {
        const line = st.line - mid + k;
        const y = inner.y + 1 + k;
        if (line < 0 || line >= block.lines) continue;
        const here = line === st.line;
        const beat = line % Math.max(1, s.lpb) === 0;
        const bg = here ? (engine.playing ? mix(c.panel, c.accent, 0.28) : c.highlight) : beat ? c.panelAlt : undefined;
        if (bg !== undefined) ui.fill({ x: inner.x, y, w: inner.w, h: 1 }, { bg });
        ui.text(inner.x, y, hex(line, 3), { fg: here ? c.accent : beat ? c.muted : c.faint, bg });
        for (let j = 0; j < fits && firstTrack + j < s.tracks; j++) {
          const tr = firstTrack + j;
          const cell = block.cells[line][tr];
          const cx = inner.x + numW + j * cw;
          const dim = engine.muted.has(tr);
          let xx = ui.text(cx, y, noteName(cell.note), { fg: dim ? c.faint : cell.note === NOTE_OFF ? c.warning : cell.note ? c.fg : c.faint, bg, attrs: cell.note ? BOLD : 0 });
          xx = ui.text(xx + 1, y, cell.inst ? hex(cell.inst) : "..", { fg: dim ? c.faint : cell.inst ? c.accent : c.faint, bg });
          for (let p = 0; p < block.pages; p++) {
            const has = cell.cmd[p] || cell.val[p];
            xx = ui.text(xx + 1, y, has ? `${hex(cell.cmd[p])}${hex(cell.val[p])}` : "....", { fg: dim ? c.faint : has ? c.accentAlt : c.faint, bg });
          }
          if (here && tr === st.track && focused) ui.tint({ x: cx, y, w: 3, h: 1 }, c.bg, c.accent);
          ui.hit({ x: cx, y, w: cw - 1, h: 1 }, { onClick: () => ((st.line = line), (st.track = tr)), onWheel: (d) => moveLine(Math.sign(d) * 2) });
        }
      }
      ui.hit(inner, { onWheel: (d) => moveLine(Math.sign(d) * 2) });
    },

    onKey(k: KeyInput) {
      const s = st.song;
      if (k.key === "enter") return run(k.shift ? `med play block ${st.seq} ${st.line}` : `med play song ${st.seq} ${st.line}`), true;
      if (k.key === "space") return run("med stop"), true;
      if (!s) return false;
      if (k.alt) {
        if (k.key === "up") return (st.octave = Math.min(7, st.octave + 1)), true;
        if (k.key === "down") return (st.octave = Math.max(0, st.octave - 1)), true;
        if (k.key === "left") return (st.inst = Math.max(0, st.inst - 1)), true;
        if (k.key === "right") return (st.inst = Math.min(Math.max(0, s.instruments.length - 1), st.inst + 1)), true;
        return false;
      }
      switch (k.key) {
        case "up": return moveLine(-1), true;
        case "down": return moveLine(1), true;
        case "pageup": return moveLine(-16), true;
        case "pagedown": return moveLine(16), true;
        case "home": return (st.line = 0), true;
        case "end": return moveLine(9999), true;
        case "left": return moveTrack(-1), true;
        case "right": return moveTrack(1), true;
      }
      const semi = pianoKey(k.code);
      if (semi !== null && !k.ctrl && !k.meta) return k.repeat || preview(st.octave * 12 + semi), true;
      return false;
    },

    // the gamepad (and what the keys above didn't take)
    onAction(a: Action) {
      switch (a) {
        case "up": return moveLine(-1), true;
        case "down": return moveLine(1), true;
        case "left": return moveTrack(-1), true;
        case "right": return moveTrack(1), true;
        case "page-up": return moveLine(-16), true;
        case "page-down": return moveLine(16), true;
        case "confirm": return run(engine.playing ? "med stop" : `med play song ${st.seq} ${st.line}`), true;
      }
      return false;
    },
  };
}

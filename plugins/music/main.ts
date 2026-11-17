/**
 * MUSIC — what's playing on this computer, as a module.
 *
 *   music              what's playing
 *   music toggle       play / pause (also: play, pause, next, prev)
 *   music vol 40       volume (+ / - to nudge)
 *
 * The HOME widget (music.now) shows the track, a progress line, a tiny
 * equalizer and the controls; every button runs a `music …` command.
 * Native side: src-tauri/src/media.rs (Spotify + Music on macOS, playerctl
 * on Linux). Permission: "media".
 */
import type { IcebreakerAPI } from "../../src/plugins/api";
import type { MediaStatus } from "../../src/platform/types";

const ACTIONS: Record<string, string> = { toggle: "toggle", "play-pause": "toggle", play: "play", pause: "pause", next: "next", skip: "next", prev: "prev", previous: "prev", back: "prev" };

export function activate(ib: IcebreakerAPI): void {
  const { BOLD, strWidth, fmt } = ib.lib;

  // ── state: polled while the widget is on screen (or a command asks) ──
  let status: MediaStatus | null = null;
  let at = 0;
  let error: string | null = null;
  let loading = false;
  let polledAt = 0;

  const poll = async (): Promise<void> => {
    if (loading) return;
    loading = true;
    polledAt = Date.now();
    try {
      status = await ib.media.status();
      at = Date.now();
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
      ib.ui.redraw();
    }
  };

  /** Position now, moving on between two polls while it plays. */
  const position = () => (status ? Math.min(status.duration || Infinity, status.position + (status.playing ? (Date.now() - at) / 1000 : 0)) : 0);
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  const control = async (action: string) => {
    await ib.media.control(action);
    // the player needs a moment before it reports the new state
    setTimeout(() => void poll(), 300);
    setTimeout(() => void poll(), 1200);
  };

  ib.commands.register({
    name: "music",
    aliases: ["np"],
    summary: "what's playing, play / pause / skip / volume (MUSIC module)",
    usage: "music                  what's playing\nmusic toggle           play / pause\nmusic play | pause | next | prev\nmusic vol [0-100 | + | -]",
    examples: [
      ["music", "track, artist, where it's at"],
      ["music toggle", "play / pause"],
      ["music next", "skip"],
      ["music vol 30", "volume to 30 %"],
      ["music vol +", "a bit louder"],
    ],
    man: "macOS: Spotify and Music (asked only if they're running; macOS asks once to let ICEBREAKER control them).\nLinux: any MPRIS player through playerctl (Spotify, VLC, browsers, mpv…).\nWindows: not yet.",
    complete: () => ["toggle", "play", "pause", "next", "prev", "vol"],
    async run(ctx) {
      if (!ib.media.available()) return ctx.err("music: needs the desktop app\n"), 1;
      const [a, b] = ctx.args;
      try {
        if (!a) {
          await poll();
          if (error) return ctx.err(`music: ${error}\n`), 1;
          if (!status) return ctx.out(fmt.dim("nothing playing\n")), 0;
          const s = status;
          ctx.out(`${s.playing ? fmt.green("▶") : fmt.yellow("❚❚")} ${fmt.bold(s.title)} ${fmt.dim("—")} ${s.artist}${s.album ? fmt.dim(` · ${s.album}`) : ""}\n`);
          ctx.out(fmt.dim(`${s.player} · ${clock(position())}${s.duration ? ` / ${clock(s.duration)}` : ""}${s.volume !== null ? ` · vol ${Math.round(s.volume)}%` : ""}\n`));
          return 0;
        }
        if (a === "vol" || a === "volume") {
          if (!b) {
            await poll();
            return ctx.out(status?.volume !== null && status ? `${Math.round(status.volume!)}%\n` : "unknown\n"), 0;
          }
          const action = b === "+" ? "vol+" : b === "-" ? "vol-" : /^\d{1,3}%?$/.test(b) ? `vol:${parseInt(b)}` : "";
          if (!action) return ctx.err("usage: music vol 0-100 | + | -\n"), 1;
          await control(action);
          return 0;
        }
        const action = ACTIONS[a];
        if (!action) return ctx.err(`music: "${a}"? try toggle, play, pause, next, prev, vol\n`), 1;
        await control(action);
        return 0;
      } catch (e) {
        ctx.err(`music: ${e instanceof Error ? e.message : String(e)}\n`);
        return 1;
      }
    },
  });

  // ── the widget ──

  const BARS = " ▁▂▃▄▅▆▇█";

  ib.widgets.register({
    id: "now",
    title: "music",
    description: "what's playing (Spotify, Music…) with play / pause / skip",
    size: { w: 4, h: 4 },
    min: { w: 2, h: 2 },
    render(ui, r) {
      const c = ui.c;
      if (!ib.media.available()) return void ui.text(r.x + 1, r.y, "music needs the desktop app", { fg: c.muted }, r.w - 2);
      if (Date.now() - polledAt > (status?.playing ? 2000 : 4000)) void poll();
      ui.animate(status?.playing ? 120 : 1000);
      if (error) {
        ui.text(r.x + 1, r.y, `⚠ ${error}`, { fg: c.error }, r.w - 2);
        if (r.h > 1) ui.text(r.x + 1, r.y + 1, "enter: retry", { fg: c.faint });
        return;
      }
      if (!status) {
        const msg = loading && !at ? `${ui.spinner()} listening…` : "nothing playing";
        ui.textCenter(r, r.y + Math.floor((r.h - 1) / 2) - (r.h > 2 ? 1 : 0), msg, { fg: c.muted });
        if (r.h > 2) ui.textCenter(r, r.y + Math.floor((r.h - 1) / 2), "play something in Spotify or Music", { fg: c.faint });
        return;
      }
      const s = status;
      const w = r.w - 2;
      const x0 = r.x + 1;
      // what fits, top to bottom: header, title, artist, progress, controls
      const rows = r.h >= 5 ? ["head", "title", "artist", "progress"] : r.h === 4 ? ["head", "title", "progress"] : r.h === 3 ? ["mini", "progress"] : r.h === 2 ? ["mini"] : [];
      let y = r.y + Math.max(0, Math.floor((r.h - rows.length - 1) / 2));

      const title = s.title || "—";
      const marquee = (text: string, room: number) => {
        if (strWidth(text) <= room) return text;
        const loop = [...`${text}     ·     `];
        const off = Math.floor(ui.now / 220) % loop.length;
        return [...loop.slice(off), ...loop.slice(0, off)].join("");
      };
      const eq = 7;
      const drawEq = (ex: number, ey: number) => {
        for (let i = 0; i < eq; i++) {
          const v = s.playing ? (Math.sin(ui.now / (140 + i * 37) + i * 1.7) + Math.sin(ui.now / (230 + i * 19) + i)) / 4 + 0.5 : 0.08;
          ui.text(ex + i, ey, BARS[Math.max(1, Math.min(8, Math.round(v * 8)))], { fg: i % 2 ? c.accent : c.accentAlt });
        }
      };

      for (const row of rows) {
        if (row === "head") {
          ui.text(x0, y, `♪ ${s.player.toLowerCase()}`, { fg: c.accentAlt });
          if (w > 16) drawEq(x0 + w - eq, y);
        } else if (row === "title") ui.text(x0, y, marquee(title, w), { fg: c.fg, attrs: BOLD }, w);
        else if (row === "artist") ui.text(x0, y, [s.artist, s.album].filter(Boolean).join(" · "), { fg: c.muted }, w);
        else if (row === "mini") {
          ui.text(x0, y, "♪", { fg: c.accentAlt });
          ui.text(x0 + 2, y, marquee(`${title} — ${s.artist}`, w - 2), { fg: c.fg, attrs: BOLD }, w - 2);
        } else if (row === "progress") {
          if (s.duration > 0) {
            const pos = position();
            const left = clock(pos), right = clock(s.duration);
            const bw = Math.max(4, w - left.length - right.length - 2);
            const filled = Math.round((pos / s.duration) * bw);
            ui.text(x0, y, left, { fg: c.subtle });
            const bx = x0 + left.length + 1;
            ui.text(bx, y, "━".repeat(Math.max(0, filled)), { fg: c.accent });
            if (filled < bw) ui.text(bx + filled, y, filled > 0 ? "╸" : "─", { fg: c.accent });
            ui.text(bx + filled + 1, y, "─".repeat(Math.max(0, bw - filled - 1)), { fg: c.faint });
            ui.text(bx + bw + 1, y, right, { fg: c.subtle });
          } else ui.text(x0, y, s.playing ? "playing" : "paused", { fg: c.subtle });
        }
        y++;
      }

      // controls · volume
      const cy = Math.min(r.y + r.h - 1, y);
      const btns: [string, string, string][] = [
        ["|◀◀", "music prev", "previous"],
        [s.playing ? " ❚❚ " : " ▶ ", "music toggle", s.playing ? "pause" : "play"],
        ["▶▶|", "music next", "next"],
      ];
      const total = btns.reduce((n, [l]) => n + strWidth(l) + 3, -3);
      let bx = x0 + Math.max(0, Math.floor((w - total) / 2) - (w > 30 && s.volume !== null ? 6 : 0));
      for (const [label, cmd, tip] of btns) {
        const rect = { x: bx, y: cy, w: strWidth(label), h: 1 };
        const hot = ui.hovered(rect);
        ui.text(bx, cy, label, { fg: hot ? c.panel : cmd === "music toggle" ? c.accent : c.fg, bg: hot ? c.accent : undefined, attrs: BOLD });
        ui.hit(rect, { cmd, tip });
        bx += strWidth(label) + 3;
      }
      if (w > 30 && s.volume !== null) {
        const n = 5;
        const lv = Math.round((s.volume / 100) * n);
        const vx = x0 + w - (n + 4);
        ui.text(vx, cy, "−", { fg: c.subtle });
        ui.hit({ x: vx, y: cy, w: 1, h: 1 }, { cmd: "music vol -", tip: `volume ${Math.round(s.volume)}%` });
        ui.text(vx + 2, cy, "▮".repeat(lv) + "▯".repeat(n - lv), { fg: c.accent });
        ui.text(vx + n + 3, cy, "+", { fg: c.subtle });
        ui.hit({ x: vx + n + 3, y: cy, w: 1, h: 1 }, { cmd: "music vol +", tip: `volume ${Math.round(s.volume)}%` });
      }
    },
    activate: () => {
      if (error) {
        error = null;
        void poll();
      } else void ib.shell.run("music toggle");
    },
  });
}

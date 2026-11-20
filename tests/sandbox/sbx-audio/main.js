// ib.audio and binary files, used normally from the sandbox (docs/SECURITY_AUDIT.md
// "How to repeat the test"). `sbxaudio` plays a little 8-bit tune on 4 voices,
// smooth then stepped (Paula), writes and reads back a binary file, and tries the limits.
// `sbxaudio key` plays one note now (the latency of a key).
// `sbxaudio stream` computes a 440 Hz sine here and streams it for 1.5 s (ib.audio.stream).
export async function activate(ib) {
  // one cycle of a square wave, 8 bits like an Amiga sample, looped
  const square = new Int8Array(32).map((_, i) => (i < 16 ? 100 : -100));
  const saw = new Int8Array(64).map((_, i) => i * 4 - 128);
  ib.commands.register({
    name: "sbxaudio",
    summary: "checks the modules' sampler",
    async run(ctx) {
      const ok = (s) => ctx.out("  ok  " + s + "\n");
      const no = (s, e) => ctx.out("  ✗   " + s + ": " + String(e && e.message || e) + "\n");
      const t = async (s, f) => { try { const v = await f(); ok(s + (v === undefined ? "" : " → " + String(v).slice(0, 60))); } catch (e) { no(s, e); } };
      const refused = async (s, f) => { try { await f(); ctx.out("  OPEN " + s + "\n"); } catch (e) { ok(s + " refused (" + String(e && e.message || e).slice(0, 60) + ")"); } };
      if (!ib.audio.available()) return ctx.out("no sound output here\n"), 1;
      await ib.audio.sample("sq", square, { loopStart: 0, loopLength: 32 });
      await ib.audio.sample("saw", saw, { loopStart: 0, loopLength: 64 });
      if (ctx.args[0] === "stream") {
        const s = await ib.audio.stream();
        let phase = 0, sent = 0, pulls = 0;
        const total = Math.round(s.rate * 1.5);
        await new Promise((done) => {
          s.onPull = (frames) => {
            pulls++;
            const n = Math.min(frames, total - sent);
            if (n <= 0) return done();
            const l = new Float32Array(n), r = new Float32Array(n);
            for (let i = 0; i < n; i++) (l[i] = r[i] = 0.2 * Math.sin(phase)), (phase += (2 * Math.PI * 440) / s.rate);
            s.write(l, r);
            sent += n;
          };
        });
        ctx.out("  ok  streamed " + sent + " frames at " + s.rate + " Hz in " + pulls + " pulls (asks below " + s.low + ", up to " + s.high + ")\n");
        s.close();
        return 0;
      }
      if (ctx.args[0] === "key") {
        await ib.audio.schedule([{ voice: 0, play: "sq", rate: 440 * 32, volume: 0.4 }, { at: (await ib.audio.now()) + 0.15, voice: 0, stop: true }]);
        return 0;
      }
      // C E G C, twice: smooth, then stepped like Paula; one voice each, a bass on the 4th
      const now = await ib.audio.now();
      const notes = [261.63, 329.63, 392, 523.25];
      const ev = [];
      for (let pass = 0; pass < 2; pass++) {
        const interp = pass ? "none" : "linear";
        for (let i = 0; i < 8; i++) {
          const at = now + 0.1 + pass * 1.8 + i * 0.2;
          ev.push({ at, voice: i % 3, play: "sq", rate: notes[i % 4] * 32, volume: 0.3, pan: (i % 3) - 1, interp });
          ev.push({ at: at + 0.18, voice: i % 3, stop: true });
        }
        ev.push({ at: now + 0.1 + pass * 1.8, voice: 3, play: "saw", rate: 65.4 * 64, volume: 0.35, interp });
        ev.push({ at: now + 1.7 + pass * 1.8, voice: 3, stop: true });
      }
      await t("schedule " + ev.length + " events", () => ib.audio.schedule(ev));
      // binary files: write, read back, compare
      const bytes = new Uint8Array(70000).map((_, i) => (i * 7) & 255);
      await t("writeBytes 70 kB", () => ib.vault.writeBytes("sbx-audio/test.bin", bytes));
      await t("readBytes is the same", async () => {
        const back = await ib.vault.readBytes("sbx-audio/test.bin");
        if (back.length !== bytes.length || back.some((b, i) => b !== bytes[i])) throw new Error("different (" + back.length + " bytes)");
        return back.length + " bytes";
      });
      // a WAV made here, decoded by the deck
      await t("decode a WAV", async () => {
        const n = 800;
        const wav = new DataView(new ArrayBuffer(44 + n));
        const s = (o, x) => [...x].forEach((c, i) => wav.setUint8(o + i, c.charCodeAt(0)));
        s(0, "RIFF"); wav.setUint32(4, 36 + n, true); s(8, "WAVEfmt "); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true);
        wav.setUint32(24, 8000, true); wav.setUint32(28, 8000, true); wav.setUint16(32, 1, true); wav.setUint16(34, 8, true); s(36, "data"); wav.setUint32(40, n, true);
        for (let i = 0; i < n; i++) wav.setUint8(44 + i, 128 + Math.round(100 * Math.sin(i / 3)));
        const d = await ib.audio.decode(new Uint8Array(wav.buffer));
        return d.channels.length + " channel(s), " + d.channels[0].length + " frames at " + d.rate + " Hz";
      });
      // the limits
      await refused("voice 64", () => ib.audio.schedule([{ voice: 64, stop: true }]));
      await refused("a sample that isn't loaded", () => ib.audio.schedule([{ voice: 0, play: "nope" }]));
      await refused("an hour ahead", async () => ib.audio.schedule([{ at: (await ib.audio.now()) + 3600, voice: 0, stop: true }]));
      await refused("40 MB of samples", () => ib.audio.sample("big", new Float32Array(10 * 1024 * 1024)));
      await refused("a sample that isn't sound", () => ib.audio.sample("x", "hello"));
      await refused("decode nonsense", () => ib.audio.decode(new Uint8Array([1, 2, 3, 4])));
      ctx.out("listen: two times the same little tune, the second grittier (Paula). `audio` shows who plays, `audio stop` silences.\n");
      return 0;
    },
  });
}

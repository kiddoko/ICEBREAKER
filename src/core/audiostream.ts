/**
 * A module's end of its sound stream (ib.audio.stream): a direct line from the
 * module (its sandbox, a Worker) to its own audio node in the deck, which plays
 * what it receives (core/mixer-worklet.ts, "ib-stream"). The node asks for more
 * when it runs low (`onPull`): the module computes that many frames (its whole
 * mix: samples, synths, effects) and writes them. What the line carries is
 * sound only — two arrays of numbers a block —, checked and bounded on arrival.
 *
 * No imports: it runs in the deck and in the sandbox alike.
 */
export class AudioStream {
  /** the sound card's frames a second (what to compute at) */
  rate = 0;
  /** the node asks for more below `low` frames waiting, up to `high` */
  low = 0;
  high = 0;
  /**
   * The node wants `frames` more. `played`: frames it has output so far (silence included);
   * `buffered`: frames of yours still waiting — what you wrote minus `buffered` is what's heard now.
   */
  onPull?: (frames: number, played: number, buffered: number) => void;
  private closed = false;

  private constructor(private readonly port: MessagePort) {}

  /** Wraps the line once the node said hello (its rate). */
  static open(port: MessagePort): Promise<AudioStream> {
    const s = new AudioStream(port);
    return new Promise((ok, no) => {
      const t = setTimeout(() => no(new Error("the sound stream didn't answer")), 5000);
      port.onmessage = (ev: MessageEvent<{ t?: string; rate?: number; low?: number; high?: number; frames?: number; played?: number; buffered?: number }>) => {
        const m = ev.data;
        if (m?.t === "hello") {
          clearTimeout(t);
          s.rate = Number(m.rate) || 48000;
          s.low = Number(m.low) || 0;
          s.high = Number(m.high) || 0;
          ok(s);
        } else if (m?.t === "pull" && !s.closed) s.onPull?.(Number(m.frames) || 0, Number(m.played) || 0, Number(m.buffered) || 0);
      };
      port.start?.();
    });
  }

  /** Add frames to play (left and right, same length; at most 16384 a call). The arrays are handed over. */
  write(left: Float32Array, right: Float32Array): void {
    if (this.closed) return;
    const own = (a: Float32Array) => (a.byteOffset === 0 && a.byteLength === a.buffer.byteLength ? a : a.slice());
    const l = own(left), r = own(right);
    this.port.postMessage({ t: "pcm", l, r }, [l.buffer as ArrayBuffer, r.buffer as ArrayBuffer]);
  }

  close(): void {
    this.closed = true;
    this.port.close();
  }
}

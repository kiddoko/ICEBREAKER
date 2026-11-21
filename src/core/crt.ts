/**
 * Real CRT curvature (Settings → Effects → curvature > 0): the picture bulges like the
 * glass of an old tube — lines of text bend towards the edges, the corners pull in.
 *
 * The deck keeps drawing as it always does: the screen, its glow, its bloom and its colour
 * fringes on their own canvases. With the curve on, those canvases are hidden and one WebGL
 * canvas (#glass) puts them together each painted frame — the same "screen" blend the CSS
 * layers use — through a barrel warp (the classic CRT-shader one: x bends with y², y with x²).
 * The CRT lines are drawn there too, so they bend with the picture.
 *
 * The mouse goes through the same warp (`warpPoint`), the caret and the IME popup through its
 * inverse (`unwarpPoint`): a click lands on the letter you see, even near a corner.
 *
 * No WebGL, or the GPU drops the context: `onLost` is called and the flat picture comes back.
 */

/** How much the glass bends at 100 %: x by y², y by x² (positions from -1 to 1). */
export const CURVE_MAX: readonly [number, number] = [0.06, 0.08];

/** The two bend factors for a curvature from 0 to 1. */
export function curveK(curve: number): [number, number] {
  const c = Math.max(0, Math.min(1, curve));
  return [CURVE_MAX[0] * c, CURVE_MAX[1] * c];
}

/**
 * Where the point (u, v) of the screen (0–1 across, 0–1 down) shows the picture from:
 * the same formula as the shader. The middle row and column don't move.
 */
export function warpPoint(u: number, v: number, k: readonly [number, number]): [number, number] {
  const cx = u * 2 - 1, cy = v * 2 - 1;
  return [(cx * (1 + k[0] * cy * cy)) * 0.5 + 0.5, (cy * (1 + k[1] * cx * cx)) * 0.5 + 0.5];
}

/** The inverse: where the picture's point (u, v) appears on the screen. */
export function unwarpPoint(u: number, v: number, k: readonly [number, number]): [number, number] {
  const sx = u * 2 - 1, sy = v * 2 - 1;
  let cx = sx, cy = sy;
  // a fixed point: the bend is small, a few steps are exact to a fraction of a pixel
  for (let i = 0; i < 8; i++) {
    const nx = sx / (1 + k[0] * cy * cy);
    cy = sy / (1 + k[1] * cx * cx);
    cx = nx;
  }
  return [cx * 0.5 + 0.5, cy * 0.5 + 0.5];
}

/** What the glass composes this frame (the renderer fills it in). */
export interface GlassInput {
  screen: HTMLCanvasElement;
  /** the bloom copy (already blurred in its canvas) and how strongly it's screened over */
  bloom: HTMLCanvasElement | null;
  bloomAmt: number;
  /** the colour fringes (a half-size canvas) */
  chroma: HTMLCanvasElement | null;
  chromaAmt: number;
  /** the glow (one pixel per cell): blurred here, by sigma cells */
  glow: HTMLCanvasElement | null;
  glowAmt: number;
  glowSigma: number;
  glowBright: number;
  /** the cell's width / height, so the glow's blur is round */
  cellAspect: number;
  /** CRT lines: strength (the --scanlines value), device pixel ratio, the picture's top on the page (CSS px) */
  scan: number;
  dpr: number;
  top: number;
}

type Layer = "screen" | "bloom" | "chroma" | "glow";
const UNITS: Record<Layer, number> = { screen: 0, bloom: 1, chroma: 2, glow: 3 };

const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uScreen, uBloom, uChroma, uGlow;
uniform vec2 uRes;       // the picture, device px
uniform vec2 uK;         // the bend
uniform vec3 uAmt;       // bloom, chroma, glow strengths
uniform vec2 uGlowStep;  // the glow's blur step, in its texture
uniform float uGlowBright;
uniform vec3 uScan;      // strength, dpr, top (CSS px)

vec2 warp(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  c *= 1.0 + uK * c.yx * c.yx;
  return c * 0.5 + 0.5;
}
// mix-blend-mode: screen, with the layer's (premultiplied) colour
vec3 screenOver(vec3 base, vec3 l, float o) { return base + o * l * (1.0 - base); }

void main() {
  vec2 uv = vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y);
  vec2 s = warp(uv);
  // past the picture's edge: see-through (the deck's background), a soft 1.5 px edge
  vec2 px = 1.5 / uRes;
  vec2 e = smoothstep(vec2(0.0), px, s) * smoothstep(vec2(0.0), px, 1.0 - s);
  float inside = e.x * e.y;
  if (inside <= 0.0) { gl_FragColor = vec4(0.0); return; }
  vec3 col = texture2D(uScreen, s).rgb;
  if (uAmt.z > 0.0) {
    // the CSS blur of the glow, as 9 taps (the texture's own smoothing does the rest)
    vec3 g = vec3(0.0);
    for (int i = -1; i <= 1; i++)
      for (int j = -1; j <= 1; j++) {
        float w = (i == 0 ? 2.0 : 1.0) * (j == 0 ? 2.0 : 1.0);
        g += w * texture2D(uGlow, s + vec2(float(i), float(j)) * uGlowStep).rgb;
      }
    g /= 16.0;
    float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
    g = max(mix(vec3(l), g, 1.6), 0.0) * uGlowBright;   // saturate(1.6) brightness(…)
    col = screenOver(col, min(g, 1.0), uAmt.z);
  }
  if (uAmt.x > 0.0) col = screenOver(col, texture2D(uBloom, s).rgb, uAmt.x);
  if (uAmt.y > 0.0) col = screenOver(col, texture2D(uChroma, s).rgb, uAmt.y);
  if (uScan.x > 0.0) {
    // the CSS lines (a 3 px pitch: dark, half, clear, clear), on the bent picture
    float y = mod(s.y * uRes.y / uScan.y + uScan.z, 3.0);
    float a = y < 1.0 ? mix(1.3, 0.6, y) : (y < 2.0 ? mix(0.6, 0.0, y - 1.0) : 0.0);
    col *= 1.0 - min(1.0, a * uScan.x);
  }
  gl_FragColor = vec4(col * inside, inside);
}`;

export class CrtGlass {
  readonly el: HTMLCanvasElement;
  k: [number, number] = [0, 0];
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private tex: Record<Layer, WebGLTexture>;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private dirty = new Set<Layer>(["screen", "bloom", "chroma", "glow"]);
  private queued = false;
  private lost = false;

  /** A glass over `screen`, or null when this webview has no WebGL. */
  static create(screen: HTMLCanvasElement, onLost: () => void): CrtGlass | null {
    const el = document.createElement("canvas");
    el.id = "glass";
    const gl = el.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false }) as WebGLRenderingContext | null;
    if (!gl) return null;
    try {
      return new CrtGlass(el, gl, screen, onLost);
    } catch {
      return null;
    }
  }

  private constructor(el: HTMLCanvasElement, gl: WebGLRenderingContext, screen: HTMLCanvasElement, onLost: () => void) {
    this.el = el;
    this.gl = gl;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "program");
    gl.useProgram(prog);
    this.prog = prog;
    // one triangle over the whole canvas
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    for (const n of ["uScreen", "uBloom", "uChroma", "uGlow", "uRes", "uK", "uAmt", "uGlowStep", "uGlowBright", "uScan"]) this.u[n] = gl.getUniformLocation(prog, n);
    // the layers' colours come premultiplied: "screen" with a see-through layer is then exact
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const make = (layer: Layer): WebGLTexture => {
      const t = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0 + UNITS[layer]);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // 1×1 black until the layer's first frame
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      return t;
    };
    this.tex = { screen: make("screen"), bloom: make("bloom"), chroma: make("chroma"), glow: make("glow") };
    gl.uniform1i(this.u.uScreen, UNITS.screen);
    gl.uniform1i(this.u.uBloom, UNITS.bloom);
    gl.uniform1i(this.u.uChroma, UNITS.chroma);
    gl.uniform1i(this.u.uGlow, UNITS.glow);
    el.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.lost = true;
      onLost();
    });
    screen.after(el);
  }

  /** Size and place the glass exactly over the picture. */
  fit(screen: HTMLCanvasElement): void {
    if (this.el.width !== screen.width || this.el.height !== screen.height) {
      this.el.width = screen.width;
      this.el.height = screen.height;
    }
    const s = this.el.style, o = screen.style;
    s.width = o.width;
    s.height = o.height;
    s.left = o.left;
    s.top = o.top;
    this.dirty.add("screen");
  }

  /** A layer changed: compose again once this task is over (one pass for everything that changed). */
  touch(layer: Layer, input: () => GlassInput): void {
    this.dirty.add(layer);
    if (this.queued || this.lost) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      if (!this.lost) this.compose(input());
    });
  }

  private compose(f: GlassInput): void {
    const gl = this.gl;
    if (!this.el.width || !this.el.height) return;
    const upload = (layer: Layer, src: HTMLCanvasElement | null, on: boolean) => {
      if (!on || !src || !src.width || !src.height || !this.dirty.has(layer)) return;
      gl.activeTexture(gl.TEXTURE0 + UNITS[layer]);
      gl.bindTexture(gl.TEXTURE_2D, this.tex[layer]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    };
    upload("screen", f.screen, true);
    upload("bloom", f.bloom, f.bloomAmt > 0);
    upload("chroma", f.chroma, f.chromaAmt > 0);
    upload("glow", f.glow, f.glowAmt > 0);
    this.dirty.clear();
    gl.useProgram(this.prog);
    gl.viewport(0, 0, this.el.width, this.el.height);
    gl.uniform2f(this.u.uRes, this.el.width, this.el.height);
    gl.uniform2f(this.u.uK, this.k[0], this.k[1]);
    gl.uniform3f(this.u.uAmt, f.bloom ? f.bloomAmt : 0, f.chroma?.width ? f.chromaAmt : 0, f.glow?.width ? f.glowAmt : 0);
    const gw = f.glow?.width || 1, gh = f.glow?.height || 1;
    gl.uniform2f(this.u.uGlowStep, (1.2 * f.glowSigma) / (gw * f.cellAspect || 1), (1.2 * f.glowSigma) / gh);
    gl.uniform1f(this.u.uGlowBright, f.glowBright);
    gl.uniform3f(this.u.uScan, f.scan, f.dpr, f.top);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  destroy(): void {
    this.lost = true;
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.el.remove();
  }
}

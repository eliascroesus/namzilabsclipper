/**
 * The compositor: every frame of an edit is drawn here on the GPU. Footage is
 * cropped (following the subject), zoomed and graded; photos and still shots get
 * a slow push; flashes, film burns and dips to black are drawn over it, and the edit
 * designs' transitions and effects (whip pans, zoom and spin transitions, blur-ins,
 * glitches, light leaks, letterbox bars: plan/designs.ts) move and smear the whole
 * picture; captions and the demo card come in last from a 2D canvas, untouched by
 * the grade.
 */
import type { Grade } from "../plan/types";

export type Rotation = 0 | 90 | 180 | 270;

/** Pictures or clips drawn over the shot at once, at the most (their texture slots follow the shots'). */
export const OVERLAY_SLOTS = 3;

export interface LayerDraw {
  slot: number;
  /** the source's display size (after rotation), in pixels */
  srcW: number;
  srcH: number;
  rotation: Rotation;
  flip: boolean;
  /** crop centre in the source's display space, 0 to 1 */
  cx: number;
  cy: number;
  zoom: number;
  fit: "cover" | "fit";
  alpha: number;
  /** the picture inside any black bars, [x0, y0, x1, y1] of the display frame; the centre is inside it */
  rect?: [number, number, number, number];
  /** drawn as a card on black, turned this many degrees clockwise (a photo flying in) */
  tilt?: number;
  /** the card's size in the frame (1 = the whole frame) */
  inset?: number;
  /**
   * drawn as a card over what's below it (a photo on someone's head, a window with a
   * clip in it): its centre and its width and height, 0 to 1 of the frame; turned by tilt
   */
  card?: { x: number; y: number; w: number; h: number };
  /** the shot balanced on its own (render/tone.ts): black point, white point, gamma, saturation */
  tone?: [number, number, number, number];
}

export interface FrameDraw {
  layers: LayerDraw[];
  grade: Grade;
  flash: number;
  burn: number;
  burnPhase: number;
  dim: number;
  overlay: boolean;
  /** how the captions mix with the picture: 0 laid over it, else a blend mode (render/captions.ts: BLEND_INDEX) */
  overlayBlend?: number;
  time: number;
  seed: number;
  /** the picture knocked sideways and up or down this much (a shake), in frame widths and heights */
  shake?: [number, number];
  /** a zoom blur, 0 to 1 */
  zoomBlur?: number;
  /** the red and blue pulled apart from the middle out (a hit's colour split), 0 to 1 */
  split?: number;
  /** black and white, 0 to 1 */
  mono?: number;
  /**
   * the whole picture moved (in frame widths and heights, right and down), scaled about
   * the middle (1 = as it is) and turned clockwise (radians), what it leaves bare filled
   * with its own mirror image: a whip pan, a zoom or a spin across a cut, a swing
   */
  move?: [number, number];
  scale?: number;
  spin?: number;
  /** motion blur: along this (frame widths and heights), and round the middle (radians) */
  streak?: [number, number];
  spinBlur?: number;
  /** out of focus, 0 to 1 */
  blur?: number;
  /** the picture torn into bands and split in colour, 0 to 1 */
  glitch?: number;
  /** the picture's negative, 0 to 1 */
  invert?: number;
  /** letterbox bars, each this share of the frame's height */
  bars?: number;
  /** a light leak, 0 to 1, and how far across it has drifted (0 to 1) */
  leak?: number;
  leakPhase?: number;
  /** a videotape's picture, 0 to 1 */
  vhs?: number;
}

const VERT = `#version 300 es
out vec2 vPos;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vPos = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const LAYER = `#version 300 es
precision highp float;
in vec2 vPos;
uniform sampler2D uTex;
uniform vec2 uOut;
uniform vec2 uSrc;
uniform vec2 uCenter;
uniform float uZoom;
uniform int uRot;
uniform bool uFlip;
uniform int uMode; // 0 cover, 1 contain
uniform float uAlpha;
uniform float uGain;
uniform vec4 uRect; // the picture inside any black bars: x0, y0, width, height of the frame
uniform vec2 uShake; // a shake, in frame widths and heights
uniform float uTilt; // the picture as a card turned this far clockwise (radians)
uniform bool uCard; // drawn as a card: centred at uCardC, uCardS of the frame's width and height
uniform vec2 uCardC;
uniform vec2 uCardS;
uniform vec4 uTone; // black point, white point, gamma, saturation (none when the white point isn't above the black)
out vec4 outColor;
vec2 toTex(vec2 d) {
  if (uFlip) d.x = 1.0 - d.x;
  if (uRot == 1) return vec2(d.y, 1.0 - d.x);
  if (uRot == 2) return vec2(1.0 - d.x, 1.0 - d.y);
  if (uRot == 3) return vec2(1.0 - d.y, d.x);
  return d;
}
void main() {
  vec2 o = vec2(vPos.x, 1.0 - vPos.y);
  float edge = 1.0;
  // The picture's own frame, in pixels: the whole frame, or its card.
  vec2 box = uOut;
  if (uCard) {
    // This pixel in the card's own frame (turned about the card's centre), with a soft
    // edge a pixel wide; nothing around it.
    box = uCardS * uOut;
    vec2 q = (o - uCardC) * uOut;
    float cs = cos(uTilt), sn = sin(uTilt);
    q = vec2(cs * q.x + sn * q.y, -sn * q.x + cs * q.y);
    o = q / box + 0.5;
    vec2 px = min(o, 1.0 - o) * box;
    edge = clamp(min(px.x, px.y), 0.0, 1.0);
    if (edge <= 0.0) { outColor = vec4(0.0); return; }
  }
  float ao = box.x / box.y;
  float as_ = (uSrc.x * uRect.z) / (uSrc.y * uRect.w);
  vec2 f = uMode == 0
    ? (as_ > ao ? vec2(ao / as_, 1.0) : vec2(1.0, as_ / ao))
    : (as_ > ao ? vec2(1.0, as_ / ao) : vec2(ao / as_, 1.0));
  f /= uZoom;
  vec2 c = uMode == 0 ? clamp(uCenter + uShake * f, f * 0.5, 1.0 - f * 0.5) : vec2(0.5) + uShake * f;
  vec2 d = c + (o - 0.5) * f;
  if (d.x < 0.0 || d.x > 1.0 || d.y < 0.0 || d.y > 1.0) { outColor = vec4(0.0); return; }
  vec3 col = texture(uTex, toTex(uRect.xy + d * uRect.zw)).rgb * uGain;
  // The shot balanced on its own before the look goes on: black point down, white point
  // up, the exposure and the colour towards the look's.
  if (uTone.y > uTone.x) {
    col = pow(clamp((col - uTone.x) / (uTone.y - uTone.x), 0.0, 1.0), vec3(uTone.z));
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = clamp(mix(vec3(l), col, uTone.w), 0.0, 1.0);
  }
  outColor = vec4(col * uAlpha * edge, uAlpha * edge);
}`;

const BLUR = `#version 300 es
precision highp float;
in vec2 vPos;
uniform sampler2D uTex;
uniform vec2 uStep;
out vec4 outColor;
void main() {
  // 13 taps, sigma about 4 texels
  const float w[7] = float[7](0.1016, 0.0976, 0.0865, 0.0707, 0.0534, 0.0372, 0.0239);
  vec4 s = texture(uTex, vPos) * w[0];
  for (int i = 1; i < 7; i++) {
    s += texture(uTex, vPos + uStep * float(i)) * w[i];
    s += texture(uTex, vPos - uStep * float(i)) * w[i];
  }
  outColor = s / 0.8402; // the weights' own sum, so the blur neither brightens nor darkens
}`;

const COPY = `#version 300 es
precision highp float;
in vec2 vPos;
uniform sampler2D uTex;
uniform float uAlpha;
out vec4 outColor;
void main() { outColor = texture(uTex, vPos) * uAlpha; }`;

const FINAL = `#version 300 es
precision highp float;
in vec2 vPos;
uniform sampler2D uScene;
uniform sampler2D uOverlay;
uniform bool uHasOverlay;
uniform int uBlend; // how the captions mix with the picture: 0 over it, else a blend mode
uniform vec2 uOut;
uniform float uWarm, uContrast, uSat, uVig, uGrain, uFade, uGlow, uExposure;
uniform vec3 uShadows, uHighlights;
uniform float uFlash, uBurn, uBurnPhase, uDim, uTime, uSeed, uZoomBlur, uSplit, uMono;
uniform vec2 uMove; // the picture moved, in frame widths and heights (right, down)
uniform float uScale; // the picture scaled about the middle, 1 = as it is
uniform float uSpin; // the picture turned clockwise about the middle, radians
uniform vec2 uStreak; // motion blur along this, in frame widths and heights
uniform float uSpinBlur; // motion blur round the middle, radians
uniform float uBlur; // out of focus, 0 to 1
uniform bool uMips; // the scene has its smaller copies (for the blurs and the glow)
uniform float uGlitch, uInvert, uBars, uLeak, uLeakPhase, uVhs;
out vec4 outColor;
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
// A caption's colour s mixed with the picture b by a blend mode (the W3C's formulas).
vec3 blendWith(vec3 b, vec3 s, int m) {
  if (m == 1) return b * s;
  if (m == 2) return 1.0 - (1.0 - b) * (1.0 - s);
  if (m == 3) return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
  if (m == 4) return min(b, s);
  if (m == 5) return max(b, s);
  if (m == 6) return abs(b - s);
  if (m == 7) return b + s - 2.0 * b * s;
  if (m == 8) {
    vec3 d = mix(sqrt(b), ((16.0 * b - 12.0) * b + 4.0) * b, step(b, vec3(0.25)));
    return mix(b - (1.0 - 2.0 * s) * b * (1.0 - b), b + (2.0 * s - 1.0) * (d - b), step(0.5, s));
  }
  if (m == 9) return min(vec3(1.0), b / max(vec3(1e-3), 1.0 - s));
  return s;
}
// Where the picture shown at q (0 to 1, from the top left) comes from: moved, scaled
// and turned about the middle, in pixels so a turn doesn't stretch it; past its edges,
// its mirror image.
vec2 place(vec2 q) {
  vec2 d = (q - 0.5 - uMove) * uOut;
  float c = cos(uSpin), s = sin(uSpin);
  d = vec2(c * d.x + s * d.y, -s * d.x + c * d.y) / uScale;
  vec2 p = d / uOut + 0.5;
  return 1.0 - abs(1.0 - mod(p, 2.0));
}
vec3 scene(vec2 q, float lod) {
  vec2 p = place(q);
  return textureLod(uScene, vec2(p.x, 1.0 - p.y), uMips ? lod : 0.0).rgb;
}
void main() {
  vec2 o = vec2(vPos.x, 1.0 - vPos.y);
  vec2 q0 = o;
  // A glitch: bands of the picture torn sideways (a new pattern every frame), and blocks
  // of it jumped out of place.
  float torn = 0.0;
  float fs = floor(uTime * 30.0 + 0.5) + uSeed * 17.0;
  if (uGlitch > 0.001) {
    float rows = mix(10.0, 44.0, hash(vec2(fs, 3.1)));
    float band = floor(o.y * rows);
    torn = step(1.0 - 0.55 * uGlitch, hash(vec2(band, fs)));
    q0.x += (hash(vec2(band, fs + 7.0)) - 0.5) * 0.2 * uGlitch * torn;
    vec2 blk = floor(o * vec2(9.0, 16.0) * (1.0 + floor(hash(vec2(fs, 5.0)) * 3.0)));
    if (hash(blk + fs * 0.37) > 1.0 - 0.08 * uGlitch) q0 += (vec2(hash(blk + fs), hash(blk - fs)) - 0.5) * 0.12;
  }
  // A videotape: each line a little out of place (the bottom few torn sideways by the
  // heads switching), and now and then a band of it rolling down.
  if (uVhs > 0.001) {
    float row = floor(o.y * uOut.y / 3.0);
    q0.x += uVhs * (noise(vec2(row * 0.07, uTime * 9.0)) - 0.5) * 4.0 / uOut.x;
    float head = smoothstep(0.955, 1.0, o.y);
    q0.x += uVhs * head * (0.03 + 0.03 * noise(vec2(uTime * 40.0, o.y * 60.0)));
    float roll = fract(uTime * 0.11 + uSeed);
    q0.x += uVhs * smoothstep(0.03, 0.0, abs(o.y - roll)) * (noise(vec2(o.y * 300.0, uTime * 50.0)) - 0.5) * 0.04;
  }
  vec3 c;
  // Blurs: a zoom blur out from the middle, motion along a whip, round a spin, and out of
  // focus, all in one set of taps (on the scene's smaller copies, so they come out smooth).
  float r = length((q0 - 0.5) * uOut);
  float spread = r * (0.14 * uZoomBlur + abs(uSpinBlur)) + length(uStreak * uOut) + 0.06 * uBlur * max(uOut.x, uOut.y);
  if (spread > 1.0) {
    float lod = log2(max(1.0, spread / 10.0));
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 24; i++) {
      float f = (float(i) + 0.5) / 24.0;
      vec2 q = mix(vec2(0.5), q0, 1.0 - 0.14 * uZoomBlur * f) + uStreak * (f - 0.5);
      if (uSpinBlur != 0.0) {
        vec2 d = (q - 0.5) * uOut;
        float a = uSpinBlur * (f - 0.5), ca = cos(a), sa = sin(a);
        q = vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y) / uOut + 0.5;
      }
      float ang = float(i) * 2.39996;
      q += vec2(cos(ang), sin(ang)) * sqrt(f) * 0.03 * uBlur * max(uOut.x, uOut.y) / uOut;
      acc += scene(q, lod);
    }
    c = acc / 24.0;
  } else {
    c = scene(q0, 0.0);
  }
  // A colour split: red pushed out from the middle and blue pulled in on a hit; sideways
  // in a glitch, most in its torn bands.
  if (uSplit > 0.001 || uGlitch > 0.001) {
    vec2 d = (q0 - 0.5) * 0.028 * uSplit + vec2(0.01 * uGlitch * (1.0 + 2.0 * torn), 0.0);
    c.r = scene(q0 + d, 0.0).r;
    c.b = scene(q0 - d, 0.0).b;
  }
  // A videotape's picture: the detail soft, the colour soft and late (a few pixels to the
  // right), and noise in the lines.
  if (uVhs > 0.001) {
    float px = 1.0 / uOut.x;
    vec3 soft = (scene(q0 - vec2(1.5 * px, 0.0), 0.0) + scene(q0, 0.0) + scene(q0 + vec2(1.5 * px, 0.0), 0.0)) / 3.0;
    vec3 wide = vec3(0.0);
    for (int i = -3; i <= 3; i++) wide += scene(q0 + vec2((float(i) * 4.0 - 4.0) * px, 0.0), uMips ? 1.5 : 0.0);
    wide /= 7.0;
    vec3 luma = vec3(0.299, 0.587, 0.114);
    vec3 tape = dot(soft, luma) + (wide - dot(wide, luma));
    tape += (hash(vec2(floor(o.y * uOut.y / 2.0), floor(uTime * 30.0))) - 0.5) * 0.05;
    c = mix(c, tape, uVhs);
  }
  // The highlights glowing into what's around them.
  if (uGlow > 0.001 && uMips) {
    vec3 halo = 0.5 * scene(o, 4.0) + 0.5 * scene(o, 5.5);
    vec3 g = clamp((halo - 0.45) * 1.8, 0.0, 1.0) * uGlow;
    c = 1.0 - (1.0 - clamp(c, 0.0, 1.0)) * (1.0 - g);
  }
  // Exposure, then the white balance towards warm.
  c *= exp2(uExposure);
  c *= vec3(1.0 + 0.07 * uWarm, 1.0 + 0.012 * uWarm, 1.0 - 0.1 * uWarm);
  // A soft filmic S-curve (a little harder in black and white).
  vec3 s = c * c * (3.0 - 2.0 * c);
  c = mix(c, s, clamp(uContrast * 0.55 + 0.3 * uMono, 0.0, 1.0));
  // Split tone: golden highlights, faintly teal shadows; and a look's own colours.
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c += uWarm * 0.05 * vec3(1.0, 0.5, -0.45) * smoothstep(0.45, 1.0, l);
  c += uWarm * 0.03 * vec3(-0.35, 0.08, 0.3) * (1.0 - smoothstep(0.0, 0.35, l));
  c += uShadows * (1.0 - smoothstep(0.0, 0.45, l)) + uHighlights * smoothstep(0.4, 1.0, l);
  l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat * (1.0 - uMono));
  // The blacks lifted to a matte.
  c = mix(vec3(0.2 * uFade), vec3(1.0), clamp(c, 0.0, 1.0));
  // Vignette, by the frame's longer side.
  vec2 q = (o - 0.5) * 2.0 * uOut / max(uOut.x, uOut.y);
  c *= 1.0 - uVig * 0.5 * smoothstep(0.5, 1.5, length(q));
  // Grain, strongest in the mid-tones.
  float g = hash(floor(o * uOut) + vec2(fract(uTime * 7.31) * 173.0, fract(uTime * 3.17) * 211.0)) - 0.5;
  c += g * uGrain * 0.06 * (1.0 - abs(l - 0.5));
  // A glitch's scanlines.
  if (uGlitch > 0.001) c *= 1.0 - 0.2 * uGlitch * step(0.5, fract(o.y * uOut.y / 4.0));
  // Film burn: a warm glow drifting in from an edge, screen-blended.
  if (uBurn > 0.0) {
    float n = fbm(o * vec2(2.4, 1.7) + vec2(uBurnPhase * 1.9, -uBurnPhase * 0.7) + uSeed);
    float edge = 1.0 - smoothstep(-0.1, 0.95, o.x + 0.18 * sin(o.y * 4.0 + uSeed * 3.0));
    float heat = clamp(n * 1.5 + edge * 1.1 - 1.05 + uBurn * 0.55, 0.0, 1.0) * uBurn;
    vec3 bc = mix(vec3(1.0, 0.42, 0.06), vec3(1.0, 0.9, 0.62), smoothstep(0.15, 0.8, heat));
    c = 1.0 - (1.0 - clamp(c, 0.0, 1.0)) * (1.0 - bc * heat);
  }
  // A light leak: warm and pink glows drifting across, screen-blended.
  if (uLeak > 0.001) {
    vec2 asp = uOut / max(uOut.x, uOut.y);
    vec2 a = vec2(-0.3 + 1.6 * uLeakPhase, 0.2 + 0.25 * sin(uSeed * 2.0 + uLeakPhase * 2.5));
    vec2 b = vec2(1.25 - 1.1 * uLeakPhase, 0.85 - 0.3 * uLeakPhase);
    vec2 da = (o - a) * asp, db = (o - b) * asp;
    vec3 lc = vec3(1.0, 0.48, 0.16) * exp(-dot(da, da) / 0.1) + vec3(1.0, 0.25, 0.42) * 0.85 * exp(-dot(db, db) / 0.07) + vec3(1.0, 0.85, 0.6) * 0.3 * exp(-dot(da, da) / 0.02);
    c = 1.0 - (1.0 - clamp(c, 0.0, 1.0)) * (1.0 - clamp(lc * uLeak, 0.0, 1.0));
  }
  c = mix(c, 1.0 - clamp(c, 0.0, 1.0), uInvert);
  c = mix(c, vec3(1.0), uFlash);
  c *= 1.0 - uDim;
  // Letterbox bars, their edges a pixel soft.
  if (uBars > 0.0) c *= clamp(min(o.y, 1.0 - o.y) * uOut.y - uBars * uOut.y + 0.5, 0.0, 1.0);
  if (uHasOverlay) {
    vec4 ov = texture(uOverlay, o);
    if (uBlend == 0) c = ov.rgb + c * (1.0 - ov.a);
    else c = mix(c, blendWith(clamp(c, 0.0, 1.0), ov.a > 0.001 ? ov.rgb / ov.a : vec3(0.0), uBlend), ov.a);
  }
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

type Program = { prog: WebGLProgram; loc: (name: string) => WebGLUniformLocation | null };

function compile(gl: WebGL2RenderingContext, frag: string): Program {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, make(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, make(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Program: ${gl.getProgramInfoLog(prog)}`);
  const cache = new Map<string, WebGLUniformLocation | null>();
  return {
    prog,
    loc: (name) => {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(prog, name));
      return cache.get(name)!;
    },
  };
}

interface Target {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

export class Compositor {
  readonly gl: WebGL2RenderingContext;
  private readonly layer: Program;
  private readonly blur: Program;
  private readonly copy: Program;
  private readonly final: Program;
  private readonly textures: WebGLTexture[] = [];
  private readonly texSize: [number, number][] = [];
  private readonly overlayTex: WebGLTexture;
  private readonly scene: Target;
  private readonly small: [Target, Target];

  constructor(
    readonly canvas: OffscreenCanvas | HTMLCanvasElement,
    readonly W: number,
    readonly H: number,
  ) {
    canvas.width = W;
    canvas.height = H;
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    this.gl = gl;
    this.layer = compile(gl, LAYER);
    this.blur = compile(gl, BLUR);
    this.copy = compile(gl, COPY);
    this.final = compile(gl, FINAL);
    // The shot, the next one, and pictures or clips drawn over them.
    for (let i = 0; i < 2 + OVERLAY_SLOTS; i++) {
      this.textures.push(this.makeTexture(true));
      this.texSize.push([0, 0]);
    }
    this.overlayTex = this.makeTexture(false);
    this.scene = this.makeTarget(W, H);
    const sw = Math.max(8, Math.round(W / 8));
    const sh = Math.max(8, Math.round(H / 8));
    this.small = [this.makeTarget(sw, sh), this.makeTarget(sw, sh)];
    gl.bindVertexArray(gl.createVertexArray());
  }

  private makeTexture(mip: boolean): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return t;
  }

  private makeTarget(w: number, h: number): Target {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fb, tex, w, h };
  }

  /** Put a frame (a VideoFrame, ImageBitmap or canvas) in a layer slot. */
  upload(slot: number, source: TexImageSource, width: number, height: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.textures[slot]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.texSize[slot] = [width, height];
  }

  /** The captions-and-card layer, drawn over everything. */
  uploadOverlay(source: TexImageSource) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.overlayTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  private quad(target: Target | null) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, target ? target.w : this.W, target ? target.h : this.H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private shake: [number, number] = [0, 0];

  private drawLayer(l: LayerDraw, target: Target, mode: 0 | 1, alpha: number, gain = 1) {
    const gl = this.gl;
    const p = this.layer;
    gl.useProgram(p.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[l.slot]);
    gl.uniform1i(p.loc("uTex"), 0);
    gl.uniform2f(p.loc("uOut"), target.w, target.h);
    gl.uniform2f(p.loc("uSrc"), l.srcW, l.srcH);
    gl.uniform2f(p.loc("uCenter"), l.cx, l.cy);
    gl.uniform1f(p.loc("uZoom"), Math.max(1, l.zoom));
    gl.uniform1i(p.loc("uRot"), l.rotation / 90);
    gl.uniform1i(p.loc("uFlip"), l.flip ? 1 : 0);
    gl.uniform1i(p.loc("uMode"), mode);
    gl.uniform1f(p.loc("uAlpha"), alpha);
    gl.uniform1f(p.loc("uGain"), gain);
    const r = l.rect ?? [0, 0, 1, 1];
    gl.uniform4f(p.loc("uRect"), r[0], r[1], r[2] - r[0], r[3] - r[1]);
    gl.uniform2f(p.loc("uShake"), this.shake[0], this.shake[1]);
    gl.uniform1f(p.loc("uTilt"), ((l.tilt ?? 0) * Math.PI) / 180);
    // A photo flying in is a card the frame's shape, in its middle.
    const inset = Math.max(0.05, l.inset ?? 1);
    const card = l.card ?? (inset < 0.999 || Math.abs(l.tilt ?? 0) > 1e-3 ? { x: 0.5, y: 0.5, w: inset, h: inset } : null);
    gl.uniform1i(p.loc("uCard"), card ? 1 : 0);
    gl.uniform2f(p.loc("uCardC"), card?.x ?? 0.5, card?.y ?? 0.5);
    gl.uniform2f(p.loc("uCardS"), Math.max(1e-3, card?.w ?? 1), Math.max(1e-3, card?.h ?? 1));
    const tone = l.tone ?? [0, 0, 1, 1];
    gl.uniform4f(p.loc("uTone"), tone[0], tone[1], tone[2], tone[3]);
    this.quad(target);
  }

  /**
   * The pixels of a layer as it shows, untouched (for balancing a shot: render/tone.ts):
   * drawn at an eighth of the frame, RGBA, transparent where there's no picture.
   */
  measure(l: LayerDraw): Uint8Array {
    const gl = this.gl;
    const [a] = this.small;
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb);
    gl.viewport(0, 0, a.w, a.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const shake = this.shake;
    this.shake = [0, 0];
    this.drawLayer({ ...l, tone: undefined }, a, l.fit === "fit" ? 1 : 0, 1);
    this.shake = shake;
    const px = new Uint8Array(a.w * a.h * 4);
    gl.readPixels(0, 0, a.w, a.h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  }

  draw(f: FrameDraw) {
    const gl = this.gl;
    this.shake = f.shake ?? [0, 0];
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fb);
    gl.viewport(0, 0, this.W, this.H);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (const l of f.layers) {
      if (l.alpha <= 0) continue;
      if (l.fit === "fit") {
        // A blurred, darkened cover copy behind the whole picture.
        const [a, b] = this.small;
        gl.disable(gl.BLEND);
        this.drawLayer({ ...l, zoom: 1.1 }, a, 0, 1, 0.55);
        gl.useProgram(this.blur.prog);
        gl.uniform1i(this.blur.loc("uTex"), 0);
        for (let pass = 0; pass < 2; pass++) {
          gl.bindTexture(gl.TEXTURE_2D, a.tex);
          gl.uniform2f(this.blur.loc("uStep"), 1 / a.w, 0);
          this.quad(b);
          gl.bindTexture(gl.TEXTURE_2D, b.tex);
          gl.uniform2f(this.blur.loc("uStep"), 0, 1 / a.h);
          this.quad(a);
        }
        gl.enable(gl.BLEND);
        gl.useProgram(this.copy.prog);
        gl.bindTexture(gl.TEXTURE_2D, a.tex);
        gl.uniform1i(this.copy.loc("uTex"), 0);
        gl.uniform1f(this.copy.loc("uAlpha"), l.alpha);
        this.quad(this.scene);
        this.drawLayer(l, this.scene, 1, l.alpha);
      } else {
        this.drawLayer(l, this.scene, 0, l.alpha);
      }
    }
    gl.disable(gl.BLEND);

    const p = this.final;
    gl.useProgram(p.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    // The scene's smaller copies, only when a blur or the glow reads them.
    const mips = (f.zoomBlur ?? 0) > 0.001 || (f.blur ?? 0) > 0.001 || (f.grade.glow ?? 0) > 0.001 || (f.vhs ?? 0) > 0.001 || Math.hypot(...(f.streak ?? [0, 0])) > 1e-4 || Math.abs(f.spinBlur ?? 0) > 1e-4;
    if (mips) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.uniform1i(p.loc("uMips"), mips ? 1 : 0);
    gl.uniform1i(p.loc("uScene"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.overlayTex);
    gl.uniform1i(p.loc("uOverlay"), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(p.loc("uHasOverlay"), f.overlay ? 1 : 0);
    gl.uniform1i(p.loc("uBlend"), f.overlayBlend ?? 0);
    gl.uniform2f(p.loc("uOut"), this.W, this.H);
    gl.uniform1f(p.loc("uWarm"), f.grade.warmth);
    gl.uniform1f(p.loc("uContrast"), f.grade.contrast);
    gl.uniform1f(p.loc("uSat"), f.grade.saturation);
    gl.uniform1f(p.loc("uVig"), f.grade.vignette);
    gl.uniform1f(p.loc("uGrain"), f.grade.grain);
    gl.uniform1f(p.loc("uFlash"), f.flash);
    gl.uniform1f(p.loc("uBurn"), f.burn);
    gl.uniform1f(p.loc("uBurnPhase"), f.burnPhase);
    gl.uniform1f(p.loc("uDim"), f.dim);
    gl.uniform1f(p.loc("uTime"), f.time);
    gl.uniform1f(p.loc("uSeed"), f.seed);
    gl.uniform1f(p.loc("uZoomBlur"), f.zoomBlur ?? 0);
    gl.uniform1f(p.loc("uSplit"), f.split ?? 0);
    gl.uniform1f(p.loc("uMono"), f.mono ?? 0);
    gl.uniform1f(p.loc("uFade"), f.grade.fade ?? 0);
    gl.uniform1f(p.loc("uGlow"), f.grade.glow ?? 0);
    gl.uniform3fv(p.loc("uShadows"), f.grade.shadows ?? [0, 0, 0]);
    gl.uniform3fv(p.loc("uHighlights"), f.grade.highlights ?? [0, 0, 0]);
    gl.uniform2fv(p.loc("uMove"), f.move ?? [0, 0]);
    gl.uniform1f(p.loc("uScale"), Math.max(0.2, f.scale ?? 1));
    gl.uniform1f(p.loc("uSpin"), f.spin ?? 0);
    gl.uniform2fv(p.loc("uStreak"), f.streak ?? [0, 0]);
    gl.uniform1f(p.loc("uSpinBlur"), f.spinBlur ?? 0);
    gl.uniform1f(p.loc("uBlur"), f.blur ?? 0);
    gl.uniform1f(p.loc("uGlitch"), f.glitch ?? 0);
    gl.uniform1f(p.loc("uInvert"), f.invert ?? 0);
    gl.uniform1f(p.loc("uBars"), f.bars ?? 0);
    gl.uniform1f(p.loc("uLeak"), f.leak ?? 0);
    gl.uniform1f(p.loc("uLeakPhase"), f.leakPhase ?? 0);
    gl.uniform1f(p.loc("uVhs"), f.vhs ?? 0);
    gl.uniform1f(p.loc("uExposure"), f.grade.exposure ?? 0);
    this.quad(null);
  }

  dispose() {
    const gl = this.gl;
    for (const t of this.textures) gl.deleteTexture(t);
    gl.deleteTexture(this.overlayTex);
    for (const t of [this.scene, ...this.small]) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fb);
    }
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

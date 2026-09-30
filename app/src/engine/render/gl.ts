/**
 * The compositor: every frame of an edit is drawn here on the GPU. Footage is
 * cropped (following the subject), zoomed and graded; photos and still shots get
 * a slow push; flashes, film burns and dips to black are drawn over it; captions
 * and the demo card come in last from a 2D canvas, untouched by the grade.
 */
import type { Grade } from "../plan/types";

export type Rotation = 0 | 90 | 180 | 270;

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
}

export interface FrameDraw {
  layers: LayerDraw[];
  grade: Grade;
  flash: number;
  burn: number;
  burnPhase: number;
  dim: number;
  overlay: boolean;
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
uniform float uInset; // the card's size in the frame (1: the whole frame)
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
  if (uInset < 0.999 || abs(uTilt) > 1e-4) {
    // This pixel in the card's own frame (the frame's shape, turned and shrunk about the
    // middle), with a soft edge a pixel wide; black around it.
    vec2 q = (o - 0.5) * uOut;
    float cs = cos(uTilt), sn = sin(uTilt);
    q = vec2(cs * q.x + sn * q.y, -sn * q.x + cs * q.y) / uInset;
    o = q / uOut + 0.5;
    vec2 px = min(o, 1.0 - o) * uOut * uInset;
    edge = clamp(min(px.x, px.y), 0.0, 1.0);
    if (edge <= 0.0) { outColor = vec4(0.0); return; }
  }
  float ao = uOut.x / uOut.y;
  float as_ = (uSrc.x * uRect.z) / (uSrc.y * uRect.w);
  vec2 f = uMode == 0
    ? (as_ > ao ? vec2(ao / as_, 1.0) : vec2(1.0, as_ / ao))
    : (as_ > ao ? vec2(1.0, as_ / ao) : vec2(ao / as_, 1.0));
  f /= uZoom;
  vec2 c = uMode == 0 ? clamp(uCenter + uShake * f, f * 0.5, 1.0 - f * 0.5) : vec2(0.5) + uShake * f;
  vec2 d = c + (o - 0.5) * f;
  if (d.x < 0.0 || d.x > 1.0 || d.y < 0.0 || d.y > 1.0) { outColor = vec4(0.0); return; }
  vec3 col = texture(uTex, toTex(uRect.xy + d * uRect.zw)).rgb * uGain;
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
uniform vec2 uOut;
uniform float uWarm, uContrast, uSat, uVig, uGrain;
uniform float uFlash, uBurn, uBurnPhase, uDim, uTime, uSeed, uZoomBlur, uSplit, uMono;
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
void main() {
  vec2 o = vec2(vPos.x, 1.0 - vPos.y);
  vec3 c = texture(uScene, vPos).rgb;
  // A zoom blur across a cut: the picture smeared out from the middle.
  if (uZoomBlur > 0.001) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 16; i++) acc += texture(uScene, mix(vec2(0.5), vPos, 1.0 - 0.14 * uZoomBlur * float(i) / 15.0)).rgb;
    c = acc / 16.0;
  }
  // A colour split on a hit: red pushed out from the middle, blue pulled in.
  if (uSplit > 0.001) {
    vec2 d = (vPos - 0.5) * 0.028 * uSplit;
    c.r = texture(uScene, vPos + d).r;
    c.b = texture(uScene, vPos - d).b;
  }
  // White balance towards warm.
  c *= vec3(1.0 + 0.07 * uWarm, 1.0 + 0.012 * uWarm, 1.0 - 0.1 * uWarm);
  // A soft filmic S-curve (a little harder in black and white).
  vec3 s = c * c * (3.0 - 2.0 * c);
  c = mix(c, s, clamp(uContrast * 0.55 + 0.3 * uMono, 0.0, 1.0));
  // Split tone: golden highlights, faintly teal shadows.
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c += uWarm * 0.05 * vec3(1.0, 0.5, -0.45) * smoothstep(0.45, 1.0, l);
  c += uWarm * 0.03 * vec3(-0.35, 0.08, 0.3) * (1.0 - smoothstep(0.0, 0.35, l));
  l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat * (1.0 - uMono));
  // Vignette, by the frame's longer side.
  vec2 q = (o - 0.5) * 2.0 * uOut / max(uOut.x, uOut.y);
  c *= 1.0 - uVig * 0.5 * smoothstep(0.5, 1.5, length(q));
  // Grain, strongest in the mid-tones.
  float g = hash(floor(o * uOut) + vec2(fract(uTime * 7.31) * 173.0, fract(uTime * 3.17) * 211.0)) - 0.5;
  c += g * uGrain * 0.06 * (1.0 - abs(l - 0.5));
  // Film burn: a warm glow drifting in from an edge, screen-blended.
  if (uBurn > 0.0) {
    float n = fbm(o * vec2(2.4, 1.7) + vec2(uBurnPhase * 1.9, -uBurnPhase * 0.7) + uSeed);
    float edge = 1.0 - smoothstep(-0.1, 0.95, o.x + 0.18 * sin(o.y * 4.0 + uSeed * 3.0));
    float heat = clamp(n * 1.5 + edge * 1.1 - 1.05 + uBurn * 0.55, 0.0, 1.0) * uBurn;
    vec3 bc = mix(vec3(1.0, 0.42, 0.06), vec3(1.0, 0.9, 0.62), smoothstep(0.15, 0.8, heat));
    c = 1.0 - (1.0 - clamp(c, 0.0, 1.0)) * (1.0 - bc * heat);
  }
  c = mix(c, vec3(1.0), uFlash);
  c *= 1.0 - uDim;
  if (uHasOverlay) {
    vec4 ov = texture(uOverlay, o);
    c = ov.rgb + c * (1.0 - ov.a);
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
    for (let i = 0; i < 2; i++) {
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
    gl.uniform1f(p.loc("uInset"), Math.max(0.05, l.inset ?? 1));
    this.quad(target);
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
    gl.uniform1i(p.loc("uScene"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.overlayTex);
    gl.uniform1i(p.loc("uOverlay"), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(p.loc("uHasOverlay"), f.overlay ? 1 : 0);
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

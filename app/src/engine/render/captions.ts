/**
 * The six caption styles of the reference edits (docs/edit-analysis.md), with
 * sizes and positions measured from their frames, and the edit designs' own
 * (plan/designs.ts). Sizes scale with the frame's short side, so a 9:16 and a 4:3
 * export read the same.
 */
import type { Blend, CaptionEvent, Face, TextLook } from "../plan/types";
import { FONT } from "./fonts";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface Style {
  font: (px: number) => string;
  /** font size as a share of the frame's short side */
  size: number;
  /** vertical centre of the block, 0 (top) to 1 (bottom) */
  y: number;
  x: number;
  lineHeight: number;
  box: boolean;
  outline: boolean;
  shadow: boolean;
  transform: (s: string) => string;
  maxWidth: number;
  /** space between the letters, in ems */
  spacing?: number;
  /** red and cyan copies either side of the white (a glitch's) */
  chroma?: boolean;
  /** grown until its widest line is this share of the frame's width (a word on the beat filling the frame), up to `most` of the short side */
  fill?: number;
  most?: number;
  /** set from its left edge (at x) instead of its centre */
  left?: boolean;
}

const STYLES: Record<CaptionEvent["style"], Style> = {
  // nio dialogue: lowercase, white on a tight black box, bottom centre
  doc: { font: (px) => `500 ${px}px ${FONT.sans}`, size: 0.036, y: 0.93, x: 0.5, lineHeight: 1.3, box: true, outline: false, shadow: false, transform: (s) => s.toLowerCase(), maxWidth: 0.84 },
  // the POV label held over a montage: condensed, lowercase, lower third
  pov: { font: (px) => `500 ${px}px ${FONT.condensed}`, size: 0.04, y: 0.86, x: 0.5, lineHeight: 1.25, box: false, outline: false, shadow: true, transform: (s) => s, maxWidth: 0.8 },
  // shouting in a reaction: caps on the black box
  shout: { font: (px) => `600 ${px}px ${FONT.sans}`, size: 0.038, y: 0.93, x: 0.5, lineHeight: 1.3, box: true, outline: false, shadow: false, transform: (s) => s.toUpperCase(), maxWidth: 0.84 },
  // lyrics: tall condensed words with a thin outline, off-centre, high
  lyric: { font: (px) => `400 ${px}px ${FONT.tall}`, size: 0.062, y: 0.23, x: 0.64, lineHeight: 1.05, box: false, outline: true, shadow: false, transform: (s) => s.toLowerCase(), maxWidth: 0.6 },
  // mico's mood line: a small italic serif, dead centre
  mood: { font: (px) => `italic 400 ${px}px ${FONT.serif}`, size: 0.042, y: 0.5, x: 0.5, lineHeight: 1.2, box: false, outline: false, shadow: true, transform: (s) => s, maxWidth: 0.8 },
  // the text meme: small bold lines, centred in the upper third
  meme: { font: (px) => `700 ${px}px ${FONT.sans}`, size: 0.029, y: 0.3, x: 0.5, lineHeight: 1.4, box: false, outline: false, shadow: true, transform: (s) => s, maxWidth: 0.56 },
  // the edit designs' (plan/designs.ts): big tall capitals, a word at a time on the beat, filling the frame
  impact: { font: (px) => `400 ${px}px ${FONT.tall}`, size: 0.12, y: 0.5, x: 0.5, lineHeight: 0.95, box: false, outline: false, shadow: true, transform: (s) => s.toUpperCase(), maxWidth: 0.86, spacing: 0.02, fill: 0.62, most: 0.26 },
  // a film's title: small capitals spaced wide
  film: { font: (px) => `500 ${px}px ${FONT.sans}`, size: 0.038, y: 0.5, x: 0.5, lineHeight: 1.5, box: false, outline: false, shadow: true, transform: (s) => s.toUpperCase(), maxWidth: 0.86, spacing: 0.42 },
  // condensed capitals with red and cyan either side
  glitch: { font: (px) => `500 ${px}px ${FONT.condensed}`, size: 0.075, y: 0.5, x: 0.5, lineHeight: 1.05, box: false, outline: false, shadow: false, transform: (s) => s.toUpperCase(), maxWidth: 0.86, spacing: 0.04, chroma: true, fill: 0.56, most: 0.2 },
  // a VCR's on-screen lettering, top left
  osd: { font: (px) => `400 ${px}px ${FONT.mono}`, size: 0.062, y: 0.08, x: 0.07, lineHeight: 1.1, box: false, outline: false, shadow: true, transform: (s) => s.toUpperCase(), maxWidth: 0.86, spacing: 0.04, left: true },
};

/** How big a popping caption is `frames` after it lands: from seven tenths, a little too big two frames on, settled by the fifth. */
export function popScale(frames: number): number {
  if (frames >= 5) return 1;
  if (frames <= 2) return 0.7 + 0.225 * Math.max(0, frames);
  return 1.15 - 0.05 * (frames - 2);
}

function wrap(ctx: Ctx, text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = words[0];
    for (const w of words.slice(1)) {
      const next = `${line} ${w}`;
      if (ctx.measureText(next).width <= max) line = next;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

/** Each face a caption of the user's own design can take: its family, and its weight when it has only the one. */
export const FACES: Record<Face, { name: string; family: string; weight?: number; italic?: boolean }> = {
  inter: { name: "Inter", family: FONT.sans },
  montserrat: { name: "Montserrat", family: FONT.montserrat },
  poppins: { name: "Poppins", family: FONT.poppins, weight: 800 },
  anton: { name: "Anton", family: FONT.anton, weight: 400 },
  bebas: { name: "Bebas Neue", family: FONT.bebas, weight: 400 },
  gothic: { name: "League Gothic", family: FONT.tall, weight: 400 },
  oswald: { name: "Oswald", family: FONT.condensed, weight: 500 },
  serif: { name: "Instrument Serif", family: FONT.serif, weight: 400, italic: true },
  playfair: { name: "Playfair Display", family: FONT.playfair, italic: true },
  mono: { name: "VT323", family: FONT.mono, weight: 400 },
};

/** The canvas's name for a blend mode (its globalCompositeOperation), for previews. */
export const CANVAS_BLEND: Record<Blend, GlobalCompositeOperation> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  difference: "difference",
  exclusion: "exclusion",
  "soft-light": "soft-light",
  "color-dodge": "color-dodge",
};

/** The compositor's number for a blend mode (render/gl.ts). */
export const BLEND_INDEX: Record<Blend, number> = { normal: 0, multiply: 1, screen: 2, overlay: 3, darken: 4, lighten: 5, difference: 6, exclusion: 7, "soft-light": 8, "color-dodge": 9 };

const BASE_LOOK: TextLook = {
  font: "montserrat",
  weight: 800,
  size: 0.075,
  color: "#ffffff",
  stroke: 0.09,
  strokeColor: "#000000",
  shadow: 0.35,
  shadowColor: "#000000",
  box: false,
  boxColor: "#000000",
  boxOpacity: 0.7,
  blend: "normal",
  x: 0.5,
  y: 0.62,
  align: "center",
  case: "typed",
  spacing: 0,
  width: 0.84,
  rotate: 0,
  opacity: 1,
  animate: "design",
};

/** Looks to start a caption of the user's own design from: CapCut's most used, and the reference editors'. */
export const TEXT_LOOKS: { id: string; name: string; look: TextLook }[] = [
  { id: "classic", name: "Classic", look: BASE_LOOK },
  { id: "hype", name: "Hype", look: { ...BASE_LOOK, weight: 900, case: "upper", color: "#ffe14d", stroke: 0.11, size: 0.085, animate: "words" } },
  { id: "box", name: "Box", look: { ...BASE_LOOK, font: "inter", weight: 700, color: "#111111", stroke: 0, shadow: 0, box: true, boxColor: "#ffffff", boxOpacity: 1, size: 0.055, y: 0.7 } },
  { id: "serif", name: "Serif", look: { ...BASE_LOOK, font: "playfair", weight: 500, stroke: 0, shadow: 0.7, size: 0.07, y: 0.5, animate: "fade" } },
  { id: "impact", name: "Impact", look: { ...BASE_LOOK, font: "anton", case: "upper", stroke: 0, shadow: 0.45, size: 0.12, y: 0.5, animate: "pop" } },
  { id: "ink", name: "Ink", look: { ...BASE_LOOK, font: "bebas", case: "upper", color: "#b3121e", stroke: 0, shadow: 0, size: 0.16, y: 0.5, width: 0.94, blend: "multiply", animate: "pop" } },
  { id: "invert", name: "Invert", look: { ...BASE_LOOK, font: "anton", case: "upper", stroke: 0, shadow: 0, size: 0.14, y: 0.5, width: 0.94, blend: "difference", animate: "words" } },
  { id: "tape", name: "Tape", look: { ...BASE_LOOK, font: "mono", weight: 400, case: "upper", stroke: 0, shadow: 0, box: true, boxOpacity: 0.55, size: 0.065, y: 0.2, animate: "type" } },
  { id: "glow", name: "Glow", look: { ...BASE_LOOK, font: "poppins", stroke: 0, shadow: 1, shadowColor: "#ffd27a", size: 0.08, animate: "fade" } },
  // nio.trade's label ("kimchi after retiring:") and its subtitles: white on a square black box, lowercase, plain.
  { id: "label", name: "Label", look: { ...BASE_LOOK, font: "inter", weight: 500, case: "lower", stroke: 0, shadow: 0, box: true, boxColor: "#000000", boxOpacity: 1, size: 0.05, y: 0.72, animate: "none" } },
  { id: "subtitle", name: "Subtitle", look: { ...BASE_LOOK, font: "inter", weight: 400, case: "lower", stroke: 0, shadow: 0, box: true, boxColor: "#000000", boxOpacity: 1, size: 0.042, y: 0.78, width: 0.9, animate: "none" } },
  // gillioniare's meme: small heavy rounded-sans lowercase, white with a thin hard black outline, high in the frame.
  { id: "meme", name: "Meme", look: { ...BASE_LOOK, font: "montserrat", weight: 800, case: "lower", stroke: 0.12, shadow: 0, size: 0.034, y: 0.22, width: 0.7, animate: "none" } },
  // The phone's own text (Instagram's Classic): small, plain white, dead centre (brezscales).
  { id: "phone", name: "Phone", look: { ...BASE_LOOK, font: "inter", weight: 600, stroke: 0, shadow: 0, size: 0.034, y: 0.5, width: 0.6, animate: "none" } },
  // mico's: a small serif italic, dead centre, held the whole edit.
  { id: "signature", name: "Signature", look: { ...BASE_LOOK, font: "playfair", weight: 400, stroke: 0, shadow: 0, size: 0.04, y: 0.5, animate: "none" } },
];

/** The look the caption editor opens on. */
export const DEFAULT_LOOK: TextLook = BASE_LOOK;

/** A colour (#rgb or #rrggbb) at an opacity, for the canvas. */
function withAlpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h.padEnd(6, "0");
  const n = parseInt(full.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

export const faceFont = (look: Pick<TextLook, "font" | "weight">, px: number) => {
  const f = FACES[look.font];
  return `${f.italic ? "italic " : ""}${f.weight ?? look.weight} ${px}px ${f.family}`;
};

/**
 * A caption of the user's own design: its face, size and colour, an outline, a shadow,
 * a box behind each line, where it sits and how it's turned. `typed` (0 to 1) shows
 * only that much of its letters (typed out); `scale` pops it about its middle. The
 * blend mode isn't drawn here: the compositor mixes the whole caption layer with the
 * picture (a preview passes `blend` to draw it with the canvas's own).
 */
export function drawLook(ctx: Ctx, W: number, H: number, text: string, look: TextLook, alpha = 1, scale = 1, typed = 1, blend = false) {
  const px = Math.max(4, Math.round(Math.min(W, H) * look.size));
  ctx.save();
  ctx.globalAlpha = alpha * look.opacity;
  if (blend) ctx.globalCompositeOperation = CANVAS_BLEND[look.blend];
  ctx.font = faceFont(look, px);
  const gap = "letterSpacing" in ctx ? look.spacing * px : 0;
  if (gap) ctx.letterSpacing = `${gap}px`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const cased = look.case === "upper" ? text.toUpperCase() : look.case === "lower" ? text.toLowerCase() : text;
  let lines = wrap(ctx, cased, W * look.width);
  if (typed < 1) {
    let left = Math.ceil(typed * lines.reduce((a, l) => a + l.length, 0));
    lines = lines.map((l) => {
      const keep = l.slice(0, Math.max(0, left));
      left -= l.length;
      return keep;
    });
  }
  const widths = lines.map((l) => ctx.measureText(l).width - gap);
  const block = Math.max(1, ...widths);
  const lh = px * 1.18;
  ctx.translate(W * look.x, H * look.y);
  ctx.rotate((look.rotate * Math.PI) / 180);
  if (scale !== 1) ctx.scale(scale, scale);
  const top = -((lines.length - 1) * lh) / 2;
  lines.forEach((line, i) => {
    if (!line) return;
    const w = widths[i];
    const x = look.align === "center" ? -w / 2 : look.align === "left" ? -block / 2 : block / 2 - w;
    const y = top + i * lh;
    if (look.box) {
      const pad = px * 0.28;
      ctx.save();
      ctx.globalAlpha *= look.boxOpacity;
      ctx.fillStyle = look.boxColor;
      ctx.beginPath();
      ctx.roundRect(x - pad, y - px * 0.62, w + 2 * pad, px * 1.24, px * 0.16);
      ctx.fill();
      ctx.restore();
    }
    if (look.shadow > 0) {
      ctx.shadowColor = withAlpha(look.shadowColor, 0.75 * look.shadow);
      ctx.shadowBlur = px * 0.45 * look.shadow;
      ctx.shadowOffsetY = px * 0.06 * look.shadow;
    }
    if (look.stroke > 0) {
      ctx.lineJoin = "round";
      ctx.lineWidth = 2 * look.stroke * px;
      ctx.strokeStyle = look.strokeColor;
      ctx.strokeText(line, x, y);
      ctx.shadowColor = "transparent";
    }
    ctx.fillStyle = look.color;
    ctx.fillText(line, x, y);
    ctx.shadowColor = "transparent";
  });
  ctx.restore();
}

/** Draw a caption at full opacity times `alpha`, scaled about its middle by `scale` (a pop), `typed` of its letters shown. */
export function drawCaption(ctx: Ctx, W: number, H: number, ev: CaptionEvent, alpha = 1, scale = 1, typed = 1) {
  if (ev.look) return drawLook(ctx, W, H, ev.text, ev.look, alpha, scale, typed);
  const st = STYLES[ev.style];
  let px = Math.round(Math.min(W, H) * st.size);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = st.font(px);
  if (st.fill) {
    // (Its longest line grown to fill the width it's given, up to the most it may be.)
    const widest = Math.max(...st.transform(ev.text).split("\n").map((l) => ctx.measureText(l).width), 1);
    px = Math.round(Math.max(px, Math.min(Math.min(W, H) * (st.most ?? st.size), (px * st.fill * W) / widest)));
    ctx.font = st.font(px);
  }
  ctx.textAlign = st.left ? "left" : "center";
  ctx.textBaseline = "middle";
  // (Letter spacing adds a space after the last letter too: half of it back, to stay centred.)
  const gap = st.spacing && "letterSpacing" in ctx ? st.spacing * px : 0;
  if (gap) ctx.letterSpacing = `${gap}px`;
  const text = st.transform(ev.text);
  const lines = wrap(ctx, text, W * st.maxWidth);
  const lh = px * st.lineHeight;
  const cx = W * (ev.x ?? st.x) + (st.left ? 0 : gap / 2);
  // In a tall frame the app's own caption, name and buttons cover the bottom third
  // (Reels keeps the lower 35% for them), so bottom captions sit higher there.
  const tall = H / W > 1.5;
  const baseY = tall && st.y > 0.8 ? 0.64 : st.y;
  const cy = H * (ev.y ?? baseY);
  const top = cy - ((lines.length - 1) * lh) / 2;
  if (scale !== 1) {
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
  }
  lines.forEach((line, i) => {
    const y = top + i * lh;
    if (!line) return;
    if (st.box) {
      // Instagram's "Classic" text with its background on: a tight box per line.
      const m = ctx.measureText(line);
      const padX = px * 0.28;
      const asc = px * 0.74;
      const desc = px * 0.3;
      ctx.fillStyle = "rgba(0,0,0,0.92)";
      ctx.beginPath();
      ctx.roundRect(cx - m.width / 2 - padX, y - asc + px * 0.05, m.width + 2 * padX, asc + desc, px * 0.12);
      ctx.fill();
    }
    if (st.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = px * 0.35;
      ctx.shadowOffsetY = px * 0.04;
    }
    if (st.outline) {
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, px * 0.07);
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(line, cx, y);
    }
    if (st.chroma) {
      const d = Math.max(2, px * 0.045);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,0,60,0.9)";
      ctx.fillText(line, cx - d, y);
      ctx.fillStyle = "rgba(0,230,255,0.9)";
      ctx.fillText(line, cx + d, y);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.fillStyle = "#fff";
    ctx.fillText(line, cx, y);
    ctx.shadowColor = "transparent";
  });
  ctx.restore();
}

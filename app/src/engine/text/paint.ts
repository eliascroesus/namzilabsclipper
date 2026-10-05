/**
 * Drawing a word in a style: its glow first, then its shadow and outline, then its fill
 * (a colour or a gradient across the word or its line), all mixed into the picture by
 * the style's blend mode, at the opacity, scale, offset, blur and reveal its animation
 * gives it at that moment.
 */
import { AT_REST, type MotionState } from "./motion";
import { fontOf, setStyleFont, type Fill, type TextStyle } from "./style";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface WordDraw {
  /** as drawn (cased already) */
  text: string;
  /** the word's left edge (its advance box) and baseline, in pixels */
  x: number;
  y: number;
  /** the font size, pixels */
  px: number;
  style: TextStyle;
  /** what a gradient spans (the word's own box when unset) */
  span?: Box;
  state?: MotionState;
}

/** How wide a word is in a style at a size (its advance, letter spacing included), and how far its letters reach above and below the baseline. */
export function measureWord(ctx: Ctx, style: TextStyle, px: number, text: string): { width: number; up: number; down: number } {
  setStyleFont(ctx, style, px);
  const m = ctx.measureText(text);
  const f = fontOf(style).metrics;
  return { width: m.width, up: m.actualBoundingBoxAscent || f.cap * px, down: m.actualBoundingBoxDescent || 0 };
}

/** The word's box (pixels): its advance across, cap height up to its descent down. */
export function wordBox(w: Pick<WordDraw, "x" | "y" | "px" | "style">, width: number): Box {
  const f = fontOf(w.style).metrics;
  return { x0: w.x, x1: w.x + width, y0: w.y - Math.max(f.cap, f.xh * 1.3) * w.px, y1: w.y + f.desc * 0.5 * w.px };
}

/** A canvas paint for a fill over a box. */
export function paintFor(ctx: Ctx, fill: Fill, b: Box): string | CanvasGradient {
  if (fill.kind === "solid") return fill.color;
  const n = fill.colors.length;
  const at = (i: number) => Math.min(1, Math.max(0, fill.stops?.[i] ?? (n > 1 ? i / (n - 1) : 0)));
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  let g: CanvasGradient;
  if (fill.kind === "linear") {
    const a = (fill.angle * Math.PI) / 180;
    const [dx, dy] = [Math.cos(a), Math.sin(a)];
    // Half the box's extent along the gradient's line, so the first and last colours sit on its edges.
    const half = (Math.abs((b.x1 - b.x0) * dx) + Math.abs((b.y1 - b.y0) * dy)) / 2;
    g = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
  } else {
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2);
  }
  fill.colors.forEach((c, i) => g.addColorStop(at(i), c));
  return g;
}

/** Draw one word. */
export function drawWord(ctx: Ctx, w: WordDraw) {
  const s = w.style;
  const st = w.state ?? AT_REST;
  const alpha = st.alpha * s.opacity;
  if (alpha <= 0.002 || st.letters <= 0 || st.wipe <= 0) return;
  setStyleFont(ctx, s, w.px);
  const full = ctx.measureText(w.text);
  const width = full.width;
  const box = wordBox(w, width);
  // Typed out: the letters so far.
  const letters = [...w.text];
  const text = st.letters < 1 ? letters.slice(0, Math.max(1, Math.round(st.letters * letters.length))).join("") : w.text;
  ctx.save();
  ctx.globalCompositeOperation = s.blend === "normal" ? "source-over" : s.blend;
  ctx.globalAlpha = alpha;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  // Its move: scaled about its middle, then offset.
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  ctx.translate(cx + st.dx * w.px, cy + st.dy * w.px);
  if (st.scale !== 1) ctx.scale(st.scale, st.scale);
  // A stretch up from the baseline (in the word's own frame, so it grows from where it stands).
  if (st.sy !== undefined && st.sy !== 1) {
    ctx.translate(0, w.y - cy);
    ctx.scale(1, Math.max(0.001, st.sy));
    ctx.translate(0, cy - w.y);
  }
  // A turn and a lean of the word, about its middle.
  if (s.rotate) ctx.rotate((s.rotate * Math.PI) / 180);
  if (s.skew) ctx.transform(1, 0, -Math.tan((s.skew * Math.PI) / 180), 1, 0, 0);
  ctx.translate(-cx, -cy);
  const blur = (st.blur + (s.blur ?? 0)) * w.px;
  if (blur > 0.3) ctx.filter = `blur(${blur.toFixed(1)}px)`;
  // A wipe: only what the edge has passed.
  if (st.wipe < 1) {
    ctx.beginPath();
    ctx.rect(box.x0 - w.px, box.y0 - w.px, (box.x1 - box.x0) * st.wipe + w.px, box.y1 - box.y0 + 2 * w.px);
    ctx.clip();
  }
  const scale = st.scale;
  // The glow: the letters blurred out in its colour, under everything.
  if (s.glow && s.glow.strength > 0) {
    ctx.shadowColor = s.glow.color;
    ctx.shadowBlur = s.glow.blur * w.px * scale;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = s.glow.color;
    const passes = 1 + Math.round(2 * Math.min(1, s.glow.strength));
    for (let i = 0; i < passes; i++) ctx.fillText(text, w.x, w.y);
    ctx.shadowColor = "transparent";
  }
  if (s.shadow) {
    ctx.shadowColor = s.shadow.color;
    ctx.shadowBlur = s.shadow.blur * w.px * scale;
    ctx.shadowOffsetX = s.shadow.x * w.px * scale;
    ctx.shadowOffsetY = s.shadow.y * w.px * scale;
  }
  const paint = paintFor(ctx, s.fill, s.fillSpan === "line" && w.span ? w.span : box);
  if (s.stroke && s.stroke.width > 0) {
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = s.stroke.width * w.px * 2;
    ctx.strokeStyle = s.stroke.color;
    ctx.strokeText(text, w.x, w.y);
    ctx.shadowColor = "transparent";
  }
  ctx.fillStyle = paint;
  ctx.fillText(text, w.x, w.y);
  ctx.restore();
}

/** A box behind words (pixels), in a style's box colour. */
export function drawBox(ctx: Ctx, s: TextStyle, b: Box, px: number, alpha = 1) {
  if (!s.box) return;
  const pad = s.box.pad * px;
  ctx.save();
  ctx.globalAlpha = alpha * s.opacity;
  ctx.fillStyle = s.box.color;
  ctx.beginPath();
  ctx.roundRect(b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + 2 * pad, b.y1 - b.y0 + 2 * pad, s.box.radius * px);
  ctx.fill();
  ctx.restore();
}

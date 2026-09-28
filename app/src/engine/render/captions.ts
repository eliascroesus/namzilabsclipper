/**
 * The six caption styles of the reference edits (docs/edit-analysis.md), with
 * sizes and positions measured from their frames. Sizes scale with the frame's
 * short side, so a 9:16 and a 4:3 export read the same.
 */
import type { CaptionEvent } from "../plan/types";
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
};

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

/** Draw a caption at full opacity times `alpha`. */
export function drawCaption(ctx: Ctx, W: number, H: number, ev: CaptionEvent, alpha = 1) {
  const st = STYLES[ev.style];
  const px = Math.round(Math.min(W, H) * st.size);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = st.font(px);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const text = st.transform(ev.text);
  const lines = wrap(ctx, text, W * st.maxWidth);
  const lh = px * st.lineHeight;
  const cx = W * st.x;
  // In a tall frame the app's own caption, name and buttons cover the bottom third
  // (Reels keeps the lower 35% for them), so bottom captions sit higher there.
  const tall = H / W > 1.5;
  const baseY = tall && st.y > 0.8 ? 0.64 : st.y;
  const cy = H * (ev.y ?? baseY);
  const top = cy - ((lines.length - 1) * lh) / 2;
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
    ctx.fillStyle = "#fff";
    ctx.fillText(line, cx, y);
    ctx.shadowColor = "transparent";
  });
  ctx.restore();
}

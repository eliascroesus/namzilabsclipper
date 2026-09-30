/**
 * Captions the way the reference sets them: the words broken into lines and
 * captions (pages), each line sized (fitted to one width, or all one size),
 * placed and coloured as measured, and each word coming on as it's said.
 */
import { FONT } from "../engine/render/fonts";
import type { CaptionLook, CaptionPage, FontFamily, PlanWord } from "./types";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const FAMILY: Record<FontFamily, string> = { sans: FONT.sans, condensed: FONT.condensed, tall: FONT.tall, serif: FONT.serif };

const ends = (w: string) => /[.!?…]["”')\]]*$/.test(w);
const pauses = (w: string) => /[,;:–-]["”')\]]*$/.test(w);

/**
 * Words into captions: a sentence's end, or a pause of 0.35 s or more, ends a
 * caption; lines fill up to the reference's letters per line, breaking after a
 * comma when the line is at least half full; a caption holds the reference's
 * number of lines.
 */
export function paginate(words: PlanWord[], look: CaptionLook): CaptionPage[] {
  const pages: CaptionPage[] = [];
  let lines: PlanWord[][] = [];
  let line: PlanWord[] = [];
  const len = (l: PlanWord[]) => l.reduce((a, w) => a + w.text.length, 0) + Math.max(0, l.length - 1);
  const flushPage = () => {
    if (line.length) lines.push(line);
    line = [];
    if (lines.length) pages.push({ start: lines[0][0].start, end: lines[lines.length - 1][lines[lines.length - 1].length - 1].end, lines });
    lines = [];
  };
  const flushLine = () => {
    if (line.length) lines.push(line);
    line = [];
    if (lines.length >= look.lines) flushPage();
  };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (prev && w.start - prev.end >= 0.35) flushPage();
    if (line.length && len([...line, w]) > look.chars) flushLine();
    line.push(w);
    const next = words[i + 1];
    if (ends(w.text)) flushPage();
    else if (pauses(w.text) && len(line) >= look.chars / 2 && next) flushLine();
  });
  flushPage();
  // Each caption stays until the next starts, or a little past its last word.
  for (let i = 0; i < pages.length; i++) {
    const next = pages[i + 1];
    pages[i].end = Math.min(next ? next.start : Infinity, pages[i].end + look.hold);
  }
  return pages;
}

export interface LaidWord {
  text: string;
  start: number;
  end: number;
  x: number;
  /** baseline */
  y: number;
}

export interface LaidLine {
  size: number;
  y: number;
  x0: number;
  x1: number;
  words: LaidWord[];
}

const cased = (s: string, look: CaptionLook) => (look.case === "upper" ? s.toUpperCase() : look.case === "lower" ? s.toLowerCase() : s);

export function font(look: CaptionLook, px: number): string {
  return `${look.weight} ${Math.round(px * 10) / 10}px ${FAMILY[look.font]}`;
}

function setFont(ctx: Ctx, look: CaptionLook, px: number) {
  ctx.font = font(look, px);
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${(look.tracking * px).toFixed(2)}px`;
}

/** Where every word of a caption goes on a W × H frame. */
export function layoutPage(ctx: Ctx, look: CaptionLook, page: CaptionPage, W: number, H: number): LaidLine[] {
  const maxPx = look.maxSize * H;
  const minPx = Math.min(maxPx, look.minSize * H);
  const room = look.width * W;
  const out: LaidLine[] = [];
  let prev: LaidLine | null = null;
  for (const words of page.lines) {
    const texts = words.map((w) => cased(w.text, look));
    setFont(ctx, look, maxPx);
    const natural = ctx.measureText(texts.join(" ")).width;
    // Fitted: as big as fills the width, never over the biggest; otherwise shrunk only to fit.
    let px = look.fit ? maxPx * (room / Math.max(1, natural)) : natural > room ? maxPx * (room / natural) : maxPx;
    px = Math.max(Math.min(px, maxPx), look.fit ? minPx : 0.5 * maxPx);
    setFont(ctx, look, px);
    const space = ctx.measureText(" ").width;
    const widths = texts.map((t) => ctx.measureText(t).width);
    const total = widths.reduce((a, b) => a + b, 0) + space * (texts.length - 1);
    const x0 = look.align === "center" ? (W - total) / 2 : (W - room) / 2;
    const y: number = prev ? prev.y + (look.pitch * (prev.size + px)) / 2 : look.y * H;
    let x = x0;
    const laid: LaidWord[] = words.map((w, i) => {
      const lw = { text: texts[i], start: w.start, end: w.end, x, y: y + px * 0.36 };
      x += widths[i] + space;
      return lw;
    });
    const line = { size: px, y, x0, x1: x0 + total, words: laid };
    out.push(line);
    prev = line;
  }
  return out;
}

/** How much of a word shows at t: words come on as they're said (or with their line, or the caption). */
function shown(look: CaptionLook, line: LaidLine, w: LaidWord, pageStart: number, t: number): number {
  const from = look.reveal === "word" ? w.start : look.reveal === "line" ? line.words[0].start : pageStart;
  if (t < from - 1e-6) return 0;
  return look.fade > 0 ? Math.min(1, (t - from) / look.fade) : 1;
}

/** Draw the caption at t. */
export function drawPage(ctx: Ctx, look: CaptionLook, laid: LaidLine[], page: CaptionPage, t: number) {
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  for (const line of laid) {
    setFont(ctx, look, line.size);
    if (look.box) {
      const visible = line.words.filter((w) => shown(look, line, w, page.start, t) > 0);
      if (visible.length) {
        const last = visible[visible.length - 1];
        const x1 = last.x + ctx.measureText(last.text).width;
        const pad = look.box.pad * line.size;
        ctx.globalAlpha = Math.min(1, ...visible.map((w) => shown(look, line, w, page.start, t)).slice(0, 1));
        ctx.fillStyle = look.box.color;
        ctx.beginPath();
        ctx.roundRect(line.words[0].x - pad, line.y - line.size * 0.62, x1 - line.words[0].x + 2 * pad, line.size * 1.24, look.box.radius * line.size);
        ctx.fill();
      }
    }
    for (const w of line.words) {
      const a = shown(look, line, w, page.start, t);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      if (look.shadow) {
        ctx.shadowColor = look.shadow.color;
        ctx.shadowBlur = look.shadow.blur * line.size;
        ctx.shadowOffsetY = look.shadow.y * line.size;
      }
      if (look.stroke) {
        ctx.lineJoin = "round";
        ctx.lineWidth = look.stroke.width * line.size * 2;
        ctx.strokeStyle = look.stroke.color;
        ctx.strokeText(w.text, w.x, w.y);
        ctx.shadowColor = "transparent";
      }
      const speaking = look.active && t >= w.start && t < w.end;
      ctx.fillStyle = speaking ? look.active! : look.color;
      ctx.fillText(w.text, w.x, w.y);
      ctx.shadowColor = "transparent";
    }
  }
  ctx.restore();
}

/** The look the page starts from when a reference has no captions to learn from. */
export const DEFAULT_LOOK: CaptionLook = {
  y: 0.62,
  width: 0.46,
  maxSize: 0.04,
  minSize: 0.022,
  fit: true,
  pitch: 1.1,
  lines: 2,
  chars: 16,
  align: "center",
  reveal: "word",
  fade: 0.12,
  case: "as-said",
  font: "sans",
  weight: 600,
  tracking: -0.02,
  color: "#ffffff",
  active: null,
  stroke: null,
  shadow: { color: "rgba(0,0,0,0.35)", blur: 0.25, y: 0.04 },
  box: null,
  hold: 0.2,
};

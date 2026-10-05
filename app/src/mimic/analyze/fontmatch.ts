/**
 * Which of the library's fonts a reference's captions are set in, by drawing each and
 * comparing: a style's clearest words (their letters as read off the frame) are drawn in a
 * candidate face at the size that gives their measured lowercase (or capitals) height, with
 * the letter spacing that makes them as wide as the read word (editors set letters touching,
 * or spaced out), laid on the frame's letters baseline to baseline, and scored by how much of
 * the two sets of letters overlap. A face whose letters are the wrong shape (a condensed one
 * spaced out to the width of a regular one set tight) covers less. The best few faces are
 * then tried at every weight and width they have.
 */
import { FONTS, type FontDef } from "../../engine/text/library";
import type { InkMask } from "./words";

/** A word as read: its text (as cased on the frame), its letters, their measured heights. */
export interface Specimen {
  text: string;
  mask: InkMask;
  xh: number;
  tall: number;
}

/** A word drawn: its letters cropped to their box, and its baseline's row. */
export interface Rendered {
  w: number;
  h: number;
  data: Uint8Array;
  base: number;
}

/** Draws a word in a face, with a letter spacing in font sizes (the page's canvas does this). */
export type Renderer = (font: FontDef, weight: number, stretch: number | undefined, italic: boolean, px: number, text: string, tracking?: number) => Rendered | null;

export interface FontGuess {
  font: string;
  weight: number;
  stretch?: number;
  italic: boolean;
  /** the letter spacing that makes the words as wide as read, in font sizes */
  tracking: number;
  /** the font size each word needs, in pixels (their median) */
  px: number;
  score: number;
}

const letters = (s: string) => [...s].filter((c) => /\p{L}|\p{N}/u.test(c)).length;

/** The font size a word needs in a face: from its lowercase, or its capitals. */
export const sizeIn = (f: FontDef, s: Pick<Specimen, "text" | "xh" | "tall">) => (/\p{Ll}/u.test(s.text) ? s.xh / f.metrics.xh : Math.max(s.xh, s.tall) / f.metrics.cap);

/**
 * How well a drawn word covers a read one: the drawn letters stretched across to the read
 * width, baselines together, the share of ink they have in common over all the ink (IoU);
 * and the stretch it took.
 */
export function overlap(read: InkMask, drawn: Rendered): { iou: number; k: number } {
  const k = read.w / Math.max(1, drawn.w);
  // Rows as offsets from the baseline, over both words' extents.
  const top = Math.max(read.base, drawn.base);
  const below = Math.max(read.h - read.base, drawn.h - drawn.base);
  let both = 0;
  let either = 0;
  for (let r = -top; r < below; r++) {
    const ry = read.base + r;
    const dy = drawn.base + r;
    for (let x = 0; x < read.w; x++) {
      const a = ry >= 0 && ry < read.h ? read.data[ry * read.w + x] : 0;
      const dx = Math.min(drawn.w - 1, Math.floor((x + 0.5) / k));
      const b = dy >= 0 && dy < drawn.h ? drawn.data[dy * drawn.w + dx] : 0;
      if (a && b) both++;
      if (a || b) either++;
    }
  }
  return { iou: either ? both / either : 0, k };
}

interface Candidate {
  f: FontDef;
  weight: number;
  stretch?: number;
  italic: boolean;
}

function score(c: Candidate, specimens: Specimen[], render: Renderer): { score: number; tracking: number; px: number } {
  const none = { score: -1, tracking: 0, px: 0 };
  let sum = 0;
  let track = 0;
  const pxs: number[] = [];
  for (const s of specimens) {
    const px = sizeIn(c.f, s);
    const d0 = render(c.f, c.weight, c.stretch, c.italic, px, s.text);
    if (!d0) return none;
    // The spacing that closes the gap; past what spacing is set to, it's another width of face.
    const t = (s.mask.w - d0.w) / Math.max(1, [...s.text].length - 1) / px;
    if (t < -0.2 || t > 0.35) return none;
    const d = Math.abs(t) > 0.004 ? render(c.f, c.weight, c.stretch, c.italic, px, s.text, t) ?? d0 : d0;
    const { iou, k } = overlap(s.mask, d);
    if (Math.abs(Math.log(k)) > Math.log(1.35)) return none;
    // (What's left of the width, stretched across, and spacing past the usual, count against it.)
    sum += iou - 0.6 * Math.abs(Math.log(k)) - 0.4 * Math.max(0, Math.abs(t) - 0.08);
    track += t;
    pxs.push(px);
  }
  pxs.sort((a, b) => a - b);
  return { score: sum / specimens.length, tracking: track / specimens.length, px: pxs[pxs.length >> 1] };
}

const weightsOf = (f: FontDef, ws: number[]) => [...new Set(ws.map((w) => Math.min(f.weights[1], Math.max(f.weights[0], w))))];
const widthsOf = (f: FontDef, ws: number[]) => (f.stretch ? [...new Set(ws.map((w) => Math.min(f.stretch![1], Math.max(f.stretch![0], w))))] : [undefined]);

/**
 * The face, weight, width and slant a style's words are set in, of the library's: every
 * face at the weight its strokes suggest (and widened, where it widens), then the best six
 * at every weight and width. Italic words are tried in the faces that have an italic and in
 * the scripts; upright ones in the rest.
 */
export function matchFont(specimens: Specimen[], render: Renderer, hint: { weight: number; italic: boolean }): FontGuess | null {
  const sp = specimens.filter((s) => letters(s.text) >= 2 && s.mask.w >= 8).slice(0, 4);
  if (!sp.length) return null;
  const pool = FONTS.filter((f) => (hint.italic ? f.italic || f.kind === "script" : f.upright));
  const first: (Candidate & { s: number })[] = [];
  for (const f of pool) {
    for (const stretch of widthsOf(f, [100, 125])) {
      const c = { f, weight: weightsOf(f, [hint.weight])[0], stretch, italic: hint.italic && f.italic };
      first.push({ ...c, s: score(c, sp, render).score });
    }
  }
  const best = new Map<string, number>();
  for (const c of first) best.set(c.f.id, Math.max(best.get(c.f.id) ?? -1, c.s));
  const top = [...best.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => FONTS.find((f) => f.id === id)!);
  let win: (FontGuess & { s: number }) | null = null;
  for (const f of top)
    for (const weight of weightsOf(f, [300, 400, 500, 600, 700, 800, 900]))
      for (const stretch of widthsOf(f, [75, 87.5, 100, 112.5, 125, 137.5, 150])) {
        const c = { f, weight, stretch, italic: hint.italic && f.italic };
        const r = score(c, sp, render);
        if (r.score > (win?.s ?? -1)) win = { font: f.id, weight, ...(stretch !== undefined && stretch !== 100 ? { stretch } : {}), italic: c.italic, tracking: Math.round(r.tracking * 1000) / 1000, px: r.px, score: Math.round(r.score * 1000) / 1000, s: r.score };
      }
  if (!win) return null;
  const { s: _s, ...guess } = win;
  void _s;
  return guess;
}

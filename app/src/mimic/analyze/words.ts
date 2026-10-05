/**
 * The words of a line of text on a frame, one by one. The letters' pixels are picked
 * out whatever colour they are (a gradient's too): they're the pixels unlike anything
 * the box's border shows, the border being background. The line is split into words at
 * its wide gaps, and each word measured: its lowercase and tall letters' heights, its
 * baseline, how thick its strokes are (its weight), how far it leans (italic), its colour
 * or the gradient across it. Behind-the-speaker and blend modes are judged from these
 * (whether the letters go missing where the person is; whether their colour follows the
 * picture under them).
 */
import type { Blend } from "../../engine/text/style";
import { boxMean } from "../../engine/vision/person";
import type { Picture, TextBox } from "./ocr";

export type RGB = [number, number, number];

export interface Gradient {
  /** colours at its two ends */
  from: RGB;
  to: RGB;
  /** its direction in degrees: 0 left to right, 90 top to bottom */
  angle: number;
}

export interface WordInk {
  text: string;
  /** the letters' box, in the picture's pixels */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** the baseline (pixels down the picture) */
  base: number;
  /** height of the lowercase (the busiest rows), and from the tallest letters' tops to the baseline */
  xh: number;
  tall: number;
  /** stroke thickness over the busiest rows' height: about 0.12 regular, 0.18 bold, 0.24 black */
  stroke: number;
  /** horizontal lean per pixel of height (an italic leans about 0.2) */
  slant: number;
  /** the colour of the letters' insides, and how much it varies (0 to 255) */
  color: RGB;
  spread: number;
  /** a gradient across the letters, when one explains their colour */
  grad: Gradient | null;
  /** the picture between and round the letters (its mean colour) */
  bg: RGB;
  /** ink pixels */
  ink: number;
  /** each letter's columns (runs of columns with ink), in the picture's pixels */
  runs: [number, number][];
}

export interface LineWords {
  box: TextBox;
  words: WordInk[];
  /** the ink found in the line's box (1: letter), its place and size in the picture */
  mask: Uint8Array;
  x: number;
  y: number;
  w: number;
  h: number;
}

const dist2 = (a: RGB, b: RGB) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Otsu's threshold over values 0 to `top`. */
function otsu(v: Float32Array, top: number): number {
  const bins = 256;
  const hist = new Float64Array(bins);
  for (const x of v) hist[Math.min(bins - 1, Math.max(0, Math.floor((x / top) * bins)))]++;
  let sum = 0;
  for (let i = 0; i < bins; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = -1;
  let thr = bins / 2;
  for (let t = 0; t < bins; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = v.length - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) [best, thr] = [between, t];
  }
  return ((thr + 1) / bins) * top;
}

/** Connected pieces of a mask (8-connected): each piece's pixels' indices. */
function pieces(mask: Uint8Array, w: number, h: number): number[][] {
  const seen = new Uint8Array(w * h);
  const out: number[][] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    const px: number[] = [];
    seen[s] = 1;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      px.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (mask[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
    }
    out.push(px);
  }
  return out;
}

/** A sliding minimum (or maximum) over 2r + 1 values along rows, then down columns: a grey-level erosion (dilation) by a square. */
export function slide(src: Float32Array, w: number, h: number, r: number, max: boolean): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const better = max ? (a: number, b: number) => a >= b : (a: number, b: number) => a <= b;
  const pass = (get: (i: number) => number, set: (i: number, v: number) => void, n: number) => {
    // A monotonic queue of indices: the window's best at its head.
    const q = new Int32Array(n);
    let head = 0;
    let tail = 0;
    let next = 0;
    for (let i = 0; i < n; i++) {
      while (next < n && next <= i + r) {
        const v = get(next);
        while (tail > head && better(v, get(q[tail - 1]))) tail--;
        q[tail++] = next++;
      }
      while (q[head] < i - r) head++;
      set(i, get(q[head]));
    }
  };
  for (let y = 0; y < h; y++)
    pass(
      (i) => src[y * w + i],
      (i, v) => (tmp[y * w + i] = v),
      w,
    );
  for (let x = 0; x < w; x++)
    pass(
      (i) => tmp[i * w + x],
      (i, v) => (out[i * w + x] = v),
      h,
    );
  return out;
}

/**
 * The letters' pixels in a box of the picture, whatever their colour and whatever is
 * behind them. Strokes stand out of their surroundings: brighter (a white top-hat, in
 * any channel) or darker (a black-hat), the square a little wider than the thickest
 * stroke the box's height allows. But so do the gaps between letters (dark between
 * light strokes) and the picture's own fine detail, so each standing-out piece is kept
 * only when its colour is unlike the background right round it: the pixels near it that
 * stand out neither way (leaving out what lies in other lines' boxes, `avoid`, in the
 * picture's pixels). A gradient's letters stand out as well as plain ones; so do letters
 * mixed in by difference, dark over the light parts of the picture and light over the
 * dark; a glow behind the words is background, its colour all round them. Specks and
 * pieces taller than a line are dropped, and so are pieces touching the border (the
 * picture reaching in) unless most of them lies in the line's own box (`inner`, in the
 * box's pixels: a stacked line's letters run into the next line's), clipped to it.
 */
export function inkIn(p: Picture, x0: number, y0: number, w: number, h: number, avoid: (x: number, y: number) => boolean = () => false, inner: [number, number, number, number] = [0, 0, w - 1, h - 1], r = Math.max(2, Math.round(0.12 * h))): Uint8Array {
  const n = w * h;
  const bright = new Float32Array(n);
  const dark = new Float32Array(n);
  const ch = new Float32Array(n);
  const colour = (i: number): RGB => {
    const k = ((y0 + ((i / w) | 0)) * p.width + x0 + (i % w)) * 4;
    return [p.data[k], p.data[k + 1], p.data[k + 2]];
  };
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) ch[y * w + x] = p.data[((y0 + y) * p.width + x0 + x) * 4 + c];
    // White top-hat: the picture less its opening; black-hat: its closing less the picture.
    const open = slide(slide(ch, w, h, r, false), w, h, r, true);
    const close = slide(slide(ch, w, h, r, true), w, h, r, false);
    for (let i = 0; i < n; i++) {
      bright[i] = Math.max(bright[i], ch[i] - open[i]);
      dark[i] = Math.max(dark[i], close[i] - ch[i]);
    }
  }
  const both = new Float32Array(n);
  for (let i = 0; i < n; i++) both[i] = Math.max(bright[i], dark[i]);
  // (Low: what isn't a letter goes on its colour, and a faint word over a busy picture stays.)
  const thr = Math.max(20, 0.6 * otsu(both, 256));
  const side = new Int8Array(n);
  for (let i = 0; i < n; i++) side[i] = bright[i] > thr && bright[i] >= dark[i] ? 1 : dark[i] > thr ? -1 : 0;
  // The background: pixels standing out neither way, outside other lines' boxes.
  const calm = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!side[y * w + x] && !avoid(x0 + x, y0 + y)) calm[y * w + x] = 1;
  const mask = new Uint8Array(n);
  const speck = Math.max(3, Math.round((0.04 * h) ** 2));
  const kept: { piece: number[]; d: number; c: RGB; clipped: boolean }[] = [];
  for (const sign of [1, -1]) {
    const cand = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (side[i] === sign) cand[i] = 1;
    for (let piece of pieces(cand, w, h)) {
      if (piece.length < speck) continue;
      const within = (i: number) => {
        const x = i % w;
        const y = (i / w) | 0;
        return x >= inner[0] && x <= inner[2] && y >= inner[1] && y <= inner[3];
      };
      const clipped = piece.some((i) => i % w === 0 || i % w === w - 1 || i < w || i >= n - w);
      if (clipped) {
        const inside = piece.filter(within);
        if (inside.length < 0.6 * piece.length || inside.length < speck) continue;
        piece = inside;
      }
      let top = h;
      let bottom = 0;
      let left = w;
      let right = 0;
      const mean = [0, 0, 0];
      for (const i of piece) {
        const x = i % w;
        const y = (i / w) | 0;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
        const c = colour(i);
        mean[0] += c[0];
        mean[1] += c[1];
        mean[2] += c[2];
      }
      if (bottom - top + 1 > 0.92 * h) continue;
      const pc: RGB = [mean[0] / piece.length, mean[1] / piece.length, mean[2] / piece.length];
      // The calm pixels round it (wider until there are enough), and how unlike them it is:
      // a fifth of them closer than this.
      let ds: number[] = [];
      for (let grow = r + 2; grow <= Math.max(w, h) && ds.length < 24; grow *= 2) {
        ds = [];
        const ya = Math.max(0, top - grow);
        const yb = Math.min(h - 1, bottom + grow);
        const xa = Math.max(0, left - grow);
        const xb = Math.min(w - 1, right + grow);
        const step = Math.max(1, Math.round(Math.sqrt(((yb - ya + 1) * (xb - xa + 1)) / 400)));
        for (let y = ya; y <= yb; y += step) for (let x = xa; x <= xb; x += step) if (calm[y * w + x]) ds.push(Math.sqrt(dist2(pc, colour(y * w + x))));
      }
      if (!ds.length) continue;
      ds.sort((u, v) => u - v);
      kept.push({ piece, d: ds[Math.floor(0.2 * (ds.length - 1))], c: pc, clipped });
    }
  }
  if (!kept.length) return mask;
  // Unlike the background: more than a good share of the most unlike pieces' (by ink).
  const byD = [...kept].sort((u, v) => v.d - u.d);
  const total = kept.reduce((s2, k) => s2 + k.piece.length, 0);
  let acc = 0;
  let top = byD[0].d;
  for (const k of byD) {
    acc += k.piece.length;
    top = k.d;
    if (acc >= 0.3 * total) break;
  }
  const cut = Math.max(28, 0.45 * top);
  // A piece cut off by the border is the line's when it's the colour of the line's whole
  // letters (a stacked line's letters running in), not when it's another line's.
  const own = kept.filter((k) => k.d >= cut && !k.clipped);
  const ownInk = own.reduce((s2, k) => s2 + k.piece.length, 0);
  const ownC: RGB = [0, 1, 2].map((c) => own.reduce((s2, k) => s2 + k.c[c] * k.piece.length, 0) / Math.max(1, ownInk)) as RGB;
  for (const k of kept) if (k.d >= cut && (!k.clipped || !ownInk || dist2(k.c, ownC) < 70 * 70)) for (const i of k.piece) mask[i] = 1;
  return mask;
}

/** Runs of columns with ink, between columns a and b of a w-wide mask (rows y0 to y1). */
function columnRuns(mask: Uint8Array, w: number, a: number, b: number, y0: number, y1: number): [number, number][] {
  const runs: [number, number][] = [];
  let r = -1;
  for (let x = a; x <= b + 1; x++) {
    let has = false;
    if (x <= b) for (let y = y0; y <= y1 && !has; y++) has = mask[y * w + x] === 1;
    if (has && r < 0) r = x;
    else if (!has && r >= 0) {
      runs.push([r, x - 1]);
      r = -1;
    }
  }
  return runs;
}

/** The lean that makes a word's strokes most upright: columns of the sheared ink most peaked. */
export function slantOf(mask: Uint8Array, w: number, x0: number, x1: number, top: number, base: number): number {
  const height = base - top + 1;
  if (height < 6) return 0;
  const pad = Math.ceil(0.4 * height) + 1;
  let best = 0;
  let bestV = -1;
  let flat = 0;
  for (let k = -6; k <= 6; k++) {
    const s = k * 0.05;
    const hist = new Float64Array(x1 - x0 + 1 + 2 * pad);
    for (let y = top; y <= base; y++)
      for (let x = x0; x <= x1; x++) if (mask[y * w + x]) hist[Math.round(x - x0 - s * (base - y)) + pad]++;
    let v = 0;
    for (const c of hist) v += c * c;
    if (k === 0) flat = v;
    if (v > bestV + 1e-9) [best, bestV] = [s, v];
  }
  // (Only a clear gain counts: an upright face's round letters peak a little anywhere.)
  return bestV > flat * 1.05 ? Math.round(best * 100) / 100 : 0;
}

/**
 * The colour across some pixels: a straight gradient fitted (each channel against the
 * position along the direction they change most), kept when its ends differ clearly and
 * it explains most of the colour's variation.
 */
export function fitGradient(xs: number[], ys: number[], cs: RGB[]): { color: RGB; spread: number; grad: Gradient | null } {
  const n = cs.length;
  const mean: RGB = [0, 0, 0];
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i];
    my += ys[i];
    for (let c = 0; c < 3; c++) mean[c] += cs[i][c];
  }
  if (!n) return { color: [255, 255, 255], spread: 0, grad: null };
  mx /= n;
  my /= n;
  for (let c = 0; c < 3; c++) mean[c] /= n;
  let tot = 0;
  for (const s of cs) tot += dist2(s, mean);
  const spread = Math.sqrt(tot / n);
  if (n < 12) return { color: mean, spread, grad: null };
  // Each channel against x and y: the direction the colour changes most along.
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  const sxc = [0, 0, 0];
  const syc = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
    for (let c = 0; c < 3; c++) {
      sxc[c] += dx * (cs[i][c] - mean[c]);
      syc[c] += dy * (cs[i][c] - mean[c]);
    }
  }
  const det = sxx * syy - sxy * sxy;
  if (Math.abs(det) < 1e-6) return { color: mean, spread, grad: null };
  let a = 0;
  let b = 0;
  let cc = 0;
  for (let c = 0; c < 3; c++) {
    const gx = (syy * sxc[c] - sxy * syc[c]) / det;
    const gy = (sxx * syc[c] - sxy * sxc[c]) / det;
    a += gx * gx;
    b += gx * gy;
    cc += gy * gy;
  }
  // The principal direction of the gradients' outer product.
  const theta = 0.5 * Math.atan2(2 * b, a - cc);
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const us = xs.map((x, i) => (x - mx) * ux + (ys[i] - my) * uy);
  const sorted = [...us].sort((p, q) => p - q);
  const lo = sorted[Math.floor(0.02 * (n - 1))];
  const hi = sorted[Math.ceil(0.98 * (n - 1))];
  if (hi - lo < 4) return { color: mean, spread, grad: null };
  // Each channel against the position along it, 0 to 1 across the letters.
  const t = us.map((u) => (u - lo) / (hi - lo));
  const mt = t.reduce((s, v) => s + v, 0) / n;
  let stt = 0;
  for (const v of t) stt += (v - mt) ** 2;
  const from: RGB = [0, 0, 0];
  const to: RGB = [0, 0, 0];
  let res = 0;
  for (let c = 0; c < 3; c++) {
    let stc = 0;
    for (let i = 0; i < n; i++) stc += (t[i] - mt) * (cs[i][c] - mean[c]);
    const k = stc / Math.max(1e-9, stt);
    from[c] = mean[c] - k * mt;
    to[c] = mean[c] + k * (1 - mt);
    for (let i = 0; i < n; i++) res += (cs[i][c] - (from[c] + k * t[i])) ** 2;
  }
  const explained = 1 - res / Math.max(1e-9, tot);
  const clamp = (v: RGB): RGB => v.map((x) => Math.max(0, Math.min(255, x))) as RGB;
  // Angles kept as a designer would set them: 0 to 180 is enough (the colours swap ends past it).
  let angle = (theta * 180) / Math.PI;
  let f = clamp(from);
  let e = clamp(to);
  if (angle < -1e-6) {
    angle += 180;
    [f, e] = [e, f];
  }
  const grad = Math.sqrt(dist2(f, e)) > 48 && explained > 0.45 ? { from: f, to: e, angle: Math.round(angle) % 180 } : null;
  return { color: mean, spread, grad };
}

const mh = (mask: Uint8Array, w: number) => mask.length / w;

/** A word's measures from its ink in a mask of the picture. */
function measureWord(p: Picture, mask: Uint8Array, mw: number, ox: number, oy: number, a: number, b: number, y0: number, y1: number, text: string): WordInk | null {
  const rows = new Float64Array(y1 - y0 + 1);
  let ink = 0;
  let top = Infinity;
  let bottom = -Infinity;
  for (let y = y0; y <= y1; y++)
    for (let x = a; x <= b; x++)
      if (mask[y * mw + x]) {
        rows[y - y0]++;
        ink++;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
  if (ink < 8) return null;
  const maxRow = Math.max(...rows);
  // The busiest rows: the lowercase's band (a line of capitals: theirs).
  let xa = -1;
  let xb = -1;
  rows.forEach((r, i) => {
    if (r >= 0.5 * maxRow) {
      if (xa < 0) xa = i;
      xb = i;
    }
  });
  const base = y0 + xb;
  const xh = xb - xa + 1;
  let tallTop = top;
  while (tallTop < base && rows[tallTop - y0] < 0.08 * maxRow) tallTop++;
  const tall = base - tallTop + 1;
  // Stroke thickness: twice the ink over its edge pixels (a stroke's area over half its outline).
  let edge = 0;
  for (let y = top; y <= bottom; y++)
    for (let x = a; x <= b; x++) {
      const i = y * mw + x;
      if (!mask[i]) continue;
      if (x === 0 || y === 0 || x === mw - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - mw] || !mask[i + mw]) edge++;
    }
  const stroke = (2 * ink) / Math.max(1, edge) / Math.max(1, xh);
  // Colour from the letters' insides (thin strokes: all their pixels).
  const xs: number[] = [];
  const ys: number[] = [];
  const cs: RGB[] = [];
  // (The lowercase's band: a stacked line's letters reaching in from above or below stay out.)
  const take = (inside: boolean) => {
    for (let y = Math.max(top, base - xh + 1); y <= base; y++)
      for (let x = a; x <= b; x++) {
        const i = y * mw + x;
        if (!mask[i]) continue;
        if (inside && (x === 0 || x === mw - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - mw] || !mask[i + mw])) continue;
        const k = ((oy + y) * p.width + ox + x) * 4;
        xs.push(x);
        ys.push(y);
        cs.push([p.data[k], p.data[k + 1], p.data[k + 2]]);
      }
  };
  take(true);
  if (cs.length < Math.max(12, 0.15 * ink)) {
    xs.length = ys.length = cs.length = 0;
    take(false);
  }
  const { color, spread, grad } = fitGradient(xs, ys, cs);
  // The picture between the letters and just round them: pixels clear of ink all round.
  const bgs = [0, 0, 0];
  let nb = 0;
  const pad = Math.max(2, Math.round(0.3 * xh));
  for (let y = Math.max(1, base - xh + 1); y <= Math.min(mh(mask, mw) - 2, base); y++)
    for (let x = Math.max(1, a - pad); x <= Math.min(mw - 2, b + pad); x++) {
      const i = y * mw + x;
      if (mask[i] || mask[i - 1] || mask[i + 1] || mask[i - mw] || mask[i + mw]) continue;
      const k = ((oy + y) * p.width + ox + x) * 4;
      bgs[0] += p.data[k];
      bgs[1] += p.data[k + 1];
      bgs[2] += p.data[k + 2];
      nb++;
    }
  const bg: RGB = nb ? (bgs.map((v) => Math.round(v / nb)) as RGB) : [0, 0, 0];
  const runs = columnRuns(mask, mw, a, b, top, bottom).map(([u, v]) => [ox + u, ox + v] as [number, number]);
  return {
    text,
    x0: ox + a,
    y0: oy + top,
    x1: ox + b,
    y1: oy + bottom,
    base: oy + base,
    xh,
    tall,
    stroke: Math.round(stroke * 1000) / 1000,
    slant: slantOf(mask, mw, a, b, tallTop, base),
    color: color.map((v) => Math.round(v)) as RGB,
    spread: Math.round(spread),
    grad: grad && { ...grad, from: grad.from.map(Math.round) as RGB, to: grad.to.map(Math.round) as RGB },
    bg,
    ink,
    runs,
  };
}

/**
 * A line of text's words: the ink in its box (pushed out a little for background to
 * read from), split at the gaps that are words' rather than letters'. The reader's text
 * says how many words there are when its spaces agree with the ink; otherwise gaps wider
 * than about half the lowercase's height (and well over the letters' own) split it.
 */
export function lineWords(p: Picture, box: TextBox, text: string, others: TextBox[] = []): LineWords | null {
  const bh = box.y1 - box.y0;
  const m = Math.max(2, Math.round(0.12 * bh));
  const x = Math.max(0, Math.floor(box.x0) - m);
  const y = Math.max(0, Math.floor(box.y0) - m);
  const w = Math.min(p.width, Math.ceil(box.x1) + m) - x;
  const h = Math.min(p.height, Math.ceil(box.y1) + m) - y;
  if (w < 8 || h < 8) return null;
  const inside = others.filter((o) => o !== box);
  const inner: [number, number, number, number] = [Math.round(box.x0) - x, Math.round(box.y0) - y, Math.round(box.x1) - x, Math.round(box.y1) - y];
  const mask = inkIn(p, x, y, w, h, (px2, py2) => inside.some((o) => px2 >= o.x0 && px2 <= o.x1 && py2 >= o.y0 && py2 <= o.y1), inner);
  const runs = columnRuns(mask, w, 0, w - 1, 0, h - 1);
  if (!runs.length) return null;
  // The line's lowercase height, for the gaps' scale.
  const rows = new Float64Array(h);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) rows[yy] += mask[yy * w + xx];
  const maxRow = Math.max(...rows);
  const band = [...rows].filter((r) => r >= 0.5 * maxRow).length;
  const gaps = runs.slice(1).map((r, i) => ({ i, g: r[0] - runs[i][1] - 1 }));
  const letterGap = gaps.length ? [...gaps].sort((p2, q) => p2.g - q.g)[Math.floor((gaps.length - 1) * 0.4)].g : 0;
  const said = text.trim().split(/\s+/).filter(Boolean);
  let cuts: number[];
  // (A line the reader takes for one word splits only at a gap far wider than its letters'.)
  const wide = gaps.filter((g) => g.g > (said.length <= 1 ? Math.max(0.8 * band, 3 * letterGap, 3) : Math.max(0.45 * band, 2.2 * letterGap, 2))).sort((p2, q) => q.g - p2.g);
  const byText = [...gaps].sort((p2, q) => q.g - p2.g).slice(0, Math.max(0, said.length - 1));
  // The reader's spaces, when they fall on gaps clearly wider than the letters' own.
  if (said.length > 1 && byText.length === said.length - 1 && byText.every((g) => g.g > Math.max(1.5 * letterGap, 0.25 * band, 1))) cuts = byText.map((g) => g.i).sort((p2, q) => p2 - q);
  else cuts = wide.map((g) => g.i).sort((p2, q) => p2 - q);
  const groups: [number, number][] = [];
  let start = 0;
  for (const c of cuts) {
    groups.push([runs[start][0], runs[c][1]]);
    start = c + 1;
  }
  groups.push([runs[start][0], runs[runs.length - 1][1]]);
  // The words' texts: the reader's, when the counts agree; else its letters shared out by width.
  let texts: string[];
  if (said.length === groups.length) texts = said;
  else {
    const letters = said.join("");
    const total = groups.reduce((s, g) => s + g[1] - g[0] + 1, 0);
    let at = 0;
    texts = groups.map((g, i) => {
      const n = i === groups.length - 1 ? letters.length - at : Math.round(((g[1] - g[0] + 1) / total) * letters.length);
      const s = letters.slice(at, at + n);
      at += n;
      return s;
    });
  }
  const words = groups.map((g, i) => measureWord(p, mask, w, x, y, g[0], g[1], 0, h - 1, texts[i] ?? "")).filter((v): v is WordInk => !!v);
  return { box, words, mask, x, y, w, h };
}

/** A plane of values 0 to 1 over a picture (a person mask), at its own size. */
export interface Plane {
  data: Float32Array;
  width: number;
  height: number;
}

/**
 * Whether a line of text is behind the person or in front: where the person covers part
 * of the line's letters' span, the letters are missing (behind) or there as anywhere else
 * on the line (in front). Undefined when the person doesn't cover enough of it to tell.
 */
export function layerOf(lw: LineWords, person: Plane, W: number, H: number): "behind" | "front" | undefined {
  const words = lw.words;
  if (!words.length) return undefined;
  const xh = Math.max(...words.map((w) => w.xh));
  const top = Math.min(...words.map((w) => w.base - w.xh + 1)) - lw.y;
  const bottom = Math.max(...words.map((w) => w.base)) - lw.y;
  // The letters' span, and a little past its ends (a word hidden at the end of the line).
  const a = Math.max(0, Math.min(...words.map((w) => w.x0)) - lw.x - Math.round(0.6 * xh));
  const b = Math.min(lw.w - 1, Math.max(...words.map((w) => w.x1)) - lw.x + Math.round(0.6 * xh));
  let cov = 0;
  let covInk = 0;
  let open = 0;
  let openInk = 0;
  for (let y = Math.max(0, top); y <= Math.min(lw.h - 1, bottom); y++)
    for (let x = a; x <= b; x++) {
      const px = Math.min(person.width - 1, Math.floor(((lw.x + x + 0.5) / W) * person.width));
      const py = Math.min(person.height - 1, Math.floor(((lw.y + y + 0.5) / H) * person.height));
      const ink = lw.mask[y * lw.w + x];
      if (person.data[py * person.width + px] > 0.5) {
        cov++;
        covInk += ink;
      } else {
        open++;
        openInk += ink;
      }
    }
  if (cov < 0.8 * xh * xh || open < xh * xh || !openInk) return undefined;
  const k = covInk / cov / (openInk / open);
  return k < 0.3 ? "behind" : k > 0.6 ? "front" : undefined;
}

/** How a word's letters mix with the picture under them. */
export interface WordBlend {
  mode: Blend;
  /** the letters' own colour, and their opacity */
  color: RGB;
  opacity: number;
  /** how much of their colour's variation the mix explains over a plain opaque colour (0 to 1) */
  gain: number;
}

const D = (b: number) => (b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b));
/** The W3C blend modes (canvas's composite operations of the same names), backdrop b and source s, 0 to 1. */
export const MIX: Record<Blend, (b: number, s: number) => number> = {
  normal: (_b, s) => s,
  multiply: (b, s) => b * s,
  screen: (b, s) => b + s - b * s,
  overlay: (b, s) => (b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)),
  darken: (b, s) => Math.min(b, s),
  lighten: (b, s) => Math.max(b, s),
  "color-dodge": (b, s) => (b === 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s))),
  "color-burn": (b, s) => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s)),
  "hard-light": (b, s) => (s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)),
  "soft-light": (b, s) => (s <= 0.5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * (D(b) - b)),
  difference: (b, s) => Math.abs(b - s),
  exclusion: (b, s) => b + s - 2 * b * s,
};

/**
 * How a word mixes with the picture, when its colour varies with what's under it: the
 * picture under each letter pixel guessed from the pixels round the letters (a box blur
 * of what isn't ink), then each blend mode fitted (the letters' colour per channel, and an
 * opacity) to the pixels seen. A mix is kept when it explains the letters' colour much
 * better than one plain colour does. Null when the letters are one colour (opaque), or
 * the picture under them is too even to tell.
 */
export function blendOf(p: Picture, lw: LineWords, word: WordInk): WordBlend | null {
  const { w, h, mask } = lw;
  const a = word.x0 - lw.x;
  const b = word.x1 - lw.x;
  const top = Math.max(1, word.base - word.xh + 1 - lw.y);
  const bottom = Math.min(h - 2, word.base - lw.y);
  // What isn't ink (two pixels clear of it), and the picture's colour round each pixel from it.
  const clear = new Float32Array(w * h).fill(1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x])
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if (yy >= 0 && xx >= 0 && yy < h && xx < w) clear[yy * w + xx] = 0;
          }
  const r = Math.max(3, Math.round(1.6 * word.stroke * word.xh));
  const den = boxMean(clear, w, h, r);
  const under: Float32Array[] = [];
  const seen: Float32Array[] = [];
  for (let c = 0; c < 3; c++) {
    const v = new Float32Array(w * h);
    const s2 = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const k = ((lw.y + ((i / w) | 0)) * p.width + lw.x + (i % w)) * 4 + c;
      s2[i] = p.data[k] / 255;
      v[i] = s2[i] * clear[i];
    }
    under.push(boxMean(v, w, h, r));
    seen.push(s2);
  }
  // The letters' insides, and the picture under them.
  const B: number[][] = [[], [], []];
  const I: number[][] = [[], [], []];
  for (let y = top; y <= bottom; y++)
    for (let x = Math.max(1, a); x <= Math.min(w - 2, b); x++) {
      const i = y * w + x;
      if (!mask[i] || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w] || den[i] < 0.03) continue;
      for (let c = 0; c < 3; c++) {
        B[c].push(under[c][i] / den[i]);
        I[c].push(seen[c][i]);
      }
    }
  let n = B[0].length;
  if (n < 40) return null;
  // (At most 300 of them, spread over the word.)
  if (n > 300) {
    const step = n / 300;
    for (let c = 0; c < 3; c++) {
      B[c] = Array.from({ length: 300 }, (_, k) => B[c][Math.floor(k * step)]);
      I[c] = Array.from({ length: 300 }, (_, k) => I[c][Math.floor(k * step)]);
    }
    n = 300;
  }
  const lum = B[0].map((_, k) => 0.299 * B[0][k] + 0.587 * B[1][k] + 0.114 * B[2][k]);
  const ml = lum.reduce((s2, v) => s2 + v, 0) / n;
  const sd = Math.sqrt(lum.reduce((s2, v) => s2 + (v - ml) ** 2, 0) / n);
  if (sd < 0.04) {
    // Too even to fit, but white letters mixed by difference still show: they're the
    // picture's colour turned inside out (peach over blue, navy over cream), which a
    // coloured backdrop makes plain (over grey it could as well be black on white).
    const mb = [0, 1, 2].map((c) => B[c].reduce((s2, v) => s2 + v, 0) / n);
    const mi = [0, 1, 2].map((c) => I[c].reduce((s2, v) => s2 + v, 0) / n);
    const inverse = mb.every((b2, c) => Math.abs(b2 + mi[c] - 1) < 0.06) && Math.max(...mb) - Math.min(...mb) > 0.08 && Math.abs(mb[1] - mi[1]) > 0.3;
    return inverse ? { mode: "difference", color: [255, 255, 255], opacity: 1, gain: 0.5 } : null;
  }
  // One plain colour: each channel's own mean.
  let plain = 0;
  for (let c = 0; c < 3; c++) {
    const m = I[c].reduce((s2, v) => s2 + v, 0) / n;
    plain += I[c].reduce((s2, v) => s2 + (v - m) ** 2, 0);
  }
  if (plain / (3 * n) < 0.003) return null;
  let best = { mode: "normal" as Blend, sse: plain, color: [0, 0, 0] as RGB, opacity: 1 };
  const S = Array.from({ length: 33 }, (_, k) => k / 32);
  for (const mode of Object.keys(MIX) as Blend[]) {
    const f = MIX[mode];
    for (const alpha of [0.35, 0.55, 0.75, 0.9, 1]) {
      let sse = 0;
      const col: RGB = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        let bc = Infinity;
        for (const s of S) {
          let e = 0;
          for (let k = 0; k < n; k++) e += (alpha * f(B[c][k], s) + (1 - alpha) * B[c][k] - I[c][k]) ** 2;
          if (e < bc) [bc, col[c]] = [e, s];
        }
        sse += bc;
      }
      // (Difference first among near ties: with white letters exclusion is the same mix, and editors reach for difference.)
      const tie = best.mode === "difference" ? 1.04 : 1;
      if (sse * tie < best.sse - 1e-9) best = { mode, sse, color: col.map((v) => Math.round(v * 255)) as RGB, opacity: alpha };
    }
  }
  const gain = 1 - best.sse / plain;
  if (gain < 0.45 || (best.mode === "normal" && best.opacity === 1)) return null;
  return { mode: best.mode, color: best.color, opacity: best.opacity, gain: Math.round(gain * 100) / 100 };
}

/** A word's letters as a small mask (1: ink), its box in the picture, and its baseline row in it. */
export interface InkMask {
  w: number;
  h: number;
  data: Uint8Array;
  /** the baseline's row in the mask */
  base: number;
}

/** The ink of one word of a line, cut out to its letters' box. */
export function wordMask(lw: LineWords, word: WordInk): InkMask | null {
  const x0 = word.x0 - lw.x;
  const x1 = word.x1 - lw.x;
  const y0 = word.y0 - lw.y;
  const y1 = word.y1 - lw.y;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w < 4 || h < 4 || x0 < 0 || y0 < 0 || x1 >= lw.w || y1 >= lw.h) return null;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = lw.mask[(y0 + y) * lw.w + x0 + x];
  return { w, h, data, base: word.base - word.y0 };
}

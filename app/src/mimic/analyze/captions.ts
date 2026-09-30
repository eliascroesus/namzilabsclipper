/**
 * The reference's captions, measured: the text reader finds the lines on
 * frames a third of a second apart; the band of the frame where lines keep
 * coming and going is the captions' place. Inside each line the letters'
 * pixels are picked out (the side of the brightness split that doesn't touch
 * the box's border), which gives the letters' height, width, colour and what
 * sits around them (an outline, a shadow, a box). Frames of one caption tell
 * how it comes on (word by word, or whole), and its last frame, the whole
 * caption: how many letters a line takes, how lines are sized and aligned.
 */
import type { CaptionLook, FontFamily } from "../types";
import type { Picture, TextBox } from "./ocr";

/**
 * x-height of the caption face over its size: Inter's display cut, which the browser draws
 * at caption sizes (its optical size follows the font size, and captions are over 32 px).
 */
export const X_HEIGHT = 0.516;

export interface LineInk {
  /** the letters' extent, in the picture's pixels */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** height of the lowercase letters */
  xh: number;
  /** from the tallest letters' tops to the baseline */
  tall: number;
  /** ink pixels over the letters' box (x-height band), a guide to weight */
  density: number;
  color: [number, number, number];
  /** the ring just outside the letters against the ring beyond it (luma, 0 to 255) */
  ring: number;
  outer: number;
  /** ring darker below the letters than above (a dropped shadow) */
  below: number;
  above: number;
  /** the space between the letters inside the box: its colour and how even it is */
  bg: [number, number, number];
  bgSpread: number;
  /** the brightest word's colour and the rest's, when one stands out (a highlighted word) */
  accent: [number, number, number] | null;
  /** the letters' columns: each run of columns with ink, left to right */
  runs?: [number, number][];
}

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

function otsu(v: Float32Array): number {
  const hist = new Float64Array(256);
  for (const x of v) hist[Math.max(0, Math.min(255, Math.round(x)))]++;
  const total = v.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr + 0.5;
}

/** The letters of one caption line: their pixels, size, colour and surroundings. */
export function measureLine(p: Picture, b: TextBox): LineInk | null {
  const x0 = Math.max(0, Math.floor(b.x0));
  const y0 = Math.max(0, Math.floor(b.y0));
  const x1 = Math.min(p.width - 1, Math.ceil(b.x1));
  const y1 = Math.min(p.height - 1, Math.ceil(b.y1));
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w < 6 || h < 6) return null;
  const L = new Float32Array(w * h);
  const px = (x: number, y: number) => ((y0 + y) * p.width + x0 + x) * 4;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = px(x, y);
      L[y * w + x] = luma(p.data[i], p.data[i + 1], p.data[i + 2]);
    }
  // The background is what the box's border shows; the letters are the far extreme from it
  // (light letters: the brightest few percent), split halfway between.
  const borderL: number[] = [];
  for (let x = 0; x < w; x++) borderL.push(L[x], L[(h - 1) * w + x]);
  for (let y = 1; y < h - 1; y++) borderL.push(L[y * w], L[y * w + w - 1]);
  borderL.sort((a, b) => a - b);
  const Lb = borderL[borderL.length >> 1];
  const sorted = Float32Array.from(L).sort();
  const hi = sorted[Math.floor(sorted.length * 0.98)];
  const lo = sorted[Math.floor(sorted.length * 0.02)];
  const bright = hi - Lb >= Lb - lo;
  const thr = bright ? (hi + Lb) / 2 : (lo + Lb) / 2;
  void otsu;
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = (bright ? L[i] > thr : L[i] < thr) ? 1 : 0;
  // Only ink away from the border counts (the box's margin is background).
  const rows = new Float64Array(h);
  const cols = new Float64Array(w);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++)
      if (ink[y * w + x]) {
        rows[y]++;
        cols[x]++;
      }
  const maxRow = Math.max(...rows);
  if (maxRow < 2) return null;
  let bx0 = 1;
  while (bx0 < w - 1 && cols[bx0] < 1) bx0++;
  let bx1 = w - 2;
  while (bx1 > bx0 && cols[bx1] < 1) bx1--;
  let by0 = 1;
  while (by0 < h - 1 && rows[by0] < 1) by0++;
  let by1 = h - 2;
  while (by1 > by0 && rows[by1] < 1) by1--;
  // The x-height band: rows with at least half the busiest row's ink.
  let xa = -1;
  let xb = -1;
  for (let y = 0; y < h; y++)
    if (rows[y] >= 0.5 * maxRow) {
      if (xa < 0) xa = y;
      xb = y;
    }
  const xh = xb - xa + 1;
  // Tall letters reach up to about 0.73 of the size above the baseline (the x-height band's foot).
  let top = by0;
  while (top < xb && rows[top] < 0.12 * maxRow) top++;
  const tall = xb - top + 1;
  let inkBand = 0;
  for (let y = xa; y <= xb; y++) inkBand += rows[y];
  const density = inkBand / Math.max(1, xh * (bx1 - bx0 + 1));
  // Colour: the letters' insides (ink with ink all round), and the space between.
  const col = [0, 0, 0];
  let nc = 0;
  const bgc = [0, 0, 0];
  let nb = 0;
  const bgL: number[] = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      const i = px(x, y);
      if (ink[k] && ink[k - 1] && ink[k + 1] && ink[k - w] && ink[k + w]) {
        col[0] += p.data[i];
        col[1] += p.data[i + 1];
        col[2] += p.data[i + 2];
        nc++;
      } else if (!ink[k] && y >= by0 && y <= by1 && x >= bx0 && x <= bx1) {
        bgc[0] += p.data[i];
        bgc[1] += p.data[i + 1];
        bgc[2] += p.data[i + 2];
        nb++;
        bgL.push(L[k]);
      }
    }
  if (!nc) {
    for (let k = 0; k < w * h; k++)
      if (ink[k]) {
        const i = px(k % w, (k / w) | 0);
        col[0] += p.data[i];
        col[1] += p.data[i + 1];
        col[2] += p.data[i + 2];
        nc++;
      }
  }
  const color: [number, number, number] = [col[0] / nc, col[1] / nc, col[2] / nc];
  const bg: [number, number, number] = nb ? [bgc[0] / nb, bgc[1] / nb, bgc[2] / nb] : [0, 0, 0];
  const bgMean = bgL.reduce((a, v) => a + v, 0) / Math.max(1, bgL.length);
  const bgSpread = Math.sqrt(bgL.reduce((a, v) => a + (v - bgMean) ** 2, 0) / Math.max(1, bgL.length));
  // Rings around the letters: one and two pixels out, against three and four out.
  const dist = new Uint8Array(w * h).fill(9);
  for (let k = 0; k < w * h; k++) if (ink[k]) dist[k] = 0;
  for (let pass = 1; pass <= 4; pass++)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (dist[k] !== 9) continue;
        if ((x > 0 && dist[k - 1] === pass - 1) || (x < w - 1 && dist[k + 1] === pass - 1) || (y > 0 && dist[k - w] === pass - 1) || (y < h - 1 && dist[k + w] === pass - 1)) dist[k] = pass;
      }
  let ring = 0;
  let nr = 0;
  let outer = 0;
  let no = 0;
  let above = 0;
  let na = 0;
  let below = 0;
  let nbl = 0;
  const mid = (by0 + by1) / 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      const d = dist[k];
      if (d === 1 || d === 2) {
        ring += L[k];
        nr++;
        if (y < mid) (above += L[k]), na++;
        else (below += L[k]), nbl++;
      } else if (d === 3 || d === 4) {
        outer += L[k];
        no++;
      }
    }
  // A highlighted word: split the line at gaps as wide as a third of the x-height, colour each piece.
  let accent: [number, number, number] | null = null;
  const gap = Math.max(2, Math.round(xh / 3));
  const words: [number, number][] = [];
  let a = -1;
  let empty = 0;
  for (let x = bx0; x <= bx1 + 1; x++) {
    const has = x <= bx1 && cols[x] > 0;
    if (has) {
      if (a < 0) a = x;
      empty = 0;
    } else if (a >= 0 && ++empty >= gap) {
      words.push([a, x - empty]);
      a = -1;
    }
  }
  if (a >= 0) words.push([a, bx1]);
  const runs: [number, number][] = [];
  for (let x = bx0, r = -1; x <= bx1 + 1; x++) {
    const has = x <= bx1 && cols[x] > 0;
    if (has && r < 0) r = x;
    else if (!has && r >= 0) {
      runs.push([x0 + r, x0 + x - 1]);
      r = -1;
    }
  }
  if (words.length >= 2) {
    const wc = words.map(([u, v]) => {
      const c = [0, 0, 0];
      let n = 0;
      for (let y = xa; y <= xb; y++)
        for (let x = u; x <= v; x++)
          if (ink[y * w + x]) {
            const i = px(x, y);
            c[0] += p.data[i];
            c[1] += p.data[i + 1];
            c[2] += p.data[i + 2];
            n++;
          }
      return n ? ([c[0] / n, c[1] / n, c[2] / n] as [number, number, number]) : null;
    });
    const sat = (c: [number, number, number] | null) => (c ? (Math.max(...c) - Math.min(...c)) / Math.max(1, Math.max(...c)) : 0);
    const loud = wc.filter((c) => sat(c) > 0.35);
    const quiet = wc.filter((c) => c && sat(c) < 0.15);
    if (loud.length >= 1 && loud.length <= Math.ceil(wc.length / 3) && quiet.length >= 1) accent = loud[0]!;
  }
  return {
    x0: x0 + bx0,
    x1: x0 + bx1,
    y0: y0 + by0,
    y1: y0 + by1,
    xh,
    tall,
    density,
    color,
    ring: nr ? ring / nr : 0,
    outer: no ? outer / no : 0,
    above: na ? above / na : 0,
    below: nbl ? below / nbl : 0,
    bg,
    bgSpread,
    accent,
    runs,
  };
}

/** Cap height (and ascenders, near enough) of the caption face over its size. */
export const CAP_HEIGHT = 0.727;

/**
 * A line's font size in pixels, the size Inter needs to draw its letters as tall: from its
 * lowercase (whose height is the busiest rows'), or, for a line of capitals, from theirs.
 * (Not from the tallest letters: faces differ most in how far those reach over the
 * lowercase, and a t is shorter than an h.)
 */
export function lineSize(ink: LineInk, text: string): number {
  const lower = /\p{Ll}/u.test(text);
  const upper = /[\p{Lu}\p{N}]/u.test(text);
  return upper && !lower ? Math.max(ink.xh, ink.tall) / CAP_HEIGHT : ink.xh / X_HEIGHT;
}

/** The ink between two words of Inter over its size (the median over word pairs), with the look's tracking (-0.02), by weight. */
const interWordGap = (weight: number) => 0.264 - 0.00017 * (weight - 600);

export interface CaptionSample {
  t: number;
  /** the lines read on this frame (all of them; the band is found from all samples) */
  lines: (TextBox & { ink: LineInk | null })[];
}

const letters = (s: string) => (s.match(/\p{L}|\p{N}/gu) ?? []).length;
const hex = (c: [number, number, number]) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const median = (v: number[], d = 0) => {
  if (!v.length) return d;
  const s = [...v].sort((a, b) => a - b);
  return s[s.length >> 1];
};
const pct = (v: number[], p: number, d = 0) => {
  if (!v.length) return d;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
};

/** Is `b` what `a` becomes with words added (the same start, longer)? */
function grows(a: string, b: string): boolean {
  const x = a.replace(/\s/g, "").toLowerCase();
  const y = b.replace(/\s/g, "").toLowerCase();
  return x.length >= 1 && y.length > x.length && y.startsWith(x.slice(0, Math.max(1, x.length - 1)));
}

/**
 * The caption look from samples of a W × H frame (the pictures the lines were
 * read on). Null when there are no captions.
 */
export function captionLook(samples: CaptionSample[], W: number, H: number, cards: { start: number; end: number; rect: [number, number, number, number] }[] = []): CaptionLook | null {
  // Candidate lines: read with confidence, big enough to be captions.
  type Cand = TextBox & { ink: LineInk; t: number; cy: number; size: number };
  const cands: Cand[] = [];
  for (const s of samples)
    for (const l of s.lines) {
      if (!l.ink || (l.conf ?? 0) < 0.6 || !letters(l.text ?? "")) continue;
      const size = lineSize(l.ink, l.text ?? "") / H;
      if (size < 0.012) continue;
      // Text on a card belongs to the card's picture.
      const cx = (l.ink.x0 + l.ink.x1) / 2 / W;
      const cy = (l.ink.y0 + l.ink.y1) / 2 / H;
      const onCard = cards.some((c) => s.t >= c.start && s.t < c.end && cx > c.rect[0] && cx < c.rect[0] + c.rect[2] && cy > c.rect[1] + 0.02 && cy < c.rect[1] + c.rect[3] - 0.02 && size < 0.025);
      if (onCard) continue;
      cands.push({ ...l, ink: l.ink, t: s.t, cy, size });
    }
  if (cands.length < 4) return null;
  // Text that never changes (a handle, a logo) isn't a caption.
  const key = (c: Cand) => `${Math.round(c.cy * 50)}:${(c.text ?? "").replace(/\s/g, "").toLowerCase()}`;
  const counts = new Map<string, number>();
  for (const c of cands) counts.set(key(c), (counts.get(key(c)) ?? 0) + 1);
  const moving = cands.filter((c) => (counts.get(key(c)) ?? 0) < Math.max(4, samples.length * 0.3));
  if (moving.length < 4) return null;
  // The band: where most lines sit.
  const bins = new Float64Array(100);
  for (const c of moving) bins[Math.min(99, Math.floor(c.cy * 100))] += 1;
  let peak = 0;
  for (let i = 0; i < 100; i++) if (bins[i] + (bins[i - 1] ?? 0) + (bins[i + 1] ?? 0) > bins[peak] + (bins[peak - 1] ?? 0) + (bins[peak + 1] ?? 0)) peak = i;
  const band = moving.filter((c) => c.cy > (peak - 9) / 100 && c.cy < (peak + 13) / 100);
  if (band.length < 4) return null;
  // Frame by frame: the band's lines, top down.
  const frames = new Map<number, Cand[]>();
  for (const c of band) frames.set(c.t, [...(frames.get(c.t) ?? []), c]);
  const byTime = [...frames.entries()].sort((a, b) => a[0] - b[0]).map(([t, ls]) => ({ t, ls: ls.sort((p, q) => p.cy - q.cy) }));
  // Captions: frames in a row whose first line keeps its start.
  const pages: (typeof byTime)[] = [];
  let reveals = 0;
  let steps = 0;
  for (const f of byTime) {
    const last = pages[pages.length - 1];
    const prev = last?.[last.length - 1];
    const same = prev && f.t - prev.t < 0.8 && Math.abs(f.ls[0].cy - prev.ls[0].cy) < 0.02 && ((f.ls[0].text ?? "") === (prev.ls[0].text ?? "") || grows(prev.ls[0].text ?? "", f.ls[0].text ?? "") || (f.ls.length > prev.ls.length && (f.ls[0].text ?? "").startsWith((prev.ls[0].text ?? "").slice(0, 3))));
    if (same) {
      steps++;
      const grew = grows(prev.ls[0].text ?? "", f.ls[0].text ?? "") || f.ls.length > prev.ls.length || (f.ls.length > 1 && prev.ls.length > 1 && grows(prev.ls[1].text ?? "", f.ls[1].text ?? ""));
      if (grew) reveals++;
      last.push(f);
    } else pages.push([f]);
  }
  const finals = pages.map((p) => p[p.length - 1]);
  const lines1 = byTime.map((f) => f.ls[0]);
  const y = median(lines1.map((l) => l.cy), 0.7);
  const counts2 = byTime.map((f) => f.ls.length);
  const lines = Math.max(1, Math.min(3, pct(counts2, 0.9, 1))) as 1 | 2 | 3;
  const two = byTime.filter((f) => f.ls.length >= 2);
  const pitch = two.length ? median(two.map((f) => (f.ls[1].cy - f.ls[0].cy) / Math.max(1e-3, (f.ls[0].size + f.ls[1].size) / 2)), 1.15) : 1.15;
  // The whole caption: its last frame. Long lines show how lines are sized: fitted to one
  // width (the width stays put as the letters grow in number) or all one size (the width
  // grows with the letters).
  const full = finals.flatMap((f) => f.ls);
  const chars0 = (l: Cand) => (l.text ?? "").replace(/\s+/g, " ").trim().length;
  const long = full.filter((l) => chars0(l) >= 13);
  const widths = long.map((l) => (l.ink.x1 - l.ink.x0) / W);
  const perChar = long.map((l) => (l.ink.x1 - l.ink.x0) / W / chars0(l));
  const sizes = full.map((l) => l.size);
  const cv = (v: number[]) => {
    const m = v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
    return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length)) / Math.max(1e-6, m);
  };
  // (Spread as the median distance from the median: a few misread lines don't count.)
  const spread = (v: number[]) => {
    const m = median(v);
    return median(v.map((x) => Math.abs(x - m))) / Math.max(1e-6, m);
  };
  const fit = long.length >= 4 && spread(widths) < 0.7 * spread(perChar) && median(widths) > 0.2;
  void cv;
  // The biggest a line gets: short lines' size; the smallest: the longest lines'.
  const short = full.filter((l) => chars0(l) <= 8).map((l) => l.size);
  const maxSize = fit ? median(short.length >= 3 ? short : sizes, median(sizes)) : median(sizes);
  const minSize = fit ? pct(sizes, 0.1) : median(sizes);
  const width = fit ? median(widths) : Math.max(0.5, pct(full.map((l) => (l.ink.x1 - l.ink.x0) / W), 0.9));
  const chars = Math.max(6, Math.round(pct(full.map((l) => (l.text ?? "").replace(/\s+/g, " ").trim().length), 0.9, 16)));
  // Aligned: complete lines' middles on the frame's middle, or their left edges together.
  const mids = full.map((l) => (l.ink.x0 + l.ink.x1) / 2 / W);
  const lefts = full.map((l) => l.ink.x0 / W);
  const centred = mids.filter((m) => Math.abs(m - 0.5) < 0.04).length / Math.max(1, mids.length);
  const align = centred >= 0.6 || cv(lefts) > 0.08 ? "center" : "left";
  const reveal: CaptionLook["reveal"] = steps >= 3 && reveals / steps > 0.3 ? "word" : "page";
  // Case, from the letters read.
  const text = full.map((l) => l.text ?? "").join(" ");
  const up = (text.match(/\p{Lu}/gu) ?? []).length;
  const lo = (text.match(/\p{Ll}/gu) ?? []).length;
  const kase: CaptionLook["case"] = up > 0.85 * (up + lo) ? "upper" : up === 0 ? "lower" : "as-said";
  // Colour, and what's around the letters.
  const inks = band.map((l) => l.ink);
  const color: [number, number, number] = [0, 1, 2].map((k) => median(inks.map((i) => i.color[k]))) as [number, number, number];
  const textL = luma(...color);
  const darkRing = inks.filter((i) => (textL > 128 ? i.outer - i.ring : i.ring - i.outer) > 18).length / inks.length;
  const boxed = inks.filter((i) => i.bgSpread < 14 && Math.abs(luma(...i.bg) - textL) > 90).length / inks.length;
  const sunk = inks.filter((i) => i.above - i.below > 6).length / inks.length;
  const ringL = median(inks.map((i) => i.ring));
  let stroke: CaptionLook["stroke"] = null;
  let shadow: CaptionLook["shadow"] = null;
  let box: CaptionLook["box"] = null;
  if (boxed > 0.6) {
    const bg: [number, number, number] = [0, 1, 2].map((k) => median(inks.map((i) => i.bg[k]))) as [number, number, number];
    box = { color: hex(bg), pad: 0.3, radius: 0.18 };
  } else if (darkRing > 0.5) {
    // A crisp dark ring all round is an outline; a softer one, heavier below, a shadow.
    if (textL > 128 && ringL < 70 && sunk < 0.5) stroke = { color: "#000000", width: 0.08 };
    else shadow = { color: "rgba(0,0,0,0.55)", blur: 0.3, y: 0.05 };
  }
  // Light captions with nothing measurable round them still carry a faint shadow (it's what
  // keeps them readable over a light shirt); a video this small hides it.
  if (!stroke && !box && !shadow && textL > 180) shadow = { color: "rgba(0,0,0,0.3)", blur: 0.2, y: 0.03 };
  const accents = inks.map((i) => i.accent).filter(Boolean) as [number, number, number][];
  const active = accents.length >= Math.max(3, inks.length * 0.2) ? hex([0, 1, 2].map((k) => median(accents.map((a) => a[k]))) as [number, number, number]) : null;
  const density = median(inks.map((i) => i.density), 0.5);
  // (A compressed video blurs letters out a little: its ink reads a shade heavier than the face is.)
  const weight = density < 0.38 ? 400 : density < 0.47 ? 500 : density < 0.57 ? 600 : density < 0.67 ? 700 : 800;
  // Narrow letters: a condensed face.
  const perLetter = median(full.map((l) => (l.ink.x1 - l.ink.x0) / Math.max(1, letters(l.text ?? "")) / (l.size * H)), 0.5);
  const font: FontFamily = perLetter < 0.4 ? "condensed" : "sans";
  // The space between words. A caption laid out whole and coming on word by word shows it
  // exactly: a line's new word starts one word gap past where the line ended a frame before.
  // (The reader can't: it runs tightly set words together.) Set well apart from Inter's own,
  // it's kept as the ink gap itself, which such a caption holds whatever the letters.
  const gaps: number[] = [];
  for (const p of pages)
    for (let i = 1; i < p.length; i++)
      for (let k = 0; k < Math.min(p[i - 1].ls.length, p[i].ls.length); k++) {
        const a = p[i - 1].ls[k];
        const b = p[i].ls[k];
        if (Math.abs(a.ink.x0 - b.ink.x0) > 1 || b.ink.x1 < a.ink.x1 + b.ink.xh) continue;
        const next = b.ink.runs?.find(([u]) => u > a.ink.x1);
        const gap = next ? next[0] - a.ink.x1 - 1 : 0;
        if (gap >= 1 && gap < 1.2 * b.ink.xh) gaps.push(gap / (b.size * H));
      }
  const gapFor = (w: number) => {
    const g = median(gaps);
    return font === "sans" && gaps.length >= 6 && Math.abs(g - interWordGap(w)) > 0.04 ? Math.round(Math.max(0.05, Math.min(0.6, g)) * 100) / 100 : undefined;
  };
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return {
    y: r3(y),
    width: r3(width),
    maxSize: r3(maxSize),
    minSize: r3(Math.min(minSize, maxSize)),
    fit,
    pitch: Math.round(pitch * 100) / 100,
    lines,
    chars,
    align,
    reveal,
    fade: reveal === "word" ? 0.12 : 0.08,
    case: kase,
    font,
    weight,
    tracking: font === "sans" ? -0.02 : 0,
    wordGap: gapFor(weight),
    color: hex(color),
    active,
    stroke,
    shadow,
    box,
    hold: 0.2,
  };
}

/**
 * Cards: pictures laid over the footage (a photo, a screenshot, a clip) that
 * slide or cut on and off. On a frame, a card is a rectangle of straight edges:
 * two long sides the same height, or a long top and bottom the same width,
 * with the rest of its outline there too wherever a caption or its own
 * picture doesn't hide it. Once one is seen, each next frame looks for it again
 * where it was (or a little to either side, when it's sliding), so a caption
 * across its edge doesn't lose it. Its moves on and off become its motion, and
 * a change of picture while it stays put starts the next card of a run.
 */
import type { CardSlot, Edge, Motion } from "../types";

export interface Gray {
  data: Uint8Array | Uint8ClampedArray | Float32Array;
  width: number;
  height: number;
}

export interface FoundRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** off the frame on that side */
  clipL: boolean;
  clipR: boolean;
  /** share of its visible outline that shows an edge */
  score: number;
}

/** Edge strength across rows (gy) and across columns (gx), 0 to 255 per pixel. */
export interface Edges {
  w: number;
  h: number;
  gx: Float32Array;
  gy: Float32Array;
}

export function edges(g: Gray): Edges {
  const { data, width: w, height: h } = g;
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      gx[i] = Math.abs(data[i + 1] - data[i - 1]) / 2;
      gy[i] = Math.abs(data[i + w] - data[i - w]) / 2;
    }
  return { w, h, gx, gy };
}

const THR = 14;
const LOW = 9;

type Line = { at: number; a: number; b: number };

/** Straight runs along rows (horizontal edges) or columns (vertical ones), gaps of up to 3 bridged. */
function lines(e: Edges, horizontal: boolean, min: number): Line[] {
  const { w, h } = e;
  const g = horizontal ? e.gy : e.gx;
  const n = horizontal ? w : h;
  const out: Line[] = [];
  for (let k = 2; k < (horizontal ? h : w) - 2; k++) {
    let a = -1;
    let last = -1;
    const flush = () => {
      if (a >= 0 && last - a + 1 >= min) out.push({ at: k, a, b: last });
    };
    for (let i = 0; i < n; i++) {
      const v = horizontal ? g[k * w + i] : g[i * w + k];
      if (v <= THR) continue;
      if (a < 0) a = i;
      else if (i - last > 4) {
        flush();
        a = i;
      }
      last = i;
    }
    flush();
  }
  // One edge a pixel or two thick counts once: keep the longest of neighbours.
  out.sort((p, q) => q.b - q.a - (p.b - p.a));
  const kept: Line[] = [];
  for (const l of out) if (!kept.some((k) => Math.abs(k.at - l.at) <= 2 && Math.min(k.b, l.b) - Math.max(k.a, l.a) > 0.5 * (l.b - l.a))) kept.push(l);
  return kept;
}

/** Share of a row's (or column's) stretch showing an edge, within a pixel of `at`. */
function cover(e: Edges, horizontal: boolean, at: number, a: number, b: number): number {
  const { w, h } = e;
  const g = horizontal ? e.gy : e.gx;
  const lim = horizontal ? h : w;
  const n = horizontal ? w : h;
  const lo = Math.max(0, Math.round(a));
  const hi = Math.min(n - 1, Math.round(b));
  if (hi <= lo) return 0;
  let hit = 0;
  for (let i = lo; i <= hi; i++) {
    let best = 0;
    for (let d = -1; d <= 1; d++) {
      const k = Math.round(at) + d;
      if (k < 1 || k >= lim - 1) continue;
      best = Math.max(best, horizontal ? g[k * w + i] : g[i * w + k]);
    }
    if (best > LOW) hit++;
  }
  return hit / (hi - lo + 1);
}

/** How much of a rectangle's visible outline is there, and whether each visible side shows enough. */
export function outline(e: Edges, x0: number, x1: number, y0: number, y1: number): { score: number; ok: boolean; clipL: boolean; clipR: boolean } {
  const { w } = e;
  const clipL = x0 <= 2;
  const clipR = x1 >= w - 3;
  const top = cover(e, true, y0, Math.max(0, x0), Math.min(w - 1, x1));
  const bottom = cover(e, true, y1, Math.max(0, x0), Math.min(w - 1, x1));
  const sides: number[] = [];
  if (!clipL) sides.push(cover(e, false, x0, y0, y1));
  if (!clipR) sides.push(cover(e, false, x1, y0, y1));
  const all = [top, bottom, ...sides];
  const score = all.reduce((s, v) => s + v, 0) / all.length;
  // A caption can hide most of a top or bottom; the sides that show, and the outline overall, must be there.
  const ok = score >= 0.6 && Math.max(top, bottom) >= 0.6 && Math.min(top, bottom) >= 0.2 && sides.every((s) => s >= 0.4);
  return { score, ok, clipL, clipR };
}

/**
 * A card's picture can hide part of its outline (a white shirt on a white wall),
 * so a rectangle found short is pushed out to the furthest edge line that still
 * gives a whole outline: down, up, left and right in turn.
 */
export function grow(e: Edges, r: FoundRect, only: "all" | "mirror" | "y" = "all"): FoundRect {
  let { x0, x1, y0, y1 } = r;
  const { w, h } = e;
  const okAt = (a: number, b: number, c: number, d: number) => {
    const o = outline(e, a, b, c, d);
    return o.ok ? o : null;
  };
  for (let pass = 0; pass < (only === "mirror" ? 1 : 2); pass++) {
    if (only !== "mirror")
    for (let y = h - 3; y > y1 + 2; y--) {
      if (cover(e, true, y, x0, x1) < 0.55) continue;
      if (okAt(x0, x1, y0, y)) {
        y1 = y;
        break;
      }
    }
    if (only !== "mirror")
    for (let y = 2; y < y0 - 2; y++) {
      if (cover(e, true, y, x0, x1) < 0.55) continue;
      if (okAt(x0, x1, y, y1)) {
        y0 = y;
        break;
      }
    }
    // Cards are mostly centred: a fainter side where the other side's mirror is counts too.
    const mirror = w - 1 - x1;
    if (only !== "y" && !r.clipL && !r.clipR && x0 > mirror + 3 && mirror > 2) {
      let best = -1;
      for (let x = mirror - 2; x <= mirror + 2; x++) if (cover(e, false, x, y0, y1) >= 0.3 && (best < 0 || cover(e, false, x, y0, y1) > cover(e, false, best, y0, y1))) best = x;
      if (best >= 0 && cover(e, true, y0, best, x1) >= 0.4 && cover(e, true, y1, best, x1) >= 0.3) x0 = best;
    }
    const mirrorR = w - 1 - x0;
    if (only !== "y" && !r.clipL && !r.clipR && x1 < mirrorR - 3 && mirrorR < w - 3) {
      let best = -1;
      for (let x = mirrorR - 2; x <= mirrorR + 2; x++) if (cover(e, false, x, y0, y1) >= 0.3 && (best < 0 || cover(e, false, x, y0, y1) > cover(e, false, best, y0, y1))) best = x;
      if (best >= 0 && cover(e, true, y0, x0, best) >= 0.4 && cover(e, true, y1, x0, best) >= 0.3) x1 = best;
    }
    if (!r.clipL && only === "all")
      for (let x = 2; x < x0 - 2; x++) {
        if (cover(e, false, x, y0, y1) < 0.55) continue;
        if (okAt(x, x1, y0, y1)) {
          x0 = x;
          break;
        }
      }
    if (!r.clipR && only === "all")
      for (let x = w - 3; x > x1 + 2; x--) {
        if (cover(e, false, x, y0, y1) < 0.55) continue;
        if (okAt(x0, x, y0, y1)) {
          x1 = x;
          break;
        }
      }
  }
  const o = outline(e, x0, x1, y0, y1);
  return { x0, x1, y0, y1, clipL: o.clipL, clipR: o.clipR, score: o.score };
}

/** The cards on one frame: every rectangle whose outline is mostly there, the biggest of any that nest. */
export function findRects(g: Gray | Edges): FoundRect[] {
  const e = "gx" in g ? g : edges(g);
  const { w, h } = e;
  const hs = lines(e, true, Math.round(0.1 * w));
  const vs = lines(e, false, Math.round(0.1 * h));
  const cands: FoundRect[] = [];
  const tryRect = (x0: number, x1: number, y0: number, y1: number) => {
    if (x1 - x0 < 0.2 * w || y1 - y0 < 0.1 * h) return;
    if (x0 <= 2 && x1 >= w - 3) return; // across the whole frame: bars, not a card
    const o = outline(e, x0, x1, y0, y1);
    if (o.ok) cands.push({ x0, x1, y0, y1, clipL: o.clipL, clipR: o.clipR, score: o.score });
  };
  // Two sides of about the same height.
  for (let i = 0; i < vs.length; i++)
    for (let j = 0; j < vs.length; j++) {
      const l = vs[i];
      const r = vs[j];
      if (r.at - l.at < 0.2 * w) continue;
      const ov = Math.min(l.b, r.b) - Math.max(l.a, r.a);
      if (ov < 0.6 * Math.min(l.b - l.a, r.b - r.a)) continue;
      tryRect(l.at, r.at, Math.min(l.a, r.a), Math.max(l.b, r.b));
    }
  // A top and a bottom over about the same stretch (a card half off the frame has one side at most).
  for (let i = 0; i < hs.length; i++)
    for (let j = 0; j < hs.length; j++) {
      const t = hs[i];
      const b = hs[j];
      if (b.at - t.at < 0.1 * h) continue;
      const ov = Math.min(t.b, b.b) - Math.max(t.a, b.a);
      if (ov < 0.5 * Math.max(t.b - t.a, b.b - b.a)) continue;
      const x0 = Math.min(t.a, b.a);
      const x1 = Math.max(t.b, b.b);
      tryRect(x0 <= 4 ? 0 : x0, x1 >= w - 5 ? w - 1 : x1, t.at, b.at);
    }
  // The truest outline first; one much like it, or a small one inside it (its picture), is the same card.
  cands.sort((p, q) => q.score - p.score || area(q) - area(p));
  const kept: FoundRect[] = [];
  for (const c of cands) {
    const nested = kept.some((k) => c.x0 >= k.x0 - 3 && c.x1 <= k.x1 + 3 && c.y0 >= k.y0 - 3 && c.y1 <= k.y1 + 3 && area(c) < 0.6 * area(k));
    const same = kept.some((k) => iou(k, c) > 0.6);
    if (!nested && !same) kept.push(c);
  }
  return kept;
}

const area = (r: { x0: number; x1: number; y0: number; y1: number }) => (r.x1 - r.x0) * (r.y1 - r.y0);
function iou(a: FoundRect, b: FoundRect): number {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const inter = ix * iy;
  return inter / Math.max(1, area(a) + area(b) - inter);
}

/** A rect's inside as an 8 × 8 grid of mean grays (its visible part). */
export function insideLook(g: Gray, r: { x0: number; x1: number; y0: number; y1: number }): Float32Array {
  const out = new Float32Array(64);
  const cnt = new Float32Array(64);
  const x0 = Math.max(0, Math.round(r.x0) + 2);
  const x1 = Math.min(g.width - 1, Math.round(r.x1) - 2);
  const y0 = Math.round(r.y0) + 2;
  const y1 = Math.round(r.y1) - 2;
  if (x1 <= x0 || y1 <= y0) return out;
  for (let y = y0; y <= y1; y++) {
    const gy = Math.min(7, Math.floor(((y - y0) / (y1 - y0 + 1)) * 8));
    for (let x = x0; x <= x1; x++) {
      const gx = Math.min(7, Math.floor(((x - x0) / (x1 - x0 + 1)) * 8));
      out[gy * 8 + gx] += g.data[y * g.width + x];
      cnt[gy * 8 + gx]++;
    }
  }
  for (let i = 0; i < 64; i++) out[i] = cnt[i] ? out[i] / cnt[i] : -1;
  return out;
}

function lookDiff(a?: Float32Array, b?: Float32Array): number {
  if (!a || !b) return 0;
  let s = 0;
  let n = 0;
  for (let i = 0; i < 64; i++) {
    if (a[i] < 0 || b[i] < 0) continue;
    s += Math.abs(a[i] - b[i]);
    n++;
  }
  return n ? s / n : 0;
}

interface Seen {
  t: number;
  /** left edge (the width known), top, bottom */
  x: number;
  look?: Float32Array;
}

interface Track {
  y0: number;
  y1: number;
  /** full width, once seen whole */
  width: number;
  /** the side it's off the frame, while its width isn't known */
  clip: "L" | "R" | null;
  /** the edge that shows, while its width isn't known */
  edge: number;
  seen: Seen[];
  missed: number;
  /** how different its picture is from what was there a few frames before it came (0 to 255) */
  novel: number;
  /** whole outlines found at its place, by width: the width seen most is its width */
  widths: Map<number, number>;
  /** left edges found for each width */
  lefts: Map<number, number[]>;
}

/**
 * Follows cards frame by frame. Feed it every frame in order (`push`), then
 * `finish` for the cards it saw. A card is looked for again where it was, or
 * up to a third of the frame either side (a slide), before new ones are found;
 * anything found inside a card is part of its picture.
 */
export class CardFinder {
  private readonly tracks: Track[] = [];
  private readonly open: Track[] = [];
  /** the last few frames, to see what was there before a card came */
  private readonly past: Gray[] = [];
  private w = 0;
  private h = 0;

  constructor(
    private readonly fps: number,
    /** a card can't be on screen longer than this (a rectangle in the room is not a card) */
    private readonly longest = 12,
  ) {}

  push(t: number, g: Gray) {
    const e = edges(g);
    const { w } = e;
    this.w = e.w;
    this.h = e.h;
    const reach = Math.round(w / 3);
    const found = findRects(e);
    const claimed: FoundRect[] = [];
    for (const tr of [...this.open]) {
      const last = tr.seen[tr.seen.length - 1];
      let hit: { x: number; x1: number } | null = null;
      if (tr.width) {
        const W = tr.width;
        let best = -Infinity;
        for (let dx = -reach; dx <= reach; dx++) {
          const x0 = last.x + dx;
          if (x0 + W < 0.12 * w || x0 > 0.88 * w) continue;
          const o = outline(e, Math.max(0, x0), Math.min(w - 1, x0 + W), tr.y0, tr.y1);
          // Staying put wins a tie; moving must be clearly better.
          const s = o.score - Math.abs(dx) * 0.0005;
          if (o.ok && s > best) {
            best = s;
            hit = { x: x0, x1: x0 + W };
          }
        }
      } else {
        // Still half off the frame: the same top and bottom, off the same side, its edge nearby.
        const near = (r: FoundRect, tol: number) => Math.abs(r.y0 - tr.y0) <= tol && Math.abs(r.y1 - tr.y1) <= tol;
        const same = found.flatMap((r) => (near(r, 6) ? [r] : Math.abs(r.y0 - tr.y0) <= 6 || Math.abs(r.y1 - tr.y1) <= 6 ? [grow(e, r, "y")].filter((g) => near(g, 3)) : []));
        const whole = same.find((r) => !r.clipL && !r.clipR);
        if (whole) {
          tr.width = whole.x1 - whole.x0;
          tr.clip = null;
          hit = { x: whole.x0, x1: whole.x1 };
        } else {
          const part = same.find((r) => (tr.clip === "R" ? r.clipR && Math.abs(r.x0 - tr.edge) <= reach : r.clipL && Math.abs(r.x1 - tr.edge) <= reach));
          if (part) {
            tr.edge = tr.clip === "R" ? part.x0 : part.x1;
            hit = { x: part.x0, x1: part.x1 };
          }
        }
      }
      if (hit) {
        // Whole outlines found here vote for the card's width (a side its picture hides can come back).
        for (const r of found) {
          if (r.clipL || r.clipR || Math.abs(r.y0 - tr.y0) > 4 || Math.abs(r.y1 - tr.y1) > 4 || Math.min(r.x1, hit.x1) - Math.max(r.x0, hit.x) < 0.5 * (r.x1 - r.x0)) continue;
          const m = grow(e, r, "mirror");
          const W = Math.round((m.x1 - m.x0) / 2) * 2;
          tr.widths.set(W, (tr.widths.get(W) ?? 0) + 1);
          tr.lefts.set(W, [...(tr.lefts.get(W) ?? []), m.x0]);
        }
        const top = [...tr.widths.entries()].sort((a, b) => b[1] - a[1])[0];
        if (top && top[1] >= 3 && Math.abs(top[0] - tr.width) > 3) {
          const ls = tr.lefts.get(top[0])!;
          tr.width = top[0];
          hit = { x: ls[ls.length - 1], x1: ls[ls.length - 1] + top[0] };
        }
        const box = { x0: Math.max(0, hit.x), x1: Math.min(w - 1, hit.x1), y0: tr.y0, y1: tr.y1 };
        tr.seen.push({ t, x: hit.x, look: tr.width ? insideLook(g, box) : undefined });
        tr.missed = 0;
        claimed.push({ ...box, clipL: false, clipR: false, score: 1 });
      } else if (++tr.missed > 3) this.open.splice(this.open.indexOf(tr), 1);
    }
    for (let r of found) {
      if (claimed.some((c) => iou(c, r) > 0.4 || (Math.abs(c.y0 - r.y0) <= 3 && Math.abs(c.y1 - r.y1) <= 3) || (r.x0 >= c.x0 - 3 && r.x1 <= c.x1 + 3 && r.y0 >= c.y0 - 3 && r.y1 <= c.y1 + 3))) continue;
      if (r.x1 - r.x0 < 0.25 * w || r.y1 - r.y0 < 0.12 * e.h) continue;
      r = grow(e, r, "mirror");
      if (this.open.some((o) => Math.abs(o.y0 - r.y0) <= 3 && Math.abs(o.y1 - r.y1) <= 3)) continue;
      const clip = r.clipL ? "L" : r.clipR ? "R" : null;
      const before = this.past[0];
      const novel = before ? lookDiff(insideLook(before, r), insideLook(g, r)) : 255;
      const tr: Track = { y0: r.y0, y1: r.y1, width: clip ? 0 : r.x1 - r.x0, clip, edge: clip === "R" ? r.x0 : r.x1, seen: [{ t, x: r.x0, look: clip ? undefined : insideLook(g, r) }], missed: 0, novel, widths: new Map(), lefts: new Map() };
      this.open.push(tr);
      this.tracks.push(tr);
      claimed.push(r);
    }
    this.past.push({ data: Uint8Array.from(g.data), width: g.width, height: g.height });
    if (this.past.length > 5) this.past.shift();
  }

  finish(cuts: number[] = []): CardSlot[] {
    const { w, h, fps } = this;
    const dt = 1 / fps;
    // (tracks are in the order they started, so a run's first card is placed before the next)
    const slots: CardSlot[] = [];
    let run = 0;
    const runOf = new Map<Track, number>();
    // Two tracks of one card (found twice while it slid in): keep the one seen more.
    const box = (tr: Track) => {
      const xs = tr.seen.map((q) => q.x).sort((a, b) => a - b);
      const x = xs[xs.length >> 1];
      return { x0: x, x1: x + tr.width, y0: tr.y0, y1: tr.y1, clipL: false, clipR: false, score: 0 };
    };
    // A card is a new picture: something that was already there (an arm, a door) isn't one,
    // unless it takes over from a card that just left the same place (the next of a run).
    const ends = (tr: Track) => tr.seen[tr.seen.length - 1].t + dt;
    const rough = (tr: Track) => {
      const xs = tr.seen.map((q) => q.x).sort((a, b) => a - b);
      return { x0: xs[xs.length >> 1], x1: xs[xs.length >> 1] + tr.width, y0: tr.y0, y1: tr.y1, clipL: false, clipR: false, score: 0 };
    };
    const shaped = this.tracks.filter((tr) => tr.width && tr.seen.length >= 4);
    const follows = new Map<Track, Track>();
    const alive = shaped.filter((tr) => {
      if (tr.novel >= 14) return true;
      const prev = shaped.find((o) => o !== tr && o.novel >= 14 && Math.abs(tr.seen[0].t - ends(o)) < 0.25 && iou(rough(o), rough(tr)) > 0.5);
      if (prev) follows.set(tr, prev);
      return !!prev;
    });
    const dropped = new Set<Track>();
    for (const a of alive)
      for (const b of alive) {
        if (a === b || dropped.has(a) || dropped.has(b)) continue;
        const overlap = Math.min(a.seen[a.seen.length - 1].t, b.seen[b.seen.length - 1].t) - Math.max(a.seen[0].t, b.seen[0].t);
        if (overlap <= 0.1) continue;
        const A = box(a);
        const B = box(b);
        if (iou(A, B) > 0.5) dropped.add(a.seen.length >= b.seen.length ? b : a);
        else {
          // Mostly inside another card at the same time: part of that card's picture.
          const ix = Math.max(0, Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0)) * Math.max(0, Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0));
          if (ix > 0.8 * Math.min(area(A), area(B))) dropped.add(area(A) < area(B) ? a : b);
        }
      }
    for (const tr of alive) {
      if (dropped.has(tr)) continue;
      const W = tr.width;
      // Frames seen before the width was known: their left edge from the edge that showed.
      const xs = tr.seen.map((s) => s.x);
      const t0 = tr.seen[0].t;
      const t1 = tr.seen[tr.seen.length - 1].t + dt;
      if (t1 - t0 < 0.3 || t1 - t0 > this.longest) continue;
      const counts = new Map<number, number>();
      for (const x of xs) counts.set(Math.round(x), (counts.get(Math.round(x)) ?? 0) + 1);
      const rest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      // A card rests inside the frame; one that "rests" half off it is edges that lined up by chance.
      if (rest < -0.02 * w || rest + W > 1.02 * w) continue;
      const still = (i: number) => Math.abs(xs[i] - rest) <= 1.5;
      const stillFrames = xs.filter((_, i) => still(i)).length;
      if (stillFrames * dt < 0.2) continue;
      let a = 0;
      while (a < xs.length && !still(a)) a++;
      let b = xs.length - 1;
      while (b > a && !still(b)) b--;
      const enter = motionOf(xs.slice(0, a + 1), rest, W, w, dt, "in");
      const exit = motionOf(xs.slice(b).reverse(), rest, W, w, dt, "out");
      const swaps: number[] = [];
      for (let i = a + 1; i <= b; i++) if (still(i) && still(i - 1) && lookDiff(tr.seen[i].look, tr.seen[i - 1].look) > 22) swaps.push(tr.seen[i].t);
      const bounds = [t0, ...swaps.filter((s, i, all) => s - t0 > 0.2 && t1 - s > 0.2 && (i === 0 || s - all[i - 1] > 0.2)), t1];
      const rect: [number, number, number, number] = [rest / w, tr.y0 / h, W / w, (tr.y1 - tr.y0) / h];
      const prev = follows.get(tr);
      const r = prev && runOf.has(prev) ? runOf.get(prev)! : run++;
      runOf.set(tr, r);
      for (let k = 0; k + 1 < bounds.length; k++) {
        slots.push({
          id: "",
          start: bounds[k],
          end: bounds[k + 1],
          rect,
          enter: k === 0 ? enter : { kind: "cut", dur: 0, ease: "linear" },
          exit: k === bounds.length - 2 ? exit : { kind: "cut", dur: 0, ease: "linear" },
          run: r,
          content: "unknown",
          radius: 0,
        });
      }
    }
    void cuts;
    slots.sort((p, q) => p.start - q.start);
    slots.forEach((s, i) => (s.id = `card${i + 1}`));
    return slots;
  }
}

/**
 * How a card came on (or, read backwards, went off): its left edge from its
 * first frame to the frame it settles, in pixels. Starting well away from where
 * it rests is a slide from that side; the easing is how much of the way it
 * covers by the middle of the move.
 */
function motionOf(lefts: number[], rest: number, W: number, w: number, dt: number, dir: "in" | "out"): Motion {
  if (lefts.length < 2) return { kind: "cut", dur: 0, ease: "linear" };
  const dist = lefts[0] - rest;
  if (Math.abs(dist) < 3) return { kind: "cut", dur: 0, ease: "linear" };
  const from: Edge = dist > 0 ? "right" : "left";
  // The frames before it was seen took part of the move too: from fully off the frame.
  const full = dist > 0 ? w - rest : rest + W;
  const seen = lefts.length - 1;
  const firstStep = Math.abs(lefts[1] - lefts[0]);
  const before = Math.min(3, Math.max(0, (full - Math.abs(dist)) / Math.max(1, firstStep)));
  const mid = lefts[Math.floor(seen / 2)];
  const done = 1 - Math.abs(mid - rest) / Math.abs(dist);
  const ease = done > 0.62 ? (dir === "in" ? "out" : "in") : done < 0.38 ? (dir === "in" ? "in" : "out") : "linear";
  return { kind: "slide", from, dur: Math.round((seen + before) * dt * 1000) / 1000, ease };
}

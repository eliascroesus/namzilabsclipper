/**
 * Zooms: how much bigger (or smaller) each frame of the footage is than the one
 * before. Each frame is compared with the one before it scaled about the
 * middle and nudged a pixel or two, on a small gray copy, leaving out where the
 * captions and cards are; the scale that matches best is the zoom. Runs of
 * frames that all grow (or shrink) are one zoom: a punch-in or a pull-out,
 * with how far it went and how long it took.
 */
import type { ZoomChange, ZoomLook } from "../types";
import type { Gray } from "./cards";

/** Sum of absolute differences of `b` against `a` scaled by `s` about the middle and moved by (tx, ty), on every `step`-th pixel inside the mask. */
function sad(a: Gray, b: Gray, s: number, tx: number, ty: number, mask: Uint8Array | null, step: number): number {
  const { width: w, height: h } = a;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  let sum = 0;
  let n = 0;
  for (let y = 4; y < h - 4; y += step) {
    // b's pixel (x, y) shows what a had at the middle + (x - middle) / s
    const sy = cy + (y - cy - ty) / s;
    const y0 = Math.floor(sy);
    if (y0 < 0 || y0 >= h - 1) continue;
    const fy = sy - y0;
    for (let x = 4; x < w - 4; x += step) {
      if (mask && !mask[y * w + x]) continue;
      const sx = cx + (x - cx - tx) / s;
      const x0 = Math.floor(sx);
      if (x0 < 0 || x0 >= w - 1) continue;
      const fx = sx - x0;
      const i = y0 * w + x0;
      const v = (a.data[i] * (1 - fx) + a.data[i + 1] * fx) * (1 - fy) + (a.data[i + w] * (1 - fx) + a.data[i + w + 1] * fx) * fy;
      sum += Math.abs(b.data[y * w + x] - v);
      n++;
    }
  }
  return n ? sum / n : Infinity;
}

export interface Scale {
  /** b is this much bigger than a */
  s: number;
  tx: number;
  ty: number;
  /** mean difference left at the best match, and with no change at all */
  err: number;
  still: number;
}

/** How much bigger frame b is than frame a (same size, gray). */
export function scaleBetween(a: Gray, b: Gray, mask: Uint8Array | null = null, range = 0.08): Scale {
  const still = sad(a, b, 1, 0, 0, mask, 2);
  let best = { s: 1, tx: 0, ty: 0, err: still };
  // Coarse: scale alone, 1% apart.
  const coarse: { s: number; err: number }[] = [];
  for (let s = 1 - range; s <= 1 + range + 1e-9; s += 0.01) coarse.push({ s, err: sad(a, b, s, 0, 0, mask, 3) });
  coarse.sort((p, q) => p.err - q.err);
  // Fine: around the two best, a quarter percent apart; then a pixel or two either way; then the scale again.
  for (const c of coarse.slice(0, 2)) {
    for (let k = -3; k <= 3; k++) {
      const s = c.s + k * 0.0025;
      const err = sad(a, b, s, 0, 0, mask, 2);
      if (err < best.err) best = { s, tx: 0, ty: 0, err };
    }
  }
  const s0 = best.s;
  for (let ty = -2; ty <= 2; ty++)
    for (let tx = -2; tx <= 2; tx++) {
      if (!tx && !ty) continue;
      const err = sad(a, b, s0, tx, ty, mask, 2);
      if (err < best.err) best = { s: s0, tx, ty, err };
    }
  for (let k = -2; k <= 2; k++) {
    if (!k) continue;
    const s = best.s + k * 0.0025;
    const err = sad(a, b, s, best.tx, best.ty, mask, 2);
    if (err < best.err) best = { ...best, s, err };
  }
  // No real match gained over standing still: no zoom.
  if (still - best.err < 0.15) best = { s: 1, tx: 0, ty: 0, err: still };
  return { ...best, still };
}

export interface ZoomEvent {
  start: number;
  end: number;
  /** total change: 1.15 is 15% bigger */
  total: number;
  frames: number;
}

/**
 * Zoom events from per-frame scales (each frame against the one before; 1 = no
 * change): a frame growing 1.2% or more starts one, and it lasts while each
 * next frame keeps changing the same way by 0.4% or more. Under 3% in all isn't one.
 */
export function zoomEvents(times: number[], scales: number[], fps: number): ZoomEvent[] {
  const logs = scales.map((s) => Math.log(s || 1));
  const out: ZoomEvent[] = [];
  let i = 0;
  while (i < logs.length) {
    if (Math.abs(logs[i]) > 0.012) {
      let j = i;
      while (j + 1 < logs.length && Math.abs(logs[j + 1]) > 0.004 && Math.sign(logs[j + 1]) === Math.sign(logs[i])) j++;
      let sum = 0;
      for (let k = i; k <= j; k++) sum += logs[k];
      if (Math.abs(sum) > 0.03) out.push({ start: times[i] - 1 / fps, end: times[j], total: Math.exp(sum), frames: j - i + 1 });
      i = j + 1;
    } else i++;
  }
  return out;
}

/**
 * The footage's zoom as the reference edits it: the level it steps between
 * (the close one, against the wide), how long a step takes, how often it
 * steps, and each step, as the level after it.
 */
export function zoomLook(events: ZoomEvent[], fps: number, spans: [number, number][]): ZoomLook | null {
  if (!events.length) return null;
  const changes: ZoomChange[] = [];
  // Levels within each stretch of the main footage, the lowest of each stretch being the wide.
  for (const [a, b] of spans) {
    const inside = events.filter((e) => e.start >= a - 0.05 && e.end <= b + 0.05);
    if (!inside.length) continue;
    let level = 1;
    const levels = [1];
    const raw: { t: number; level: number; dur: number }[] = [];
    for (const e of inside) {
      level *= e.total;
      levels.push(level);
      raw.push({ t: e.start, level, dur: e.frames <= 2 ? 0 : Math.round((e.frames / fps) * 1000) / 1000 });
    }
    const wide = Math.min(...levels);
    for (const r of raw) changes.push({ t: r.t, level: Math.round((r.level / wide) * 1000) / 1000, dur: r.dur });
  }
  if (!changes.length) return null;
  const closes = changes.map((c) => c.level).filter((l) => l > 1.02).sort((p, q) => p - q);
  const durs = changes.map((c) => c.dur).sort((p, q) => p - q);
  const gaps: number[] = [];
  for (let i = 1; i < changes.length; i++) {
    const g = changes[i].t - changes[i - 1].t;
    if (g < 8) gaps.push(g);
  }
  gaps.sort((p, q) => p - q);
  const mid = (v: number[], d: number) => (v.length ? v[v.length >> 1] : d);
  return { close: Math.round(mid(closes, 1.12) * 1000) / 1000, dur: mid(durs, 0.2), every: Math.round(mid(gaps, 2.5) * 100) / 100, changes };
}

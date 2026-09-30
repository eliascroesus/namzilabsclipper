/**
 * Shots: where the reference cuts, which shots are the talking footage (the
 * A-roll: one set-up, one look) and which are cutaways laid over the talk (the
 * B-roll), and the black it may end on. Frames are small grays (90 × 160). A
 * cut changes most of the frame at once, not one rectangle of it (a card
 * swapping its picture changes only the card).
 */
import type { Gray } from "./cards";

/** Mean absolute change of each of 4 × 4 cells between two frames. */
function cellChange(a: Gray, b: Gray): number[] {
  const { width: w, height: h } = a;
  const out = new Array(16).fill(0);
  const n = new Array(16).fill(0);
  for (let y = 0; y < h; y++) {
    const cy = Math.min(3, Math.floor((y / h) * 4));
    for (let x = 0; x < w; x++) {
      const c = cy * 4 + Math.min(3, Math.floor((x / w) * 4));
      out[c] += Math.abs(a.data[y * w + x] - b.data[y * w + x]);
      n[c]++;
    }
  }
  return out.map((v, i) => v / n[i]);
}

/**
 * Cuts: frames where at least 12 of the 16 cells change a lot, far more than
 * the frames around it change (so a fast pan or a flash of light isn't one).
 */
export function findCuts(frames: Gray[], times: number[]): number[] {
  const total: number[] = [0];
  const wide: boolean[] = [false];
  for (let i = 1; i < frames.length; i++) {
    const cells = cellChange(frames[i - 1], frames[i]);
    total.push(cells.reduce((a, b) => a + b, 0) / 16);
    wide.push(cells.filter((c) => c > 14).length >= 12);
  }
  const cuts: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    if (!wide[i]) continue;
    const around: number[] = [];
    for (let k = Math.max(1, i - 8); k <= Math.min(frames.length - 1, i + 8); k++) if (k !== i) around.push(total[k]);
    around.sort((p, q) => p - q);
    const med = around[around.length >> 1] ?? 0;
    if (total[i] > Math.max(18, 4 * med)) cuts.push(times[i]);
  }
  return cuts;
}

/** A shot's look: its middle frame's 9 × 16 layout of grays, normalised. */
function layout(g: Gray): Float32Array {
  const out = new Float32Array(144);
  const n = new Float32Array(144);
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++) {
      const k = Math.min(15, Math.floor((y / g.height) * 16)) * 9 + Math.min(8, Math.floor((x / g.width) * 9));
      out[k] += g.data[y * g.width + x];
      n[k]++;
    }
  let m = 0;
  for (let i = 0; i < 144; i++) m += (out[i] /= Math.max(1, n[i]));
  m /= 144;
  let v = 0;
  for (let i = 0; i < 144; i++) v += (out[i] - m) ** 2;
  const sd = Math.sqrt(v / 144) || 1;
  for (let i = 0; i < 144; i++) out[i] = (out[i] - m) / sd;
  return out;
}

const corr = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s / a.length;
};

export interface Shot {
  start: number;
  end: number;
  /** part of the talking footage */
  main: boolean;
}

/**
 * The shots between cuts, each marked as the talking footage or not: the
 * longest shot sets the look, and a shot whose layout matches it (or matches a
 * shot that does) is the same set-up.
 */
export function classifyShots(frames: Gray[], times: number[], cuts: number[], duration: number, faces?: (t: number) => boolean): Shot[] {
  const bounds = [0, ...cuts, duration];
  const shots = bounds.slice(0, -1).map((a, i) => ({ start: a, end: bounds[i + 1], main: false }));
  const looks = shots.map((s) => {
    const mid = (s.start + s.end) / 2;
    let k = 0;
    while (k + 1 < times.length && times[k + 1] <= mid) k++;
    return layout(frames[k]);
  });
  const longest = shots.reduce((b, s, i) => (s.end - s.start > shots[b].end - shots[b].start ? i : b), 0);
  shots[longest].main = true;
  for (let pass = 0; pass < 3; pass++)
    shots.forEach((s, i) => {
      if (s.main) return;
      if (shots.some((o, j) => o.main && corr(looks[i], looks[j]) > 0.75)) s.main = true;
    });
  // A face-finder, when there is one: the talking footage has the speaker in it.
  if (faces) for (const s of shots) if (s.main && s.end - s.start > 1 && !faces((s.start + s.end) / 2)) s.main = false;
  return shots;
}

/** Seconds of black at the very end. */
export function blackTail(means: number[], times: number[], duration: number): number {
  let i = means.length - 1;
  while (i >= 0 && means[i] < 10) i--;
  if (i === means.length - 1) return 0;
  return Math.max(0, duration - (times[i + 1] ?? duration));
}

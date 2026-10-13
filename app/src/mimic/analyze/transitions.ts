/**
 * Transitions: what the reference does as one shot gives way to the next. A hard cut;
 * a crossfade (the frames between are mixes of the two shots); a dip through black or
 * white, or a flash; a push (both pictures moving as one, the next following the last
 * in), a slide (the next sliding over the last as it stays, or the last sliding off
 * the next), a wipe (both still, an edge sweeping across), a whip (the pictures thrown
 * one way so fast they smear); a zoom through the cut; a blur; a glitch's torn rows;
 * and the fade up from black that opens an edit or the fade down that ends it. Read on
 * the small gray copies of every frame.
 *
 * Where the picture changes: each frame against the one before with the camera's own
 * move taken out (the shift that leaves the least difference), against what the shots
 * either side do frame to frame. A pan or a handheld shake changes every frame a lot
 * and none of it is left once the move is taken out; a crossfade between moving shots
 * leaves its mixing. A run of frames changing like that is one transition; a lone frame
 * of it is a hard cut (the cut finder's), and frames held between two changes (a
 * flipbook) keep them apart.
 *
 * A camera's own pan or zoom inside a shot is not a transition: where the frame after
 * the change is the frame before it moved or scaled, it's the same shot. (The first
 * pass of tools/break_down.py took those for whips and spins; these tests rule them out.)
 */
import type { TransitionLook, Way } from "../types";
import type { Gray } from "./cards";
import { scaleBetween } from "./zoom";

export interface FoundTransition extends TransitionLook {
  /** the cut's time: a hard cut's first frame of the next shot, or a gradual one's middle */
  t: number;
  /** what was measured, for the page */
  why: string;
}

export interface FrameStats {
  /** brightness, 0 to 255 */
  luma: number;
  /** sharpness: mean absolute Laplacian, on a half-size copy (the picture's edges, not its compression noise) */
  sharp: number;
  /** rows breaking off clean right across the frame */
  tear: number;
  /** edges across x and across y (mean absolute step to the next pixel): a sideways smear loses the first */
  gx: number;
  gy: number;
}

export function frameStats(g: Gray): FrameStats {
  const { data, width: w, height: h } = g;
  let sum = 0;
  for (let i = 0; i < w * h; i++) sum += data[i];
  const hw = w >> 1;
  const hh = h >> 1;
  const half = new Float32Array(hw * hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) half[y * hw + x] = (data[2 * y * w + 2 * x] + data[2 * y * w + 2 * x + 1] + data[(2 * y + 1) * w + 2 * x] + data[(2 * y + 1) * w + 2 * x + 1]) / 4;
  let lap = 0;
  let n = 0;
  let gx = 0;
  let gy = 0;
  for (let y = 1; y < hh - 1; y++)
    for (let x = 1; x < hw - 1; x++) {
      const i = y * hw + x;
      lap += Math.abs(4 * half[i] - half[i - 1] - half[i + 1] - half[i - hw] - half[i + hw]);
      gx += Math.abs(half[i + 1] - half[i]);
      gy += Math.abs(half[i + hw] - half[i]);
      n++;
    }
  let tear = 0;
  for (let y = 0; y + 1 < h; y++) {
    let k = 0;
    for (let x = 0; x < w; x++) if (Math.abs(data[(y + 1) * w + x] - data[y * w + x]) > 40) k++;
    if (k > 0.55 * w) tear++;
  }
  return { luma: sum / (w * h), sharp: n ? lap / n : 0, tear, gx: n ? gx / n : 0, gy: n ? gy / n : 0 };
}

/** Mean absolute difference of two frames, every `step`-th pixel. */
export function frameDiff(a: Gray, b: Gray, step = 2): number {
  const { width: w, height: h } = a;
  let s = 0;
  let n = 0;
  for (let y = 0; y < h; y += step)
    for (let x = 0; x < w; x += step) {
      const i = y * w + x;
      s += Math.abs(a.data[i] - b.data[i]);
      n++;
    }
  return n ? s / n : 0;
}

/** The frame k times smaller each way, each pixel the mean of a k × k block. */
function shrink(g: Gray, k: number): Gray {
  if (k <= 1) return g;
  const w = Math.max(1, Math.floor(g.width / k));
  const h = Math.max(1, Math.floor(g.height / k));
  const out = new Float32Array(w * h);
  const W = g.width;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let v = 0; v < k; v++) for (let u = 0; u < k; u++) s += g.data[(y * k + v) * W + x * k + u];
      out[y * w + x] = s / (k * k);
    }
  return { data: out, width: w, height: h };
}

/** The difference left between b and a moved by (dx, dy) pixels, where they overlap (Infinity under half of it). */
function moved(a: Gray, b: Gray, dx: number, dy: number): number {
  const { width: w, height: h } = a;
  let s = 0;
  let n = 0;
  for (let y = Math.max(0, dy); y < Math.min(h, h + dy); y++)
    for (let x = Math.max(0, dx); x < Math.min(w, w + dx); x++) {
      s += Math.abs(b.data[y * w + x] - a.data[(y - dy) * w + (x - dx)]);
      n++;
    }
  return n >= 0.5 * w * h ? s / n : Infinity;
}

/** The camera's move from a to b: the shift within r pixels leaving the least difference, that difference, and standing still's. */
function motion(a: Gray, b: Gray, r: number): { dx: number; dy: number; err: number; still: number } {
  const still = moved(a, b, 0, 0);
  let best = { dx: 0, dy: 0, err: still };
  for (let dy = -r; dy <= r; dy += 2)
    for (let dx = -r; dx <= r; dx += 2) {
      const e = moved(a, b, dx, dy);
      if (e < best.err) best = { dx, dy, err: e };
    }
  const { dx: x0, dy: y0 } = best;
  for (let dy = y0 - 1; dy <= y0 + 1; dy++)
    for (let dx = x0 - 1; dx <= x0 + 1; dx++) {
      if (Math.abs(dx) > r || Math.abs(dy) > r) continue;
      const e = moved(a, b, dx, dy);
      if (e < best.err) best = { dx, dy, err: e };
    }
  return { ...best, still };
}

/** How well x is a mix of a and b: the share of b in it (0 to 1) and the difference left. */
function mixFit(x: Gray, a: Gray, b: Gray): { alpha: number; err: number } {
  let num = 0;
  let den = 0;
  const n = x.width * x.height;
  for (let i = 0; i < n; i++) {
    const d = b.data[i] - a.data[i];
    num += (x.data[i] - a.data[i]) * d;
    den += d * d;
  }
  const alpha = den > 1e-6 ? Math.min(1, Math.max(0, num / den)) : 0;
  let err = 0;
  for (let i = 0; i < n; i++) err += Math.abs(x.data[i] - (a.data[i] + alpha * (b.data[i] - a.data[i])));
  return { alpha, err: err / Math.max(1, n) };
}

/** How alike two frames' pictures are, brightness and contrast aside: their correlation (1: the same picture). */
function correlation(a: Gray, b: Gray): number {
  const n = a.width * a.height;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) (ma += a.data[i]), (mb += b.data[i]);
  ma /= n;
  mb /= n;
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < n; i++) {
    const x = a.data[i] - ma;
    const y = b.data[i] - mb;
    ab += x * y;
    aa += x * x;
    bb += y * y;
  }
  return aa > 1e-6 && bb > 1e-6 ? ab / Math.sqrt(aa * bb) : 0;
}

/** A frame's column (or row) means, centred: what it shows across (or down) it. */
function profile(g: Gray, axis: "x" | "y"): Float32Array {
  const { data, width: w, height: h } = g;
  const n = axis === "x" ? w : h;
  const out = new Float32Array(n);
  if (axis === "x") {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x] += data[y * w + x];
    for (let x = 0; x < w; x++) out[x] /= h;
  } else {
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let x = 0; x < w; x++) s += data[y * w + x];
      out[y] = s / w;
    }
  }
  let m = 0;
  for (const v of out) m += v;
  m /= n;
  for (let i = 0; i < n; i++) out[i] -= m;
  return out;
}

/**
 * How far b's picture has moved from a's along an axis, in pixels (+: right or down):
 * the shift of b's profile that best matches a's, over at least two fifths of it, and
 * how much better that matches than standing still (0: not at all, 1: perfectly).
 */
export function shiftAlong(a: Gray, b: Gray, axis: "x" | "y", most = 0.6): { d: number; gain: number } {
  const pa = profile(a, axis);
  const pb = profile(b, axis);
  const n = pa.length;
  const R = Math.round(most * n);
  const cost = (d: number) => {
    let s = 0;
    let k = 0;
    for (let i = Math.max(0, d); i < Math.min(n, n + d); i++) {
      s += Math.abs(pb[i] - pa[i - d]);
      k++;
    }
    return k >= 0.4 * n ? s / k : Infinity;
  };
  const still = cost(0);
  let best = 0;
  let bestCost = still;
  for (let d = -R; d <= R; d++) {
    const c = cost(d);
    if (c < bestCost - 1e-9) (best = d), (bestCost = c);
  }
  return { d: best, gain: still > 1e-6 ? Math.max(0, 1 - bestCost / still) : 0 };
}

type Mode = "push" | "in" | "out" | "wipe";

/**
 * A frame made of two pictures side by side, as a push, a slide or a wipe leaves them,
 * against x: the mean difference. `d` pixels of the move have happened, toward `dir`.
 * Push: both move; "in": b slides over a still a; "out": a slides off a still b; wipe:
 * both still, the edge between them sweeping.
 */
function compositeErr(x: Gray, a: Gray, b: Gray, d: number, dir: Way, mode: Mode): number {
  const { width: w, height: h } = x;
  const horiz = dir === "left" || dir === "right";
  const L = horiz ? w : h;
  let s = 0;
  let n = 0;
  for (let y = 0; y < h; y++)
    for (let xx = 0; xx < w; xx++) {
      // position along the move, measured in the direction of travel
      const p = horiz ? (dir === "right" ? xx : w - 1 - xx) : dir === "down" ? y : h - 1 - y;
      const q = horiz ? y : xx;
      // the edge between the two pictures, d pixels along from where the next one enters
      let v: number;
      if (p >= d) {
        // the old picture's part: moved d along (push, out) or where it was (in, wipe)
        const src = mode === "in" || mode === "wipe" ? p : p - d;
        v = sample(a, horiz, dir, src, q);
      } else {
        // the new picture's part: its far end (push, in) or where it is (out, wipe)
        const src = mode === "out" || mode === "wipe" ? p : L - d + p;
        v = sample(b, horiz, dir, src, q);
      }
      s += Math.abs(x.data[y * w + xx] - v);
      n++;
    }
  return s / Math.max(1, n);
}

/** The pixel `p` along the direction of travel and `q` across it. */
function sample(g: Gray, horiz: boolean, dir: Way, p: number, q: number): number {
  const { width: w, height: h } = g;
  const pi = Math.max(0, Math.min((horiz ? w : h) - 1, Math.round(p)));
  if (horiz) return g.data[q * w + (dir === "right" ? pi : w - 1 - pi)];
  return g.data[(dir === "down" ? pi : h - 1 - pi) * w + q];
}

const WAYS: Way[] = ["left", "right", "up", "down"];
const MODES: Mode[] = ["push", "in", "out", "wipe"];

interface MoveFit {
  mode: Mode;
  dir: Way;
  /** how far along, a share of the frame */
  d: number;
  err: number;
}

/** The push, slide or wipe that best explains x as a and b side by side. */
function bestMove(x: Gray, a: Gray, b: Gray): MoveFit | null {
  let best: MoveFit | null = null;
  for (const dir of WAYS) {
    const L = dir === "left" || dir === "right" ? x.width : x.height;
    for (const mode of MODES)
      for (let d = 1; d < L; d++) {
        const err = compositeErr(x, a, b, d, dir, mode);
        if (!best || err < best.err) best = { mode, dir, d: d / L, err };
      }
  }
  return best;
}

const median = (v: number[]) => {
  if (!v.length) return 0;
  const s = [...v].sort((p, q) => p - q);
  return s[s.length >> 1];
};

const quantile = (v: number[], q: number) => {
  if (!v.length) return 0;
  const s = [...v].sort((p, r) => p - r);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

function majority<T>(v: T[]): T {
  const c = new Map<T, number>();
  for (const x of v) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((p, q) => q[1] - p[1])[0][0];
}

const secs = (frames: number, fps: number) => Math.round((frames / fps) * 1000) / 1000;

/** How a move's speed runs over its frames: even, fast then slow (out), slow then fast (in), or slow at both ends. */
function easeOf(speeds: number[]): TransitionLook["ease"] {
  if (speeds.length < 3) return "linear";
  const n = speeds.length;
  const top = Math.max(...speeds);
  if (top <= 0) return "linear";
  const third = Math.max(1, Math.floor(n / 3));
  const first = speeds.slice(0, third).reduce((a, v) => a + v, 0) / third;
  const last = speeds.slice(n - third).reduce((a, v) => a + v, 0) / third;
  const mid = speeds.slice(third, n - third).reduce((a, v) => a + v, 0) / Math.max(1, n - 2 * third);
  if (mid > 1.4 * Math.max(first, last)) return "inout";
  if (first > 1.5 * last) return "out";
  if (last > 1.5 * first) return "in";
  return "linear";
}

export interface TransitionOptions {
  fps: number;
  /** sees each change's measurements (tests) */
  debug?: (d: Record<string, unknown>) => void;
}

/** What the finder knows about every frame. */
interface Watch {
  frames: Gray[];
  /** the frames shrunk to about 30 pixels across their short side, for the fits */
  q: Gray[];
  st: FrameStats[];
  /** each frame's camera move from the one before (shrunk pixels) */
  mv: { dx: number; dy: number; err: number; still: number }[];
  fps: number;
}

/**
 * Every shot change in the reference and what happens at it, in time order. `cuts` are
 * the cut finder's hard cuts (the times of each next shot's first frame).
 */
export function findTransitions(frames: Gray[], times: number[], cuts: number[], o: TransitionOptions): FoundTransition[] {
  const n = frames.length;
  if (n < 8) return [];
  const fps = o.fps || 30;
  const k = Math.max(1, Math.round(Math.min(frames[0].width, frames[0].height) / 30));
  const q = frames.map((f) => shrink(f, k));
  const reach = Math.max(2, Math.round(0.12 * Math.min(q[0].width, q[0].height)));
  const st = frames.map(frameStats);
  const mv = [{ dx: 0, dy: 0, err: 0, still: 0 }, ...q.slice(1).map((g, i) => motion(q[i], g, reach))];
  const idx = (t: number) => {
    let i = 0;
    while (i + 1 < n && times[i + 1] <= t + 1e-6) i++;
    return i;
  };
  const isCut = new Uint8Array(n);
  for (const t of cuts) {
    const i = idx(t);
    if (i > 0 && i < n) isCut[i] = 1;
  }
  const w: Watch = { frames, q, st, mv, fps };
  const out: FoundTransition[] = [];

  // ── the fade up from black at the start, and the fade down to black at the end ──
  let openEnd = 0;
  if (st[0].luma < 20) {
    for (let f = 1; f < Math.min(n - 9, 46); f++) {
      if (isCut[f]) break;
      const plat = median(st.slice(f, f + 9).map((x) => x.luma));
      if (plat > Math.max(25, 2 * st[0].luma + 10) && st[f].luma >= 0.85 * plat) {
        if (f >= 2) {
          out.push({ kind: "dip", color: "black", over: "in", dur: secs(f, fps), ease: "linear", t: times[0], why: `up from black over ${f} frames` });
          openEnd = f;
        }
        break;
      }
    }
  }
  let closeStart = n;
  if (st[n - 1].luma < 16) {
    let i = n - 1;
    while (i > 0 && st[i - 1].luma < 16) i--;
    let f = i;
    while (f > 0 && i - f < 45 && st[f - 1].luma > st[f].luma + 0.5 && !isCut[f]) f--;
    if (i - f >= 2 && st[f].luma > 35) {
      out.push({ kind: "dip", color: "black", over: "out", dur: secs(i - f, fps), ease: "linear", t: times[f], why: `down to black over ${i - f} frames` });
      closeStart = f;
    }
  }

  // ── runs of frames changing more than their shots do ──
  const step = mv.map((m) => m.err);
  const busy = new Uint8Array(n);
  for (let j = 1; j < n; j++) {
    const around: number[] = [];
    for (let i = Math.max(1, j - 15); i <= Math.min(n - 1, j + 15); i++) if (i !== j) around.push(step[i]);
    busy[j] = isCut[j] || step[j] >= Math.max(1.5, 2.5 * quantile(around, 0.3)) ? 1 : 0;
  }
  const runs: [number, number][] = [];
  for (let j = 1; j < n; j++) {
    if (!busy[j]) continue;
    let e = j;
    // (a frame shown twice, a 24 fps clip in a 30 fps edit, doesn't break a run)
    while (e + 1 < n && (busy[e + 1] || (e + 2 < n && busy[e + 2] && mv[e + 1].still < 1))) e++;
    runs.push([j, e]);
    j = e;
  }
  // A cut standing out of its run (far more change than the frames next to it) is a hard
  // cut of its own, the frames either side the shots' own busy movement, or the cut's
  // moves (a whip's smear, a zoom): the run splits there.
  const pieces: { j0: number; j1: number; spike: boolean }[] = [];
  for (const [j0, j1] of runs) {
    let a = j0;
    for (let j = j0; j <= j1 && j1 > j0; j++) {
      if (!isCut[j]) continue;
      const near = Math.max(j > j0 ? step[j - 1] : 0, j < j1 ? step[j + 1] : 0);
      if (step[j] < 3 * near) continue;
      if (j > a) pieces.push({ j0: a, j1: j - 1, spike: false });
      pieces.push({ j0: j, j1: j, spike: true });
      a = j + 1;
    }
    if (a <= j1) pieces.push({ j0: a, j1, spike: j1 === j0 });
  }
  const used = new Uint8Array(n);
  const absorbed = new Set<number>();
  pieces.forEach((p, i) => {
    if (!p.spike || !isCut[p.j0] || p.j0 <= openEnd || p.j0 >= closeStart) return;
    const kind = hardKind(w, p.j0);
    out.push({ ...kind, t: times[p.j0] });
    used[p.j0] = 1;
    // (the frames either side that run into it are part of a whip or a zoom)
    if (kind.kind !== "cut")
      for (const k of [i - 1, i + 1]) {
        const q = pieces[k];
        if (q && !q.spike && (q.j1 + 1 === p.j0 || q.j0 - 1 === p.j0)) absorbed.add(k);
      }
  });
  pieces.forEach((p, i) => {
    const { j0, j1 } = p;
    if (p.spike || j0 <= openEnd || j1 >= closeStart) return;
    const hard: number[] = [];
    for (let j = j0; j <= j1; j++) if (isCut[j]) hard.push(j);
    if (absorbed.has(i)) {
      for (const c of hard) used[c] = 1;
      return;
    }
    const steps = step.slice(j0, j1 + 1);
    const total = steps.reduce((a, v) => a + v, 0);
    const big = Math.max(...steps);
    const strongest = hard.length ? hard.reduce((b, x) => (step[x] > step[b] ? x : b), hard[0]) : -1;
    o.debug?.({ s: j0 - 1, e: j1, hard, steps: steps.map((v) => +v.toFixed(1)) });
    if (j1 === j0 || big >= 0.6 * total) {
      // One frame changing (around it, at most the shots' own movement): a hard cut, and
      // what the frames about it do (the cut finder's other cuts in it are that, if anything).
      if (strongest >= 0) {
        const kind = hardKind(w, strongest);
        out.push({ ...kind, t: times[strongest] });
        used[strongest] = 1;
        if (kind.kind !== "cut") for (const c of hard) used[c] = 1;
      }
      return;
    }
    const jump = hard.length > 0 || big >= 2.5 * median(steps);
    const found = gradualKind(w, j0 - 1, j1, jump);
    if (found) {
      out.push({ ...found, t: (times[j0 - 1] + times[j1]) / 2 });
      for (const c of hard) used[c] = 1;
    } else if (strongest >= 0) {
      // (The pictures either side are one shot moved, and yet the cut finder saw a cut: the strongest one.)
      out.push({ ...hardKind(w, strongest), t: times[strongest] });
      used[strongest] = 1;
    }
  });
  // (and any cut the runs missed)
  for (let c = 1; c < n; c++) {
    if (!isCut[c] || used[c] || c <= openEnd || c >= closeStart) continue;
    if (out.some((x) => x.dur > 0 && Math.abs(x.t - times[c]) <= x.dur / 2 + 0.5 / fps)) continue;
    out.push({ ...hardKind(w, c), t: times[c] });
  }
  out.sort((p, r) => p.t - r.t);
  // (a flash or a dip the cut finder cut in two is one)
  return out.filter((x, i) => {
    const prev = out[i - 1];
    const light = (y: FoundTransition) => (y.kind === "flash" || y.kind === "dip") && !y.over;
    if (prev && light(x) && light(prev) && x.t - prev.t <= prev.dur + 3 / fps) {
      prev.dur = secs(Math.round((x.t + x.dur - prev.t) * fps), fps);
      return false;
    }
    return true;
  });
}

/** Brightness through a stretch, against the pictures either side: a dip through black or white, or a flash. */
function brightness(st: FrameStats[], lo: number, hi: number, s: number, e: number): { kind: "dip" | "flash"; color: "black" | "white"; frames: number } | null {
  const n = st.length;
  const before = st.slice(Math.max(0, s - 6), Math.max(0, s - 1)).map((x) => x.luma);
  const after = st.slice(Math.min(n, e + 2), Math.min(n, e + 7)).map((x) => x.luma);
  if (!before.length || !after.length) return null;
  const a = median(before);
  const b = median(after);
  let peak = -Infinity;
  let low = Infinity;
  for (let j = Math.max(0, lo); j <= Math.min(n - 1, hi); j++) (peak = Math.max(peak, st[j].luma)), (low = Math.min(low, st[j].luma));
  // Darker than both pictures, to black: a dip. Its length: the frames past halfway down.
  if (low < 16 && Math.min(a, b) > 30 && low < 0.4 * Math.min(a, b)) {
    const half = low + 0.5 * (Math.min(a, b) - low);
    return { kind: "dip", color: "black", frames: extent(st, lo, hi, (x) => x < half) };
  }
  // Brighter than both, to white: a flash (a dip through white if it's held).
  if (peak > 175 && peak - Math.max(a, b) > 45) {
    const top = Math.max(a, b);
    const k = extent(st, lo, hi, (x) => x > top + 0.5 * (peak - top));
    return { kind: k <= 3 ? "flash" : "dip", color: "white", frames: k };
  }
  return null;
}

/** From the first frame to the last between lo and hi whose brightness passes. */
function extent(st: FrameStats[], lo: number, hi: number, pass: (luma: number) => boolean): number {
  let first = -1;
  let last = -1;
  for (let j = Math.max(0, lo); j <= Math.min(st.length - 1, hi); j++)
    if (pass(st[j].luma)) {
      if (first < 0) first = j;
      last = j;
    }
  return first < 0 ? 0 : last - first + 1;
}

/**
 * A frame's sideways and up-and-down smear against its shot's own (1: as sharp as ever
 * that way, 0.5: half). Only where the edges across the move stay: a frame gone flat
 * (a plain colour, a fade) isn't smeared any way.
 */
function smearOf(st: FrameStats[], j: number, ref: number[]): { x: number; y: number } {
  const r0 = median(ref.map((i) => st[i].gx / Math.max(1e-6, st[i].gy))) || 1;
  const gx0 = median(ref.map((i) => st[i].gx)) || 1;
  const gy0 = median(ref.map((i) => st[i].gy)) || 1;
  const r = st[j].gx / Math.max(1e-6, st[j].gy);
  return { x: st[j].gy >= 0.35 * gy0 ? r / r0 : 1, y: st[j].gx >= 0.35 * gx0 ? r0 / Math.max(1e-6, r) : 1 };
}

/** The frames from `from` to `to` that exist. */
function span(w: Watch, from: number, to: number): number[] {
  const out: number[] = [];
  for (let j = Math.max(0, from); j <= Math.min(w.frames.length - 1, to); j++) out.push(j);
  return out;
}

/** Which way the frames from s to e travel, by their profiles, when they agree on it. */
function travel(w: Watch, s: number, e: number): Way | null {
  let hx = 0;
  let hy = 0;
  for (let j = Math.max(1, s + 1); j <= Math.min(w.frames.length - 1, e); j++) {
    const a = w.q[j - 1];
    const b = w.q[j];
    const mx = shiftAlong(a, b, "x", 0.5);
    const my = shiftAlong(a, b, "y", 0.5);
    if (mx.gain > 0.15) hx += mx.d / a.width;
    if (my.gain > 0.15) hy += my.d / a.height;
  }
  if (Math.max(Math.abs(hx), Math.abs(hy)) < 0.02) return null;
  return Math.abs(hx) >= Math.abs(hy) ? (hx < 0 ? "left" : "right") : hy < 0 ? "up" : "down";
}

/**
 * A gradual change from frame s (the last of the picture before) to frame e (the first
 * of the one after): a crossfade, a dip, a push, slide or wipe, a whip, a zoom, a blur;
 * or, when the picture after is the picture before moved, scaled or lit differently,
 * the same shot (null). A zoom, a whip or a blur needs the picture to jump somewhere in it
 * (`jump`): without one, frames scaling, smearing or softening are the camera's.
 */
function gradualKind(w: Watch, s: number, e: number, jump: boolean): Omit<FoundTransition, "t"> | null {
  const { st, q, fps } = w;
  const A = q[s];
  const B = q[e];
  const mids: number[] = [];
  for (let j = s + 1; j < e; j++) mids.push(j);
  const dur = secs(e - s, fps);
  const light = brightness(st, s, e, s, e);
  if (light) return { kind: light.kind === "flash" ? "flash" : "dip", color: light.color, dur: secs(Math.max(1, light.frames), fps), ease: "linear", why: `${light.kind === "flash" ? "a flash" : `a dip to ${light.color}`} over ${light.frames} frame${light.frames === 1 ? "" : "s"}` };
  // Torn rows through it, far more than either picture has: a glitch.
  const tearBase = Math.max(st[s].tear, st[e].tear);
  const torn = mids.filter((j) => st[j].tear >= Math.max(3, 3 * tearBase + 2)).length;
  if (torn >= Math.max(1, 0.5 * mids.length)) return { kind: "glitch", dur, ease: "linear", why: `a glitch: torn rows on ${torn} frame${torn === 1 ? "" : "s"}` };
  // The camera's own move: the picture after is the one before, moved (the moves frame to
  // frame added up) or scaled.
  const raw = frameDiff(A, B, 1);
  let sx = 0;
  let sy = 0;
  for (let j = s + 1; j <= e; j++) (sx += w.mv[j].dx), (sy += w.mv[j].dy);
  let movedErr = Infinity;
  for (let dy = sy - 1; dy <= sy + 1; dy++) for (let dx = sx - 1; dx <= sx + 1; dx++) movedErr = Math.min(movedErr, moved(A, B, dx, dy));
  const sc = scaleBetween(w.frames[s], w.frames[e], null, 0.3);
  if (movedErr < 0.45 * raw || (sc.s !== 1 && sc.err < 0.45 * sc.still) || correlation(A, B) > 0.85) return null;
  // Each frame between: a mix of the two, or the two side by side.
  const alphas: number[] = [];
  const fits: MoveFit[] = [];
  for (const j of mids) {
    const X = q[j];
    const ends = Math.min(frameDiff(X, A, 1), frameDiff(X, B, 1));
    const m = mixFit(X, A, B);
    const mvf = bestMove(X, A, B);
    if (mvf && mvf.err < 0.5 * ends && mvf.err < 0.7 * m.err && mvf.d > 0.06 && mvf.d < 0.94) fits.push(mvf);
    else if (m.alpha > 0.06 && m.alpha < 0.94 && m.err < 0.6 * ends) alphas.push(m.alpha);
  }
  const frameCount = mids.length;
  // Pushes, slides and wipes: most frames between are the two side by side, the edge moving one way.
  if (fits.length >= Math.max(1, 0.6 * frameCount)) {
    const dir = majority(fits.map((f) => f.dir));
    const same = fits.filter((f) => f.dir === dir);
    const mode = majority(same.map((f) => f.mode));
    const ds = same.map((f) => f.d);
    const growing = ds.every((d, i) => i === 0 || d >= ds[i - 1] - 0.05);
    if (same.length >= Math.max(1, 0.6 * frameCount) && growing) {
      const speeds = [ds[0], ...ds.slice(1).map((d, i) => d - ds[i]), 1 - ds[ds.length - 1]].map((v) => Math.max(0, v));
      const blurry = Math.min(...mids.map((j) => st[j].sharp)) < 0.6 * Math.min(st[s].sharp, st[e].sharp);
      const kind = mode === "wipe" ? "wipe" : mode === "push" ? (blurry ? "whip" : "push") : "slide";
      const what = kind === "slide" ? (mode === "in" ? "the next picture slides over" : "the last picture slides off") : kind === "wipe" ? "an edge sweeps across" : kind === "whip" ? "a smeared push" : "both pictures move as one";
      return { kind, dir, ...(kind === "slide" ? { over: mode === "out" ? ("out" as const) : ("in" as const) } : {}), dur, ease: easeOf(speeds), why: `${what} toward the ${dir}, ${e - s - 1} frames` };
    }
  }
  // Crossfades: most frames between are mixes, the next picture's share growing.
  if (alphas.length >= Math.max(2, 0.6 * frameCount) && alphas.every((a, i) => i === 0 || a >= alphas[i - 1] - 0.08)) {
    const steps = [alphas[0], ...alphas.slice(1).map((a, i) => a - alphas[i]), 1 - alphas[alphas.length - 1]];
    return { kind: "dissolve", dur, ease: easeOf(steps), why: `a crossfade over ${frameCount + 1} frames (${alphas.map((a) => Math.round(a * 100)).join(", ")}% of the next)` };
  }
  if (!jump) return alphas.length >= Math.max(2, 0.4 * frameCount) ? { kind: "dissolve", dur, ease: "linear", why: `a crossfade over ${frameCount + 1} frames, partly hidden` } : null;
  // A zoom through: the frames between are the pictures scaled hard.
  const zoom = zoomThrough(w.frames, s, e);
  if (zoom) return { kind: "zoom", dir: zoom.dir, dur, ease: "inout", why: `a zoom ${zoom.dir} through the change (${Math.round((zoom.most - 1) * 100)}% a frame at the most)` };
  // A whip: the frames between smeared one way (far more than either shot is), thrown that way.
  const ref = [...span(w, s - 8, s - 3), ...span(w, e + 3, e + 8)];
  const smears = mids.map((j) => smearOf(st, j, ref));
  const sideways = smears.filter((m) => m.x < 0.55).length;
  const upDown = smears.filter((m) => m.y < 0.55).length;
  if (Math.max(sideways, upDown) >= Math.max(2, 0.5 * frameCount)) {
    const horiz = sideways >= upDown;
    const tr = travel(w, s, e);
    const dir: Way = tr && (tr === "left" || tr === "right") === horiz ? tr : horiz ? "left" : "up";
    const most = Math.min(...smears.map((m) => (horiz ? m.x : m.y)));
    return { kind: "whip", dir, dur, ease: "inout", why: `a whip toward the ${dir} over ${e - s - 1} frames, smeared ${horiz ? "sideways" : "up and down"} to ${Math.round(most * 100)}% of its sharpness that way` };
  }
  const sharpMin = Math.min(...mids.map((j) => st[j].sharp));
  // (A plain frame between the two, neither black nor white: a dip through it, the nearest look.)
  if (sharpMin < 0.05 * Math.min(st[s].sharp, st[e].sharp)) {
    const flat = mids.reduce((b, j) => (st[j].sharp < st[b].sharp ? j : b), mids[0]);
    const color = st[flat].luma >= 128 ? ("white" as const) : ("black" as const);
    return { kind: "dip", color, dur, ease: "linear", why: `through a plain frame (${Math.round(st[flat].luma)} of 255 bright)` };
  }
  if (sharpMin < 0.4 * Math.min(st[s].sharp, st[e].sharp)) return { kind: "blur", dur, ease: "inout", why: `blurred through the change (sharpness to ${Math.round((sharpMin / Math.min(st[s].sharp, st[e].sharp)) * 100)}%)` };
  if (alphas.length >= Math.max(2, 0.4 * frameCount)) return { kind: "dissolve", dur, ease: "linear", why: `a crossfade over ${frameCount + 1} frames, partly hidden` };
  return null;
}

/**
 * Frames growing (or shrinking) hard into a change and the next picture settling back: a
 * zoom through it. "In": the picture before grows into the change, the one after lands
 * close and shrinks back to rest (or either alone); "out" the other way.
 */
function zoomThrough(frames: Gray[], s: number, e: number): { dir: "in" | "out"; most: number } | null {
  const steps: { j: number; log: number; ok: boolean; jump: number }[] = [];
  for (let j = Math.max(1, s - 2); j <= Math.min(frames.length - 1, e + 2); j++) {
    const sc = scaleBetween(frames[j - 1], frames[j], null, 0.3);
    steps.push({ j, log: Math.log(sc.s), ok: sc.still - sc.err >= 1 && sc.err < 0.6 * sc.still, jump: sc.err });
  }
  // The change itself: the step the scaling explains least.
  const cut = steps.reduce((b, x) => (x.jump > b.jump ? x : b), steps[0]);
  let inward = 0;
  let k = 0;
  let most = 1;
  for (const x of steps) {
    if (x === cut || !x.ok || Math.abs(x.log) < 0.05) continue;
    inward += x.j < cut.j ? x.log : -x.log;
    most = Math.max(most, Math.exp(Math.abs(x.log)));
    k++;
  }
  if (k < 2 || most < 1.08) return null;
  return { dir: inward >= 0 ? "in" : "out", most };
}

/**
 * A hard cut at frame c (the next shot's first frame), and what the frames either side
 * do: a flash or a dip on it, a crossfade hiding inside it, the pictures smeared one way
 * into and out of it (a whip), zooming hard into it (a zoom), blurring (a blur), tearing
 * (a glitch); or nothing, a plain cut. (Shots that only move, however fast, are a cut.)
 */
function hardKind(w: Watch, c: number): Omit<FoundTransition, "t"> {
  const { st, q, frames, fps } = w;
  const n = frames.length;
  const light = brightness(st, c - 3, c + 2, c - 1, c);
  if (light) return { kind: light.kind === "flash" ? "flash" : "dip", color: light.color, dur: secs(Math.max(1, light.frames), fps), ease: "linear", why: light.kind === "flash" ? `a flash of ${light.frames} frame${light.frames === 1 ? "" : "s"} on the cut` : `a dip to ${light.color} on the cut (${light.frames} frames)` };
  // A crossfade the cut finder took for a cut: the frames around it mixes of the shots either side.
  if (c - 6 >= 0 && c + 5 < n) {
    const A = q[c - 6];
    const B = q[c + 5];
    if (frameDiff(A, B, 1) > 12) {
      const alphas: number[] = [];
      for (let k = c - 4; k <= c + 3; k++) {
        const X = q[k];
        const m = mixFit(X, A, B);
        const ends = Math.min(frameDiff(X, A, 1), frameDiff(X, B, 1));
        if (m.alpha > 0.15 && m.alpha < 0.85 && m.err < 0.6 * ends) alphas.push(m.alpha);
      }
      if (alphas.length >= 2 && alphas.every((a, i) => i === 0 || a >= alphas[i - 1] - 0.08)) return { kind: "dissolve", dur: secs(alphas.length + 1, fps), ease: "linear", why: `a crossfade over ${alphas.length + 1} frames` };
    }
  }
  const before = span(w, c - 12, c - 5);
  const after = span(w, c + 4, c + 11);
  // Smeared the same way into and out of the cut: a whip.
  const sa = span(w, c - 2, c - 1).map((j) => smearOf(st, j, before));
  const sb = span(w, c, c + 1).map((j) => smearOf(st, j, after));
  for (const horiz of [true, false]) {
    const ax = Math.min(...sa.map((m) => (horiz ? m.x : m.y)));
    const bx = Math.min(...sb.map((m) => (horiz ? m.x : m.y)));
    if (ax < 0.65 && bx < 0.65) {
      const tr = travel(w, c - 3, c + 2);
      const dir: Way = tr && (tr === "left" || tr === "right") === horiz ? tr : horiz ? "left" : "up";
      const k = [...sa, ...sb].filter((m) => (horiz ? m.x : m.y) < 0.8).length;
      return { kind: "whip", dir, dur: secs(Math.max(2, k), fps), ease: "inout", why: `a whip toward the ${dir}: smeared ${horiz ? "sideways" : "up and down"} to ${Math.round(Math.max(ax, bx) * 100)}% each side of the cut` };
    }
  }
  // Zooming hard into the cut, the next landing scaled and settling.
  const zs = (j: number) => {
    const sc = scaleBetween(frames[j - 1], frames[j], null, 0.3);
    return sc.still - sc.err >= 1 && sc.err < 0.6 * sc.still ? Math.log(sc.s) : 0;
  };
  const za = span(w, c - 2, c - 1).filter((j) => j >= 1).map(zs);
  const zb = span(w, c + 1, c + 2).map(zs);
  const intoA = za.reduce((a, v) => (Math.abs(v) > Math.abs(a) ? v : a), 0);
  const fromB = zb.reduce((a, v) => (Math.abs(v) > Math.abs(a) ? v : a), 0);
  if (Math.abs(intoA) >= 0.05 && Math.abs(fromB) >= 0.05) {
    const dir = intoA > 0 ? "in" : "out";
    const most = Math.exp(Math.max(Math.abs(intoA), Math.abs(fromB)));
    const k = [...za, ...zb].filter((v) => Math.abs(v) >= 0.03).length;
    return { kind: "zoom", dir, dur: secs(Math.max(2, k), fps), ease: "inout", why: `a zoom ${dir} through the cut (${Math.round((most - 1) * 100)}% a frame at the most)` };
  }
  // Torn rows about the cut, far more than the footage has.
  // (each shot's own: a keyboard's rows or blinds tear every frame of their shot)
  const tears = st.slice(Math.max(0, c - 2), Math.min(n, c + 3)).map((x) => x.tear);
  const tearBase = Math.max(median(before.map((j) => st[j].tear)), median(after.map((j) => st[j].tear)));
  const torn = tears.filter((x) => x >= Math.max(3, 3 * tearBase + 2)).length;
  if (torn >= 1) return { kind: "glitch", dur: secs(Math.max(2, torn), fps), ease: "linear", why: `a glitch: ${Math.max(...tears)} torn rows on ${torn} frame${torn === 1 ? "" : "s"}` };
  // Blurred into and out of the cut: each side against its own shot's sharpness.
  const ownA = median(before.map((j) => st[j].sharp)) || 1;
  const ownB = median(after.map((j) => st[j].sharp)) || 1;
  const softA = Math.min(...span(w, c - 3, c - 1).map((j) => st[j].sharp)) / ownA;
  const softB = Math.min(...span(w, c, c + 2).map((j) => st[j].sharp)) / ownB;
  if (Math.max(softA, softB) < 0.6) {
    const k = span(w, c - 3, c - 1).filter((j) => st[j].sharp < 0.75 * ownA).length + span(w, c, c + 2).filter((j) => st[j].sharp < 0.75 * ownB).length;
    return { kind: "blur", dur: secs(Math.max(2, k), fps), ease: "inout", why: `blurred through the cut (to ${Math.round(softA * 100)}% and ${Math.round(softB * 100)}% of each shot's sharpness)` };
  }
  return { kind: "cut", dur: 0, ease: "linear", why: "a hard cut" };
}

export function transitionName(t: Pick<TransitionLook, "kind" | "dir" | "color" | "dur" | "over">, fps = 30): string {
  const frames = Math.round(t.dur * fps);
  const len = t.kind === "cut" ? "" : ` (${frames} frame${frames === 1 ? "" : "s"})`;
  const dir = t.dir ? ` ${t.dir}` : "";
  if (t.kind === "dip" && t.over === "in") return `Fade in from ${t.color ?? "black"}${len}`;
  if (t.kind === "dip" && t.over === "out") return `Fade out to ${t.color ?? "black"}${len}`;
  const names: Record<TransitionLook["kind"], string> = { cut: "Cut", dissolve: "Crossfade", dip: t.color === "white" ? "Dip to white" : "Dip to black", flash: "Flash", push: "Push", slide: "Slide", wipe: "Wipe", whip: "Whip", zoom: "Zoom", blur: "Blur", glitch: "Glitch", spin: "Spin" };
  const moves = t.kind === "push" || t.kind === "slide" || t.kind === "wipe" || t.kind === "whip" || t.kind === "zoom" || t.kind === "spin";
  return `${names[t.kind]}${moves ? dir : ""}${len}`;
}

export const _test = { compositeErr, mixFit, motion, shrink };

/**
 * Framing: where the window of a crop sits in the source, and how it moves.
 * A person in the shot decides it: the window keeps their face in, eyes in the
 * upper part of the frame, and moves like a camera operator would (still while
 * they stay near the middle, gliding when they walk out of it, never letting
 * the face slip out of frame). Without anyone in it, the window goes where the
 * picture's interest is. Black bars around the picture (a letterboxed film, a
 * phone video inside a YouTube frame) are left out either way.
 */
import { PROFILE_BINS, type Scan } from "../media/scan";
import { FRAME_SIZE, type Aspect, type Crop } from "./types";

/** Faces found in one frame of a source, at a source time. */
export interface FaceSample {
  t: number;
  faces: { x: number; y: number; w: number; h: number; score: number }[];
}

export type Rect = [x0: number, y0: number, x1: number, y1: number];

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const FULL: Rect = [0, 0, 1, 1];

function median(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * The picture inside any black bars over a stretch of a source. Bars count only
 * when they're even on both sides (a letterbox or pillarbox), so a black sky
 * or a dark wall doesn't read as one.
 */
export function activeRect(scan: Scan, a: number, b: number): Rect {
  const st = scan.stats;
  if (!st.bars) return FULL;
  const n = st.t.length;
  const pick: number[] = [];
  for (let i = 0; i < n; i++) if (scan.kind === "image" || (st.t[i] >= a - 0.25 && st.t[i] <= b + 0.25)) pick.push(i);
  if (!pick.length && n) {
    let near = 0;
    for (let i = 1; i < n; i++) if (Math.abs(st.t[i] - (a + b) / 2) < Math.abs(st.t[near] - (a + b) / 2)) near = i;
    pick.push(near);
  }
  const side = (k: number) => median(pick.map((i) => st.bars![i * 4 + k]));
  let [top, bottom, left, right] = [side(0), side(1), side(2), side(3)];
  const even = (p: number, q: number, most: number) => Math.min(p, q) >= 0.02 && Math.abs(p - q) <= 0.035 && Math.max(p, q) <= most;
  if (!even(top, bottom, 0.3)) top = bottom = 0;
  if (!even(left, right, 0.42)) left = right = 0;
  // The bars are measured on a small frame: step a hair further in so no dark line of them shows.
  const inset = (v: number) => (v > 0 ? v + 0.008 : 0);
  return [inset(left), inset(top), 1 - inset(right), 1 - inset(bottom)];
}

/** The window's size in the picture (0 to 1 each way) for cover at `zoom`. */
export function windowSize(pictureAspect: number, frameAspect: number, zoom = 1): [number, number] {
  const f: [number, number] = pictureAspect > frameAspect ? [frameAspect / pictureAspect, 1] : [1, pictureAspect / frameAspect];
  return [f[0] / zoom, f[1] / zoom];
}

/** A saliency profile (32 bins over the whole frame) resampled over [lo, hi] of it. */
function within(profile: Float64Array, lo: number, hi: number): Float64Array {
  if (lo <= 0 && hi >= 1) return profile;
  const out = new Float64Array(PROFILE_BINS);
  for (let k = 0; k < PROFILE_BINS; k++) {
    const x = (lo + ((k + 0.5) / PROFILE_BINS) * (hi - lo)) * PROFILE_BINS - 0.5;
    const i = clamp(Math.floor(x), 0, PROFILE_BINS - 1);
    const j = Math.min(PROFILE_BINS - 1, i + 1);
    const f = clamp(x - i, 0, 1);
    out[k] = profile[i] * (1 - f) + profile[j] * f;
  }
  return out;
}

/** The best window centre along one axis from a saliency profile: most interest inside, near `bias`. */
function bestCentre(profile: Float64Array, frac: number, bias: number): number {
  if (frac >= 0.999) return 0.5;
  let total = 0;
  for (const v of profile) total += v;
  if (total <= 0) return clamp(bias, frac / 2, 1 - frac / 2);
  const width = frac * PROFILE_BINS;
  let best = 0.5;
  let bestScore = -Infinity;
  for (let s = 0; s <= 100; s++) {
    const c = frac / 2 + ((1 - frac) * s) / 100;
    const lo = (c - frac / 2) * PROFILE_BINS;
    let sum = 0;
    for (let k = Math.floor(lo); k < Math.ceil(lo + width); k++) {
      const overlap = Math.min(k + 1, lo + width) - Math.max(k, lo);
      if (overlap > 0 && k >= 0 && k < PROFILE_BINS) sum += profile[k] * overlap;
    }
    const score = sum / total - 0.12 * Math.abs(c - bias);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** Zero-phase Gaussian smoothing of values at (uneven) times. */
export function smoothAt(t: number[], v: number[], sigma: number): number[] {
  return v.map((_, i) => {
    let s = 0;
    let w = 0;
    for (let j = 0; j < v.length; j++) {
      const k = Math.exp(-((t[j] - t[i]) ** 2) / (2 * sigma * sigma));
      s += k * v[j];
      w += k;
    }
    return s / w;
  });
}

/**
 * A camera operator's path along one axis: still while the subject stays within
 * `dead` of the middle, gliding (the steps smoothed over `sigma` seconds, both
 * ways, so it starts moving a moment before they leave) when they don't, and
 * always keeping [lo, hi] of the subject inside a window of size `size`.
 */
export function follow(t: number[], target: number[], lo: number[], hi: number[], size: number, dead: number, sigma: number): number[] {
  const held: number[] = [];
  let cur = target[0];
  for (const x of target) {
    if (x > cur + dead) cur = x - dead;
    else if (x < cur - dead) cur = x + dead;
    held.push(cur);
  }
  const eased = smoothAt(t, held, sigma);
  // No faster than about a window's width a second (Google's AutoFlip and the
  // auto-reframe tools cap their virtual camera the same way), limited both ways
  // so the path stays centred on the subject.
  const most = size * 1.0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < eased.length; i++) {
      const j = pass ? eased.length - 1 - i : i;
      const k = pass ? j + 1 : j - 1;
      const step = most * Math.abs(t[j] - t[k]);
      eased[j] = Math.min(eased[k] + step, Math.max(eased[k] - step, eased[j]));
    }
  }
  return eased.map((c, i) => {
    // Keep the subject inside, with a little room, then keep the window inside the picture.
    const margin = Math.min(0.04, Math.max(0, (size - (hi[i] - lo[i])) / 2));
    const min = hi[i] + margin - size / 2;
    const max = lo[i] - margin + size / 2;
    const kept = min <= max ? clamp(c, min, max) : (lo[i] + hi[i]) / 2;
    return clamp(kept, size / 2, 1 - size / 2);
  });
}

interface Tracked {
  t: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Track {
  faces: Tracked[];
  /** how much it's seen: face area times confidence, summed over the samples */
  weight: number;
}

/**
 * Faces followed from frame to frame (picture coordinates), heaviest first: the
 * first is the person the shot is about. Null when no one is in at least a
 * quarter of the frames looked at.
 */
export function faceTracks(samples: FaceSample[], rect: Rect): Track[] | null {
  const rw = rect[2] - rect[0];
  const rh = rect[3] - rect[1];
  const tracks: Track[] = [];
  let withFaces = 0;
  for (const s of samples) {
    const faces = s.faces
      .map((f) => ({ t: s.t, x: (f.x - rect[0]) / rw, y: (f.y - rect[1]) / rh, w: f.w / rw, h: f.h / rh, score: f.score }))
      .filter((f) => f.score >= 0.6 && f.h >= 0.035 && f.x > 0 && f.x < 1 && f.y > 0 && f.y < 1);
    if (faces.length) withFaces++;
    const taken = new Set<number>();
    for (const f of faces.sort((p, q) => q.w * q.h - p.w * p.h)) {
      let best = -1;
      let bestD = Infinity;
      tracks.forEach((tr, k) => {
        if (taken.has(k)) return;
        const last = tr.faces[tr.faces.length - 1];
        if (s.t - last.t > 1.5) return;
        const d = Math.hypot(f.x - last.x, f.y - last.y);
        if (d < 0.1 + 1.2 * Math.max(f.w, last.w) && d < bestD) {
          best = k;
          bestD = d;
        }
      });
      const face = { t: f.t, x: f.x, y: f.y, w: f.w, h: f.h };
      if (best < 0) {
        tracks.push({ faces: [face], weight: f.w * f.h * f.score });
        taken.add(tracks.length - 1);
      } else {
        tracks[best].faces.push(face);
        tracks[best].weight += f.w * f.h * f.score;
        taken.add(best);
      }
    }
  }
  if (!tracks.length || withFaces < Math.max(1, Math.ceil(samples.length * 0.25))) return null;
  // One person lost for a moment (a turn of the head, a fast move) and found again
  // nearby is still one person.
  tracks.sort((a, b) => a.faces[0].t - b.faces[0].t);
  for (let i = 0; i < tracks.length; i++) {
    for (let j = i + 1; j < tracks.length; j++) {
      const a = tracks[i].faces[tracks[i].faces.length - 1];
      const b = tracks[j].faces[0];
      if (b.t <= a.t || b.t - a.t > 0.8 || Math.hypot(b.x - a.x, b.y - a.y) > 0.25) continue;
      tracks[i].faces.push(...tracks[j].faces);
      tracks[i].weight += tracks[j].weight;
      tracks.splice(j, 1);
      j = i;
    }
  }
  return tracks.sort((a, b) => b.weight - a.weight);
}

/** A track's face at time `t`: between two sightings, where it would be; outside them, null (or held, `hold`). */
function faceAt(tr: Track, t: number, hold: boolean): Tracked | null {
  const f = tr.faces;
  if (t <= f[0].t) return hold || f[0].t - t < 0.3 ? { ...f[0], t } : null;
  if (t >= f[f.length - 1].t) return hold || t - f[f.length - 1].t < 0.3 ? { ...f[f.length - 1], t } : null;
  let i = 1;
  while (f[i].t < t) i++;
  const a = f[i - 1];
  const b = f[i];
  const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
  return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k };
}

export interface FrameOptions {
  scan: Scan;
  /** the stretch of the source, in source seconds */
  a: number;
  b: number;
  aspect: Aspect;
  /** faces found through the stretch, if they were looked for */
  faces?: FaceSample[];
  /** source seconds per second of the edit (to time the path) */
  speed?: number;
  zoom0?: number;
  zoom1?: number;
}

/** Where the crop sits, and how it moves, for a stretch of a source. */
export function frameShot(o: FrameOptions): Crop {
  const [W, H] = FRAME_SIZE[o.aspect];
  const out = W / H;
  const rect = activeRect(o.scan, o.a, o.b);
  const bars = rect[0] > 0 || rect[1] > 0 || rect[2] < 1 || rect[3] < 1;
  const zoom0 = o.zoom0 ?? 1;
  const zoom1 = o.zoom1 ?? 1;
  const base: Crop = { cx: 0.5, cy: 0.5, zoom0, zoom1, fit: "cover", ...(bars ? { rect } : {}) };
  const pictureAspect = (o.scan.width * (rect[2] - rect[0])) / Math.max(1, o.scan.height * (rect[3] - rect[1]));
  // A portrait picture in a landscape frame loses too much to a crop: it sits whole
  // over a blurred copy of itself instead, the way the apps show one.
  if (pictureAspect < 1 / 1.05 && out > 1) return { ...base, fit: "fit" };
  const [fx, fy] = windowSize(pictureAspect, out, Math.max(zoom0, zoom1));
  if (fx >= 0.999 && fy >= 0.999) return base;

  const tracks = o.faces?.length ? faceTracks(o.faces, rect) : null;
  if (!tracks) return { ...base, ...salientCentre(o.scan, o.a, o.b, rect, fx, fy) };

  // Who's in the frame, decided once for the shot: the main person, and anyone seen
  // nearly as much who stays close enough beside them to share the frame.
  const t = o.faces!.map((f) => f.t);
  const main = tracks[0];
  const group = [main];
  for (const tr of tracks.slice(1)) {
    if (tr.weight < main.weight * 0.35) continue;
    let seen = 0;
    let fits = 0;
    for (const at of t) {
      const f = faceAt(tr, at, false);
      const m = faceAt(main, at, true)!;
      if (!f) continue;
      seen++;
      if (Math.max(f.x + f.w / 2, m.x + m.w / 2) - Math.min(f.x - f.w / 2, m.x - m.w / 2) <= fx * 0.8) fits++;
    }
    if (seen >= t.length * 0.5 && fits >= seen * 0.8) group.push(tr);
  }
  const tx: number[] = [];
  const ty: number[] = [];
  const lo: number[] = [];
  const hi: number[] = [];
  const loY: number[] = [];
  const hiY: number[] = [];
  for (const at of t) {
    const m = faceAt(main, at, true)!;
    let x0 = m.x - m.w / 2;
    let x1 = m.x + m.w / 2;
    for (const tr of group.slice(1)) {
      const f = faceAt(tr, at, false);
      if (!f) continue;
      x0 = Math.min(x0, f.x - f.w / 2);
      x1 = Math.max(x1, f.x + f.w / 2);
    }
    tx.push((x0 + x1) / 2);
    lo.push(x0);
    hi.push(x1);
    // Eyes a little above the middle of the frame (a tall face just goes in the middle).
    ty.push(m.y + (m.h > fy * 0.4 ? 0.04 : 0.12) * fy);
    loY.push(m.y - m.h * 0.7);
    hiY.push(m.y + m.h * 0.6);
  }
  const speed = o.speed ?? 1;
  const span = (o.b - o.a) / speed;
  const axis = (target: number[], l: number[], h: number[], size: number): number[] => {
    if (size >= 0.999) return target.map(() => 0.5);
    const reach = Math.max(...h) - Math.min(...l);
    const inside = (c: number) => clamp(c, size / 2, 1 - size / 2);
    // Everyone stays in one still frame: the window goes where the framing wants it,
    // as far as it can while holding them all.
    if (reach <= size * 0.85) {
      const want = target.reduce((a, v) => a + v, 0) / target.length;
      return target.map(() => inside(clamp(want, Math.max(...h) - size / 2, Math.min(...l) + size / 2)));
    }
    // A quick shot of someone on the move: one steady pan from where they are to where they go.
    if (span < 1.2 || target.length < 3) {
      const first = inside(target[0]);
      const last = inside(target[target.length - 1]);
      return target.map((_, i) => (t.length > 1 ? first + ((last - first) * (t[i] - t[0])) / Math.max(1e-6, t[t.length - 1] - t[0]) : first));
    }
    // A final light pass takes the corners off where keeping the face in pushed the window.
    return smoothAt(t, follow(t, target, l, h, size, size * 0.16, 0.35), 0.1).map(inside);
  };
  const xs = axis(tx, lo, hi, fx);
  const ys = axis(ty, loY, hiY, fy);
  const still = xs.every((x) => Math.abs(x - xs[0]) < 1e-3) && ys.every((y) => Math.abs(y - ys[0]) < 1e-3);
  const crop: Crop = { ...base, cx: xs[0], cy: ys[0] };
  if (!still) {
    const path: number[] = [];
    for (let i = 0; i < t.length; i++) path.push(Math.max(0, (t[i] - o.a) / speed), xs[i], ys[i]);
    crop.path = path;
    crop.cx = xs[0];
    crop.cy = ys[0];
  }
  return crop;
}

/** The window's centre from where the picture's interest sits (no one in the shot). */
function salientCentre(scan: Scan, a: number, b: number, rect: Rect, fx: number, fy: number): { cx: number; cy: number } {
  const st = scan.stats;
  const cols = new Float64Array(PROFILE_BINS);
  const rows = new Float64Array(PROFILE_BINS);
  for (let i = 0; i < st.t.length; i++) {
    if (scan.kind === "video" && (st.t[i] < a - 0.1 || st.t[i] > b + 0.1)) continue;
    for (let k = 0; k < PROFILE_BINS; k++) {
      cols[k] += st.cols[i * PROFILE_BINS + k];
      rows[k] += st.rows[i * PROFILE_BINS + k];
    }
  }
  return {
    cx: fx < 0.999 ? bestCentre(within(cols, rect[0], rect[2]), fx, 0.5) : 0.5,
    cy: fy < 0.999 ? bestCentre(within(rows, rect[1], rect[3]), fy, 0.42) : 0.5,
  };
}

/** The crop centre at `t` seconds into a shot: along its path if it has one, else its pan. */
export function centreAt(c: Crop, t: number, d: number): [number, number] {
  const p = c.path;
  if (p && p.length >= 3) {
    if (t <= p[0]) return [p[1], p[2]];
    for (let i = 3; i < p.length; i += 3) {
      if (t <= p[i]) {
        const f = (t - p[i - 3]) / Math.max(1e-6, p[i] - p[i - 3]);
        return [p[i - 2] + (p[i + 1] - p[i - 2]) * f, p[i - 1] + (p[i + 2] - p[i - 1]) * f];
      }
    }
    return [p[p.length - 2], p[p.length - 1]];
  }
  const f = d > 0 ? Math.min(1, Math.max(0, t / d)) : 0;
  return [c.cx + ((c.cx1 ?? c.cx) - c.cx) * f, c.cy + ((c.cy1 ?? c.cy) - c.cy) * f];
}

/** A photo's slow push (or pull, `inward` false) drifting towards `target`: a face, or the interest. */
export function kenBurns(crop: Crop, target: [number, number], inward: boolean): Crop {
  const [tx, ty] = target;
  const mid = (v: number) => 0.5 + (v - 0.5) * 0.4;
  return { ...crop, path: undefined, zoom0: inward ? 1.02 : 1.1, zoom1: inward ? 1.1 : 1.02, cx: inward ? mid(tx) : tx, cy: inward ? mid(ty) : ty, cx1: inward ? tx : mid(tx), cy1: inward ? ty : mid(ty) };
}

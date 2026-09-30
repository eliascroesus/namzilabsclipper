/** Stand-ins for scanned footage, shared by the planner tests. */
import { KINDS, PROFILE_BINS, type Kind, type Scan } from "../src/engine/media/scan";
import { mulberry32 } from "../src/engine/plan/montage";

/** A stand-in for a scanned clip: interest and motion that wander, one colour cast. */
export function fakeScan(id: string, duration: number, seed: number, kind: "video" | "image" = "video"): Scan {
  const rand = mulberry32(seed);
  const rate = kind === "video" ? 6 : 0;
  const n = kind === "video" ? Math.floor(duration * rate) : 1;
  const base = [rand(), rand(), rand()];
  const f = (k: number) => new Float32Array(k);
  const stats = {
    t: f(n), luma: f(n), contrast: f(n), sharp: f(n), color: f(n), skin: f(n), motion: f(n),
    hist: f(n * 64), cols: f(n * PROFILE_BINS), rows: f(n * PROFILE_BINS), rgb: f(n * 3),
  };
  const interest = f(n);
  let phase = rand() * 6;
  for (let i = 0; i < n; i++) {
    stats.t[i] = kind === "video" ? (i + 0.5) / rate : 0;
    phase += 0.2;
    interest[i] = 0.4 + 0.3 * Math.sin(phase) * rand() + 0.2 * rand();
    stats.motion[i] = 0.05 + 0.2 * rand();
    for (let c = 0; c < 3; c++) stats.rgb[i * 3 + c] = base[c];
    for (let k = 0; k < PROFILE_BINS; k++) {
      stats.cols[i * PROFILE_BINS + k] = 1 / PROFILE_BINS;
      stats.rows[i * PROFILE_BINS + k] = 1 / PROFILE_BINS;
    }
  }
  return { id, kind, start: 0, duration, width: 1920, height: 1080, rate, stats, cuts: [], interest };
}

/**
 * A clip the picture model has looked at: each of its shots (between cuts) shows one
 * thing, judged as `kind` with its flex and wow; shots with the same `look` show the
 * same thing (the same car), others are unrelated. `frame` is how it's framed (its
 * colours and where the subject sits): the same look and frame is the same shot.
 */
export function lookedAt(id: string, shots: { len: number; kind: Kind; flex: number; wow: number; look: number; frame?: number }[], seed: number): Scan {
  const rand = mulberry32(seed);
  const rate = 6;
  const duration = shots.reduce((a, s) => a + s.len, 0);
  const n = Math.floor(duration * rate);
  const f = (k: number) => new Float32Array(k);
  const stats = { t: f(n), luma: f(n), contrast: f(n), sharp: f(n), color: f(n), skin: f(n), motion: f(n), hist: f(n * 64), cols: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rows: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rgb: f(n * 3) };
  const look = { flex: f(n), wow: f(n), kind: new Uint8Array(n), embs: [] as Float32Array[], cell: new Int32Array(n) };
  const cuts: number[] = [];
  let at = 0;
  for (const [k, shot] of shots.entries()) {
    const e = f(16).map((_, d) => (d === shot.look ? 1 : 0) + 0.12 * (rand() - 0.5));
    const norm = Math.hypot(...e);
    look.embs.push(e.map((x) => x / norm));
    if (k) cuts.push(at);
    at += shot.len;
  }
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / rate;
    stats.t[i] = t;
    let k = 0;
    while (k + 1 < shots.length && t >= cuts[k]) k++;
    stats.luma[i] = 0.45 + 0.1 * rand();
    stats.contrast[i] = 0.2;
    stats.sharp[i] = 4 + rand();
    stats.color[i] = 0.3;
    stats.motion[i] = 0.08 + 0.1 * rand();
    stats.rgb.set([0.3 + 0.4 * rand(), 0.4, 0.5], i * 3);
    const frame = shots[k].frame ?? shots[k].look;
    for (let b = 0; b < 64; b++) stats.hist[i * 64 + b] = Math.exp(-(((b - ((frame * 11) % 64)) / 4) ** 2));
    for (let b = 0; b < PROFILE_BINS; b++) {
      stats.cols[i * PROFILE_BINS + b] = Math.exp(-(((b - ((frame * 7) % PROFILE_BINS)) / 3) ** 2));
      stats.rows[i * PROFILE_BINS + b] = Math.exp(-(((b - ((frame * 13) % PROFILE_BINS)) / 3) ** 2));
    }
    look.flex[i] = shots[k].flex;
    look.wow[i] = shots[k].wow;
    look.kind[i] = KINDS.indexOf(shots[k].kind);
    look.cell[i] = k;
  }
  return { id, kind: "video", start: 0, duration, width: 1080, height: 1920, rate, stats, cuts, look };
}

/**
 * A steady beat grid. Most music made on a computer (house, garage, trap, pop)
 * runs at one exact tempo from start to finish, but a beat tracker that works in
 * whole analysis frames can only space beats in steps of 23 ms: at 134 bpm it has
 * to choose between 136 and 129, so its beats drift off and snap back, and cuts
 * on them land up to a tenth of a second off. So the tempo here is measured to a
 * hundredth of a bpm, from where the onset envelope repeats itself 4, 8, 16...
 * beats later, and the beat is placed where the kick and the snare land, not where
 * the hi-hats do: in a lot of dance music the hats hit hardest on the "and" in
 * between, and a tracker following them cuts off the beat. The same goes for a
 * 15 second clip of the song, which is what a Reel's sound is.
 */
import { getFFT } from "./dsp";

export interface Grid {
  /** analysis frames per beat (fractional) */
  period: number;
  /** the frame of a beat, 0 <= phase < period */
  phase: number;
  /** the period measured at each lag, for checking */
  lags: { beats: number; period: number; acf: number }[];
}

/** The autocorrelation of `x` (mean removed), normalised so lag 0 is 1. */
export function autocorrelation(x: ArrayLike<number>): Float64Array {
  const n = x.length;
  let size = 1;
  while (size < 2 * n) size <<= 1;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= Math.max(1, n);
  for (let i = 0; i < n; i++) re[i] = x[i] - mean;
  const fft = getFFT(size);
  fft.transform(re, im);
  // The power spectrum is real and even, so one more forward transform gives the autocorrelation.
  for (let k = 0; k < size; k++) {
    re[k] = re[k] * re[k] + im[k] * im[k];
    im[k] = 0;
  }
  fft.transform(re, im);
  const out = new Float64Array(n);
  const zero = re[0] || 1;
  for (let i = 0; i < n; i++) out[i] = re[i] / zero;
  return out;
}

/**
 * The peak of `a` between frames lo and hi, placed between frames by a parabola
 * through it; null when there's none (the highest point is on the slope up to a
 * peak outside).
 */
function peakBetween(a: Float64Array, lo: number, hi: number): { at: number; value: number } | null {
  const from = Math.max(1, Math.floor(lo));
  const to = Math.min(a.length - 2, Math.ceil(hi));
  if (to <= from) return null;
  let i = from;
  for (let k = from + 1; k <= to; k++) if (a[k] > a[i]) i = k;
  if ((i === from && a[i - 1] > a[i]) || (i === to && a[i + 1] > a[i])) return null;
  const y0 = a[i - 1];
  const y1 = a[i];
  const y2 = a[i + 1];
  const den = y0 - 2 * y1 + y2;
  const d = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)) : 0;
  return { at: i + d, value: y1 };
}

/**
 * The beat period, refined from `rough` (frames per beat, the tracker's): the
 * autocorrelation's peak one beat away, then 2, 4, 8... beats away, each look
 * narrowing the period further. Returns every estimate.
 */
export function refinePeriod(env: ArrayLike<number>, rough: number): { period: number; lags: Grid["lags"] } {
  const a = autocorrelation(env);
  let period = rough;
  const lags: Grid["lags"] = [];
  for (let k = 1; k * period < a.length * 0.45; k *= 2) {
    // The first look allows for the tracker's rounding to whole frames; later ones only
    // for what's left of the error, well short of half a beat, where the off-beat
    // hits (the hats on the "and") line up with the beats and make a peak of their own.
    const c = k * period;
    const w = k === 1 ? 0.04 * period + 1 : 0.1 * period;
    const p = peakBetween(a, c - w, c + w);
    if (!p) break;
    period = p.at / k;
    lags.push({ beats: k, period, acf: p.value });
  }
  return { period, lags };
}

/** Average onset strength by position within the beat, `bins` positions, smoothed a little around the circle. */
export function beatProfile(env: ArrayLike<number>, period: number, bins = 64, from = 0, to = env.length): Float64Array {
  const sum = new Float64Array(bins);
  const count = new Float64Array(bins);
  for (let i = Math.max(0, from); i < Math.min(env.length, to); i++) {
    const b = Math.min(bins - 1, Math.floor(((i % period) / period) * bins));
    sum[b] += env[i];
    count[b] += 1;
  }
  const p = sum.map((s, b) => (count[b] ? s / count[b] : 0));
  return p.map((v, b) => (p[(b - 1 + bins) % bins] + 2 * v + p[(b + 1) % bins]) / 4);
}

/**
 * How tightly the kick and snare keep to a grid in frames a..b. Each frame's hits
 * pull on a clock that goes round twice a beat (so a hit on the beat and one exactly
 * between pull the same way): `r` is how much of the pull agrees, 0 (spread all over
 * the beat) to 1 (every hit on the grid), and `off` where it points, in half beats.
 */
export function pull(low: ArrayLike<number>, mid: ArrayLike<number>, period: number, phase: number, a: number, b: number): { r: number; off: number } {
  let x = 0;
  let y = 0;
  let w = 0;
  for (let i = Math.max(0, a); i < Math.min(low.length, b); i++) {
    const v = low[i] + mid[i];
    const th = (4 * Math.PI * (i - phase)) / period;
    x += v * Math.cos(th);
    y += v * Math.sin(th);
    w += v;
  }
  return { r: w > 0 ? Math.hypot(x, y) / w : 0, off: Math.atan2(y, x) / (2 * Math.PI) };
}

/**
 * How hard the kick and the snare hit on a grid, on average: at every beat, the
 * strongest onset in each band (the kick's read up to three frames late: a low note
 * takes a moment to show in a long analysis window), each band against its own mean.
 */
function weight(low: ArrayLike<number>, mid: ArrayLike<number>, period: number, phase: number): number {
  let ml = 0;
  let mm = 0;
  for (let i = 0; i < low.length; i++) {
    ml += low[i];
    mm += mid[i];
  }
  ml = ml / low.length || 1;
  mm = mm / mid.length || 1;
  let sum = 0;
  let n = 0;
  for (let f = phase; f < low.length; f += period) {
    const c = Math.round(f);
    let l = 0;
    let m = 0;
    for (let i = Math.max(0, c - 1); i <= Math.min(low.length - 1, c + 3); i++) l = Math.max(l, low[i]);
    for (let i = Math.max(0, c - 1); i <= Math.min(mid.length - 1, c + 2); i++) m = Math.max(m, mid[i]);
    sum += l / ml + m / mm;
    n++;
  }
  return n ? sum / n : 0;
}

function zs(p: Float64Array): Float64Array {
  let m = 0;
  for (const v of p) m += v;
  m /= p.length;
  let sd = 0;
  for (const v of p) sd += (v - m) ** 2;
  sd = Math.sqrt(sd / p.length) || 1;
  return p.map((v) => (v - m) / sd);
}

/**
 * The song's steady grid, or null when it doesn't keep one (a live band, rubato,
 * a tempo change, or too short to tell): then the tracker's own beats stand.
 * `env` is the full onset envelope, `low` and `mid` the kick and snare bands',
 * `rough` the tracker's frames per beat, `fps` analysis frames per second, and
 * `others` more guesses at the beat (frames), tried after the tracker's.
 */
export function steadyGrid(env: ArrayLike<number>, low: ArrayLike<number>, mid: ArrayLike<number>, rough: number, fps = 22050 / 512, others: number[] = []): Grid | null {
  if (!(rough > 2) || env.length < rough * 12) return null;
  const bpm = (p: number) => (60 * fps) / p;
  const beatLike = (p: number) => p > 2 && bpm(p) >= 60 && bpm(p) <= 200 && env.length >= p * 12;
  const tried: number[] = [];
  const attempt = (p: number) => {
    if (!beatLike(p) || tried.some((q) => Math.abs(q - p) < 0.02 * p)) return null;
    tried.push(p);
    return gridAt(env, low, mid, p);
  };
  // The tracker's own level first, then the other guesses (the tempo the kick and
  // snare keep on their own: a trap beat's hats run in sixteenths, and a tracker
  // listening to everything can settle on five of them).
  const guesses = [rough, ...others];
  for (const p of guesses) {
    const g = attempt(p);
    if (g) return g;
  }
  // Then the levels around each. Hats on every "and" can pull the tracker to two
  // thirds of the tempo, where a beat lands on the kick, then on a hat, then on the
  // clap: no grid holds there. Or it counts every "and" as a beat, faster than
  // anyone cuts. The ones nearest a moderate tempo first, between 60 and 200 bpm.
  const levels = guesses
    .flatMap((p) => [2 / 3, 3 / 2, 1 / 2, 2].map((m) => p * m))
    .filter(beatLike)
    .sort((a, b) => Math.abs(Math.log2(bpm(a) / 120)) - Math.abs(Math.log2(bpm(b) / 120)));
  for (const p of levels) {
    const g = attempt(p);
    if (g) return g;
  }
  return null;
}

function gridAt(env: ArrayLike<number>, low: ArrayLike<number>, mid: ArrayLike<number>, rough: number): Grid | null {
  const { period, lags } = refinePeriod(env, rough);
  // Steady means the long looks agree to within a third of a percent, and the
  // envelope really does repeat there.
  const long = lags.filter((l) => l.beats >= 4);
  if (long.length < 2) return null;
  let spread = 0;
  let strength = 0;
  for (const l of long) {
    spread = Math.max(spread, Math.abs(l.period - period) / period);
    strength += l.acf;
  }
  strength /= long.length;
  if (spread > 0.0035 || strength < 0.12) return null;
  // Where the hits land, to a fraction of a frame: the kick, the snare and a little of
  // everything else, folded onto half a beat so the beat and the "and" line up and
  // sharpen each other.
  const bins = 64;
  const half = bins / 2;
  const pl = zs(beatProfile(low, period, bins));
  const pm = zs(beatProfile(mid, period, bins));
  const pe = zs(beatProfile(env, period, bins));
  const score = new Float64Array(half);
  for (let b = 0; b < bins; b++) score[b % half] += pl[b] + pm[b] + 0.5 * pe[b];
  let j = 0;
  for (let b = 1; b < half; b++) if (score[b] > score[j]) j = b;
  const y0 = score[(j - 1 + half) % half];
  const y1 = score[j];
  const y2 = score[(j + 1) % half];
  const den = y0 - 2 * y1 + y2;
  const d = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)) : 0;
  const at = (((j + 0.5 + d) / bins) * period + period) % (period / 2);
  // Then which of the two is the beat: the one the kick and the snare hit harder. The
  // hats are often the loudest thing on the "and" (all through garage and house); the
  // kick and snare almost never are, though a short stretch can look that way.
  const phase = weight(low, mid, period, at) >= weight(low, mid, period, at + period / 2) ? at : at + period / 2;
  // One tempo all the way through: in every stretch of the song that has drums, the
  // hits have to keep to the grid (on the beat, or exactly between: a syncopated kick
  // pattern can outweigh the snare for a few bars), not drift across it. A song that
  // changes tempo, or speeds up and slows down, keeps the tracker's beats.
  const whole = pull(low, mid, period, phase, 0, env.length);
  if (whole.r < 0.05) return null;
  const span = Math.round(16 * period);
  let level = 0;
  for (let i = 0; i < env.length; i++) level += low[i] + mid[i];
  level /= env.length;
  let checked = 0;
  let held = 0;
  for (let a = 0; a + span <= env.length; a += span) {
    let here = 0;
    for (let i = a; i < a + span; i++) here += low[i] + mid[i];
    if (here / span < 0.5 * level) continue; // a breakdown with no drums says nothing
    const p = pull(low, mid, period, phase, a, a + span);
    checked++;
    const off = ((p.off - whole.off + 1.5) % 1) - 0.5;
    if (p.r >= 0.4 * whole.r && Math.abs(off) <= 0.2) held++;
  }
  if (checked >= 3 && held < checked * 0.7) return null;
  return { period, phase, lags };
}

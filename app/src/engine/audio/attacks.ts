/**
 * Where the hits actually start. The beat grid (grid.ts) is found from an onset
 * envelope measured in 23 ms frames over 93 ms windows, which places each beat
 * where the energy of the hit peaks, some way after the hit begins: 25 ms on a
 * clean drum machine, 40 to 55 ms on a mixed record (a clap that builds, a kick
 * whose weight is in the sub). A viewer hears the hit where it begins, and a cut
 * placed off the envelope lands after it. Here the song is looked at in 3 ms steps,
 * hits are traced back to where they start, and the grid is moved onto the starts:
 * by however much it sits after them in this song, the same all the way through
 * (the grid's spacing is right; only where it sits is off). Each accent the planner
 * can cut on is traced back to its own start the same way.
 */
import { getFFT, hann } from "./dsp";

const N = 256;
const HOP = 64;
/** The first bin of the flux: 1 kHz at 22,050 Hz. */
const LOW_BIN = 12;

/**
 * Spectral flux in 3 ms steps over [a, b) seconds: how much the spectrum rises
 * from one step to the next, averaged over 1 to 11 kHz. Up there every hit starts
 * sharply (a clap, a hat, a bell, a kick's click); a kick's weight low down swells
 * for tens of milliseconds and would pull the start late.
 */
function flux(y: Float32Array, sr: number, a: number, b: number): { t0: number; d: Float32Array } {
  const fft = getFFT(N);
  const win = hann(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const start = Math.max(0, Math.floor(a * sr) - N / 2);
  const end = Math.min(y.length, Math.ceil(b * sr) + N / 2);
  const frames = Math.max(0, Math.floor((end - start - N) / HOP) + 1);
  const d = new Float32Array(frames);
  // Two frames per transform: one as the real part, the next as the imaginary part.
  const mags = Array.from({ length: frames }, () => new Float64Array(N / 2));
  for (let f = 0; f < frames; f += 2) {
    const s0 = start + f * HOP;
    const two = f + 1 < frames;
    for (let i = 0; i < N; i++) {
      re[i] = y[s0 + i] * win[i];
      im[i] = two ? y[s0 + HOP + i] * win[i] : 0;
    }
    fft.transform(re, im);
    for (let k = LOW_BIN; k < N / 2; k++) {
      const nk = N - k;
      // A = (Z[k] + conj Z[N-k]) / 2, B = (Z[k] - conj Z[N-k]) / 2i
      const ar = (re[k] + re[nk]) / 2;
      const ai = (im[k] - im[nk]) / 2;
      mags[f][k] = Math.log1p(100 * Math.sqrt(ar * ar + ai * ai));
      if (two) {
        const br = (im[k] + im[nk]) / 2;
        const bi = (re[nk] - re[k]) / 2;
        mags[f + 1][k] = Math.log1p(100 * Math.sqrt(br * br + bi * bi));
      }
    }
  }
  for (let f = 1; f < frames; f++) {
    let s = 0;
    for (let k = LOW_BIN; k < N / 2; k++) s += Math.max(0, mags[f][k] - mags[f - 1][k]);
    d[f] = s / (N / 2 - LOW_BIN);
  }
  // Frame f's window is centred on start + f·HOP + N/2.
  return { t0: (start + N / 2) / sr, d };
}

/** The strongest hit in [a, b) seconds, traced back to where it starts; null when nothing stands out. */
export function hitStart(y: Float32Array, sr: number, a: number, b: number): { t: number; s: number } | null {
  const { t0, d } = flux(y, sr, a - 0.03, b);
  let best = -1;
  for (let f = 1; f < d.length; f++) {
    const t = t0 + (f * HOP) / sr;
    if (t < a || t >= b) continue;
    if (best < 0 || d[f] > d[best]) best = f;
  }
  if (best < 0) return null;
  // Where the rise begins: back while the flux stays above a third of its peak.
  let f = best;
  while (f > 1 && d[f - 1] > 0.33 * d[best]) f--;
  // Something has to stand out: the peak well above what the stretch usually does.
  const sorted = [...d].sort((x, z) => x - z);
  const typical = sorted[Math.floor(sorted.length / 2)] ?? 0;
  if (d[best] < 2 * typical + 1e-4) return null;
  return { t: t0 + (f * HOP) / sr, s: d[best] };
}

/** The start of the strongest hit near each time (from 120 ms before it to 40 ms after), as a gap from it, with the hit's strength. */
function gapsNear(y: Float32Array, sr: number, times: number[], most = 240): { gap: number; s: number }[] {
  const step = Math.max(1, Math.floor(times.length / most));
  const found: { gap: number; s: number }[] = [];
  for (let i = 0; i < times.length; i += step) {
    const hit = hitStart(y, sr, times[i] - 0.12, times[i] + 0.04);
    if (hit) found.push({ gap: hit.t - times[i], s: hit.s });
  }
  return found;
}

/** The median gap over the clearer half of the hits (in a breakdown the "strongest" hit near a beat is often something else). */
function clearMedian(found: { gap: number; s: number }[]): number {
  const strong = [...found].sort((x, z) => z.s - x.s).slice(0, Math.max(8, Math.ceil(found.length / 2)));
  const gaps = strong.map((h) => h.gap).sort((x, z) => x - z);
  return gaps[gaps.length >> 1];
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
const bounded = (x: number) => Math.min(0.05, Math.max(-0.12, x));

/**
 * How far the hits start from the beats that stand for them (seconds; negative: the
 * beats are late). Where most beats carry a clear hit, it's measured on them: the
 * median gap from a beat to where its hit starts, over the clearer half. A broken
 * beat or a short clip of one has too few hits on the beat to go on, and there it's
 * measured through every onset (`onsets`, the envelope's own times for them): how far
 * each hit starts ahead of where the envelope has it, plus how far the envelope's
 * onsets sit from the beats. With nothing to go on, 30 ms, about how late the envelope
 * reads a clean drum machine.
 */
export function beatShift(y: Float32Array, sr: number, beats: number[], onsets: number[] = []): number {
  if (beats.length < 8) return 0;
  const onBeats = gapsNear(y, sr, beats);
  if (onBeats.length >= 24) return bounded(clearMedian(onBeats));
  const lag = gapsNear(y, sr, onsets, 400);
  const near: number[] = [];
  let k = 0;
  for (const b of beats) {
    while (k + 1 < onsets.length && onsets[k + 1] <= b) k++;
    let d = Infinity;
    for (const j of [k, k + 1]) if (j < onsets.length && Math.abs(onsets[j] - b) < Math.abs(d)) d = onsets[j] - b;
    if (Math.abs(d) < 0.035) near.push(d);
  }
  if (lag.length >= 8 && near.length >= 8) return bounded(clearMedian(lag) + median(near));
  if (onBeats.length >= 8) return bounded(clearMedian(onBeats));
  return -0.03;
}

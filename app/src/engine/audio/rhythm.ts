/**
 * Tempo, beats and onsets from an onset-strength envelope: exact ports of
 * librosa 0.11's feature.tempo, beat.beat_track (Ellis's dynamic-programming
 * tracker) and onset.onset_detect at their default parameters, quirks included,
 * so a beat here is the frame librosa would report.
 */
import { getFFT, hann, median, roundHalfEven, std } from "./dsp";

const TINY32 = 1.1754943508222875e-38;
const f32 = Math.fround;

/** librosa.feature.tempo: the mean tempogram weighted by a log-normal prior at 120 bpm. */
export function estimateTempo(env: Float32Array, sr: number, hop: number, startBpm = 120, stdBpm = 1, acSize = 8, maxTempo = 320): number {
  const n = env.length;
  const win = Math.floor(Math.floor(acSize * sr) / hop);
  const half = win >> 1;
  // numpy's pad(mode="linear_ramp", end_values=0): ramps up to the first value, down from the last.
  const padded = new Float64Array(n + 2 * half);
  for (let i = 0; i < half; i++) padded[i] = (env[0] * i) / half;
  for (let i = 0; i < n; i++) padded[half + i] = env[i];
  for (let i = 0; i < half; i++) padded[half + n + i] = (env[n - 1] * (half - 1 - i)) / half;

  const w = hann(win);
  let size = 1;
  while (size < 2 * win - 1) size <<= 1;
  const fft = getFFT(size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const tg = new Float64Array(win);
  const acA = new Float64Array(win);
  const acB = new Float64Array(win);
  // Every column is autocorrelated and normalised by its peak, two columns per FFT.
  const addColumn = (ac: Float64Array) => {
    let peak = 0;
    for (let k = 0; k < win; k++) peak = Math.max(peak, Math.abs(ac[k]));
    const norm = peak >= 1e-30 ? peak : 1;
    for (let k = 0; k < win; k++) tg[k] += ac[k] / norm;
  };
  for (let t = 0; t < n; t += 2) {
    const two = t + 1 < n;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < win; i++) {
      re[i] = padded[t + i] * w[i];
      if (two) im[i] = padded[t + 1 + i] * w[i];
    }
    fft.transform(re, im);
    // |A|² and |B|² of the two real columns, then one forward FFT of |A|² + i|B|²
    // gives size × both autocorrelations (the power spectra are real and even).
    for (let k = 0; k <= size >> 1; k++) {
      const nk = (size - k) & (size - 1);
      const ar = re[k] + re[nk];
      const ai = im[k] - im[nk];
      const br = im[k] + im[nk];
      const bi = re[nk] - re[k];
      const pa = (ar * ar + ai * ai) / 4;
      const pb = (br * br + bi * bi) / 4;
      re[k] = pa;
      im[k] = pb;
      re[nk] = pa;
      im[nk] = pb;
    }
    fft.transform(re, im);
    for (let k = 0; k < win; k++) {
      acA[k] = re[k] / size;
      acB[k] = im[k] / size;
    }
    addColumn(acA);
    if (two) addColumn(acB);
  }
  let best = -1;
  let bestScore = -Infinity;
  for (let k = 1; k < win; k++) {
    const bpm = (60 * sr) / (hop * k);
    if (bpm >= maxTempo) continue;
    const prior = -0.5 * ((Math.log2(bpm) - Math.log2(startBpm)) / stdBpm) ** 2;
    const score = Math.log1p(1e6 * (tg[k] / n)) + prior;
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best > 0 ? (60 * sr) / (hop * best) : startBpm;
}

export interface BeatTrack {
  bpm: number;
  /** beat frame indices */
  beats: number[];
  /** the tracker's smoothed onset score per frame (a beat-wide Gaussian over the normalised envelope) */
  localScore: Float64Array;
}

/** librosa.beat.beat_track(onset_envelope=env): the tempo, then the dynamic-programming tracker. */
export function beatTrack(env: Float32Array, sr: number, hop: number, bpm?: number, tightness = 100, trim = true): BeatTrack {
  const n = env.length;
  let any = false;
  for (let i = 0; i < n && !any; i++) any = env[i] !== 0;
  if (!any) return { bpm: 0, beats: [], localScore: new Float64Array(n) };
  const tempo = bpm ?? estimateTempo(env, sr, hop);
  const fpb = roundHalfEven(((sr / hop) * 60) / tempo);

  // __normalize_onsets, then __beat_local_score: a same-mode convolution with a
  // Gaussian a beat wide. librosa's loop bounds never reach the envelope's first frame.
  const sd = std(env, 1) + TINY32;
  const onsets = new Float64Array(n);
  for (let i = 0; i < n; i++) onsets[i] = env[i] / sd;
  const window = new Float64Array(2 * fpb + 1);
  for (let k = -fpb; k <= fpb; k++) window[k + fpb] = Math.exp(-0.5 * ((k * 32) / fpb) ** 2);
  const local = new Float64Array(n);
  let localMax = -Infinity;
  for (let i = 0; i < n; i++) {
    let s = 0;
    const jLo = Math.max(1, i - fpb);
    const jHi = Math.min(n - 1, i + fpb);
    for (let j = jLo; j <= jHi; j++) s += window[i - j + fpb] * onsets[j];
    local[i] = s;
    if (s > localMax) localMax = s;
  }

  // __beat_track_dp: each frame looks back between half a beat and two beats, nearest first.
  const threshold = 0.01 * localMax;
  const nearest = roundHalfEven(fpb / 2);
  const penalty = new Float64Array(2 * fpb + 1);
  for (let d = 1; d <= 2 * fpb; d++) penalty[d] = tightness * (Math.log(d) - Math.log(fpb)) ** 2;
  const cum = new Float64Array(n);
  const back = new Int32Array(n);
  let first = true;
  for (let i = 0; i < n; i++) {
    let bestScore = -Infinity;
    let loc = -1;
    for (let l = i - nearest; l >= i - 2 * fpb; l--) {
      if (l < 0) break;
      const s = cum[l] - penalty[i - l];
      if (s > bestScore) {
        bestScore = s;
        loc = l;
      }
    }
    cum[i] = loc >= 0 ? local[i] + bestScore : local[i];
    if (first && local[i] < threshold) {
      back[i] = -1;
    } else {
      back[i] = loc;
      first = false;
    }
  }

  // __last_beat: the last local maximum of the cumulative score (edge-padded, so
  // never frame 0) reaching half the median of all the maxima.
  const maxima: number[] = [];
  const isMax = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const l = cum[Math.max(0, i - 1)];
    const r = cum[Math.min(n - 1, i + 1)];
    if (cum[i] > l && cum[i] >= r) {
      isMax[i] = 1;
      maxima.push(cum[i]);
    }
  }
  const lastThreshold = maxima.length ? 0.5 * median(maxima) : 0;
  let tail = n - 1;
  for (let i = n - 1; i >= 0; i--) {
    if (isMax[i] && cum[i] >= lastThreshold) {
      tail = i;
      break;
    }
  }

  const isBeat = new Uint8Array(n);
  for (let i = tail; i >= 0; i = back[i]) isBeat[i] = 1;

  // __trim_beats: half the RMS of the beats' local scores, Hann-smoothed; librosa's
  // slice keeps the convolution's two trailing values in that RMS. Frames (not
  // beats) under the threshold are then cleared from each end.
  const at: number[] = [];
  for (let i = 0; i < n; i++) if (isBeat[i]) at.push(local[i]);
  const h = [0, 0.5, 1, 0.5, 0];
  const full = new Float64Array(at.length + 4);
  for (let j = 0; j < at.length; j++) for (let k = 0; k < 5; k++) full[j + k] += at[j] * h[k];
  const smoothBoe = full.subarray(2, Math.min(full.length, n + 2));
  let ss = 0;
  for (let i = 0; i < smoothBoe.length; i++) ss += smoothBoe[i] ** 2;
  const trimThreshold = trim ? 0.5 * Math.sqrt(ss / Math.max(1, smoothBoe.length)) : 0;
  for (let i = 0; i < n && local[i] <= trimThreshold; i++) isBeat[i] = 0;
  for (let i = n - 1; i >= 0 && local[i] <= trimThreshold; i--) isBeat[i] = 0;

  const beats: number[] = [];
  for (let i = 0; i < n; i++) if (isBeat[i]) beats.push(i);
  return { bpm: tempo, beats, localScore: local };
}

/**
 * librosa.onset.onset_detect: the envelope scaled to [0, 1], then util.peak_pick
 * (pre_max 30 ms, post_max 0, pre_avg 100 ms, post_avg 100 ms, wait 30 ms, delta 0.07)
 * in the float32 arithmetic librosa runs it in. Returns frame indices.
 */
export function detectOnsets(env: Float32Array, sr: number, hop: number, delta = 0.07): number[] {
  const n = env.length;
  if (!n) return [];
  let min = Infinity;
  for (let i = 0; i < n; i++) min = Math.min(min, env[i]);
  const x = new Float32Array(n);
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    x[i] = f32(env[i] - min);
    max = Math.max(max, x[i]);
  }
  const denom = f32(max + TINY32);
  let any = false;
  for (let i = 0; i < n; i++) {
    x[i] = f32(x[i] / denom);
    if (x[i] !== 0) any = true;
  }
  if (!any) return [];

  // Python's float floor division, then ceil to int.
  const frames = (seconds: number) => Math.ceil(Math.floor((seconds * sr) / hop));
  const preMax = frames(0.03);
  const postMax = frames(0) + 1;
  const preAvg = frames(0.1);
  const postAvg = frames(0.1) + 1;
  const wait = frames(0.03);
  const d = f32(delta);
  // numba's mean: a float32 accumulator divided by the count in float64.
  const mean32 = (a: number, b: number) => {
    let c = 0;
    for (let i = a; i < b; i++) c = f32(c + x[i]);
    return c / (b - a);
  };
  const maxOf = (a: number, b: number) => {
    let m = -Infinity;
    for (let i = a; i < b; i++) if (x[i] > m) m = x[i];
    return m;
  };

  const peaks: number[] = [];
  let i: number;
  if (x[0] >= maxOf(0, Math.min(postMax, n)) && x[0] >= mean32(0, Math.min(postAvg, n)) + d) {
    peaks.push(0);
    i = wait + 1;
  } else {
    i = 1;
  }
  while (i < n) {
    if (x[i] !== maxOf(Math.max(0, i - preMax), Math.min(i + postMax, n))) {
      i++;
      continue;
    }
    if (!(x[i] >= mean32(Math.max(0, i - preAvg), Math.min(i + postAvg, n)) + d)) {
      i++;
      continue;
    }
    peaks.push(i);
    i += wait + 1;
  }
  return peaks;
}

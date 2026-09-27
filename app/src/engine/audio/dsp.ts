/**
 * The signal-processing core, ported from librosa so the browser hears a song
 * the way the reference analysis did (tools/analyze_edit.py). Every function
 * mirrors a librosa default; tests/audio.test.ts holds them to librosa's own
 * output on the reference songs.
 */

/** An in-place radix-2 complex FFT with its tables computed once per size. */
export class FFT {
  readonly n: number;
  private readonly rev: Uint32Array;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;

  constructor(n: number) {
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`FFT size ${n} is not a power of two`);
    this.n = n;
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float64Array(n >> 1);
    this.sin = new Float64Array(n >> 1);
    for (let i = 0; i < n >> 1; i++) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / n);
      this.sin[i] = Math.sin((-2 * Math.PI * i) / n);
    }
  }

  /** Forward transform (e^{-2πikn/N}), unscaled. */
  transform(re: Float64Array, im: Float64Array): void {
    const { n, rev, cos, sin } = this;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (i < j) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0, w = 0; k < half; k++, w += step) {
          const a = i + k;
          const b = a + half;
          const wr = cos[w];
          const wi = sin[w];
          const br = re[b] * wr - im[b] * wi;
          const bi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - br;
          im[b] = im[a] - bi;
          re[a] += br;
          im[a] += bi;
        }
      }
    }
  }
}

const ffts = new Map<number, FFT>();
export function getFFT(n: number): FFT {
  let f = ffts.get(n);
  if (!f) ffts.set(n, (f = new FFT(n)));
  return f;
}

/** A periodic Hann window, as scipy's get_window("hann", n, fftbins=True). */
export function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

/** Number of frames librosa produces for a centred STFT. */
export const frameCount = (samples: number, hop: number) => 1 + Math.floor(samples / hop);

export interface Spectrogram {
  /** frames × bins, row-major */
  data: Float64Array;
  frames: number;
  bins: number;
}

/**
 * Power spectrogram |STFT|², centred with zero padding (librosa 0.10+ default).
 * Two real frames share one complex FFT, then are separated by symmetry.
 */
export function powerSpectrogram(y: Float32Array, nFft = 2048, hop = 512): Spectrogram {
  const pad = nFft >> 1;
  const frames = frameCount(y.length, hop);
  const bins = (nFft >> 1) + 1;
  const out = new Float64Array(frames * bins);
  const win = hann(nFft);
  const fft = getFFT(nFft);
  const re = new Float64Array(nFft);
  const im = new Float64Array(nFft);
  const fill = (buf: Float64Array, f: number) => {
    const start = f * hop - pad;
    for (let i = 0; i < nFft; i++) {
      const s = start + i;
      buf[i] = s >= 0 && s < y.length ? y[s] * win[i] : 0;
    }
  };
  for (let f = 0; f < frames; f += 2) {
    fill(re, f);
    if (f + 1 < frames) fill(im, f + 1);
    else im.fill(0);
    fft.transform(re, im);
    const rowA = f * bins;
    const rowB = (f + 1) * bins;
    for (let k = 0; k < bins; k++) {
      const nk = (nFft - k) & (nFft - 1);
      // A = (Z[k] + conj Z[N-k]) / 2, B = (Z[k] - conj Z[N-k]) / 2i
      const ar = (re[k] + re[nk]) / 2;
      const ai = (im[k] - im[nk]) / 2;
      out[rowA + k] = ar * ar + ai * ai;
      if (f + 1 < frames) {
        const br = (im[k] + im[nk]) / 2;
        const bi = (re[nk] - re[k]) / 2;
        out[rowB + k] = br * br + bi * bi;
      }
    }
  }
  return { data: out, frames, bins };
}

// Slaney mel scale, librosa's default (htk=False).
const F_SP = 200 / 3;
const MIN_LOG_HZ = 1000;
const MIN_LOG_MEL = MIN_LOG_HZ / F_SP;
const LOGSTEP = Math.log(6.4) / 27;
export const hzToMel = (f: number) => (f >= MIN_LOG_HZ ? MIN_LOG_MEL + Math.log(f / MIN_LOG_HZ) / LOGSTEP : f / F_SP);
export const melToHz = (m: number) => (m >= MIN_LOG_MEL ? MIN_LOG_HZ * Math.exp(LOGSTEP * (m - MIN_LOG_MEL)) : F_SP * m);

export interface MelBank {
  nMels: number;
  bins: number;
  /** nMels × bins, row-major */
  weights: Float64Array;
  /** the first and one-past-last non-zero bin of each band */
  lo: Int32Array;
  hi: Int32Array;
  /** each band's centre frequency */
  centres: Float64Array;
}

/** librosa.filters.mel with norm="slaney". */
export function melFilterbank(sr: number, nFft: number, nMels = 128, fmin = 0, fmax = sr / 2): MelBank {
  const bins = (nFft >> 1) + 1;
  const fftFreqs = new Float64Array(bins);
  for (let k = 0; k < bins; k++) fftFreqs[k] = (k * sr) / nFft;
  const minMel = hzToMel(fmin);
  const maxMel = hzToMel(fmax);
  const melF = new Float64Array(nMels + 2);
  for (let i = 0; i < nMels + 2; i++) melF[i] = melToHz(minMel + ((maxMel - minMel) * i) / (nMels + 1));
  const weights = new Float64Array(nMels * bins);
  const lo = new Int32Array(nMels);
  const hi = new Int32Array(nMels);
  const centres = new Float64Array(nMels);
  for (let i = 0; i < nMels; i++) {
    const d0 = melF[i + 1] - melF[i];
    const d1 = melF[i + 2] - melF[i + 1];
    const enorm = 2 / (melF[i + 2] - melF[i]);
    centres[i] = melF[i + 1];
    lo[i] = bins;
    hi[i] = 0;
    for (let k = 0; k < bins; k++) {
      const lower = (fftFreqs[k] - melF[i]) / d0;
      const upper = (melF[i + 2] - fftFreqs[k]) / d1;
      const v = Math.max(0, Math.min(lower, upper)) * enorm;
      weights[i * bins + k] = v;
      if (v > 0) {
        if (k < lo[i]) lo[i] = k;
        hi[i] = k + 1;
      }
    }
    if (hi[i] === 0) lo[i] = 0;
  }
  return { nMels, bins, weights, lo, hi, centres };
}

/** Mel power spectrogram, frames × nMels. */
export function melSpectrogram(power: Spectrogram, bank: MelBank): Float64Array {
  const { data, frames, bins } = power;
  const { nMels, weights, lo, hi } = bank;
  const out = new Float64Array(frames * nMels);
  for (let f = 0; f < frames; f++) {
    const pr = f * bins;
    for (let m = 0; m < nMels; m++) {
      const wr = m * bins;
      let s = 0;
      for (let k = lo[m]; k < hi[m]; k++) s += weights[wr + k] * data[pr + k];
      out[f * nMels + m] = s;
    }
  }
  return out;
}

/** power_to_db with ref=1, amin=1e-10, top_db=80, in place. */
export function powerToDb(s: Float64Array): Float64Array {
  let max = -Infinity;
  for (let i = 0; i < s.length; i++) {
    const db = 10 * Math.log10(Math.max(1e-10, s[i]));
    s[i] = db;
    if (db > max) max = db;
  }
  const floor = max - 80;
  for (let i = 0; i < s.length; i++) if (s[i] < floor) s[i] = floor;
  return s;
}

/**
 * librosa.onset.onset_strength: spectral flux on the log-mel spectrogram (lag 1),
 * averaged over bands, shifted to counter the window's reach (n_fft / 2 hops).
 * `bandRange` restricts the average to some mel bands (the kick-drum envelope).
 */
export function onsetStrength(melDb: Float64Array, frames: number, nMels: number, nFft: number, hop: number, bandRange?: [number, number]): Float32Array {
  const [b0, b1] = bandRange ?? [0, nMels];
  const lag = 1;
  const shift = lag + Math.floor(nFft / (2 * hop));
  const env = new Float32Array(frames);
  for (let f = lag; f < frames; f++) {
    const dst = f - lag + shift;
    if (dst >= frames) break;
    let s = 0;
    for (let m = b0; m < b1; m++) {
      const d = melDb[f * nMels + m] - melDb[(f - lag) * nMels + m];
      if (d > 0) s += d;
    }
    env[dst] = s / (b1 - b0);
  }
  return env;
}

/** librosa.feature.rms (frame 2048, centred, zero padded). */
export function rms(y: Float32Array, frameLength = 2048, hop = 512): Float32Array {
  const frames = frameCount(y.length, hop);
  const out = new Float32Array(frames);
  const pad = frameLength >> 1;
  // A running sum of squares: each frame adds and drops one hop.
  const sq = (i: number) => (i >= 0 && i < y.length ? y[i] * y[i] : 0);
  let s = 0;
  for (let i = -pad; i < -pad + frameLength; i++) s += sq(i);
  for (let f = 0; f < frames; f++) {
    out[f] = Math.sqrt(Math.max(0, s) / frameLength);
    const start = f * hop - pad;
    for (let i = 0; i < hop; i++) s += sq(start + frameLength + i) - sq(start + i);
  }
  return out;
}

export function mean(a: ArrayLike<number>, from = 0, to = a.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i];
  return to > from ? s / (to - from) : 0;
}

export function std(a: ArrayLike<number>, ddof = 0): number {
  const m = mean(a);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - m) ** 2;
  return Math.sqrt(s / Math.max(1, a.length - ddof));
}

/** numpy.percentile with linear interpolation. */
export function percentile(a: ArrayLike<number>, p: number): number {
  if (!a.length) return 0;
  const s = Float64Array.from(a).sort();
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

export function median(a: ArrayLike<number>): number {
  return percentile(a, 50);
}

/** numpy's round: halves go to the even neighbour. */
export function roundHalfEven(x: number): number {
  const r = Math.round(x);
  return Math.abs(x - Math.trunc(x)) === 0.5 ? 2 * Math.round(x / 2) : r;
}

/** A centred moving average over `radius` frames each side, edges averaged over what exists. */
export function smooth(a: ArrayLike<number>, radius: number): Float32Array {
  const n = a.length;
  const out = new Float32Array(n);
  const cs = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + a[i];
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(n, i + radius + 1);
    out[i] = (cs[hi] - cs[lo]) / (hi - lo);
  }
  return out;
}

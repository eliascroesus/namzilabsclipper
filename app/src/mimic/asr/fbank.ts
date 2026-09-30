/**
 * The speech model's input: 128 log-mel energies every 10 ms, computed the way
 * sherpa-onnx computes them for NeMo models (kaldi-native-fbank with a
 * librosa mel bank): 25 ms Povey windows centred on each 10 ms step, reflected
 * at the ends, pre-emphasis 0.97 inside each window, a 512-point power
 * spectrum, Slaney mel filters from 0 to 7.6 kHz, the log, then every mel band
 * brought to zero mean and unit spread over the clip. tests/mimic-asr.test.ts
 * holds it to kaldi-native-fbank's own numbers.
 */
import { getFFT } from "../../engine/audio/dsp";

export const RATE = 16000;
export const BINS = 128;
const SHIFT = 160;
const LENGTH = 400;
const PADDED = 512;
const PREEMPH = 0.97;
const HIGH = RATE / 2 - 400;

const melSlaney = (f: number) => (f <= 1000 ? (f * 3) / 200 : 15 + 14.545078505785561 * Math.log(f / 1000));
const hzSlaney = (m: number) => (m <= 15 ? (200 / 3) * m : 1000 * Math.exp((m - 15) * 0.06875177742094911));

interface Band {
  first: number;
  weights: Float32Array;
}

let banks: Band[] | null = null;

/** The mel filters over the 257 bins of a 512-point spectrum, each kept as its non-zero run. */
function melBanks(): Band[] {
  if (banks) return banks;
  const lo = melSlaney(0);
  const hi = melSlaney(HIGH);
  const delta = (hi - lo) / (BINS + 1);
  const width = RATE / PADDED;
  const out: Band[] = [];
  for (let b = 0; b < BINS; b++) {
    const l = hzSlaney(lo + b * delta);
    const c = hzSlaney(lo + (b + 1) * delta);
    const r = hzSlaney(lo + (b + 2) * delta);
    const w: number[] = [];
    let first = -1;
    for (let i = 0; i <= PADDED / 2; i++) {
      const hz = width * i;
      if (hz > l && hz < r) {
        const v = (hz <= c ? (hz - l) / (c - l) : (r - hz) / (r - c)) * (2 / (r - l));
        if (first < 0) first = i;
        w[i - first] = v;
      }
    }
    out.push({ first, weights: Float32Array.from(w) });
  }
  return (banks = out);
}

let window: Float64Array | null = null;
function povey(): Float64Array {
  if (window) return window;
  const w = new Float64Array(LENGTH);
  const a = (2 * Math.PI) / (LENGTH - 1);
  for (let i = 0; i < LENGTH; i++) w[i] = Math.pow(0.5 - 0.5 * Math.cos(a * i), 0.85);
  return (window = w);
}

/** Frames of 10 ms in `samples` samples: the count rounds to the nearest step. */
export const frameCount = (samples: number) => Math.floor((samples + SHIFT / 2) / SHIFT);

/**
 * Log-mel features of 16 kHz mono audio, normalised per band, laid out band by
 * band ([128, frames], the encoder's input order).
 */
export function features(y: Float32Array): { data: Float32Array; frames: number } {
  const n = y.length;
  const frames = frameCount(n);
  const data = new Float32Array(BINS * frames);
  if (!frames) return { data, frames };
  const fft = getFFT(PADDED);
  const re = new Float64Array(PADDED);
  const im = new Float64Array(PADDED);
  const win = povey();
  const mel = melBanks();
  const frame = new Float64Array(LENGTH);
  const power = new Float64Array(PADDED / 2 + 1);
  for (let f = 0; f < frames; f++) {
    const start = f * SHIFT + SHIFT / 2 - LENGTH / 2;
    for (let s = 0; s < LENGTH; s++) {
      let k = start + s;
      // Reflect at the ends: -1 is 0, n is n - 1.
      while (k < 0 || k >= n) k = k < 0 ? -k - 1 : 2 * n - 1 - k;
      frame[s] = y[k];
    }
    for (let s = LENGTH - 1; s > 0; s--) frame[s] -= PREEMPH * frame[s - 1];
    frame[0] -= PREEMPH * frame[0];
    re.fill(0);
    im.fill(0);
    for (let s = 0; s < LENGTH; s++) re[s] = frame[s] * win[s];
    fft.transform(re, im);
    for (let i = 0; i <= PADDED / 2; i++) power[i] = re[i] * re[i] + im[i] * im[i];
    for (let b = 0; b < BINS; b++) {
      const { first, weights } = mel[b];
      let e = 0;
      for (let i = 0; i < weights.length; i++) e += weights[i] * power[first + i];
      data[b * frames + f] = Math.log(Math.max(e, 1.1920928955078125e-7));
    }
  }
  // Per band: zero mean, unit spread (population variance, as sherpa-onnx computes it).
  for (let b = 0; b < BINS; b++) {
    const row = data.subarray(b * frames, (b + 1) * frames);
    let mean = 0;
    for (let i = 0; i < frames; i++) mean += row[i];
    mean /= frames;
    let v = 0;
    for (let i = 0; i < frames; i++) v += (row[i] - mean) ** 2;
    const inv = 1 / (Math.sqrt(v / frames) + 1e-5);
    for (let i = 0; i < frames; i++) row[i] = (row[i] - mean) * inv;
  }
  return { data, frames };
}

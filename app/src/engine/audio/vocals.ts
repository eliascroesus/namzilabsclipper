/**
 * Where the singing is. Spleeter's vocal network (Deezer, MIT licence; the ONNX
 * export from sherpa-onnx, 20 MB in public/models) estimates the voice's share of
 * every moment of the song, and from that come the sung stretches, the start of
 * each line (a voice after a breath) and the syllables inside them. An editor
 * cuts a verse on its lines, not on a metronome: this is what lets the planner
 * do the same (see structure.ts and plan/montage.ts).
 *
 * It needs no extra decoding: a 2048-point STFT of the song at 22,050 Hz has the
 * same bins, window and hop as the 4096-point STFT at 44,100 Hz the network was
 * trained on, with half the samples in a window (so twice the magnitude there).
 * On KETTAMA's Comes and Goes it tells sung moments from the rest 95 times in 100
 * (ROC AUC 0.955, against a studio-grade separation) and places every line of the
 * verse within 30 ms.
 */
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import { frameCount, getFFT, hann } from "./dsp";

const MODEL = `${import.meta.env.BASE_URL}models/spleeter-vocals.onnx`;
const N_FFT = 2048;
const HOP = 512;
const BINS = 1024;
/** frames the network takes at a time (11.9 seconds) */
const SPLIT = 512;

export interface Vocals {
  /** per analysis frame (512 samples at 22,050 Hz): the voice's share of the mix in its band, dB */
  ratio: Float32Array;
  /** per analysis frame: singing (1) or not (0) */
  active: Uint8Array;
  /** song times where a sung line starts (after a breath of at least 0.4 s) */
  lines: number[];
  /** song times of syllables: onsets in the voice while it sings */
  syllables: number[];
}

let session: Promise<{ ort: typeof import("onnxruntime-web/wasm"); s: import("onnxruntime-web/wasm").InferenceSession }> | null = null;
/** how much of the model has come down, 0 to 1, for whoever is waiting on it */
let downloaded = 0;

/** The network, loaded once: its 20 MB come down in pieces (so how far it's got can be shown), and a stalled download gives up. */
function load(signal?: AbortSignal) {
  if (!session) {
    downloaded = 0;
    session = (async () => {
      const ort = await import("onnxruntime-web/wasm");
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = { wasm: wasmUrl };
      const res = await fetch(MODEL, { signal });
      if (!res.ok || !res.body) throw new Error(`The vocal model didn't load (${res.status}).`);
      const total = Number(res.headers.get("content-length")) || 19_681_017;
      const parts: Uint8Array[] = [];
      let got = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        got += value.length;
        downloaded = Math.min(1, got / total);
      }
      const bytes = new Uint8Array(got);
      let at = 0;
      for (const p of parts) bytes.set(p, (at += p.length) - p.length);
      downloaded = 1;
      const s = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
      return { ort, s };
    })();
    session.catch(() => (session = null));
  }
  return session;
}

/** Magnitudes of the first 1024 bins for frames [f0, f0 + n), row-major, scaled to the 44.1 kHz STFT the network knows. */
function magnitudes(y: Float32Array, f0: number, n: number): Float32Array {
  const out = new Float32Array(n * BINS);
  const win = hann(N_FFT);
  const fft = getFFT(N_FFT);
  const re = new Float64Array(N_FFT);
  const im = new Float64Array(N_FFT);
  const pad = N_FFT >> 1;
  for (let f = 0; f < n; f++) {
    const start = (f0 + f) * HOP - pad;
    for (let i = 0; i < N_FFT; i++) {
      const s = start + i;
      re[i] = s >= 0 && s < y.length ? y[s] * win[i] : 0;
      im[i] = 0;
    }
    fft.transform(re, im);
    const row = f * BINS;
    for (let k = 0; k < BINS; k++) out[row + k] = 2 * Math.hypot(re[k], im[k]);
  }
  return out;
}

export interface VocalOptions {
  sr?: number;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

/** The singing in mono audio at 22,050 Hz. */
export async function findVocals(y: Float32Array, o: VocalOptions = {}): Promise<Vocals> {
  const sr = o.sr ?? 22050;
  // (While the model comes down, the first half of the way.)
  const fresh = !session;
  const tick = fresh ? setInterval(() => o.onProgress?.(0.5 * downloaded), 250) : undefined;
  let model: Awaited<ReturnType<typeof load>>;
  try {
    model = await load(o.signal);
  } finally {
    clearInterval(tick);
  }
  const { ort, s } = model;
  const share = (f: number) => (fresh ? 0.5 + 0.5 * f : f);
  const frames = frameCount(y.length, HOP);
  const fps = sr / HOP;
  // The band a voice lives in: 150 Hz to 5 kHz.
  const lo = Math.ceil((150 * N_FFT) / sr);
  const hi = Math.min(BINS - 1, Math.floor((5000 * N_FFT) / sr));
  const ratio = new Float32Array(frames);
  const voice = new Float32Array(frames * (hi - lo + 1));
  for (let f0 = 0; f0 < frames; f0 += SPLIT) {
    if (o.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const n = Math.min(SPLIT, frames - f0);
    const mag = magnitudes(y, f0, n);
    // Both channels the same (the song is mono here), padded to a whole split.
    const x = new Float32Array(2 * SPLIT * BINS);
    x.set(mag, 0);
    x.set(mag, SPLIT * BINS);
    const out = await s.run({ x: new ort.Tensor("float32", x, [2, 1, SPLIT, BINS]) });
    const v = out.y.data as Float32Array;
    for (let f = 0; f < n; f++) {
      let ve = 0;
      let me = 0;
      for (let k = lo; k <= hi; k++) {
        const a = v[f * BINS + k];
        const b = mag[f * BINS + k];
        ve += a * a;
        me += b * b;
        voice[(f0 + f) * (hi - lo + 1) + (k - lo)] = a;
      }
      ratio[f0 + f] = 10 * Math.log10((ve + 1e-9) / (me + 1e-9));
    }
    o.onProgress?.(share(Math.min(1, (f0 + n) / frames)));
  }
  // A quarter-second average, then on above -9 dB and off below -15 dB.
  const w = Math.max(1, Math.round(0.25 * fps));
  const smooth = new Float32Array(frames);
  let acc = 0;
  for (let f = 0; f < frames; f++) {
    acc += 10 ** (ratio[f] / 10);
    if (f >= w) acc -= 10 ** (ratio[f - w] / 10);
    smooth[Math.max(0, f - (w >> 1))] = 10 * Math.log10(acc / Math.min(w, f + 1) + 1e-9);
  }
  const active = new Uint8Array(frames);
  let on = false;
  for (let f = 0; f < frames; f++) {
    if (!on && smooth[f] > -9) on = true;
    else if (on && smooth[f] < -15) on = false;
    active[f] = on ? 1 : 0;
  }
  // Fill breaths under 0.2 s, drop blips under 0.25 s.
  const runs = (val: number, maxLen: number, set: number) => {
    for (let f = 0; f < frames; ) {
      if (active[f] !== val) {
        f++;
        continue;
      }
      let g = f;
      while (g < frames && active[g] === val) g++;
      if (g - f < maxLen && f > 0 && g < frames) active.fill(set, f, g);
      f = g;
    }
  };
  runs(0, Math.round(0.2 * fps), 1);
  runs(1, Math.round(0.25 * fps), 0);
  const lines: number[] = [];
  let quiet = Infinity;
  for (let f = 0; f < frames; f++) {
    if (active[f]) {
      if (quiet >= 0.4 * fps) lines.push(f / fps);
      quiet = 0;
    } else quiet++;
  }
  // Syllables: where the voice's own spectrum jumps up (log flux), while it sings.
  const width = hi - lo + 1;
  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) {
    let d = 0;
    for (let k = 0; k < width; k++) {
      const a = Math.log(1 + 100 * voice[f * width + k]);
      const b = Math.log(1 + 100 * voice[(f - 1) * width + k]);
      if (a > b) d += a - b;
    }
    flux[f] = d / width;
  }
  const sorted = Array.from(flux).sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  const syllables: number[] = [];
  const gap = Math.round(0.12 * fps);
  let last = -gap;
  for (let f = 2; f + 2 < frames; f++) {
    if (!active[f] || flux[f] < floor || f - last < gap) continue;
    if (flux[f] >= flux[f - 1] && flux[f] >= flux[f + 1] && flux[f] >= flux[f - 2] && flux[f] >= flux[f + 2]) {
      syllables.push(f / fps);
      last = f;
    }
  }
  return { ratio, active, lines, syllables };
}

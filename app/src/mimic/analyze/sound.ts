/**
 * The reference's sound: where the voice is, how long its pauses are, whether
 * music (or a drone) sits under it and from where, and whether sounds come
 * with its visual events (a whoosh with every card, a hit with every zoom).
 * Heard at 16 kHz in 100 ms steps.
 */
import { getFFT } from "../../engine/audio/dsp";
import { detectSpeech, type Run } from "../../engine/audio/speech";
import type { SfxKind, SfxOn, SoundLook } from "../types";

const RATE = 16000;
const STEP = 0.1;

/** Energy (dB) per 100 ms in a few bands: low (20 to 90 Hz, under a voice), all (20 Hz to 8 kHz), high (2 to 8 kHz). */
export function bands(y: Float32Array): { low: Float32Array; all: Float32Array; high: Float32Array } {
  const hop = Math.round(RATE * STEP);
  const n = Math.floor(y.length / hop);
  const N = 2048;
  const fft = getFFT(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const low = new Float32Array(n);
  const all = new Float32Array(n);
  const high = new Float32Array(n);
  const bin = RATE / N;
  for (let f = 0; f < n; f++) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < hop; i++) re[i] = y[f * hop + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / hop));
    fft.transform(re, im);
    let l = 0;
    let a = 0;
    let h = 0;
    for (let k = 1; k < N / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      const hz = k * bin;
      if (hz >= 20) a += p;
      if (hz >= 20 && hz < 90) l += p;
      if (hz >= 2000) h += p;
    }
    low[f] = 10 * Math.log10(l + 1e-9);
    all[f] = 10 * Math.log10(a + 1e-9);
    high[f] = 10 * Math.log10(h + 1e-9);
  }
  return { low, all, high };
}

const pct = (v: ArrayLike<number>, p: number) => {
  const s = Array.from(v).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))] : 0;
};

/**
 * A bed under the voice: the quiet between words rising well above where it
 * starts (the room) and staying up, most of all in the low end, where music
 * sits under speech. Its level is the bed against the voice, in dB.
 */
export function findBed(b: { low: Float32Array; all: Float32Array }, speech: Run[]): { start: number; level: number } | null {
  const n = b.low.length;
  if (n < 50) return null;
  // The floor: the quietest fifth of each 2 s, in the low band and overall.
  const floor = (v: Float32Array) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = pct(v.subarray(Math.max(0, i - 10), Math.min(n, i + 10)), 0.2);
    return out;
  };
  const low = floor(b.low);
  const base = pct(low, 0.1);
  // Where the low floor sits 12 dB over its quietest for 5 s or more.
  let start = -1;
  for (let i = 0; i + 50 <= n; i++) {
    let up = 0;
    for (let k = i; k < i + 50; k++) if (low[k] > base + 12) up++;
    if (up >= 45) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  // Its level against the voice: the floor over the bed, against the voice's middle loudness.
  const voiced = new Uint8Array(n);
  for (const r of speech) for (let i = Math.floor(r.start / STEP); i < Math.min(n, Math.ceil(r.end / STEP)); i++) voiced[i] = 1;
  const voice = pct(Array.from(b.all).filter((_, i) => voiced[i]), 0.5);
  // The bed alone shows between words: the quietest tenth of the stretch it plays under.
  const bed = pct(b.all.subarray(start), 0.1);
  return { start: Math.round(start * STEP * 10) / 10, level: Math.round(bed - voice) };
}

/**
 * Sounds that come with visual events: for each kind of event (at least three
 * of them), the loudest high-band moment within 0.3 s of each, against the
 * same around moments picked evenly through the video. A kind whose events are
 * clearly louder (4 dB) has a sound on it.
 */
export function findSfx(high: Float32Array, events: { t: number; on: SfxOn }[], duration: number): SoundLook["sfx"] {
  const n = high.length;
  const peak = (t: number) => {
    let m = -Infinity;
    for (let i = Math.max(0, Math.floor((t - 0.3) / STEP)); i <= Math.min(n - 1, Math.ceil((t + 0.3) / STEP)); i++) m = Math.max(m, high[i]);
    return m;
  };
  const probes: number[] = [];
  for (let t = 0.5; t < duration - 0.5; t += duration / 97) probes.push(peak(t));
  const typical = pct(probes, 0.5);
  const spread = pct(probes, 0.75) - typical;
  const kinds: Record<SfxOn, SfxKind> = { "card-in": "whoosh", "card-out": "whoosh", cut: "whoosh", broll: "whoosh", zoom: "hit" };
  const out: SoundLook["sfx"] = [];
  for (const on of ["card-in", "card-out", "cut", "broll", "zoom"] as SfxOn[]) {
    const ts = events.filter((e) => e.on === on).map((e) => e.t);
    if (ts.length < 3) continue;
    const lift = pct(ts.map(peak), 0.5) - typical;
    if (lift > Math.max(4, spread)) out.push({ on, kind: kinds[on], level: Math.round(lift) });
  }
  return out;
}

export interface SoundProfile {
  speech: Run[];
  maxPause: number;
  bed: SoundLook["bed"];
  high: Float32Array;
}

export function soundProfile(y: Float32Array): SoundProfile {
  const speech = detectSpeech(y, RATE);
  const gaps: number[] = [];
  for (let i = 1; i < speech.length; i++) {
    const g = speech[i].start - speech[i - 1].end;
    if (g < 1.5) gaps.push(g);
  }
  const b = bands(y);
  return { speech, maxPause: Math.round(pct(gaps, 0.9) * 100) / 100 || 0.3, bed: findBed(b, speech), high: b.high };
}

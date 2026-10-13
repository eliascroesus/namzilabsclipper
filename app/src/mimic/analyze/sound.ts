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
  const kinds: Record<SfxOn, SfxKind> = { "card-in": "whoosh", "card-out": "whoosh", cut: "whoosh", broll: "whoosh", zoom: "hit", transition: "whoosh" };
  const out: SoundLook["sfx"] = [];
  for (const on of ["card-in", "card-out", "cut", "broll", "zoom", "transition"] as SfxOn[]) {
    const ts = events.filter((e) => e.on === on).map((e) => e.t);
    if (ts.length < 3) continue;
    const lift = pct(ts.map(peak), 0.5) - typical;
    if (lift > Math.max(4, spread)) out.push({ on, kind: kinds[on], level: Math.round(lift) });
  }
  return out;
}

const FINE = 0.01;
const EDGES = [62, 125, 250, 500, 1000, 2000, 4000, 8000];

/**
 * Every 10 ms: energy (dB) in seven octave bands from 62 Hz to 8 kHz, and how noise-like
 * the sound is above 500 Hz (spectral flatness: 0 a pure tone, 1 white noise).
 */
export function fineBands(y: Float32Array): { band: Float32Array[]; flat: Float32Array; n: number } {
  const hop = Math.round(RATE * FINE);
  const N = 512;
  const W = 400;
  const n = Math.max(0, Math.floor((y.length - W) / hop) + 1);
  const fft = getFFT(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const band = EDGES.slice(1).map(() => new Float32Array(n));
  const flat = new Float32Array(n);
  const bin = RATE / N;
  const win = new Float64Array(W);
  for (let i = 0; i < W; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (W - 1));
  for (let f = 0; f < n; f++) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < W; i++) re[i] = y[f * hop + i] * win[i];
    fft.transform(re, im);
    const e = new Float64Array(band.length);
    let logSum = 0;
    let sum = 0;
    let k = 0;
    for (let b = 1; b < N / 2; b++) {
      const pw = re[b] * re[b] + im[b] * im[b];
      const hz = b * bin;
      for (let j = 0; j < band.length; j++) if (hz >= EDGES[j] && hz < EDGES[j + 1]) e[j] += pw;
      if (hz >= 500) {
        logSum += Math.log(pw + 1e-12);
        sum += pw + 1e-12;
        k++;
      }
    }
    for (let j = 0; j < band.length; j++) band[j][f] = 10 * Math.log10(e[j] + 1e-9);
    flat[f] = k ? Math.exp(logSum / k) / (sum / k) : 0;
  }
  return { band, flat, n };
}

/** A sound standing out at a moment: how far above the usual, how long, and what kind it sounds like. */
export interface HeardSound {
  lift: number;
  dur: number;
  kind: SfxKind;
  /** its loudest moment */
  peak: number;
}

/** Each band's usual loudest within 0.3 s, over moments picked evenly through the sound: what the voice and the music do anyway. */
export function usualPeaks(f: ReturnType<typeof fineBands>, duration: number): number[] {
  const peaks: number[][] = f.band.map(() => []);
  for (let t = 0.5; t < duration - 0.5; t += Math.max(0.1, duration / 101)) {
    const i0 = Math.round(t / FINE);
    f.band.forEach((b, k) => {
      let m = -Infinity;
      for (let j = Math.max(0, i0 - 30); j <= Math.min(f.n - 1, i0 + 30); j++) m = Math.max(m, b[j]);
      peaks[k].push(m);
    });
  }
  return peaks.map((p) => pct(p, 0.6));
}

/**
 * The sound standing out most within 0.3 s of t, against what each band's loudest usually
 * is (`usual`), and what it sounds like, from its loudness over the bands it fills: a click
 * or pop (under 80 ms), a boom (most of it under 250 Hz, hitting at once), a riser (long,
 * growing into its peak), a ding (a tone), a whoosh (noise, a fifth of a second or more) or
 * a swipe (a short burst of it).
 */
export function soundAt(f: ReturnType<typeof fineBands>, t: number, usual: number[]): HeardSound | null {
  const i0 = Math.round(t / FINE);
  if (i0 < 0 || i0 >= f.n) return null;
  let best = { j: -1, rise: -Infinity };
  for (let j = Math.max(0, i0 - 30); j <= Math.min(f.n - 1, i0 + 30); j++)
    for (let b = 0; b < f.band.length; b++) {
      const r = f.band[b][j] - usual[b];
      if (r > best.rise) best = { j, rise: r };
    }
  if (best.j < 0) return null;
  const { j, rise } = best;
  // The bands it fills (10 dB over their floor about it), and its loudness over them.
  const floor = f.band.map((b) => pct(b.subarray(Math.max(0, i0 - 150), Math.min(f.n, i0 + 150)), 0.3));
  let fill = f.band.map((_, b) => b).filter((b) => f.band[b][j] - floor[b] > 10);
  if (!fill.length) fill = f.band.map((_, b) => b);
  const env = (i: number) => 10 * Math.log10(fill.reduce((a, b) => a + Math.pow(10, f.band[b][i] / 10), 0) + 1e-12);
  const top = env(j);
  const base = 10 * Math.log10(fill.reduce((a, b) => a + Math.pow(10, floor[b] / 10), 0) + 1e-12);
  const edge = Math.max(top - 10, base + 3);
  let a = j;
  while (a > 0 && j - a < 200 && env(a - 1) > edge) a--;
  let e = j;
  while (e + 1 < f.n && e - j < 200 && env(e + 1) > edge) e++;
  const dur = (e - a + 1) * FINE;
  const attack = (j - a) * FINE;
  // (How long it grows into its peak from 6 dB over the floor: a riser's whole build.)
  let lead = j;
  while (lead > 0 && j - lead < 300 && env(lead - 1) > base + 6) lead--;
  const build = (j - lead) * FINE;
  const lin = f.band.map((x) => Math.pow(10, x[j] / 10));
  const total = lin.reduce((v, x) => v + x, 0) || 1;
  const low = (lin[0] + lin[1]) / total;
  const flat = f.flat[j];
  const high = fill.some((b) => b >= 4);
  const loudest = lin.indexOf(Math.max(...lin));
  const kind: SfxKind =
    dur < 0.08 ? (loudest >= 5 ? "click" : "pop") : low > 0.6 && attack < 0.06 ? "hit" : build >= 0.7 && build >= 2 * (e - j) * FINE ? "riser" : flat < 0.1 && high ? "ding" : dur >= 0.25 ? "whoosh" : "swipe";
  return { lift: Math.round(rise * 10) / 10, dur: Math.round(dur * 100) / 100, kind, peak: Math.round(j * FINE * 100) / 100 };
}

/**
 * The reference's sound effects, one by one: at every visual event (a card coming on or
 * going, a cutaway, a zoom, a transition), the sound standing out there, against the same
 * measured every 0.6 s all through it: the voice's syllables and the music's beats are
 * what stands out anyway, and an edit cut on the beat has a drum on every cut. A kind of
 * event whose sounds stand out more than that (4 dB, and past how much it varies) has its
 * sounds; each event's own is kept with what it is.
 */
export function hearSfx(y: Float32Array, events: { t: number; on: SfxOn }[], duration: number): { sfx: SoundLook["sfx"]; heard: NonNullable<SoundLook["heard"]> } {
  const f = fineBands(y);
  const usual = usualPeaks(f, duration);
  const probes: number[] = [];
  for (let t = 0.3; t < duration - 0.3; t += 0.6) probes.push(soundAt(f, t, usual)?.lift ?? 0);
  const typical = pct(probes, 0.5);
  const spread = Math.max(0, pct(probes, 0.75) - typical);
  const need = Math.max(4, spread);
  const sfx: SoundLook["sfx"] = [];
  const heard: NonNullable<SoundLook["heard"]> = [];
  for (const on of ["card-in", "card-out", "cut", "broll", "zoom", "transition"] as SfxOn[]) {
    const at = events.filter((e) => e.on === on).map((e) => ({ t: e.t, h: soundAt(f, e.t, usual) }));
    if (at.length < 2) continue;
    const over = (x: (typeof at)[number]) => (x.h?.lift ?? 0) - typical;
    // (Most of them clear, or two alone both well clear.)
    const lift = pct(at.map(over), 0.5);
    if (!(at.length >= 3 ? lift >= need : at.every((x) => over(x) >= 2 * need))) continue;
    const mine = at.filter((x) => x.h && over(x) >= 0.75 * need);
    const kinds = new Map<SfxKind, number>();
    for (const x of mine) kinds.set(x.h!.kind, (kinds.get(x.h!.kind) ?? 0) + 1);
    const kind = [...kinds.entries()].sort((p, q) => q[1] - p[1])[0]?.[0] ?? "whoosh";
    sfx.push({ on, kind, level: Math.round(lift) });
    for (const x of mine) heard.push({ t: Math.round(x.t * 100) / 100, on, kind: x.h!.kind, level: Math.round(over(x)), dur: x.h!.dur });
  }
  heard.sort((p, q) => p.t - q.t);
  return { sfx, heard };
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

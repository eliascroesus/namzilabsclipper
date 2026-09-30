/**
 * Sound effects, made here rather than taken from anyone: a whoosh (noise swept
 * up through a band to the moment and back down, with some body under it), a
 * quicker swipe, a pop, a click, a boom, a riser, a ding and a cash register.
 * Each is a mono buffer at the mix rate with its loudest moment at `peak`
 * seconds in (that's the moment a cue lines up), and its level measured (`rms`
 * over the part that's heard), so every sound sits at the same loudness.
 */
import type { SfxKind } from "./types";

export interface Sfx {
  data: Float32Array;
  /** seconds from the start of the buffer to its loudest moment */
  peak: number;
  /** its loudness: the RMS of the part within 20 dB of its loudest */
  rms: number;
}

/** The sounds made here, with names for the page. */
export const SOUNDS: { id: SfxKind; name: string }[] = [
  { id: "whoosh", name: "Whoosh" },
  { id: "swipe", name: "Swipe" },
  { id: "pop", name: "Pop" },
  { id: "click", name: "Click" },
  { id: "hit", name: "Boom" },
  { id: "riser", name: "Riser" },
  { id: "ding", name: "Ding" },
  { id: "cash", name: "Cash register" },
];

export const isMadeSound = (id: string): id is SfxKind => SOUNDS.some((s) => s.id === id);

function noise(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x = (1664525 * x + 1013904223) >>> 0;
    return x / 2147483648 - 1;
  };
}

/** A two-pole band-pass (state variable filter) over a signal, its centre moving along `hz(t)`. */
function sweep(src: Float32Array, rate: number, hz: (t: number) => number, q = 0.9): Float32Array {
  const out = new Float32Array(src.length);
  let low = 0;
  let band = 0;
  for (let i = 0; i < src.length; i++) {
    const f = 2 * Math.sin((Math.PI * Math.min(hz(i / rate), rate / 4)) / rate);
    const high = src[i] - low - q * band;
    band += f * high;
    low += f * band;
    out[i] = band;
  }
  return out;
}

/** A one-pole low-pass. */
function lowpass(src: Float32Array, rate: number, hz: number): Float32Array {
  const a = Math.exp((-2 * Math.PI * hz) / rate);
  const out = new Float32Array(src.length);
  let y = 0;
  for (let i = 0; i < src.length; i++) out[i] = y = (1 - a) * src[i] + a * y;
  return out;
}

/** Scaled to a peak of `to`, with its loudest moment and loudness found. */
export function finish(a: Float32Array, rate: number, to = 0.7, peakAt?: number): Sfx {
  let m = 0;
  let at = 0;
  for (let i = 0; i < a.length; i++) {
    const v = Math.abs(a[i]);
    if (v > m) {
      m = v;
      at = i;
    }
  }
  if (m > 0) for (let i = 0; i < a.length; i++) a[i] *= to / m;
  // Loudness over 10 ms blocks within 20 dB of the loudest block.
  const block = Math.max(1, Math.round(0.01 * rate));
  const ms: number[] = [];
  for (let i = 0; i < a.length; i += block) {
    let s = 0;
    const n = Math.min(block, a.length - i);
    for (let k = 0; k < n; k++) s += a[i + k] ** 2;
    ms.push(s / n);
  }
  const top = Math.max(...ms, 1e-12);
  const heard = ms.filter((v) => v > top / 100);
  const rms = Math.sqrt(heard.reduce((x, v) => x + v, 0) / Math.max(1, heard.length));
  return { data: a, peak: peakAt ?? at / rate, rms };
}

export function makeSfx(kind: SfxKind, rate = 48000): Sfx {
  const rnd = noise(kind.length * 7919 + kind.charCodeAt(0));
  const white = (len: number) => new Float32Array(len).map(() => rnd());
  if (kind === "whoosh" || kind === "swipe") {
    // Air rushing past: a band of noise sweeping up to the moment and falling back, a low
    // body under it (the part a phone speaker still plays), swelling in and dying away.
    const short = kind === "swipe";
    const len = Math.round((short ? 0.3 : 0.62) * rate);
    const peak = short ? 0.13 : 0.34;
    const [lo, top, end] = short ? [1200, 6500, 2500] : [260, 3200, 900];
    const src = white(len);
    const hz = (t: number) => (t < peak ? lo + (top - lo) * (t / peak) ** 1.6 : top - (top - end) * Math.min(1, (t - peak) / (len / rate - peak)) ** 0.7);
    const band = sweep(sweep(src, rate, hz, 1.1), rate, hz, 1.1);
    const body = lowpass(lowpass(src, rate, short ? 900 : 420), rate, short ? 900 : 420);
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      const env = t < peak ? (t / peak) ** 2.4 : Math.exp(-(t - peak) / (short ? 0.05 : 0.11));
      out[i] = (band[i] + (short ? 0.15 : 0.45) * body[i] * 6) * env;
    }
    return finish(out, rate, 0.75, peak);
  }
  if (kind === "pop") {
    const len = Math.round(0.12 * rate);
    const out = new Float32Array(len);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      ph += (2 * Math.PI * (380 + 900 * Math.exp(-t / 0.012))) / rate;
      out[i] = Math.sin(ph) * Math.exp(-t / 0.03) * Math.min(1, t / 0.002);
    }
    return finish(out, rate, 0.7, 0.004);
  }
  if (kind === "click") {
    const len = Math.round(0.03 * rate);
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) out[i] = rnd() * Math.exp(-i / rate / 0.004);
    return finish(sweep(out, rate, () => 3500, 0.5), rate, 0.5, 0.002);
  }
  if (kind === "hit") {
    // A boom: a low sine falling in pitch, a thump of noise on top.
    const len = Math.round(0.8 * rate);
    const out = new Float32Array(len);
    let ph = 0;
    const thump = lowpass(white(len), rate, 1800);
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      ph += (2 * Math.PI * (46 + 110 * Math.exp(-t / 0.05))) / rate;
      out[i] = Math.sin(ph) * Math.exp(-t / 0.28) * Math.min(1, t / 0.003) + 1.5 * thump[i] * Math.exp(-t / 0.018);
    }
    return finish(out, rate, 0.85, 0.006);
  }
  if (kind === "riser") {
    const len = Math.round(1.2 * rate);
    const src = white(len);
    const out = sweep(src, rate, (t) => 300 + 5000 * (t / 1.2) ** 2, 0.5);
    for (let i = 0; i < len; i++) out[i] *= (i / len) ** 2;
    return finish(out, rate, 0.6, 1.18);
  }
  if (kind === "cash") {
    // Cha-ching: the drawer's rattle, then the bell.
    const len = Math.round(0.9 * rate);
    const out = new Float32Array(len);
    const rattle = sweep(white(len), rate, () => 4200, 0.6);
    const ring = 0.1;
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      let v = rattle[i] * (t < 0.07 ? Math.min(1, t / 0.004) * Math.exp(-t / 0.03) : 0) * 0.8;
      if (t >= ring) {
        const u = t - ring;
        const e = Math.exp(-u / 0.32) * Math.min(1, u / 0.002);
        v += e * (Math.sin(2 * Math.PI * 2093 * u) + 0.8 * Math.sin(2 * Math.PI * 2637 * u) + 0.35 * Math.sin(2 * Math.PI * 5230 * u) * Math.exp(-u / 0.08));
      }
      out[i] = v;
    }
    return finish(out, rate, 0.55, ring + 0.004);
  }
  // A ding: a small bell's partials, the high ones dying first.
  const len = Math.round(1.0 * rate);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / rate;
    out[i] = (Math.sin(2 * Math.PI * 1568 * t) * Math.exp(-t / 0.35) + 0.5 * Math.sin(2 * Math.PI * 4327 * t) * Math.exp(-t / 0.12) + 0.25 * Math.sin(2 * Math.PI * 8466 * t) * Math.exp(-t / 0.05)) * Math.min(1, t / 0.002);
  }
  return finish(out, rate, 0.5, 0.003);
}

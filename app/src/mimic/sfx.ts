/**
 * Sound effects, made here rather than taken from anyone: a whoosh (noise
 * swept up through a band, swelling to the moment and falling away), a pop, a
 * click, a hit (a low thump), a riser and a ding. Each is a mono buffer at the
 * mix rate, peaking at `peak` seconds in (where it lines up with its event).
 */
import type { SfxKind } from "./types";

export interface Sfx {
  data: Float32Array;
  /** seconds from the start of the buffer to its loudest moment */
  peak: number;
}

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

function normalise(a: Float32Array, to = 0.7): Float32Array {
  let m = 0;
  for (const v of a) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < a.length; i++) a[i] *= to / m;
  return a;
}

export function makeSfx(kind: SfxKind, rate = 48000): Sfx {
  const rnd = noise(kind.length * 7919);
  if (kind === "whoosh") {
    const len = Math.round(0.55 * rate);
    const peak = 0.3;
    const src = new Float32Array(len).map(() => rnd());
    const out = sweep(src, rate, (t) => 400 + 3600 * Math.min(1, t / peak) ** 1.5, 0.7);
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      out[i] *= t < peak ? (t / peak) ** 2 : Math.exp(-(t - peak) / 0.07);
    }
    return { data: normalise(out), peak };
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
    return { data: normalise(out), peak: 0.004 };
  }
  if (kind === "click") {
    const len = Math.round(0.03 * rate);
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) out[i] = rnd() * Math.exp(-i / rate / 0.004);
    return { data: normalise(sweep(out, rate, () => 3500, 0.5), 0.5), peak: 0.002 };
  }
  if (kind === "hit") {
    const len = Math.round(0.5 * rate);
    const out = new Float32Array(len);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      ph += (2 * Math.PI * (48 + 90 * Math.exp(-t / 0.04))) / rate;
      out[i] = Math.sin(ph) * Math.exp(-t / 0.16) + 0.3 * rnd() * Math.exp(-t / 0.01);
    }
    return { data: normalise(out, 0.8), peak: 0.005 };
  }
  if (kind === "riser") {
    const len = Math.round(1.2 * rate);
    const src = new Float32Array(len).map(() => rnd());
    const out = sweep(src, rate, (t) => 300 + 5000 * (t / 1.2) ** 2, 0.5);
    for (let i = 0; i < len; i++) out[i] *= (i / len) ** 2;
    return { data: normalise(out, 0.6), peak: 1.18 };
  }
  // ding
  const len = Math.round(0.9 * rate);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / rate;
    out[i] = (Math.sin(2 * Math.PI * 1760 * t) + 0.4 * Math.sin(2 * Math.PI * 3520 * t) + 0.2 * Math.sin(2 * Math.PI * 5280 * t)) * Math.exp(-t / 0.25) * Math.min(1, t / 0.003);
  }
  return { data: normalise(out, 0.5), peak: 0.003 };
}

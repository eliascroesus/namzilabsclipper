import { describe, expect, it } from "vitest";
import { Resampler, resample } from "../src/engine/audio/resample";

function tone(rate: number, hz: number, seconds: number): Float32Array {
  const y = new Float32Array(Math.round(rate * seconds));
  for (let i = 0; i < y.length; i++) y[i] = Math.sin((2 * Math.PI * hz * i) / rate);
  return y;
}

describe("resampler", () => {
  it("keeps a tone below the new Nyquist and its timing", () => {
    const y = resample(tone(48000, 1000, 1), 48000, 22050);
    expect(y.length).toBe(22050);
    let err = 0;
    for (let i = 200; i < y.length - 200; i++) err = Math.max(err, Math.abs(y[i] - Math.sin((2 * Math.PI * 1000 * i) / 22050)));
    expect(err).toBeLessThan(2e-3);
  });

  it("removes what the new rate can't hold", () => {
    const y = resample(tone(48000, 15000, 1), 48000, 22050);
    let peak = 0;
    for (let i = 200; i < y.length - 200; i++) peak = Math.max(peak, Math.abs(y[i]));
    expect(peak).toBeLessThan(0.01);
  });

  it("streams in chunks with the same result as one call", () => {
    const x = tone(44100, 440, 2.3);
    const whole = resample(x, 44100, 22050);
    const r = new Resampler(44100, 22050);
    const parts: Float32Array[] = [];
    for (let i = 0; i < x.length; i += 1234) parts.push(r.write(x.subarray(i, i + 1234)));
    parts.push(r.end());
    const joined = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
    let o = 0;
    for (const p of parts) {
      joined.set(p, o);
      o += p.length;
    }
    expect(joined.length).toBe(whole.length);
    let diff = 0;
    for (let i = 0; i < whole.length; i++) diff = Math.max(diff, Math.abs(whole[i] - joined[i]));
    expect(diff).toBeLessThan(1e-6);
  });
});

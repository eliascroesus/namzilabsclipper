import { describe, expect, it } from "vitest";
import { integratedLoudness, limit } from "../src/engine/render/mix";

describe("loudness and limiting", () => {
  it("measures a 1 kHz sine at -20 dBFS near -20 LUFS per channel pair", () => {
    // BS.1770: a 0 dBFS 1 kHz sine in one channel reads about -3.01 LUFS.
    const n = 48000 * 3;
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = Math.sin((2 * Math.PI * 1000 * i) / 48000);
    const l = integratedLoudness([a]);
    expect(l).toBeGreaterThan(-3.3);
    expect(l).toBeLessThan(-2.7);
  });

  it("limits peaks without touching quiet parts", () => {
    const n = 48000;
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = (i > 20000 && i < 20100 ? 1.8 : 0.3) * Math.sin(i * 0.05);
    const b = a.slice();
    limit([b], 0.9);
    let peak = 0;
    for (const v of b) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeLessThanOrEqual(0.9 + 1e-6);
    expect(Math.abs(b[5000] - a[5000])).toBeLessThan(1e-6);
    expect(Math.abs(b[40000] - a[40000])).toBeLessThan(1e-3);
  });
});

import { describe, expect, it } from "vitest";
import { hearSfx, soundAt, fineBands, usualPeaks } from "../src/mimic/analyze/sound";
import { makeSfx } from "../src/mimic/sfx";
import { mulberry32 } from "../src/engine/plan/montage";
import type { SfxKind, SfxOn } from "../src/mimic/types";

const RATE = 16000;

/** Thirty seconds of a voice-like hum (syllables of a few harmonics, coming and going) over faint noise. */
function talk(seconds: number, seed = 3): Float32Array {
  const rand = mulberry32(seed);
  const y = new Float32Array(seconds * RATE);
  let f0 = 140;
  for (let i = 0; i < y.length; i++) {
    const t = i / RATE;
    if (i % 2400 === 0) f0 = 110 + rand() * 90;
    const syl = Math.max(0, Math.sin(2 * Math.PI * 3.3 * t)) ** 2;
    let v = 0;
    for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * f0 * h * t) / h;
    y[i] = 0.08 * syl * v + 0.002 * (rand() - 0.5);
  }
  return y;
}

/** A sound made as the page makes it (48 kHz), heard as the study hears it (16 kHz), its loudest moment at t. */
function put(y: Float32Array, kind: SfxKind, t: number, gain = 1) {
  const fx = makeSfx(kind, 48000);
  const n = Math.floor(fx.data.length / 3);
  const at = Math.round((t - fx.peak) * RATE);
  const g = (0.05 / Math.max(1e-6, fx.rms)) * gain;
  for (let i = 0; i < n; i++) {
    const v = (fx.data[3 * i] + fx.data[3 * i + 1] + fx.data[3 * i + 2]) / 3;
    if (at + i >= 0 && at + i < y.length) y[at + i] += v * g;
  }
}

describe("the reference's sound effects, one by one", () => {
  it("hears a whoosh on its transitions and a boom on its zooms, and nothing on cards that have none", () => {
    const y = talk(30);
    const events: { t: number; on: SfxOn }[] = [];
    for (const t of [2.1, 6.4, 11.2, 15.9, 21.3, 26.7]) {
      put(y, "whoosh", t);
      events.push({ t, on: "transition" });
    }
    for (const t of [4.2, 9.8, 18.4, 24.1]) {
      put(y, "hit", t, 1.4);
      events.push({ t, on: "zoom" });
    }
    for (const t of [3.3, 8.1, 13.6, 20.2, 27.9]) events.push({ t, on: "card-in" });
    const { sfx, heard } = hearSfx(y, events, 30);
    expect(sfx.find((x) => x.on === "transition")?.kind).toBe("whoosh");
    expect(sfx.find((x) => x.on === "zoom")?.kind).toBe("hit");
    expect(sfx.some((x) => x.on === "card-in")).toBe(false);
    // Each one where it is.
    expect(heard.filter((h) => h.on === "transition").length).toBeGreaterThanOrEqual(5);
    expect(heard.filter((h) => h.on === "zoom").length).toBeGreaterThanOrEqual(3);
  });

  it("tells a click, a swipe and a riser by their shape", () => {
    for (const kind of ["click", "swipe", "riser", "ding"] as SfxKind[]) {
      const y = talk(6, 5);
      put(y, kind, 3, 1.2);
      const f = fineBands(y);
      const h = soundAt(f, 3, usualPeaks(f, 6));
      expect(h, kind).not.toBeNull();
      expect(h!.kind, `${kind}: heard ${JSON.stringify(h)}`).toBe(kind === "click" ? "click" : kind);
    }
  });
});

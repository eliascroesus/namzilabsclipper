import { describe, expect, it } from "vitest";
import { beatShift, hitStart } from "../src/engine/audio/attacks";
import { mulberry32 } from "../src/engine/plan/montage";

const SR = 22050;

/** A clap (a burst of noise), a kick (a click over a falling sine) or a bell (a pure tone), starting at t, over a quiet bed of noise. */
function hits(seconds: number, parts: { t: number; kind: "clap" | "kick" | "bell"; amp?: number }[], seed = 1): Float32Array {
  const rand = mulberry32(seed);
  const y = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < y.length; i++) y[i] = 0.004 * (rand() * 2 - 1);
  for (const p of parts) {
    const s0 = Math.round(p.t * SR);
    for (let i = 0; i < 6000 && s0 + i < y.length; i++) {
      const t = i / SR;
      const attack = Math.min(1, i / 40);
      let v = 0;
      if (p.kind === "clap") v = 0.5 * Math.exp(-i / 900) * (rand() * 2 - 1);
      else if (p.kind === "kick") v = 0.9 * Math.exp(-i / 2500) * Math.sin(2 * Math.PI * (50 + 100 * Math.exp(-i / 400)) * t) + (i < 60 ? 0.3 * (rand() * 2 - 1) : 0);
      else v = 0.3 * Math.exp(-i / 4000) * (Math.sin(2 * Math.PI * 1480 * t) + 0.5 * Math.sin(2 * Math.PI * 2960 * t));
      y[s0 + i] += (p.amp ?? 1) * attack * v;
    }
  }
  return y;
}

describe("where the hits start", () => {
  it("traces a clap, a kick and a bell back to where each starts", () => {
    const y = hits(3, [
      { t: 0.5, kind: "clap" },
      { t: 1.3, kind: "kick" },
      { t: 2.1, kind: "bell" },
    ]);
    for (const t of [0.5, 1.3, 2.1]) {
      // Looked for as the analysis does: up to 120 ms before where the envelope reads it.
      const hit = hitStart(y, SR, t + 0.05 - 0.12, t + 0.05 + 0.04);
      expect(hit).not.toBeNull();
      expect(Math.abs(hit!.t - t)).toBeLessThan(0.006);
    }
    // Nothing there: nothing found.
    expect(hitStart(y, SR, 2.6, 2.8)).toBeNull();
  });

  it("moves beats read late onto the hits: from the beats when they carry the hits, through every onset when they don't", () => {
    const T = 60 / 134;
    const late = 0.045;
    const rand = mulberry32(3);
    const jitter = () => 0.01 * (rand() - 0.5);
    // A clap on every beat: measured on the beats themselves.
    const truth = Array.from({ length: 40 }, (_, k) => 0.3 + k * T);
    const onBeat = hits(20, truth.map((t) => ({ t, kind: "clap" as const })));
    const heard = truth.map((t) => t + late);
    expect(beatShift(onBeat, SR, heard, heard.map((t) => t + jitter()))).toBeCloseTo(-late, 2);
    // A broken beat: a kick on the bar line, then kicks and claps between the beats (on
    // the "a" of 1, the "and" of 2 and 3, the "e" of 4), and nothing on beats 2, 3 and 4.
    const steps = [0, 3, 6, 10, 13];
    const parts: { t: number; kind: "clap" | "kick" }[] = [];
    for (let bar = 0; bar < 10; bar++) for (const [k, s] of steps.entries()) parts.push({ t: 0.3 + (bar * 16 + s) * (T / 4), kind: k % 2 ? "clap" : "kick" });
    const broken = hits(20, parts);
    const onsets = parts.map((p) => p.t + late + jitter());
    expect(beatShift(broken, SR, heard, onsets)).toBeCloseTo(-late, 2);
    // Nothing to go on: about how late the envelope reads a drum machine.
    expect(beatShift(hits(20, []), SR, heard, [])).toBeCloseTo(-0.03, 3);
  });
});

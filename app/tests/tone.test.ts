import { describe, expect, it } from "vitest";
import { balance, lookOf } from "../src/engine/render/tone";

/** RGBA pixels: `n` of each colour given, opaque. */
function pixels(colours: [number, number, number, number][]): Uint8Array {
  const out: number[] = [];
  for (const [r, g, b, n] of colours) for (let i = 0; i < n; i++) out.push(r, g, b, 255);
  return Uint8Array.from(out);
}

describe("each shot balanced on its own", () => {
  it("measures a picture as it shows, leaving out what's around a card", () => {
    const px = pixels([
      [40, 40, 40, 10],
      [128, 128, 128, 980],
      [250, 250, 250, 10],
    ]);
    const card = Uint8Array.from([...px, ...Array(4000).fill(0)]);
    for (const p of [px, card]) {
      const look = lookOf(p)!;
      expect(look.lo).toBeCloseTo(40 / 255, 2);
      expect(look.hi).toBeCloseTo(250 / 255, 2);
      expect(look.mean).toBeCloseTo((0.01 * 40 + 0.98 * 128 + 0.01 * 250) / 255, 2);
      expect(look.sat).toBe(0);
    }
    expect(lookOf(new Uint8Array(40))).toBeNull();
  });

  it("flat phone footage: the lift taken out, darker, and more colour", () => {
    // (A user's edit: the darkest of the picture at 0.3, bright, thin colour.)
    const [lo, hi, gamma, sat] = balance({ lo: 0.3, hi: 0.92, mean: 0.6, sat: 0.12 })!;
    expect(lo).toBe(0.2);
    expect(hi).toBeCloseTo(0.92, 2);
    expect(gamma).toBeGreaterThan(1.2);
    expect(sat).toBeGreaterThan(1.3);
  });

  it("footage that's already graded (the references'), barely touched", () => {
    const [lo, hi, gamma, sat] = balance({ lo: 0.005, hi: 0.95, mean: 0.33, sat: 0.36 })!;
    expect(lo).toBeLessThan(0.01);
    expect(hi).toBeCloseTo(0.95, 2);
    expect(Math.abs(gamma - 1)).toBeLessThan(0.15);
    expect(Math.abs(sat - 1)).toBeLessThan(0.1);
  });

  it("a hazy shot's whites stretched a little at most, and a black frame left alone", () => {
    expect(balance({ lo: 0.05, hi: 0.7, mean: 0.5, sat: 0.3 })![1]).toBe(0.85);
    expect(balance({ lo: 0, hi: 0.04, mean: 0.01, sat: 0 })).toBeUndefined();
  });
});

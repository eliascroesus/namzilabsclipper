import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { scaleBetween, zoomEvents, zoomLook } from "../src/mimic/analyze/zoom";

const W = 90;
const H = 160;

/** A room seen through a camera that can zoom: `z` times bigger about the middle, shifted (dx, dy). */
function view(z: number, dx = 0, dy = 0): Uint8Array {
  const g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const u = (x - W / 2 - dx) / z;
      const v = (y - H / 2 - dy) / z;
      g[y * W + x] = 120 + 50 * Math.sin(u / 5) * Math.cos(v / 7) + 30 * Math.sin((u + 2 * v) / 11) + (Math.abs(u - 10) < 1.5 ? 60 : 0);
    }
  return g;
}

describe("the zoom between two frames", () => {
  it("reads a punch-in, a pull-out, and no zoom", () => {
    const a = { data: view(1), width: W, height: H };
    expect(scaleBetween(a, { data: view(1.03), width: W, height: H }).s).toBeCloseTo(1.03, 2);
    expect(scaleBetween(a, { data: view(0.97, 1, 0), width: W, height: H }).s).toBeCloseTo(0.97, 2);
    expect(scaleBetween(a, { data: view(1), width: W, height: H }).s).toBe(1);
  });

  it("turns a run of growing frames into one zoom, with its size and length", () => {
    const fps = 30;
    const scales = [1, 1, 1.02, 1.022, 1.02, 1.021, 1.02, 1, 1, 0.94, 1, 1];
    const times = scales.map((_, i) => i / fps);
    const ev = zoomEvents(times, scales, fps);
    expect(ev).toHaveLength(2);
    expect(ev[0].frames).toBe(5);
    expect(ev[0].total).toBeCloseTo(1.02 * 1.022 * 1.02 * 1.021 * 1.02, 4);
    expect(ev[1].frames).toBe(1);
    const look = zoomLook(ev, fps, [[0, 1]])!;
    expect(look.changes.map((c) => c.dur)).toEqual([0.167, 0]);
    expect(look.close).toBeCloseTo(ev[0].total, 2);
  });
});

// The reference ad (gray, 180 × 320), when it's on this machine.
const GRAY = resolve(import.meta.dirname, "fixtures/ad-gray.u8");
describe.skipIf(!existsSync(GRAY))("the reference ad's zooms", () => {
  it("are punch-ins and pull-outs of about 15% over a fifth of a second", () => {
    const buf = new Uint8Array(readFileSync(GRAY));
    const half = (i: number) => {
      const g = new Uint8Array(W * H);
      const o = i * 180 * 320;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = (buf[o + 2 * y * 180 + 2 * x] + buf[o + 2 * y * 180 + 2 * x + 1] + buf[o + (2 * y + 1) * 180 + 2 * x] + buf[o + (2 * y + 1) * 180 + 2 * x + 1]) / 4;
      return { data: g, width: W, height: H };
    };
    // 14 to 18 s: in at 14.7 (+14% over 7 frames), out at 17.03 (-15% over 6), from the reference tool.
    const times: number[] = [];
    const scales: number[] = [];
    let prev = half(Math.round(14 * 30));
    for (let i = Math.round(14 * 30) + 1; i <= Math.round(18 * 30); i++) {
      const cur = half(i);
      times.push(i / 30);
      scales.push(scaleBetween(prev, cur).s);
      prev = cur;
    }
    const ev = zoomEvents(times, scales, 30);
    const inn = ev.find((e) => e.start > 14.5 && e.start < 14.9)!;
    const out = ev.find((e) => e.start > 16.9 && e.start < 17.2)!;
    expect(inn.total).toBeGreaterThan(1.1);
    expect(inn.total).toBeLessThan(1.18);
    expect(inn.frames).toBeGreaterThanOrEqual(5);
    expect(out.total).toBeLessThan(0.9);
    expect(out.total).toBeGreaterThan(0.83);
    expect(ev.filter((e) => Math.abs(e.total - 1) > 0.05)).toHaveLength(2);
  });
});

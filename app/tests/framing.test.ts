import { describe, expect, it } from "vitest";
import { PROFILE_BINS, type Scan } from "../src/engine/media/scan";
import { activeRect, centreAt, faceTracks, frameShot, windowSize, type FaceSample } from "../src/engine/plan/framing";
import { decodeFaces } from "../src/engine/vision/faces";

/** A 1920 × 1080 clip, sampled 6 times a second, with black bars if asked. */
function clip(duration: number, bars: [number, number, number, number] = [0, 0, 0, 0], w = 1920, h = 1080): Scan {
  const n = Math.round(duration * 6);
  const f = (k: number) => new Float32Array(k);
  const stats = { t: f(n), luma: f(n), contrast: f(n), sharp: f(n), color: f(n), skin: f(n), motion: f(n), hist: f(n * 64), cols: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rows: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rgb: f(n * 3), bars: f(n * 4) };
  for (let i = 0; i < n; i++) {
    stats.t[i] = (i + 0.5) / 6;
    stats.bars.set(bars, i * 4);
  }
  return { id: "c", kind: "video", start: 0, duration, width: w, height: h, rate: 6, stats, cuts: [] };
}

/** A face moving along a path, looked for 8 times a second over [a, b]. */
function faces(a: number, b: number, at: (t: number) => { x: number; y: number; w?: number }): FaceSample[] {
  const out: FaceSample[] = [];
  for (let t = a + 1 / 16; t < b; t += 1 / 8) {
    const p = at(t);
    out.push({ t, faces: [{ x: p.x, y: p.y, w: p.w ?? 0.06, h: (p.w ?? 0.06) * 1.8, score: 0.9 }] });
  }
  return out;
}

describe("black bars", () => {
  it("finds a letterbox and a pillarbox, and ignores uneven dark edges", () => {
    const box = activeRect(clip(4, [0.12, 0.12, 0, 0]), 0, 4);
    [0, 0.128, 1, 0.872].forEach((v, i) => expect(box[i]).toBeCloseTo(v, 5));
    const pillar = activeRect(clip(4, [0, 0, 0.34, 0.34]), 0, 4);
    expect(pillar[0]).toBeCloseTo(0.348, 3);
    expect(pillar[2]).toBeCloseTo(0.652, 3);
    // A dark sky at the top only is not a bar.
    expect(activeRect(clip(4, [0.2, 0, 0, 0]), 0, 4)).toEqual([0, 0, 1, 1]);
  });

  it("crops inside the picture: a phone video in a YouTube frame fills a 9:16 frame", () => {
    const crop = frameShot({ scan: clip(4, [0, 0, 0.34, 0.34]), a: 0, b: 4, aspect: "9x16" });
    expect(crop.rect).toBeDefined();
    expect(crop.fit).toBe("cover");
  });
});

describe("following a face", () => {
  const scan = clip(10);
  const [fx] = windowSize(16 / 9, 9 / 16);

  it("holds still on a talking head that sways", () => {
    const crop = frameShot({ scan, a: 0, b: 6, aspect: "9x16", faces: faces(0, 6, (t) => ({ x: 0.7 + 0.01 * Math.sin(t * 3), y: 0.4 })) });
    expect(crop.path).toBeUndefined();
    expect(crop.cx).toBeGreaterThan(0.64);
    expect(crop.cx).toBeLessThan(0.76);
  });

  it("follows someone walking across, smoothly, never losing the face", () => {
    const walk = (t: number) => ({ x: 0.15 + (0.7 * t) / 8, y: 0.45 });
    const crop = frameShot({ scan, a: 0, b: 8, aspect: "9x16", faces: faces(0, 8, walk) });
    expect(crop.path).toBeDefined();
    let fastest = 0;
    for (let t = 0; t <= 8; t += 1 / 30) {
      const [cx] = centreAt(crop, t, 8);
      const face = walk(t);
      // The face is inside the window.
      expect(Math.abs(face.x - cx)).toBeLessThan(fx / 2);
      if (t > 0) fastest = Math.max(fastest, Math.abs(cx - centreAt(crop, t - 1 / 30, 8)[0]) * 30);
    }
    // No faster than about a window's width a second.
    expect(fastest).toBeLessThan(fx * 1.1);
  });

  it("keeps two people in when they fit, the main one when they don't", () => {
    const two: FaceSample[] = faces(0, 4, () => ({ x: 0.45, y: 0.4 })).map((s) => ({ t: s.t, faces: [...s.faces, { x: 0.58, y: 0.42, w: 0.055, h: 0.1, score: 0.9 }] }));
    const both = frameShot({ scan, a: 0, b: 4, aspect: "9x16", faces: two });
    expect(both.cx).toBeGreaterThan(0.48);
    expect(both.cx).toBeLessThan(0.56);
    const apart: FaceSample[] = faces(0, 4, () => ({ x: 0.2, y: 0.4, w: 0.08 })).map((s) => ({ t: s.t, faces: [...s.faces, { x: 0.85, y: 0.4, w: 0.04, h: 0.07, score: 0.9 }] }));
    const main = frameShot({ scan, a: 0, b: 4, aspect: "9x16", faces: apart });
    expect(Math.abs(main.cx - 0.2)).toBeLessThan(fx / 2);
  });

  it("puts the eyes above the middle when the window can move up and down", () => {
    const portrait = clip(4, [0, 0, 0, 0], 1080, 1920);
    const crop = frameShot({ scan: portrait, a: 0, b: 4, aspect: "1x1", faces: faces(0, 4, () => ({ x: 0.5, y: 0.3, w: 0.08 })) });
    // The window sits a little below the face, so the face is in the upper part of the frame.
    const [, fy] = windowSize(1080 / 1920, 1);
    const place = (0.3 - (crop.cy - fy / 2)) / fy;
    expect(place).toBeGreaterThan(0.3);
    expect(place).toBeLessThan(0.45);
  });

  it("ignores a face seen in a single frame", () => {
    const blip: FaceSample[] = faces(0, 4, () => ({ x: 0.5, y: 0.5 })).map((s, i) => (i === 3 ? s : { t: s.t, faces: [] }));
    expect(faceTracks(blip, [0, 0, 1, 1])).toBeNull();
  });
});

describe("YuNet output", () => {
  it("decodes a face from the stride-8 grid, and keeps one box of overlapping ones", () => {
    const pw = 64;
    const ph = 32;
    const outputs: Record<string, { data: Float32Array }> = {};
    for (const s of [8, 16, 32]) {
      const cells = (pw / s) * (ph / s);
      outputs[`cls_${s}`] = { data: new Float32Array(cells) };
      outputs[`obj_${s}`] = { data: new Float32Array(cells) };
      outputs[`bbox_${s}`] = { data: new Float32Array(cells * 4) };
      outputs[`kps_${s}`] = { data: new Float32Array(cells * 10) };
    }
    // A face centred at column 3, row 2 of the stride-8 grid (x = 28, y = 20), 16 × 16.
    const idx = 2 * (pw / 8) + 3;
    outputs.cls_8.data[idx] = 0.9;
    outputs.obj_8.data[idx] = 0.9;
    outputs.bbox_8.data.set([0.5, 0.5, Math.log(2), Math.log(2)], idx * 4);
    // A weaker duplicate next to it.
    outputs.cls_8.data[idx + 1] = 0.7;
    outputs.obj_8.data[idx + 1] = 0.7;
    outputs.bbox_8.data.set([-0.3, 0.5, Math.log(2), Math.log(2)], (idx + 1) * 4);
    const found = decodeFaces(outputs, pw, ph, 60, 30);
    expect(found).toHaveLength(1);
    expect(found[0].x).toBeCloseTo(28 / 60, 5);
    expect(found[0].y).toBeCloseTo(20 / 30, 5);
    expect(found[0].w).toBeCloseTo(16 / 60, 5);
    expect(found[0].score).toBeCloseTo(0.9, 5);
  });
});

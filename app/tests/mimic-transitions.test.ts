import { describe, expect, it } from "vitest";
import type { Gray } from "../src/mimic/analyze/cards";
import { findCuts } from "../src/mimic/analyze/shots";
import { findTransitions } from "../src/mimic/analyze/transitions";
import { mulberry32 } from "../src/engine/plan/montage";

const W = 80;
const H = 142;
const FPS = 30;

/** A picture: soft blobs, stripes and a few blocks, like a photo seen small. */
function picture(seed: number, w = W, h = H): Float32Array {
  const rand = mulberry32(seed);
  const out = new Float32Array(w * h);
  const blobs = Array.from({ length: 9 }, () => ({ x: rand() * w, y: rand() * h, r: 6 + rand() * 22, v: 40 + rand() * 180 }));
  const fx = 0.05 + rand() * 0.2;
  const fy = 0.05 + rand() * 0.2;
  const ph = rand() * 6;
  const rects = Array.from({ length: 4 }, () => ({ x: rand() * w, y: rand() * h, w: 5 + rand() * 20, h: 5 + rand() * 30, v: rand() * 255 }));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 90 + 30 * Math.sin(fx * x + fy * y + ph);
      for (const b of blobs) v += (b.v - 110) * Math.exp(-((x - b.x) ** 2 + (y - b.y) ** 2) / (2 * b.r * b.r));
      for (const r of rects) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) v = 0.4 * v + 0.6 * r.v;
      out[y * w + x] = Math.max(0, Math.min(255, v));
    }
  return out;
}

const frame = (data: Float32Array, w = W, h = H): Gray => ({ data, width: w, height: h });

/** A little compression noise, so no two frames are exactly alike. */
function noisy(p: Float32Array, rand: () => number): Gray {
  const d = new Float32Array(p.length);
  for (let i = 0; i < p.length; i++) d[i] = Math.max(0, Math.min(255, p[i] + (rand() - 0.5) * 4));
  return frame(d);
}

const at = (p: Float32Array, x: number, y: number, w = W, h = H) => p[Math.max(0, Math.min(h - 1, Math.round(y))) * w + Math.max(0, Math.min(w - 1, Math.round(x)))];

/** The picture scaled about its middle (s > 1: closer). */
function scaled(p: Float32Array, s: number): Float32Array {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] = at(p, (W - 1) / 2 + (x - (W - 1) / 2) / s, (H - 1) / 2 + (y - (H - 1) / 2) / s);
  return out;
}

/** Blurred along x by a box `r` pixels wide (a smear), or both ways. */
function blurred(p: Float32Array, r: number, both = false): Float32Array {
  let cur = p;
  for (const axis of both ? ["x", "y"] : ["x"]) {
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let s = 0;
        let n = 0;
        for (let k = -r; k <= r; k++) {
          s += axis === "x" ? at(cur, x + k, y) : at(cur, x, y + k);
          n++;
        }
        out[y * W + x] = s / n;
      }
    cur = out;
  }
  return cur;
}

/** A and B side by side, d pixels of a push (or slide) toward the left done. */
function side(a: Float32Array, b: Float32Array, d: number, mode: "push" | "in"): Float32Array {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // travelling left: the next picture enters from the right edge
      if (x < W - d) out[y * W + x] = mode === "push" ? at(a, x + d, y) : at(a, x, y);
      else out[y * W + x] = at(b, x - (W - d), y);
    }
  return out;
}

/** Twelve frames of A, the transition's frames, twelve of B; and where the cut finder puts the cuts. */
function clip(mid: Float32Array[], a: Float32Array, b: Float32Array, seed = 7) {
  const rand = mulberry32(seed);
  const raw = [...Array(14).fill(a), ...mid, ...Array(14).fill(b)];
  const frames = raw.map((p) => noisy(p, rand));
  const times = frames.map((_, i) => i / FPS);
  return { frames, times, cuts: findCuts(frames, times) };
}

const A = picture(1);
const B = picture(2);

function only(c: ReturnType<typeof clip>) {
  const found = findTransitions(c.frames, c.times, c.cuts, { fps: FPS });
  return found;
}

describe("the reference's transitions", () => {
  it("a hard cut is a cut", () => {
    const found = only(clip([], A, B));
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("cut");
    expect(found[0].t).toBeCloseTo(14 / FPS, 3);
  });

  it("a crossfade, its length and its middle", () => {
    for (const k of [3, 6]) {
      const mid = Array.from({ length: k }, (_, j) => A.map((v, i) => v + ((j + 1) / (k + 1)) * (B[i] - v)));
      const found = only(clip(mid, A, B));
      expect(found, `${k} frames`).toHaveLength(1);
      expect(found[0].kind).toBe("dissolve");
      expect(Math.round(found[0].dur * FPS)).toBeGreaterThanOrEqual(k);
      expect(Math.round(found[0].dur * FPS)).toBeLessThanOrEqual(k + 2);
      expect(found[0].t).toBeGreaterThan(13 / FPS);
      expect(found[0].t).toBeLessThan((14 + k + 1) / FPS);
    }
  });

  it("a dip to black and a flash of white", () => {
    const dark = Array.from({ length: 4 }, (_, j) => A.map((v) => v * (1 - (j + 1) / 4)));
    const back = Array.from({ length: 4 }, (_, j) => B.map((v) => v * ((j + 1) / 5)));
    const dip = only(clip([...dark, ...back], A, B));
    expect(dip).toHaveLength(1);
    expect(dip[0].kind).toBe("dip");
    expect(dip[0].color).toBe("black");
    const white = new Float32Array(W * H).fill(250);
    const flash = only(clip([white, B.map((v) => v + 0.6 * (255 - v))], A, B));
    expect(flash).toHaveLength(1);
    expect(flash[0].kind).toBe("flash");
    expect(flash[0].color).toBe("white");
  });

  it("a push and a slide, which way and how fast", () => {
    const k = 6;
    const ds = Array.from({ length: k }, (_, j) => Math.round(((j + 1) / (k + 1)) * W));
    const push = only(clip(ds.map((d) => side(A, B, d, "push")), A, B));
    expect(push).toHaveLength(1);
    expect(push[0].kind).toBe("push");
    expect(push[0].dir).toBe("left");
    const slide = only(clip(ds.map((d) => side(A, B, d, "in")), A, B));
    expect(slide).toHaveLength(1);
    expect(slide[0].kind).toBe("slide");
    expect(slide[0].dir).toBe("left");
    expect(slide[0].over).toBe("in");
    // Eased: quick at first, settling (the way CapCut's slides land).
    const eased = Array.from({ length: k }, (_, j) => Math.round((1 - (1 - (j + 1) / (k + 1)) ** 3) * W));
    const out = only(clip(eased.map((d) => side(A, B, d, "in")), A, B));
    expect(out[0].kind).toBe("slide");
    expect(out[0].ease).toBe("out");
  });

  it("a whip: the pictures thrown sideways, smeared, the cut in the middle", () => {
    // A thrown left in three smeared frames, then B arriving from the right in three.
    const shift = (p: Float32Array, dx: number) => {
      const out = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] = at(p, x + dx, y);
      return out;
    };
    const mid = [blurred(shift(A, 8), 6), blurred(shift(A, 20), 10), blurred(shift(A, 34), 12), blurred(shift(B, -34), 12), blurred(shift(B, -20), 10), blurred(shift(B, -8), 6)];
    const found = only(clip(mid, A, B));
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("whip");
    expect(found[0].dir).toBe("left");
  });

  it("a zoom through the cut, and a blur", () => {
    const zin = [scaled(A, 1.12), scaled(A, 1.3), scaled(A, 1.55), scaled(B, 1.55), scaled(B, 1.3), scaled(B, 1.12)];
    const zoom = only(clip(zin, A, B));
    expect(zoom).toHaveLength(1);
    expect(zoom[0].kind).toBe("zoom");
    expect(zoom[0].dir).toBe("in");
    const blur = only(clip([blurred(A, 3, true), blurred(A, 7, true), blurred(B, 7, true), blurred(B, 3, true)], A, B));
    expect(blur).toHaveLength(1);
    expect(blur[0].kind).toBe("blur");
  });

  it("a glitch: rows torn sideways on the cut", () => {
    const torn = (p: Float32Array, seed: number) => {
      const rand = mulberry32(seed);
      const out = new Float32Array(W * H);
      for (let y = 0; y < H; y++) {
        const band = Math.floor(y / 9);
        const dx = band % 2 ? Math.round((rand() - 0.5) * 50) : 0;
        for (let x = 0; x < W; x++) out[y * W + x] = band % 3 === 1 ? 255 - at(p, x + dx, y) : at(p, x + dx, y);
      }
      return out;
    };
    const found = only(clip([torn(A, 3), torn(B, 4)], A, B));
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("glitch");
  });

  it("the camera's own pan or zoom inside a shot is no transition", () => {
    // A wide picture panned across, 3 pixels a frame, for a second; then held.
    const wide = picture(5, W * 2, H);
    const pan = Array.from({ length: 30 }, (_, j) => {
      const out = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] = wide[y * W * 2 + Math.min(W * 2 - 1, x + 3 * j)];
      return out;
    });
    const rand = mulberry32(3);
    const frames = pan.map((p) => noisy(p, rand));
    const times = frames.map((_, i) => i / FPS);
    expect(findTransitions(frames, times, findCuts(frames, times), { fps: FPS })).toEqual([]);
    // A slow push in, 1.2% a frame for two thirds of a second.
    const push = Array.from({ length: 36 }, (_, j) => scaled(A, 1 + 0.012 * Math.min(20, j)));
    const pf = push.map((p) => noisy(p, rand));
    const pt = pf.map((_, i) => i / FPS);
    expect(findTransitions(pf, pt, findCuts(pf, pt), { fps: FPS })).toEqual([]);
  });

  it("several in a row, each its own", () => {
    const C = picture(3);
    const fade = Array.from({ length: 4 }, (_, j) => A.map((v, i) => v + ((j + 1) / 5) * (B[i] - v)));
    const rand = mulberry32(9);
    const raw = [...Array(14).fill(A), ...fade, ...Array(14).fill(B), ...Array(14).fill(C)];
    const frames = raw.map((p) => noisy(p, rand));
    const times = frames.map((_, i) => i / FPS);
    const found = findTransitions(frames, times, findCuts(frames, times), { fps: FPS });
    expect(found.map((f) => f.kind)).toEqual(["dissolve", "cut"]);
  });
});

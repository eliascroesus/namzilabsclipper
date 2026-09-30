import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CardFinder, findRects } from "../src/mimic/analyze/cards";

const W = 180;
const H = 320;

/** A room: soft gradient and blotches, no long straight edges. */
function room(seed: number): Uint8Array {
  const g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) g[y * W + x] = 90 + 40 * Math.sin(x / 23 + seed) * Math.cos(y / 31) + 20 * Math.sin((x + y) / 7 + seed * 3);
  return g;
}

/** Paint a card: a picture (soft light and shade, like a photo) with its left edge at `x`. */
function card(g: Uint8Array, x: number, y: number, w: number, h: number, tone: number, pattern: number) {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = Math.max(0, Math.round(x)); xx < Math.min(W, Math.round(x) + w); xx++) {
      const u = xx - Math.round(x);
      const v = yy - y;
      g[yy * W + xx] = Math.max(0, Math.min(255, tone + 45 * Math.sin(u / 9 + pattern) * Math.cos(v / 13 + 2 * pattern)));
    }
}

describe("finding cards on a frame", () => {
  it("finds a rectangle with its sides, and one half off the frame by its top and bottom", () => {
    const g = room(1);
    card(g, 30, 70, 120, 160, 200, 1);
    const [r] = findRects({ data: g, width: W, height: H });
    expect(r).toBeDefined();
    expect(Math.abs(r.x0 - 30)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.x1 - 150)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.y0 - 70)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.y1 - 230)).toBeLessThanOrEqual(1);
    const g2 = room(1);
    card(g2, 120, 70, 120, 160, 200, 1);
    const [c] = findRects({ data: g2, width: W, height: H });
    expect(c.clipR).toBe(true);
    expect(Math.abs(c.x0 - 120)).toBeLessThanOrEqual(1);
  });

  it("sees no card in a room", () => {
    expect(findRects({ data: room(2), width: W, height: H })).toHaveLength(0);
  });
});

describe("following cards across frames", () => {
  it("reads a slide in from the right (easing out), two swaps where it rests, and a slide out to the left", () => {
    const fps = 30;
    const finder = new CardFinder(fps);
    const rest = 30;
    const n = 90;
    for (let i = 0; i < n; i++) {
      const t = i / fps;
      const g = room(3);
      let x: number | null = null;
      if (i >= 10 && i < 17) {
        // in over 7 frames, easing out: from the right edge to rest
        const u = (i - 9) / 7;
        x = rest + (W - rest) * (1 - (1 - (1 - u) ** 2));
      } else if (i >= 17 && i < 75) x = rest;
      else if (i >= 75 && i < 81) {
        const u = (i - 74) / 6;
        x = rest - (rest + 120) * u * u;
      }
      const pattern = i < 40 ? 1 : i < 60 ? 2 : 3;
      if (x !== null) card(g, x, 70, 120, 160, pattern === 2 ? 60 : 200, pattern);
      finder.push(t, { data: g, width: W, height: H });
    }
    const slots = finder.finish();
    expect(slots).toHaveLength(3);
    const [a, b, c] = slots;
    expect(new Set(slots.map((s) => s.run)).size).toBe(1);
    expect(a.enter.kind).toBe("slide");
    expect(a.enter.from).toBe("right");
    expect(a.enter.ease).toBe("out");
    expect(a.enter.dur).toBeGreaterThan(0.15);
    expect(a.enter.dur).toBeLessThan(0.36);
    expect(b.enter.kind).toBe("cut");
    expect(Math.abs(b.start - 40 / fps)).toBeLessThan(0.05);
    expect(Math.abs(c.start - 60 / fps)).toBeLessThan(0.05);
    expect(c.exit.kind).toBe("slide");
    expect(c.exit.from).toBe("left");
    expect(c.exit.ease).toBe("in");
    expect(a.rect[0]).toBeCloseTo(rest / W, 2);
    expect(a.rect[2]).toBeCloseTo(120 / W, 1);
  });
});

// The reference ad's frames (gray, 180 × 320, 30 fps), when they're on this machine.
const GRAY = resolve(import.meta.dirname, "fixtures/ad-gray.u8");
describe.skipIf(!existsSync(GRAY))("the reference ad's cards", () => {
  it("are the hook's four photos, the sales screenshot, the video and the two products", () => {
    const buf = new Uint8Array(readFileSync(GRAY));
    const n = buf.length / (W * H);
    const finder = new CardFinder(30);
    for (let i = 0; i < n; i++) finder.push(i / 30, { data: buf.subarray(i * W * H, (i + 1) * W * H), width: W, height: H });
    const slots = finder.finish();
    const at = (t: number) => slots.find((s) => s.start <= t && s.end > t);
    // The hook: one run of four photos, 4:5, centred, sliding in from the right.
    const hook = [1.3, 1.8, 2.2, 2.7].map(at);
    expect(hook.every(Boolean)).toBe(true);
    expect(new Set(hook.map((s) => s!.run)).size).toBe(1);
    expect(hook[0]!.enter).toMatchObject({ kind: "slide", from: "right" });
    expect(hook[3]!.exit).toMatchObject({ kind: "slide", from: "left" });
    const [x, y, w, h] = hook[0]!.rect;
    expect(x + w / 2).toBeCloseTo(0.5, 1);
    expect(y + h / 2).toBeCloseTo(0.5, 1);
    expect((w * 9) / (h * 16)).toBeCloseTo(0.8, 1);
    // The sales screenshot, and the two products.
    expect(at(20.4)?.enter).toMatchObject({ kind: "slide", from: "right" });
    expect(at(43.4)).toBeDefined();
    expect(at(43.9)).toBeDefined();
    expect(at(43.4)!.run).toBe(at(43.9)!.run);
  });
});

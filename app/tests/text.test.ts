import { describe, expect, it } from "vitest";
import { FONTS, fontById, fontString, stretchKeyword, weightIn } from "../src/engine/text/library";
import { ease, motionAt, onsetOf, type TextMotion } from "../src/engine/text/motion";
import { cased, fillCss } from "../src/engine/text/style";
import { boxMean, firm, guidedFilter, maskSize } from "../src/engine/vision/person";
import { designPages, keyness } from "../src/mimic/design";
import type { PlanWord, TextDesign } from "../src/mimic/types";

describe("the font library", () => {
  it("has its faces, each measured, and finds them by id", () => {
    expect(FONTS.length).toBeGreaterThanOrEqual(50);
    expect(new Set(FONTS.map((f) => f.id)).size).toBe(FONTS.length);
    for (const f of FONTS) {
      expect(f.metrics.xh, f.id).toBeGreaterThan(0.25);
      expect(f.metrics.cap, f.id).toBeGreaterThanOrEqual(f.metrics.xh - 1e-9);
      expect(f.files.length, f.id).toBeGreaterThan(0);
    }
    for (const k of ["grotesk", "wide", "condensed", "display", "rounded", "serif", "script", "mono"]) expect(FONTS.some((f) => f.kind === k), k).toBe(true);
    expect(fontById("nope").id).toBe("inter");
    expect(fontById("unbounded").name).toBe("Unbounded");
  });

  it("draws a weight it has, a slant it has, and a width its axis reaches", () => {
    const f = fontById("syne");
    expect(weightIn(f, 900)).toBe(800);
    expect(weightIn(f, 650)).toBe(700);
    expect(fontString(f, 48.04, 700, true)).toBe('700 48px "NZ Syne"');
    expect(fontString(fontById("instrument-serif"), 30, 400, true)).toBe('italic 400 30px "NZ Instrument Serif"');
    expect(stretchKeyword(fontById("tiktok-sans"), 150)).toBe("extra-expanded");
    expect(stretchKeyword(fontById("tiktok-sans"), 118)).toBe("semi-expanded");
    expect(stretchKeyword(fontById("syne"), 150)).toBe("normal");
  });
});

describe("text styles and motion", () => {
  it("sets the case and shows a fill as CSS", () => {
    expect(cased("if you sell", "title")).toBe("If You Sell");
    expect(cased("Wrong", "lower")).toBe("wrong");
    expect(fillCss({ kind: "linear", colors: ["#ff2d55", "#5b6cff"], angle: 0 })).toBe("linear-gradient(90deg, #ff2d55 0%, #5b6cff 100%)");
  });

  it("a pop grows in past its size and settles; a fade comes up; typing shows letters as it goes", () => {
    const pop: TextMotion = { kind: "pop", dur: 0.25, unit: "word", from: 0.6, overshoot: 0.12 };
    const s = [0.05, 0.3, 0.5, 0.75, 1].map((u) => motionAt(pop, u).scale);
    expect(s[0]).toBeLessThan(0.8);
    expect(Math.max(...s)).toBeGreaterThan(1.05);
    expect(Math.max(...s)).toBeLessThan(1.2);
    expect(s[4]).toBeCloseTo(1, 6);
    expect(motionAt({ kind: "fade", dur: 0.2, unit: "word" }, 0.5).alpha).toBeGreaterThan(0.5);
    expect(motionAt({ kind: "type", dur: 0.4, unit: "word" }, 0.5).letters).toBeCloseTo(0.5, 6);
    expect(motionAt({ kind: "wipe", dur: 0.3, unit: "line" }, 1).wipe).toBe(1);
    expect(motionAt({ kind: "rise", dur: 0.3, unit: "word", dist: 0.5 }, 0.01).dy).toBeGreaterThan(0.4);
    expect(motionAt(null, 0.3).alpha).toBe(1);
    expect(ease("back", 0.6, 0.12)).toBeGreaterThan(1);
    // A whole caption staggered word by word from its start.
    expect(onsetOf({ kind: "pop", dur: 0.2, unit: "page", stagger: 0.05 }, { start: 3 }, 1, 1, 0, 2)).toBeCloseTo(1.1, 9);
    expect(onsetOf({ kind: "pop", dur: 0.2, unit: "word" }, { start: 3 }, 1, 1, 0, 2)).toBe(3);
  });
});

describe("the person mask", () => {
  it("box means and the guided filter keep a mask on the picture's edges", () => {
    const w = 40;
    const h = 20;
    // A picture bright on the left half, dark on the right; a blurry mask fading across its edge (as a low-resolution mask scaled up is).
    const I = new Float32Array(w * h);
    const p = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        I[y * w + x] = x < 20 ? 0.9 : 0.1;
        p[y * w + x] = Math.min(1, Math.max(0, (26 - x) / 12));
      }
    const m = boxMean(I, w, h, 2);
    expect(m[10 * w + 5]).toBeCloseTo(0.9, 6);
    expect(m[10 * w + 20]).toBeCloseTo((0.9 * 2 + 0.1 * 3) / 5, 6);
    const q = guidedFilter(I, p, w, h, 4, 1e-3);
    // Snapped to the picture's edge: firmer just inside it, weaker just outside.
    expect(q[10 * w + 17]).toBeGreaterThan(p[10 * w + 17] + 0.05);
    expect(q[10 * w + 23]).toBeLessThan(p[10 * w + 23]);
    expect(q[10 * w + 5]).toBeGreaterThan(0.95);
    expect(q[10 * w + 35]).toBeLessThan(0.05);
    const f = firm(Float32Array.from([0, 0.25, 0.5, 0.75, 1]));
    expect([...f].map((v) => Math.round(v * 100) / 100)).toEqual([0, 0, 0.5, 1, 1]);
    expect(maskSize(1080, 1920)).toEqual([288, 512]);
  });
});

describe("a text design's captions", () => {
  const style = (id: string, size: number) => ({ id, font: "inter", weight: 700, italic: false, case: "lower" as const, size, tracking: 0, fill: { kind: "solid" as const, color: "#fff" }, stroke: null, shadow: null, glow: null, box: null, opacity: 1, blend: "normal" as const });
  const design: TextDesign = {
    styles: [style("base", 0.04), style("emph", 0.09)],
    picks: [{ style: "emph", rule: "keyword", share: 1 }],
    layout: "stack",
    leading: 1.05,
    words: 2,
    lines: 2,
    places: [
      { x: 0.7, y: 0.4, align: "left", valign: "middle", width: 0.4 },
      { x: 0.3, y: 0.3, align: "right", valign: "middle", width: 0.4, behind: true },
    ],
    behind: { share: 0 },
    enter: { kind: "pop", dur: 0.2, unit: "word" },
    exit: null,
  };
  const words = (text: string): PlanWord[] => text.split(" ").map((t, i) => ({ text: t, start: i * 0.3, end: i * 0.3 + 0.25 }));

  it("breaks words into short captions, picks a key word for the emphasis, takes the places in turn, and sets some behind", () => {
    const pages = designPages(words("if you sell through instagram dms you need this."), design);
    expect(pages.map((p) => p.lines.map((l) => l.map((w) => w.text).join(" ")).join(" / "))).toEqual(["if you / sell through", "instagram dms / you need", "this."]);
    expect(pages[0].lines.flat().find((w) => w.style === "emph")?.text).toBe("through");
    expect(pages[1].lines.flat().find((w) => w.style === "emph")?.text).toBe("instagram");
    expect(pages.map((p) => p.place)).toEqual([0, 1, 0]);
    expect(pages.map((p) => !!p.behind)).toEqual([false, true, false]);
    expect(keyness("the")).toBeLessThan(keyness("Instagram"));
    expect(keyness("40k")).toBe(3);
  });
});

import { describe, expect, it } from "vitest";
import { blendOf, fitGradient, inkIn, layerOf, lineWords, MIX, slide, type RGB } from "../src/mimic/analyze/words";
import { interfaceScreen, linesOf, readCaptions, readDesign, type SampleWord, type TextSample } from "../src/mimic/analyze/textdesign";
import { clearOfHead, designPages } from "../src/mimic/design";
import type { PlanWord, TextDesign } from "../src/mimic/types";

/** A picture filled by `at(x, y)`. */
function picture(w: number, h: number, at: (x: number, y: number) => RGB) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = at(x, y);
      data.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
    }
  return { data, width: w, height: h };
}

/** Letters as bars: 3 pixels wide, 3 apart, a word's worth each, words 14 apart, rows 10 to 29. */
const bars = (x: number, y: number, words: number[]) => {
  if (y < 10 || y > 29) return false;
  let at = 8;
  for (const n of words) {
    for (let k = 0; k < n; k++) {
      if (x >= at && x < at + 3) return true;
      at += 6;
    }
    at += 14;
  }
  return false;
};

describe("reading a line's words", () => {
  it("a sliding minimum and maximum (a grey erosion and dilation)", () => {
    const v = Float32Array.from([5, 1, 7, 3, 9, 2]);
    expect([...slide(v, 6, 1, 1, false)]).toEqual([1, 1, 1, 3, 2, 2]);
    expect([...slide(v, 6, 1, 1, true)]).toEqual([5, 7, 7, 9, 9, 9]);
  });

  it("finds light letters on a dark picture, and not the gaps between them", () => {
    const p = picture(80, 40, (x, y) => (bars(x, y, [4, 3]) ? [250, 250, 250] : [20 + ((x * 7 + y * 3) % 9), 25, 30]));
    const m = inkIn(p, 0, 0, 80, 40);
    let hit = 0;
    let miss = 0;
    let wrong = 0;
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 80; x++) {
        const ink = bars(x, y, [4, 3]);
        if (ink && m[y * 80 + x]) hit++;
        else if (ink) miss++;
        else if (m[y * 80 + x]) wrong++;
      }
    expect(hit / (hit + miss)).toBeGreaterThan(0.9);
    expect(wrong).toBeLessThan(0.05 * hit);
  });

  it("finds letters mixed in by difference: dark over the light half, light over the dark", () => {
    const p = picture(80, 40, (x, y) => {
      const bg: RGB = x < 40 ? [235, 230, 220] : [20, 40, 90];
      return bars(x, y, [4, 3]) ? (bg.map((c) => 255 - c) as RGB) : bg;
    });
    const m = inkIn(p, 0, 0, 80, 40);
    let hit = 0;
    let total = 0;
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 80; x++)
        if (bars(x, y, [4, 3])) {
          total++;
          hit += m[y * 80 + x];
        }
    expect(hit / total).toBeGreaterThan(0.85);
  });

  it("splits a line into words at the wide gaps, the reader's words to them", () => {
    const p = picture(80, 40, (x, y) => (bars(x, y, [4, 3]) ? [255, 255, 255] : [10, 10, 10]));
    const lw = lineWords(p, { x0: 4, y0: 6, x1: 76, y1: 34, score: 1 }, "four six")!;
    expect(lw.words.map((w) => w.text)).toEqual(["four", "six"]);
    expect(lw.words[0].x0).toBe(8);
    expect(lw.words[1].x0).toBe(8 + 4 * 6 + 14);
    expect(lw.words[0].color[0]).toBeGreaterThan(240);
    expect(lw.words[0].bg[0]).toBeLessThan(30);
  });

  it("fits a gradient across a word, and keeps a plain colour plain", () => {
    const xs: number[] = [];
    const ys: number[] = [];
    const cs: RGB[] = [];
    for (let x = 0; x < 60; x++)
      for (let y = 0; y < 10; y++) {
        xs.push(x);
        ys.push(y);
        cs.push([255 - 3 * x, 40, 60 + 3 * x]);
      }
    const g = fitGradient(xs, ys, cs).grad!;
    expect(g.angle).toBe(0);
    expect(g.from[0]).toBeGreaterThan(240);
    expect(g.to[2]).toBeGreaterThan(220);
    expect(fitGradient(xs, ys, cs.map(() => [250, 250, 250] as RGB)).grad).toBeNull();
  });

  it("tells white letters mixed in by difference from the picture under them", () => {
    // A picture whose light goes from dark to light across the word; the letters its inverse.
    const p = picture(120, 40, (x, y) => {
      const bg: RGB = [Math.round(30 + 1.8 * x), Math.round(60 + 1.2 * x), Math.round(90 + 0.6 * x)];
      return bars(x, y, [6, 5]) ? (bg.map((c) => Math.round(255 * MIX.difference(c / 255, 1))) as RGB) : bg;
    });
    const lw = lineWords(p, { x0: 4, y0: 6, x1: 116, y1: 34, score: 1 }, "difference words")!;
    const b = blendOf(p, lw, lw.words[0])!;
    expect(b).not.toBeNull();
    expect(["difference", "exclusion"]).toContain(b.mode);
    expect(b.color[0]).toBeGreaterThan(220);
    // Plain white letters over the same picture aren't mixed in.
    const q = picture(120, 40, (x, y) => (bars(x, y, [6, 5]) ? [255, 255, 255] : [Math.round(30 + 1.8 * x), Math.round(60 + 1.2 * x), Math.round(90 + 0.6 * x)]));
    const lq = lineWords(q, { x0: 4, y0: 6, x1: 116, y1: 34, score: 1 }, "plain words")!;
    expect(blendOf(q, lq, lq.words[0])).toBeNull();
  });

  it("puts a line behind the person when its letters are missing where the person is", () => {
    // The person covers the middle of the first word (columns 12 to 36).
    const over = (x: number) => x >= 12 && x < 37;
    const shown = (x: number, y: number) => bars(x, y, [4, 3]) && !over(x);
    const p = picture(80, 40, (x, y) => (shown(x, y) ? [255, 255, 255] : over(x) ? [120, 90, 70] : [10, 10, 10]));
    const lw = lineWords(p, { x0: 4, y0: 6, x1: 76, y1: 34, score: 1 }, "four six")!;
    const person = { data: new Float32Array(80 * 40).map((_, i) => (over(i % 80) ? 1 : 0)), width: 80, height: 40 };
    expect(layerOf(lw, person, 80, 40)).toBe("behind");
    // Letters drawn over the person: in front.
    const q = picture(80, 40, (x, y) => (bars(x, y, [4, 3]) ? [255, 255, 255] : over(x) ? [120, 90, 70] : [10, 10, 10]));
    const lq = lineWords(q, { x0: 4, y0: 6, x1: 76, y1: 34, score: 1 }, "four six")!;
    expect(layerOf(lq, person, 80, 40)).toBe("front");
  });
});

/** A caption word as read, at a place and size. */
const sw = (text: string, x0: number, base: number, xh: number, color: RGB = [250, 250, 250], extra: Partial<SampleWord> = {}): SampleWord => ({
  text,
  x0,
  x1: x0 + Math.round(xh * 0.62 * text.length),
  y0: base - Math.round(xh * 1.35),
  y1: base,
  base,
  xh,
  tall: Math.round(xh * 1.35),
  stroke: 0.26,
  slant: 0,
  color,
  spread: 6,
  grad: null,
  bg: [30, 30, 30],
  ink: 100,
  runs: [],
  conf: 0.98,
  ...extra,
});

describe("reading a reference's text design", () => {
  it("follows a caption's words from frame to frame, word by word, and sets them in lines", () => {
    const a = sw("because", 500, 200, 24);
    const b = sw("you", 520, 240, 24);
    const samples: TextSample[] = [
      { t: 0.17, words: [a] },
      { t: 0.5, words: [a, b] },
      { t: 0.83, words: [a, b] },
      { t: 1.17, words: [sw("wrong", 100, 260, 46, [247, 40, 137])] },
      { t: 1.5, words: [] },
    ];
    const caps = readCaptions(samples, 1 / 3);
    expect(caps).toHaveLength(2);
    expect(caps[0].grew).toBe(true);
    expect(caps[0].lines.map((l) => l.map((w) => w.text).join(" "))).toEqual(["because", "you"]);
    expect(linesOf([sw("SWITCH", 250, 410, 148), sw("your", 240, 455, 24), sw("lifestyle", 400, 455, 24)]).map((l) => l.map((w) => w.text).join(" "))).toEqual(["SWITCH", "your lifestyle"]);
  });

  it("reads styles, a picked key word, its places, a look of big words, and words coming on one by one", () => {
    // Subtitle-like white captions beside the head, the key word big and pink; every fourth
    // caption one big red word alone in the middle.
    const samples: TextSample[] = [];
    const H = 540;
    let t = 1 / 6;
    const said = ["going to show you", "the wrong things", "instagram works", "every single morning", "watch this money", "people never listen", "customers always reply", "growth really happens"];
    said.forEach((line, k) => {
      const words = line.split(" ");
      if (k % 4 === 3) {
        const big = sw(words[0].toUpperCase(), 300, 300, 90, [190, 5, 5], { stroke: 0.2 });
        samples.push({ t, words: [big] }, { t: t + 1 / 3, words: [big] });
        t += 2 / 3;
        return;
      }
      const key = words.reduce((a, b) => (b.length > a.length ? b : a));
      const shown: SampleWord[] = [];
      words.forEach((w, i) => {
        const isKey = w === key;
        shown.push(sw(w, 560 + (i % 2) * 120, 200 + Math.floor(i / 2) * 50, isKey ? 46 : 22, isKey ? [247, 40, 137] : [250, 250, 250]));
        samples.push({ t, words: [...shown] });
        t += 1 / 3;
      });
      samples.push({ t, words: [] });
      t += 1 / 3;
    });
    const r = readDesign(samples, 960, H, 1 / 3)!;
    expect(r).not.toBeNull();
    const d = r.design;
    expect(d.styles.length).toBeGreaterThanOrEqual(2);
    expect(d.styles[0].fill).toEqual({ kind: "solid", color: expect.stringMatching(/^#f/) });
    const pink = d.styles.find((s) => s.fill.kind === "solid" && s.fill.color.startsWith("#f72"));
    expect(pink).toBeDefined();
    expect(pink!.size / d.styles[0].size).toBeGreaterThan(1.6);
    expect(d.picks.find((p) => p.style === pink!.id)?.rule).toBe("keyword");
    expect(d.layout).toBe("stack");
    expect(d.places[0].x).toBeGreaterThan(0.55);
    expect(d.enter.unit).toBe("word");
    const alt = d.alts?.find((a) => a.style && d.styles.find((s) => s.id === a.style)?.case === "upper");
    expect(alt).toBeDefined();
    expect(alt!.places![0].x).toBeGreaterThan(0.3);
    expect(alt!.places![0].x).toBeLessThan(0.7);
  });
});

describe("text that isn't a caption, and captions clear of the face", () => {
  it("tells an app's screen (a list, a chat) from captions", () => {
    const H = 540;
    // A chat: twelve small words on five lines.
    const chat = ["Richard", "Sean", "can", "you", "send", "me", "the", "link", "Tyler", "Brown", "pricing", "today"].map((w, i) => sw(w, 100 + (i % 3) * 90, 120 + Math.floor(i / 3) * 30, 11));
    expect(interfaceScreen(chat, H)).toBe(true);
    // Subtitles: ten words on two lines, or one big caption, aren't.
    const subs = "you don't need more leads you just need to convert".split(" ").map((w, i) => sw(w, 100 + (i % 5) * 120, 460 + Math.floor(i / 5) * 30, 11));
    expect(interfaceScreen(subs, H)).toBe(false);
    expect(interfaceScreen(chat.map((w) => ({ ...w, xh: 40 })), H)).toBe(false);
  });

  it("drops a screen's writing held still, and grey writing, from a design", () => {
    const H = 540;
    const samples: TextSample[] = [];
    let t = 1 / 6;
    // Six white captions coming and going...
    for (const line of ["let me tell", "you a secret", "because you are", "probably answering", "your messages", "in the wrong order"]) {
      const ws = line.split(" ").map((w, i) => sw(w, 300 + i * 110, 200, 24));
      samples.push({ t, words: ws }, { t: t + 1 / 3, words: ws }, { t: t + 2 / 3, words: [] });
      t += 1;
    }
    // ...and a grey line of an app's screen held for six seconds.
    const ui = "Priority Inbox".split(" ").map((w, i) => sw(w, 120 + i * 140, 420, 20, [90, 88, 92]));
    for (let k = 0; k < 18; k++, t += 1 / 3) samples.push({ t, words: ui });
    const r = readDesign(samples, 960, H, 1 / 3)!;
    expect(r).not.toBeNull();
    expect(r.captions.some((c) => c.lines.flat().some((w) => w.text === "Priority"))).toBe(false);
    expect(r.design.styles.every((st) => st.fill.kind !== "solid" || st.fill.color.startsWith("#f"))).toBe(true);
  });

  it("moves a caption off the speaker's face the least way, and tucks one behind only at its foot", () => {
    const [W, H] = [1080, 1920];
    const face = { x: 0.5, y: 0.35, w: 0.3, h: 0.17 };
    const head = { y0: (0.35 - 1.05 * 0.17) * H, y1: (0.35 + 0.75 * 0.17) * H, x0: (0.5 - 0.75 * 0.3) * W, x1: (0.5 + 0.75 * 0.3) * W };
    const clear = (b: { x0: number; x1: number; y0: number; y1: number }) => b.y1 <= head.y0 || b.y0 >= head.y1 || b.x1 <= head.x0 || b.x0 >= head.x1;
    const shift = (b: { x0: number; x1: number; y0: number; y1: number }, r: { dx: number; dy: number }) => ({ x0: b.x0 + r.dx, x1: b.x1 + r.dx, y0: b.y0 + r.dy, y1: b.y1 + r.dy });
    // In front, across the eyes: moved the least way that clears the head (here, under the chin).
    const across = { x0: 300, x1: 780, y0: 600, y1: 700 };
    const r = clearOfHead(across, face, false, W, H);
    expect(clear(shift(across, r))).toBe(true);
    expect(r.dy).toBeGreaterThan(0);
    expect(r.dy / H).toBeLessThan(0.2);
    // Higher up the face, above the head is nearer.
    const brow = { x0: 300, x1: 780, y0: 380, y1: 460 };
    expect(brow.y1 + clearOfHead(brow, face, false, W, H).dy).toBeLessThanOrEqual(head.y0);
    // Beside the head already: stays.
    expect(clearOfHead({ x0: 40, x1: 240, y0: 600, y1: 700 }, face, false, W, H)).toEqual({ dx: 0, dy: 0, front: false });
    // Behind, the head hiding most of a stack: up until a fifth of it is tucked behind the top of the head.
    const stack = { x0: 380, x1: 700, y0: 600, y1: 800 };
    const up = clearOfHead(stack, face, true, W, H);
    expect(up.front).toBe(false);
    expect(stack.y1 + up.dy).toBeCloseTo(head.y0 + 0.2 * (stack.y1 - stack.y0), 6);
    // Too tall to fit above the head (a close-up): it comes out in front, clear of the head.
    const tall = { x0: 380, x1: 700, y0: 420, y1: 800 };
    const out = clearOfHead(tall, face, true, W, H);
    expect(out.front).toBe(true);
    expect(clear(shift(tall, out))).toBe(true);
    // Nowhere clear at all: behind, as far up as the frame lets it.
    const huge = { x0: 300, x1: 900, y0: 300, y1: 1500 };
    const most = clearOfHead(huge, face, true, W, H);
    expect(most.front).toBe(false);
    expect(huge.y0 + most.dy).toBeCloseTo(0.04 * H, 6);
    // A giant word behind, showing either side of the head: stays.
    expect(clearOfHead({ x0: 60, x1: 1020, y0: 500, y1: 800 }, face, true, W, H)).toEqual({ dx: 0, dy: 0, front: false });
  });
});

describe("a design's other looks", () => {
  const style = (id: string, size: number) => ({ id, font: "inter", weight: 700, italic: false, case: "lower" as const, size, tracking: 0, fill: { kind: "solid" as const, color: "#fff" }, stroke: null, shadow: null, glow: null, box: null, opacity: 1, blend: "normal" as const });
  const words = (text: string): PlanWord[] => text.split(" ").map((t, i) => ({ text: t, start: i * 0.3, end: i * 0.3 + 0.25 }));

  it("give the caption with the strongest word its own look, just the part round that word, in its own place", () => {
    const d: TextDesign = {
      styles: [style("base", 0.04), style("big", 0.14)],
      picks: [],
      layout: "lines",
      leading: 1.05,
      words: 3,
      lines: 2,
      places: [{ x: 0.5, y: 0.9, align: "center", valign: "middle", width: 0.8 }],
      behind: { share: 0 },
      enter: { kind: "fade", dur: 0.1, unit: "page" },
      exit: null,
      alts: [{ rule: "keyword", share: 0.2, style: "big", layout: "lines", words: 1, lines: 1, places: [{ x: 0.5, y: 0.45, align: "center", valign: "middle", width: 0.8 }], behind: true }],
    };
    const pages = designPages(words("so you want to switch your current lifestyle. it is a whole thing"), d);
    const alt = pages.filter((p) => p.alt === 0);
    expect(alt).toHaveLength(1);
    expect(alt[0].lines.flat().map((w) => w.text)).toEqual(["lifestyle."]);
    expect(alt[0].lines.flat()[0].style).toBe("big");
    expect(alt[0].behind).toBe(true);
    expect(alt[0].place).toBe(0);
    // The words round it stay captions of their own, in order.
    expect(pages.flatMap((p) => p.lines.flat().map((w) => w.text)).join(" ")).toBe("so you want to switch your current lifestyle. it is a whole thing");
    for (let i = 1; i < pages.length; i++) expect(pages[i].start).toBeGreaterThanOrEqual(pages[i - 1].start);
  });
});

describe("matching a style's font by drawing it", () => {
  it("finds the face whose letters cover the read ones best, and the width they're drawn at", async () => {
    const { matchFont, overlap } = await import("../src/mimic/analyze/fontmatch");
    const { fontById } = await import("../src/engine/text/library");
    // A stand-in for the canvas: letters as bars, as wide as the face's kind and width make them.
    const per = (kind: string) => (kind === "wide" ? 0.8 : kind === "condensed" ? 0.38 : 0.56);
    // (Each letter a bar in its cell, the spacing added between cells.)
    const render = (f: ReturnType<typeof fontById>, _w: number, stretch: number | undefined, _i: boolean, px: number, text: string, tracking = 0) => {
      const lw = Math.max(2, Math.round(px * per(f.kind) * ((stretch ?? 100) / 100)));
      const cell = Math.max(1, lw + Math.round(tracking * px));
      const h = Math.max(2, Math.round(px * f.metrics.xh));
      const w = cell * (text.length - 1) + lw;
      const data = new Uint8Array(w * h);
      for (let y = 0; y < h; y++)
        for (let i = 0; i < text.length; i++) for (let x = 0; x < Math.round(lw * 0.6); x++) if (i * cell + x < w) data[y * w + i * cell + x] = 1;
      return { w, h, data, base: h };
    };
    const truth = fontById("unbounded");
    const specimens = ["secret", "wrong", "order"].map((text) => {
      const m = render(truth, 700, undefined, false, 60, text);
      return { text, mask: m, xh: Math.round(60 * truth.metrics.xh), tall: Math.round(60 * truth.metrics.cap) };
    });
    expect(overlap(specimens[0].mask, specimens[0].mask).iou).toBe(1);
    const g = matchFont(specimens, render, { weight: 700, italic: false })!;
    expect(g).not.toBeNull();
    expect(fontById(g.font).kind).toBe("wide");
    expect(g.score).toBeGreaterThan(0.6);
    // A regular face set with its letters touching isn't taken for a condensed one spaced out.
    const tight = ["patient", "dream", "yours"].map((text) => {
      const m = render(fontById("inter"), 700, undefined, false, 60, text, -0.1);
      return { text, mask: m, xh: Math.round(60 * fontById("inter").metrics.xh), tall: Math.round(60 * fontById("inter").metrics.cap) };
    });
    const t = matchFont(tight, render, { weight: 700, italic: false })!;
    expect(fontById(t.font).kind).not.toBe("condensed");
    expect(t.tracking).toBeCloseTo(-0.1, 1);
  });
});

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { captionLook, CAP_HEIGHT, X_HEIGHT, type CaptionSample, type LineInk } from "../src/mimic/analyze/captions";
import { DEFAULT_LOOK, layoutPage } from "../src/mimic/captions";

const W = 360;
const H = 640;

/** A caption line as the reader would find it: centred at x, its middle at y, a size in pixels. */
function line(text: string, y: number, px: number, width: number, x = W / 2): CaptionSample["lines"][number] {
  const ink: LineInk = {
    x0: x - width / 2,
    x1: x + width / 2,
    y0: y - px * 0.36,
    y1: y + px * 0.36,
    xh: px * X_HEIGHT,
    tall: px * CAP_HEIGHT,
    density: 0.5,
    color: [250, 250, 245],
    ring: 150,
    outer: 150,
    above: 150,
    below: 150,
    bg: [150, 150, 150],
    bgSpread: 30,
    accent: null,
  };
  return { x0: ink.x0 - 6, y0: ink.y0 - 6, x1: ink.x1 + 6, y1: ink.y1 + 6, score: 0.8, text, conf: 0.95, ink };
}

/** Captions coming on word by word: each sample shows one more word of the caption. */
function wordByWord(pages: string[][], fitted: boolean): CaptionSample[] {
  const out: CaptionSample[] = [];
  let t = 0;
  for (const lines of pages) {
    const all = lines.map((l) => l.split(" "));
    for (let k = 1; k <= all.flat().length; k++) {
      let left = k;
      const shown: CaptionSample["lines"] = [];
      let y = 0.62 * H;
      all.forEach((words) => {
        const n = Math.min(words.length, left);
        left -= n;
        if (!n) return;
        const full = words.join(" ");
        // Fitted: a long line shrinks to 160 px wide; a short one stops at 26 px letters.
        const px = fitted ? Math.min(26, 160 / (full.length * 0.52)) : 22;
        const fullW = full.length * 0.52 * px;
        const part = words.slice(0, n).join(" ");
        const partW = part.length * 0.52 * px;
        // The line is laid out whole (centred), its words shown from the left.
        const x0 = W / 2 - fullW / 2;
        shown.push(line(part, y, px, partW, x0 + partW / 2));
        y += 1.1 * px;
      });
      out.push({ t, lines: shown });
      t += 1 / 3;
    }
    t += 0.4;
  }
  return out;
}

const PAGES = [
  ["Du har sikkert", "set en masse idioter"],
  ["måned med deres", "webshop."],
  ["Altså,", "det er fuldstændig"],
  ["jeg har filmet", "en gratis video"],
  ["eller måske bare", "er træt af skolen."],
  ["jamen så synes", "du skal se den"],
  ["om det er noget", "for dig."],
  ["hvordan og hvorfor", "at du burde"],
];

describe("the reference's caption look", () => {
  it("reads place, lines, word-by-word coming on, and lines fitted to one width", () => {
    const look = captionLook(wordByWord(PAGES, true), W, H)!;
    expect(look).not.toBeNull();
    expect(look.y).toBeCloseTo(0.62, 2);
    expect(look.lines).toBe(2);
    expect(look.reveal).toBe("word");
    expect(look.align).toBe("center");
    expect(look.fit).toBe(true);
    expect(look.width).toBeCloseTo(160 / W, 1);
    expect(look.maxSize * H).toBeGreaterThan(22);
    expect(look.case).toBe("as-said");
    expect(look.color).toBe("#fafaf5");
  });

  it("tells lines all one size from fitted ones", () => {
    const look = captionLook(wordByWord(PAGES, false), W, H)!;
    expect(look.fit).toBe(false);
    expect(look.maxSize * H).toBeCloseTo(22, 0);
  });
});

describe("the space between words", () => {
  /** Six captions of three words (60 px of letters each, `gap` px apart) coming on a word a frame. */
  function growing(gap: number, recentre: boolean): CaptionSample[] {
    const pages = [["alle", "kan", "gøre"], ["hvis", "du", "vil"], ["det", "er", "gratis"], ["jeg", "viser", "dig"], ["om", "at", "tjene"], ["så", "go", "watch"]];
    const out: CaptionSample[] = [];
    let t = 0;
    for (const words of pages) {
      const full = 3 * 60 + 2 * gap;
      for (let k = 1; k <= 3; k++) {
        const part = k * 60 + (k - 1) * gap;
        const x0 = recentre ? W / 2 - part / 2 : W / 2 - full / 2;
        const l = line(words.slice(0, k).join(" "), 0.62 * H, 26, part, x0 + part / 2);
        l.ink!.runs = Array.from({ length: k }, (_, i): [number, number] => [x0 + i * (60 + gap), x0 + i * (60 + gap) + 59]);
        l.ink!.x1 = x0 + part - 1;
        out.push({ t, lines: [l] });
        t += 1 / 3;
      }
      t += 0.4;
    }
    return out;
  }

  it("is read from a caption laid out whole as its words come on", () => {
    // 4 px at a size of 26 px: 0.15 of the size (Inter's own leaves about 0.26).
    expect(captionLook(growing(4, false), W, H)!.wordGap).toBeCloseTo(0.15, 2);
    // Set about as Inter sets them: its own spaces.
    expect(captionLook(growing(7, false), W, H)!.wordGap).toBeUndefined();
  });

  it("is left to the face when the caption moves as it grows", () => {
    expect(captionLook(growing(4, true), W, H)!.wordGap).toBeUndefined();
  });

  it("puts the same ink between every two words, whatever their letters", () => {
    // A stand-in canvas: letters half the size wide, a t's bar reaching past its sides.
    class Stand {
      font = "";
      letterSpacing = "";
      textAlign = "left";
      measureText(t: string) {
        const px = Number(/([\d.]+)px/.exec(this.font)![1]);
        const reach = (c: string) => (c === "t" ? 0.06 : -0.04) * px;
        return { width: t.length * 0.5 * px, actualBoundingBoxLeft: reach(t[0]), actualBoundingBoxRight: t.length * 0.5 * px + reach(t[t.length - 1]) };
      }
    }
    const ctx = new Stand() as unknown as OffscreenCanvasRenderingContext2D;
    const look = { ...DEFAULT_LOOK, fit: false, maxSize: 0.04, width: 0.9, wordGap: 0.15 };
    const words = ["overladet", "til", "dig", "at"].map((text, i) => ({ text, start: i, end: i + 0.5 }));
    const [line] = layoutPage(ctx, look, { start: 0, end: 4, lines: [words] }, 1080, 1920);
    const px = line.size;
    const edges = line.words.map((w) => {
      const m = ctx.measureText(w.text);
      return [w.x - m.actualBoundingBoxLeft, w.x + m.actualBoundingBoxRight];
    });
    for (let i = 1; i < edges.length; i++) expect(edges[i][0] - edges[i - 1][1]).toBeCloseTo(0.15 * px, 6);
    // Centred by its ink.
    expect((edges[0][0] + edges[edges.length - 1][1]) / 2).toBeCloseTo(540, 6);
  });
});

// The reference ad's captions, read by the page (when the samples are on this machine).
const SAMPLES = resolve(import.meta.dirname, "fixtures/ad-caption-samples.json");
describe.skipIf(!existsSync(SAMPLES))("the reference ad's captions", () => {
  it("are two lines at 62% of the height, word by word, fitted to about 43% of the width", () => {
    const look = captionLook(JSON.parse(readFileSync(SAMPLES, "utf8")), W, H)!;
    expect(look.y).toBeCloseTo(0.62, 2);
    expect(look.lines).toBe(2);
    expect(look.reveal).toBe("word");
    expect(look.fit).toBe(true);
    expect(look.width).toBeGreaterThan(0.4);
    expect(look.width).toBeLessThan(0.47);
    expect(look.align).toBe("center");
    expect(look.case).toBe("as-said");
  });
});

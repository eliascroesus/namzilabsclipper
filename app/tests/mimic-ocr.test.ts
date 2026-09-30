import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { boxesFromMap, ctcDecode, TextReader } from "../src/mimic/analyze/ocr";

describe("text boxes from the detector's map", () => {
  it("joins pixels over the threshold into lines, drops faint ones, and pushes each box out to the letters' edges", () => {
    const w = 64;
    const h = 32;
    const prob = new Float32Array(w * h);
    // A strong line (0.9) at x 10..49, y 10..17, and a faint blob (0.35) at x 55..60, y 25..28.
    for (let y = 10; y <= 17; y++) for (let x = 10; x <= 49; x++) prob[y * w + x] = 0.9;
    for (let y = 25; y <= 28; y++) for (let x = 55; x <= 60; x++) prob[y * w + x] = 0.35;
    const boxes = boxesFromMap(prob, w, h, 2, 2);
    expect(boxes).toHaveLength(1);
    const b = boxes[0];
    // the region grows by one pixel (dilation): 41 x 9; unclip d = 41 * 9 * 1.6 / (2 * 50)
    const d = (41 * 9 * 1.6) / 100;
    expect(b.x0).toBeCloseTo((10 - d) * 2, 4);
    expect(b.x1).toBeCloseTo((51 + d) * 2, 4);
    expect(b.y0).toBeCloseTo((10 - d) * 2, 4);
    expect(b.y1).toBeCloseTo((19 + d) * 2, 4);
  });
});

describe("reading a line", () => {
  it("merges repeats, drops blanks, and reads the last class as a space", () => {
    const keys = ["a", "b", "c"];
    const classes = 5; // blank, a, b, c, space
    const seq = [1, 1, 0, 1, 2, 4, 3, 3, 0];
    const probs = new Float32Array(seq.length * classes);
    seq.forEach((k, t) => (probs[t * classes + k] = 0.9));
    expect(ctcDecode(probs, seq.length, classes, keys).text).toBe("aab c");
  });
});

// The reference ad's frames, when they're on this machine (tests/fixtures/ad-frames, not committed).
const FRAMES = resolve(import.meta.dirname, "fixtures/ad-frames");
const MODELS = resolve(import.meta.dirname, "../public/models");
describe.skipIf(!existsSync(resolve(FRAMES, "35.4.rgba")))("the captions of the reference ad", () => {
  it("are found line by line where RapidOCR finds them, and read", { timeout: 120_000 }, async () => {
    const ort = await import("onnxruntime-web/wasm");
    ort.env.wasm.numThreads = 1;
    const reader = await TextReader.create(ort, new Uint8Array(readFileSync(resolve(MODELS, "ppocr-det.onnx"))), new Uint8Array(readFileSync(resolve(MODELS, "ppocr-rec.onnx"))), JSON.parse(readFileSync(resolve(MODELS, "ppocr-keys.json"), "utf8")));
    const pic = (t: string) => ({ data: new Uint8Array(readFileSync(resolve(FRAMES, `${t}.rgba`))), width: 360, height: 640 });
    // RapidOCR (Python, 736 px short side) on these frames: [x0, y0, x1, y1] of each caption line.
    const want: Record<string, [number, number, number, number][]> = {
      "1.0": [[105, 387, 257, 411], [102, 414, 207, 433]],
      "35.4": [[108, 386, 255, 416], [103, 415, 166, 433]],
      "52.1": [[153, 384, 212, 411]],
      "57.8": [[99, 382, 263, 409], [139, 404, 219, 439]],
    };
    for (const [t, lines] of Object.entries(want)) {
      const p = pic(t);
      const found = [];
      // Lines read with confidence; a stray mark (a logo, a socket) reads as nothing sure.
      for (const b of (await reader.find(p, 960)).filter((b) => b.y0 > 350 && b.y1 < 460)) if ((await reader.read(p, b)).conf >= 0.5) found.push(b);
      expect(found.length, `lines at ${t}s`).toBe(lines.length);
      found.forEach((b, i) => {
        const [x0, y0, x1, y1] = lines[i];
        expect(Math.abs(b.x0 - x0), `${t}s line ${i} left`).toBeLessThan(6);
        expect(Math.abs(b.x1 - x1), `${t}s line ${i} right`).toBeLessThan(6);
        expect(Math.abs((b.y0 + b.y1) / 2 - (y0 + y1) / 2), `${t}s line ${i} middle`).toBeLessThan(4);
      });
    }
    const [l1] = (await reader.find(pic("35.4"), 960)).filter((b) => b.y0 > 350 && b.y1 < 460 && b.y1 - b.y0 > 12);
    const read = await reader.read(pic("35.4"), l1);
    expect(read.text.replace(/\s/g, "")).toBe("jegharfilmet");
  });
});

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TextReader } from "../src/mimic/analyze/ocr";
import { analyzeReference, type FrameSource } from "../src/mimic/analyze/reference";

// The example ad, when its frames are on this machine (tests/fixtures, not committed: it's
// someone else's ad): every frame gray at 180 × 320, three frames a second at 360 × 640, and
// its sound at 16 kHz.
const F = resolve(import.meta.dirname, "fixtures");
const have = ["ad-gray.u8", "ad-rgba-3fps.u8", "ad16k.f32"].every((f) => existsSync(resolve(F, f)));

describe.skipIf(!have)("studying the example ad", () => {
  it("finds its captions, cards, cutaways, zooms, bed and black ending", { timeout: 600_000 }, async () => {
    const ort = await import("onnxruntime-web/wasm");
    ort.env.wasm.numThreads = 1;
    const M = resolve(import.meta.dirname, "../public/models");
    const reader = await TextReader.create(ort, new Uint8Array(readFileSync(resolve(M, "ppocr-det.onnx"))), new Uint8Array(readFileSync(resolve(M, "ppocr-rec.onnx"))), JSON.parse(readFileSync(resolve(M, "ppocr-keys.json"), "utf8")));
    const gray = new Uint8Array(readFileSync(resolve(F, "ad-gray.u8")));
    const rgba = new Uint8Array(readFileSync(resolve(F, "ad-rgba-3fps.u8")));
    const a16 = readFileSync(resolve(F, "ad16k.f32"));
    const G = 180 * 320;
    const P = 360 * 640 * 4;
    const src: FrameSource = {
      name: "ad",
      duration: 62.7,
      width: 360,
      height: 640,
      fps: 30,
      async frames(_w, _h, each) {
        for (let i = 0; i * G < gray.length; i++) each(i / 30, { data: gray.subarray(i * G, (i + 1) * G), width: 180, height: 320 });
      },
      async pictures(times, _w, _h, each) {
        for (const t of times) {
          const k = Math.min(rgba.length / P - 1, Math.round((t * 30) / 10));
          await each(t, { data: rgba.subarray(k * P, (k + 1) * P), width: 360, height: 640 });
        }
      },
      async audio() {
        return new Float32Array(a16.buffer, a16.byteOffset, a16.byteLength / 4);
      },
    };
    const t = await analyzeReference(src, { reader });
    // Captions: two lines at 62%, word by word, fitted to about 43% of the width.
    expect(t.captions).not.toBeNull();
    expect(t.captions!.y).toBeCloseTo(0.62, 2);
    expect(t.captions!.lines).toBe(2);
    expect(t.captions!.reveal).toBe("word");
    expect(t.captions!.fit).toBe(true);
    expect(t.captions!.width).toBeGreaterThan(0.4);
    expect(t.captions!.width).toBeLessThan(0.47);
    // A short line's lowercase is 13 px of 640 (Inter's display cut is 0.516 of its size), and
    // the words sit close: 3 to 4 px apart, where Inter's own space would leave 6 or 7.
    expect(t.captions!.maxSize * 640 * 0.516).toBeGreaterThan(12.4);
    expect(t.captions!.maxSize * 640 * 0.516).toBeLessThan(14);
    expect(t.captions!.wordGap).toBeGreaterThan(0.1);
    expect(t.captions!.wordGap).toBeLessThan(0.19);
    // Cards: the hook's run of four photos, then the others; a card in each place the ad has one.
    const at = (s: number) => t.cards.find((c) => c.start <= s && c.end > s);
    const hook = [1.3, 1.8, 2.2, 2.7].map(at);
    expect(hook.every(Boolean)).toBe(true);
    expect(new Set(hook.map((c) => c!.run)).size).toBe(1);
    expect(hook[0]!.enter).toMatchObject({ kind: "slide", from: "right" });
    expect(hook[3]!.exit).toMatchObject({ kind: "slide", from: "left" });
    for (const s of [20.4, 27.0, 28.3, 35.5, 43.4, 43.9]) expect(at(s), `a card at ${s}`).toBeDefined();
    expect(t.cards).toHaveLength(10);
    // (The ad's "video" card is a still of one with a play button on it.)
    expect(["photo", "video"]).toContain(at(35.5)!.content);
    expect(at(20.4)!.content).not.toBe("video");
    expect(at(27.0)!.content).toBe("screenshot");
    // Cutaways, zooms, the bed, the ending.
    expect(t.broll.map((b) => Math.round(b.start))).toEqual([8, 23, 38]);
    expect(t.zoom!.close).toBeGreaterThan(1.1);
    expect(t.zoom!.close).toBeLessThan(1.25);
    expect(t.zoom!.dur).toBeCloseTo(0.2, 1);
    expect(t.sound.bed!.start).toBeGreaterThan(17);
    expect(t.sound.bed!.start).toBeLessThan(20);
    expect(t.sound.sfx).toEqual([]);
    expect(t.tail).toBeCloseTo(3, 0);
  });
});

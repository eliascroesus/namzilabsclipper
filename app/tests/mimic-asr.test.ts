import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { features } from "../src/mimic/asr/fbank";
import { chunkAudio, FRAME, greedyTdt, parseTokens, toWords, transcribe, type DecoderState, type Transducer } from "../src/mimic/asr/parakeet";

/** Two tones and a little noise (the same numbers the reference values were made from). */
function signal(): Float32Array {
  const n = 16000;
  const y = new Float32Array(n);
  let x = 12345n;
  for (let i = 0; i < n; i++) {
    x = (1664525n * x + 1013904223n) % 4294967296n;
    const noise = (Number(x) / 4294967296 - 0.5) * 0.02;
    y[i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / 16000) + 0.2 * Math.sin((2 * Math.PI * 1234.5 * i) / 16000) * (i / n) + noise;
  }
  return y;
}

describe("the speech features", () => {
  it("match kaldi-native-fbank's (sherpa-onnx's NeMo settings), normalised per band", () => {
    const { data, frames } = features(signal());
    expect(frames).toBe(100);
    // [band, frame, value] from kaldi_native_fbank 1.22 on the same signal, then per-band normalisation.
    const ref: [number, number, number][] = [
      [0, 0, 4.9674], [0, 1, -0.9581], [0, 50, 0.5148], [0, 99, 5.5202],
      [5, 0, 5.6767], [5, 1, 1.1273], [5, 50, 1.1261], [5, 99, 5.4318],
      [40, 0, 3.3618], [40, 1, -1.0931], [40, 50, 1.037], [40, 99, 4.8089],
      [64, 0, 1.6377], [64, 1, -0.2407], [64, 50, 0.4031], [64, 99, 4.0805],
      [100, 0, -0.4454], [100, 1, 1.0718], [100, 50, -0.3403], [100, 99, 0.3616],
      [127, 0, -0.5709], [127, 1, -0.3084], [127, 50, 0.6296], [127, 99, 0.228],
    ];
    for (const [b, f, v] of ref) expect(data[b * frames + f]).toBeCloseTo(v, 2);
  });
});

/** A scripted model: at frame t the joiner answers from `script` (token, duration), blank otherwise. */
function scripted(script: Map<string, [number, number]>, blank = 9): Transducer & { calls: string[] } {
  const calls: string[] = [];
  let emitted = 0;
  return {
    blank,
    calls,
    async predict(_token: number, state: DecoderState | null) {
      if (state) emitted++;
      return { out: Float32Array.from([emitted]), state: { h: new Float32Array(1), c: new Float32Array(1) } };
    },
    async join(enc: Float32Array, dec: Float32Array) {
      const key = `${enc[0]}:${dec[0]}`;
      calls.push(key);
      const [tok, dur] = script.get(key) ?? [blank, 1];
      const logits = new Float32Array(blank + 1 + 5).fill(-10);
      logits[tok] = 5;
      logits[blank + 1 + dur] = 5;
      return logits;
    },
  };
}

describe("the token-and-duration search", () => {
  it("emits on a frame, stays there when told to, and jumps by the predicted duration", () => {
    // Six frames; the encoder frame is its own index.
    const enc = Float32Array.from([0, 1, 2, 3, 4, 5]);
    // Frame 0: token 3, stay (duration 0); then token 4, move 2; frame 2: blank, move 3; frame 5: token 1, move 1.
    const m = scripted(new Map([["0:0", [3, 0]], ["0:1", [4, 2]], ["2:2", [9, 3]], ["5:2", [1, 1]]]));
    return greedyTdt(enc, 6, 1, m).then((toks) => {
      expect(toks.map((t) => [t.id, t.frame])).toEqual([[3, 0], [4, 0], [1, 5]]);
      expect(m.calls).toEqual(["0:0", "0:1", "2:2", "5:2"]);
    });
  });

  it("moves on after five tokens on one frame, and a blank that says stay moves one", async () => {
    const script = new Map<string, [number, number]>();
    for (let k = 0; k < 8; k++) script.set(`0:${k}`, [2, 0]);
    script.set("1:5", [9, 0]);
    const toks = await greedyTdt(Float32Array.from([0, 1, 2]), 3, 1, scripted(script));
    expect(toks.filter((t) => t.frame === 0)).toHaveLength(5);
    expect(toks.every((t) => t.frame === 0)).toBe(true);
  });
});

describe("words from tokens", () => {
  const pieces = parseTokens(["<unk> 0", "▁Du 1", "▁har 2", "▁sik 3", "kert 4", ", 5", "▁set 6", ". 7", "<blk> 8"].join("\n"));
  it("joins pieces into words, keeps punctuation on its word, and skips special tokens", () => {
    const tok = (id: number, frame: number, dur = 1) => ({ id, frame, dur, logp: Math.log(0.9), t: frame * FRAME });
    const words = toWords([tok(1, 0), tok(2, 3), tok(3, 5), tok(4, 6), tok(5, 7), tok(0, 8), tok(6, 10, 2), tok(7, 12)], pieces);
    expect(words.map((w) => w.text)).toEqual(["Du", "har", "sikkert,", "set."]);
    expect(words[2].start).toBeCloseTo(5 * FRAME, 6);
    expect(words[2].end).toBeCloseTo(8 * FRAME, 6);
    expect(words[1].end).toBeLessThanOrEqual(words[2].start);
    expect(words[0].conf).toBeCloseTo(0.9, 6);
  });
});

describe("splitting long audio", () => {
  it("cuts in the quietest spot of each piece's last third, never past the limit", () => {
    const y = new Float32Array(16000 * 70).fill(0.1);
    // A pause at 25 s and one at 51 s.
    y.fill(0, 16000 * 25, 16000 * 25.3);
    y.fill(0, 16000 * 51, 16000 * 51.3);
    const chunks = chunkAudio(y, 28);
    expect(chunks[0][0]).toBe(0);
    expect(chunks[0][1] / 16000).toBeGreaterThan(25);
    expect(chunks[0][1] / 16000).toBeLessThan(25.3);
    expect(chunks[1][1] / 16000).toBeGreaterThan(51);
    expect(chunks[1][1] / 16000).toBeLessThan(51.3);
    for (const [a, b] of chunks) expect(b - a).toBeLessThanOrEqual(28 * 16000);
    expect(chunks[chunks.length - 1][1]).toBe(y.length);
  });
});

// The real model, when a copy is on this machine (tests/fixtures/parakeet-v3, not committed):
// the raw footage's first 20 s, heard the way sherpa-onnx hears it.
const MODEL = resolve(import.meta.dirname, "fixtures/parakeet-v3");
describe.skipIf(!existsSync(resolve(MODEL, "encoder.int8.onnx")) || !existsSync(resolve(import.meta.dirname, "fixtures/raw20.f32")))("the speech model", () => {
  it("hears Danish, punctuated, with each word's time", { timeout: 300_000 }, async () => {
    const ort = await import("onnxruntime-web/wasm");
    ort.env.wasm.numThreads = 1;
    const opts = { executionProviders: ["wasm"], graphOptimizationLevel: "all" } as const;
    const load = (f: string) => ort.InferenceSession.create(new Uint8Array(readFileSync(resolve(MODEL, f))), opts);
    const [encoder, decoder, joiner] = await Promise.all([load("encoder.int8.onnx"), load("decoder.int8.onnx"), load("joiner.int8.onnx")]);
    const pieces = parseTokens(readFileSync(resolve(MODEL, "tokens.txt"), "utf8"));
    const buf = readFileSync(resolve(import.meta.dirname, "fixtures/raw20.f32"));
    const y = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    const zeros = () => new Float32Array(1280);
    const words = await transcribe(
      y,
      async (feats, frames) => {
        const out = await encoder.run({ audio_signal: new ort.Tensor("float32", feats, [1, 128, frames]), length: new ort.Tensor("int64", BigInt64Array.from([BigInt(frames)]), [1]) });
        const o = out[encoder.outputNames[0]];
        const len = Number((out[encoder.outputNames[1]].data as BigInt64Array)[0]);
        const [, dim, total] = o.dims as number[];
        const src = o.data as Float32Array;
        const data = new Float32Array(len * dim);
        for (let d = 0; d < dim; d++) for (let t = 0; t < len; t++) data[t * dim + d] = src[d * total + t];
        return { data, frames: len, dim };
      },
      {
        blank: pieces.length - 1,
        async predict(token, state) {
          const [a, b, c, d] = decoder.inputNames;
          const out = await decoder.run({ [a]: new ort.Tensor("int32", Int32Array.from([token]), [1, 1]), [b]: new ort.Tensor("int32", Int32Array.from([1]), [1]), [c]: new ort.Tensor("float32", state?.h ?? zeros(), [2, 1, 640]), [d]: new ort.Tensor("float32", state?.c ?? zeros(), [2, 1, 640]) });
          const [o, , h, cc] = decoder.outputNames;
          return { out: out[o].data as Float32Array, state: { h: out[h].data as Float32Array, c: out[cc].data as Float32Array } };
        },
        async join(enc, dec) {
          const out = await joiner.run({ [joiner.inputNames[0]]: new ort.Tensor("float32", enc, [1, enc.length, 1]), [joiner.inputNames[1]]: new ort.Tensor("float32", dec, [1, dec.length, 1]) });
          return out[joiner.outputNames[0]].data as Float32Array;
        },
      },
      pieces,
    );
    const text = words.map((w) => w.text).join(" ");
    expect(text.startsWith("Du har")).toBe(true);
    expect(text).toContain("præcis samme måde.");
    expect(text).toContain("situation, som du var.");
    for (let i = 1; i < words.length; i++) expect(words[i].start).toBeGreaterThanOrEqual(words[i - 1].start);
    // "situation," is said about 16 s in.
    const sit = words.find((w) => w.text.startsWith("situation"))!;
    expect(sit.start).toBeGreaterThan(13);
    expect(sit.start).toBeLessThan(19);
  });
});

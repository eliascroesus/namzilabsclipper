/**
 * Reading the text on a frame: PP-OCRv4's detector (4.7 MB) finds every line
 * of text, and its recogniser (10.9 MB) reads a line (Latin letters, digits
 * and Chinese; æ, ø and å come back as their nearest letters, which is enough
 * to count a line's letters and see its case). Both run on ONNX Runtime's
 * WebAssembly build (public/models, Apache 2.0).
 */
import type { InferenceSession, Tensor } from "onnxruntime-web/wasm";

type Ort = typeof import("onnxruntime-web/wasm");

export interface Picture {
  /** RGBA, row by row */
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface TextBox {
  /** pixels of the picture it was found in */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** the detector's confidence, 0 to 1 */
  score: number;
  text?: string;
  /** the recogniser's confidence, 0 to 1 */
  conf?: number;
}

/** Bilinear resize of RGBA pixels into planes of B, G, R, each mapped by `norm`. */
function toPlanes(p: Picture, sx: number, sy: number, sw: number, sh: number, w: number, h: number, norm: (v: number) => number, padW = w): Float32Array {
  const plane = padW * h;
  const out = new Float32Array(3 * plane);
  const src = p.data;
  for (let y = 0; y < h; y++) {
    const fy = sy + ((y + 0.5) * sh) / h - 0.5;
    const y0 = Math.max(0, Math.min(p.height - 1, Math.floor(fy)));
    const y1 = Math.min(p.height - 1, y0 + 1);
    const wy = Math.max(0, Math.min(1, fy - y0));
    for (let x = 0; x < w; x++) {
      const fx = sx + ((x + 0.5) * sw) / w - 0.5;
      const x0 = Math.max(0, Math.min(p.width - 1, Math.floor(fx)));
      const x1 = Math.min(p.width - 1, x0 + 1);
      const wx = Math.max(0, Math.min(1, fx - x0));
      const a = (y0 * p.width + x0) * 4;
      const b = (y0 * p.width + x1) * 4;
      const c = (y1 * p.width + x0) * 4;
      const d = (y1 * p.width + x1) * 4;
      const q = y * padW + x;
      for (let ch = 0; ch < 3; ch++) {
        const v = (src[a + ch] * (1 - wx) + src[b + ch] * wx) * (1 - wy) + (src[c + ch] * (1 - wx) + src[d + ch] * wx) * wy;
        // BGR planes, as PaddleOCR reads pictures (OpenCV order)
        out[(2 - ch) * plane + q] = norm(v);
      }
    }
  }
  return out;
}

/**
 * Text boxes from the detector's probability map: pixels over 0.3, grown by one
 * (the 2 × 2 dilation PaddleOCR uses), joined into regions; a region whose mean
 * probability is 0.5 or more is a line, its box pushed out by area × 1.6 /
 * perimeter (the "unclip" that gives back the letters' edges).
 */
export function boxesFromMap(prob: Float32Array, w: number, h: number, scaleX: number, scaleY: number, thresh = 0.3, boxThresh = 0.5, unclip = 1.6): TextBox[] {
  const on = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (prob[i] > thresh) on[i] = 1;
  // 2 × 2 dilation
  const dil = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (on[i] || (x > 0 && on[i - 1]) || (y > 0 && on[i - w]) || (x > 0 && y > 0 && on[i - w - 1])) dil[i] = 1;
    }
  const label = new Int32Array(w * h).fill(-1);
  const boxes: TextBox[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!dil[s] || label[s] >= 0) continue;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    const id = boxes.length;
    label[s] = id;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i / w) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (j < 0 || j >= w * h) continue;
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) continue;
        if (dil[j] && label[j] < 0) {
          label[j] = id;
          stack.push(j);
        }
      }
    }
    // Mean probability over the box ("fast" scoring).
    let sum = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) sum += prob[y * w + x];
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const score = sum / (bw * bh);
    boxes.push({ x0, y0, x1, y1, score });
    if (Math.min(bw, bh) < 3 || score < boxThresh) boxes[id] = { x0: 0, y0: 0, x1: -1, y1: -1, score: -1 };
  }
  const out: TextBox[] = [];
  for (const b of boxes) {
    if (b.score < 0) continue;
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    const d = (bw * bh * unclip) / (2 * (bw + bh));
    out.push({ x0: (b.x0 - d) * scaleX, y0: (b.y0 - d) * scaleY, x1: (b.x1 + 1 + d) * scaleX, y1: (b.y1 + 1 + d) * scaleY, score: b.score });
  }
  return out.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}

/** CTC: the best class per step, repeats merged, blanks (0) dropped; "" past the dictionary is a space. */
export function ctcDecode(probs: Float32Array, steps: number, classes: number, keys: string[]): { text: string; conf: number } {
  let text = "";
  let last = -1;
  let sum = 0;
  let n = 0;
  for (let t = 0; t < steps; t++) {
    let k = 0;
    for (let c = 1; c < classes; c++) if (probs[t * classes + c] > probs[t * classes + k]) k = c;
    if (k !== 0 && k !== last) {
      text += k - 1 < keys.length ? keys[k - 1] : " ";
      sum += probs[t * classes + k];
      n++;
    }
    last = k;
  }
  return { text, conf: n ? sum / n : 0 };
}

export class TextReader {
  private static loading: Promise<TextReader> | null = null;

  private constructor(
    private readonly ort: Ort,
    private readonly det: InferenceSession,
    private readonly rec: InferenceSession,
    private readonly keys: string[],
  ) {}

  /** From model bytes (tests) or the site's models folder (the page). */
  static async create(ort: Ort, det: Uint8Array, rec: Uint8Array, keys: string[]): Promise<TextReader> {
    const opts = { executionProviders: ["wasm"], graphOptimizationLevel: "all" } as const;
    return new TextReader(ort, await ort.InferenceSession.create(det, opts), await ort.InferenceSession.create(rec, opts), keys);
  }

  static get(): Promise<TextReader> {
    if (!TextReader.loading) {
      TextReader.loading = (async () => {
        const ort = await import("onnxruntime-web/wasm");
        const { default: wasmUrl } = await import("onnxruntime-web/ort-wasm-simd-threaded.wasm?url");
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.wasmPaths = { wasm: wasmUrl };
        const base = `${import.meta.env.BASE_URL}models/`;
        const get = async (f: string) => {
          const r = await fetch(base + f);
          if (!r.ok) throw new Error(`The text reader didn't load (${f}: ${r.status}).`);
          return r;
        };
        const [det, rec, keys] = await Promise.all([get("ppocr-det.onnx").then((r) => r.arrayBuffer()), get("ppocr-rec.onnx").then((r) => r.arrayBuffer()), get("ppocr-keys.json").then((r) => r.json() as Promise<string[]>)]);
        return TextReader.create(ort, new Uint8Array(det), new Uint8Array(rec), keys);
      })();
      TextReader.loading.catch(() => (TextReader.loading = null));
    }
    return TextReader.loading;
  }

  /**
   * The lines of text in (a region of) a picture, looked at `side` pixels on its
   * long side. Boxes come back in the picture's pixels.
   */
  async find(p: Picture, side = 640, region?: { x: number; y: number; w: number; h: number }): Promise<TextBox[]> {
    const r = region ?? { x: 0, y: 0, w: p.width, h: p.height };
    const k = side / Math.max(r.w, r.h);
    const w = Math.max(32, Math.round((r.w * k) / 32) * 32);
    const h = Math.max(32, Math.round((r.h * k) / 32) * 32);
    const data = toPlanes(p, r.x, r.y, r.w, r.h, w, h, (v) => v / 127.5 - 1);
    const input = new this.ort.Tensor("float32", data, [1, 3, h, w]);
    const out = (await this.det.run({ [this.det.inputNames[0]]: input })) as Record<string, Tensor>;
    const prob = out[this.det.outputNames[0]].data as Float32Array;
    const boxes = boxesFromMap(prob, w, h, r.w / w, r.h / h).map((b) => ({ ...b, x0: Math.max(r.x, b.x0 + r.x), y0: Math.max(r.y, b.y0 + r.y), x1: Math.min(r.x + r.w, b.x1 + r.x), y1: Math.min(r.y + r.h, b.y1 + r.y) }));
    input.dispose();
    for (const t of Object.values(out)) t.dispose();
    return boxes;
  }

  /** Read one line: its box scaled to 48 pixels high. */
  async read(p: Picture, b: TextBox): Promise<{ text: string; conf: number }> {
    const bw = b.x1 - b.x0;
    const bh = b.y1 - b.y0;
    if (bw < 4 || bh < 4) return { text: "", conf: 0 };
    const h = 48;
    const w = Math.max(16, Math.min(960, Math.ceil((bw / bh) * h)));
    const padW = Math.max(320, Math.ceil(w / 8) * 8);
    const data = toPlanes(p, b.x0, b.y0, bw, bh, w, h, (v) => v / 127.5 - 1, padW);
    const input = new this.ort.Tensor("float32", data, [1, 3, h, padW]);
    const out = (await this.rec.run({ [this.rec.inputNames[0]]: input })) as Record<string, Tensor>;
    const o = out[this.rec.outputNames[0]];
    const [, steps, classes] = o.dims as number[];
    const res = ctcDecode(o.data as Float32Array, steps, classes, this.keys);
    input.dispose();
    for (const t of Object.values(out)) t.dispose();
    return res;
  }
}

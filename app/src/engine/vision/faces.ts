/**
 * Finding faces, so a crop keeps the person in it. YuNet, OpenCV's 230 KB face
 * detector (MIT licence, public/models), runs on ONNX Runtime's WebAssembly
 * build inside the page: it loads the first time it's needed, and nothing is
 * installed. A frame is looked at 320 pixels wide (a few milliseconds), which
 * finds any face bigger than about 3% of the frame; smaller ones don't decide a
 * crop anyway.
 */
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import type { InferenceSession, Tensor } from "onnxruntime-web/wasm";

export interface Face {
  /** centre and size, 0 to 1 of the picture */
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

type Ort = typeof import("onnxruntime-web/wasm");

const MODEL = `${import.meta.env.BASE_URL}models/yunet.onnx`;
const STRIDES = [8, 16, 32];

/** Faces from YuNet's raw outputs: per stride, a score and a box for each cell of the grid. */
export function decodeFaces(outputs: Record<string, { data: ArrayLike<number> }>, pw: number, ph: number, rw: number, rh: number, minScore = 0.6): Face[] {
  const found: Face[] = [];
  for (const s of STRIDES) {
    const cols = Math.floor(pw / s);
    const rows = Math.floor(ph / s);
    const cls = outputs[`cls_${s}`].data;
    const obj = outputs[`obj_${s}`].data;
    const box = outputs[`bbox_${s}`].data;
    for (let idx = 0; idx < cols * rows; idx++) {
      const score = Math.sqrt(Math.min(1, Math.max(0, cls[idx])) * Math.min(1, Math.max(0, obj[idx])));
      if (score < minScore) continue;
      const r = Math.floor(idx / cols);
      const c = idx - r * cols;
      const cx = (c + box[idx * 4]) * s;
      const cy = (r + box[idx * 4 + 1]) * s;
      const w = Math.exp(box[idx * 4 + 2]) * s;
      const h = Math.exp(box[idx * 4 + 3]) * s;
      found.push({ x: cx / rw, y: cy / rh, w: w / rw, h: h / rh, score });
    }
  }
  // Overlapping boxes of one face: keep the surest.
  found.sort((a, b) => b.score - a.score);
  const kept: Face[] = [];
  for (const f of found) {
    if (kept.every((k) => iou(f, k) < 0.3)) kept.push(f);
  }
  return kept.filter((f) => f.x > 0 && f.x < 1 && f.y > 0 && f.y < 1);
}

export function iou(a: Face, b: Face): number {
  const x0 = Math.max(a.x - a.w / 2, b.x - b.w / 2);
  const x1 = Math.min(a.x + a.w / 2, b.x + b.w / 2);
  const y0 = Math.max(a.y - a.h / 2, b.y - b.h / 2);
  const y1 = Math.min(a.y + a.h / 2, b.y + b.h / 2);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return inter / Math.max(1e-9, a.w * a.h + b.w * b.h - inter);
}

export class FaceFinder {
  private static loading: Promise<FaceFinder> | null = null;
  private readonly canvas = new OffscreenCanvas(32, 32);
  private readonly ctx = this.canvas.getContext("2d", { willReadFrequently: true, alpha: false })!;

  private constructor(
    private readonly ort: Ort,
    private readonly session: InferenceSession,
  ) {}

  /** The detector, loaded once (about 14 MB of runtime, cached by the browser after the first time). */
  static get(): Promise<FaceFinder> {
    if (!FaceFinder.loading) {
      FaceFinder.loading = (async () => {
        const ort = await import("onnxruntime-web/wasm");
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.wasmPaths = { wasm: wasmUrl };
        const res = await fetch(MODEL);
        if (!res.ok) throw new Error(`The face detector didn't load (${res.status}).`);
        const session = await ort.InferenceSession.create(new Uint8Array(await res.arrayBuffer()), { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
        return new FaceFinder(ort, session);
      })();
      FaceFinder.loading.catch(() => (FaceFinder.loading = null));
    }
    return FaceFinder.loading;
  }

  /**
   * The faces in a picture of aspect `aspect` (width / height), which `draw`
   * paints to fill the canvas it's given. `size` is the long side it's looked at.
   */
  async find(draw: (ctx: OffscreenCanvasRenderingContext2D) => void, aspect: number, size = 320, minScore = 0.6): Promise<Face[]> {
    const rw = Math.max(32, Math.round(aspect >= 1 ? size : size * aspect));
    const rh = Math.max(32, Math.round(aspect >= 1 ? size / aspect : size));
    const pw = Math.ceil(rw / 32) * 32;
    const ph = Math.ceil(rh / 32) * 32;
    if (this.canvas.width !== rw || this.canvas.height !== rh) {
      this.canvas.width = rw;
      this.canvas.height = rh;
    }
    draw(this.ctx);
    const px = this.ctx.getImageData(0, 0, rw, rh).data;
    // YuNet wants BGR planes of 0 to 255, padded to a multiple of 32 with black.
    const plane = pw * ph;
    const data = new Float32Array(3 * plane);
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        const p = (y * rw + x) * 4;
        const q = y * pw + x;
        data[q] = px[p + 2];
        data[plane + q] = px[p + 1];
        data[2 * plane + q] = px[p];
      }
    }
    const input = new this.ort.Tensor("float32", data, [1, 3, ph, pw]);
    const out = (await this.session.run({ input })) as Record<string, Tensor>;
    try {
      return decodeFaces(out as unknown as Record<string, { data: ArrayLike<number> }>, pw, ph, rw, rh, minScore);
    } finally {
      input.dispose();
      for (const t of Object.values(out)) t.dispose();
    }
  }
}

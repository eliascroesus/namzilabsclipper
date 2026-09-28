/**
 * Smart picks without a key: a small image model in the page looks at the same
 * contact-sheet frames Gemini would (sheets.ts) and says what each one shows and
 * how much it sells the life. It's TinyCLIP (Microsoft, MIT licence), an 8M
 * parameter image encoder, 9 MB with 8-bit weights, in public/models: a frame
 * becomes a point in the space where CLIP puts pictures and descriptions of
 * them, and the nearest descriptions ("a supercar", "a private jet", "a person
 * talking to the camera", "a computer screen with trading charts"...) decide its
 * kind. Those descriptions were turned into points once, offline
 * (tinyclip-text.json), so only the image half of the model runs here. On the
 * reference Reels it tells the supercars, jets and villas from the desks, charts
 * and title cards 96 times in 100 (ROC AUC 0.96).
 */
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import type { InferenceSession } from "onnxruntime-web/wasm";
import { KINDS, type Kind } from "../media/scan";
import type { Rating } from "./look";
import type { Sheets } from "./sheets";

type Ort = typeof import("onnxruntime-web/wasm");

const MODEL = `${import.meta.env.BASE_URL}models/tinyclip-s8.onnx`;
const TEXT = `${import.meta.env.BASE_URL}models/tinyclip-text.json`;
const SIZE = 224;
const MEAN = [0.48145466, 0.4578275, 0.40821073];
const STD = [0.26862954, 0.26130258, 0.27577711];
/** How sharply the nearest description wins (CLIP compares at 100; softer blends neighbours). */
const SHARPNESS = 50;

export const SENSE_VERSION = 2;

interface TextSpace {
  classes: { kind: Kind; flex: number; emb: number[] }[];
  wow: [number[], number[]];
}

/** A frame's rating from its image embedding (unit length): what it shows, how much it flexes, how striking it is. */
export function rate(embedding: ArrayLike<number>, text: TextSpace): Omit<Rating, "n"> {
  const dot = (e: number[]) => {
    let s = 0;
    for (let i = 0; i < e.length; i++) s += e[i] * embedding[i];
    return s;
  };
  const sims = text.classes.map((c) => dot(c.emb));
  const top = Math.max(...sims);
  const p = sims.map((s) => Math.exp(SHARPNESS * (s - top)));
  const z = p.reduce((a, b) => a + b, 0);
  let flex = 0;
  let best = 0;
  for (let c = 0; c < p.length; c++) {
    flex += (p[c] / z) * text.classes[c].flex;
    if (p[c] > p[best]) best = c;
  }
  const [up, down] = text.wow.map(dot);
  const wow = 10 / (1 + Math.exp(-SHARPNESS * (up - down)));
  const kind = text.classes[best].kind;
  return { kind: KINDS.includes(kind) ? kind : "other", flex, wow };
}

export class Senser {
  private static loading: Promise<Senser> | null = null;
  private readonly canvas = new OffscreenCanvas(SIZE, SIZE);
  private readonly ctx = this.canvas.getContext("2d", { willReadFrequently: true, alpha: false })!;

  private constructor(
    private readonly ort: Ort,
    private readonly session: InferenceSession,
    readonly text: TextSpace,
  ) {}

  /** The model, loaded once (9 MB, cached by the browser after the first time). */
  static get(): Promise<Senser> {
    if (!Senser.loading) {
      Senser.loading = (async () => {
        const ort = await import("onnxruntime-web/wasm");
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.wasmPaths = { wasm: wasmUrl };
        const [model, text] = await Promise.all([fetch(MODEL), fetch(TEXT)]);
        if (!model.ok || !text.ok) throw new Error(`The picture model didn't load (${model.ok ? text.status : model.status}).`);
        const session = await ort.InferenceSession.create(new Uint8Array(await model.arrayBuffer()), { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
        return new Senser(ort, session, (await text.json()) as TextSpace);
      })();
      Senser.loading.catch(() => (Senser.loading = null));
    }
    return Senser.loading;
  }

  /** Unit-length embeddings of pictures, each painted by `draws[i]` into a 224 square. */
  async embed(draws: ((ctx: OffscreenCanvasRenderingContext2D, size: number) => void)[]): Promise<Float32Array[]> {
    const plane = SIZE * SIZE;
    const data = new Float32Array(draws.length * 3 * plane);
    draws.forEach((draw, n) => {
      this.ctx.fillStyle = "#000";
      this.ctx.fillRect(0, 0, SIZE, SIZE);
      draw(this.ctx, SIZE);
      const px = this.ctx.getImageData(0, 0, SIZE, SIZE).data;
      const base = n * 3 * plane;
      for (let i = 0; i < plane; i++) {
        for (let c = 0; c < 3; c++) data[base + c * plane + i] = (px[i * 4 + c] / 255 - MEAN[c]) / STD[c];
      }
    });
    const input = new this.ort.Tensor("float32", data, [draws.length, 3, SIZE, SIZE]);
    const out = await this.session.run({ pixels: input });
    const e = out.embedding.data as Float32Array;
    const dim = e.length / draws.length;
    return draws.map((_, n) => {
      const v = e.slice(n * dim, (n + 1) * dim);
      let norm = 0;
      for (const x of v) norm += x * x;
      norm = Math.sqrt(norm) || 1;
      return v.map((x) => x / norm);
    });
  }
}

/** A cell of a contact sheet, drawn as the model wants it: its centre square, clear of the number in its corner. */
function cellDraw(sheet: ImageBitmap, grid: NonNullable<Sheets["grid"]>, k: number) {
  const x = (k % grid.cols) * grid.w;
  const y = Math.floor(k / grid.cols) * grid.h;
  const side = Math.min(grid.w, grid.h) - 8;
  const sx = x + (grid.w - side) / 2;
  const sy = y + (grid.h - side) / 2;
  return (ctx: OffscreenCanvasRenderingContext2D, size: number) => {
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(sheet, sx, sy, side, side, 0, 0, size, size);
  };
}

export interface SenseOptions {
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

/** Ratings for every frame on the sheets, numbered like Gemini's (from 1). */
export async function senseSheets(sheets: Sheets, o: SenseOptions = {}): Promise<Map<number, Rating>> {
  const out = new Map<number, Rating>();
  if (!sheets.grid || !sheets.cells.length) return out;
  const senser = await Senser.get();
  const total = sheets.cells.length;
  const BATCH = 8;
  for (let s = 0; s < sheets.images.length; s++) {
    if (o.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const first = sheets.firsts[s];
    const last = s + 1 < sheets.firsts.length ? sheets.firsts[s + 1] - 1 : total;
    const bitmap = await createImageBitmap(sheets.images[s]);
    try {
      for (let a = first; a <= last; a += BATCH) {
        const nums = Array.from({ length: Math.min(BATCH, last - a + 1) }, (_, i) => a + i);
        const embs = await senser.embed(nums.map((n) => cellDraw(bitmap, sheets.grid!, n - first)));
        nums.forEach((n, i) => out.set(n, { n, ...rate(embs[i], senser.text), emb: embs[i] }));
        o.onProgress?.(Math.min(1, (a + nums.length - 1) / total));
        if (o.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      }
    } finally {
      bitmap.close();
    }
  }
  return out;
}

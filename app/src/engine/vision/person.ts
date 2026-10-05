/**
 * Who's in front: the person in a frame, as a mask, so captions can be set behind them
 * (the speaker cut out and laid back over the words, as CapCut's "text behind" and the
 * jiia and Mochi edits do). MediaPipe's selfie segmenter (250 KB, Apache 2.0, on its
 * vision runtime) finds the person at 256 pixels square, a dark shirt included; the mask
 * is then snapped to the frame's own edges (a guided filter at about 512 pixels, so hair
 * and shoulders keep their outline), steadied over time (each frame leans on the last
 * unless the picture changed, so the edge doesn't shimmer), and tightened, then handed
 * back as a picture whose opacity is the person.
 */
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import type { ImageSegmenter } from "@mediapipe/tasks-vision";

const MODEL = `${import.meta.env.BASE_URL}models/selfie-segmenter.tflite`;

/** The long side the mask is worked out at. */
export const MASK_SIDE = 512;

/** A running box mean of radius r over a w × h plane (edges clamped), in O(w·h). */
export function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  // Along rows, then down columns.
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / (2 * r + 1);
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / (2 * r + 1);
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * He, Sun and Tang's guided filter: the mask `p` made to follow the edges of the picture
 * `I` (its brightness, 0 to 1), within radius r; eps sets how strong an edge has to be.
 */
export function guidedFilter(I: Float32Array, p: Float32Array, w: number, h: number, r: number, eps: number): Float32Array {
  const n = w * h;
  const II = new Float32Array(n);
  const Ip = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    II[i] = I[i] * I[i];
    Ip[i] = I[i] * p[i];
  }
  const mI = boxMean(I, w, h, r);
  const mp = boxMean(p, w, h, r);
  const mII = boxMean(II, w, h, r);
  const mIp = boxMean(Ip, w, h, r);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = mII[i] - mI[i] * mI[i];
    const c = mIp[i] - mI[i] * mp[i];
    a[i] = c / (v + eps);
    b[i] = mp[i] - a[i] * mI[i];
  }
  const ma = boxMean(a, w, h, r);
  const mb = boxMean(b, w, h, r);
  const q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = Math.min(1, Math.max(0, ma[i] * I[i] + mb[i]));
  return q;
}

/** A soft threshold: the mask's middle values pushed out, so the edge is firm but not jagged. */
export function firm(m: Float32Array, lo = 0.25, hi = 0.75): Float32Array {
  const out = new Float32Array(m.length);
  for (let i = 0; i < m.length; i++) {
    const u = Math.min(1, Math.max(0, (m[i] - lo) / (hi - lo)));
    out[i] = u * u * (3 - 2 * u);
  }
  return out;
}

/** The size the mask is worked out at for a w × h frame. */
export function maskSize(w: number, h: number): [number, number] {
  const k = MASK_SIDE / Math.max(w, h);
  return [Math.max(16, Math.round(w * k)), Math.max(16, Math.round(h * k))];
}

/** Bilinear resample of a plane. */
function resample(src: Float32Array, sw: number, sh: number, w: number, h: number): Float32Array {
  if (sw === w && sh === h) return src;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1, Math.max(0, ((y + 0.5) * sh) / h - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1, Math.max(0, ((x + 0.5) * sw) / w - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const wx = fx - x0;
      out[y * w + x] = (src[y0 * sw + x0] * (1 - wx) + src[y0 * sw + x1] * wx) * (1 - wy) + (src[y1 * sw + x0] * (1 - wx) + src[y1 * sw + x1] * wx) * wy;
    }
  }
  return out;
}

export class PersonMasker {
  private static loading: Promise<PersonMasker> | null = null;
  private readonly work: OffscreenCanvas;
  private readonly wctx: OffscreenCanvasRenderingContext2D;
  private readonly out: OffscreenCanvas;
  private readonly octx: OffscreenCanvasRenderingContext2D;
  private last: { t: number; guide: Float32Array; mask: Float32Array; w: number; h: number } | null = null;

  private constructor(private readonly seg: ImageSegmenter) {
    this.work = new OffscreenCanvas(16, 16);
    this.wctx = this.work.getContext("2d", { willReadFrequently: true })!;
    this.out = new OffscreenCanvas(16, 16);
    this.octx = this.out.getContext("2d")!;
  }

  /** The segmenter, loaded once (MediaPipe's vision runtime, about 11 MB, cached by the browser after the first time). */
  static get(): Promise<PersonMasker> {
    if (!PersonMasker.loading) {
      PersonMasker.loading = (async () => {
        const { ImageSegmenter } = await import("@mediapipe/tasks-vision");
        const seg = await ImageSegmenter.createFromOptions({ wasmLoaderPath, wasmBinaryPath }, { baseOptions: { modelAssetPath: MODEL, delegate: "CPU" }, runningMode: "IMAGE", outputConfidenceMasks: true, outputCategoryMask: false });
        return new PersonMasker(seg);
      })();
      PersonMasker.loading.catch(() => (PersonMasker.loading = null));
    }
    return PersonMasker.loading;
  }

  /**
   * The person in a frame: `draw` paints the frame to fill the canvas it's given (w × h is
   * the frame's shape). `t` is the frame's time: a mask follows on from the last one (a
   * twentieth of a second earlier or less, the picture much the same) smoothly. Returns a
   * canvas at the working size whose opacity is the person; draw it over the frame's size.
   */
  mask(draw: (ctx: OffscreenCanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number, t: number): OffscreenCanvas {
    const { data: raw, width: mw, height: mh } = this.plane(draw, w, h, t);
    const out = this.octx.createImageData(mw, mh);
    for (let i = 0; i < raw.length; i++) {
      out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = 255;
      out.data[i * 4 + 3] = Math.round(raw[i] * 255);
    }
    this.octx.putImageData(out, 0, 0);
    return this.out;
  }

  /** The same, as values 0 to 1 at the working size (for measuring, not drawing). */
  plane(draw: (ctx: OffscreenCanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number, t: number): { data: Float32Array; width: number; height: number } {
    const [mw, mh] = maskSize(w, h);
    if (this.work.width !== mw || this.work.height !== mh) {
      this.work.width = this.out.width = mw;
      this.work.height = this.out.height = mh;
    }
    this.wctx.clearRect(0, 0, mw, mh);
    draw(this.wctx, mw, mh);
    const img = this.wctx.getImageData(0, 0, mw, mh);
    const guide = new Float32Array(mw * mh);
    for (let i = 0; i < mw * mh; i++) guide[i] = (0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2]) / 255;
    const res = this.seg.segment(img);
    const masks = res.confidenceMasks ?? [];
    const m = masks[masks.length > 1 ? 1 : 0];
    let raw = m ? resample(m.getAsFloat32Array(), m.width, m.height, mw, mh) : new Float32Array(mw * mh);
    masks.forEach((x) => x.close());
    // Snapped to the picture's edges, then firmed up.
    const r = Math.max(2, Math.round(Math.max(mw, mh) / 96));
    raw = firm(guidedFilter(guide, raw, mw, mh, r, 0.002));
    // Steadied: leaning on the last frame's mask when this follows on from it.
    const prev = this.last;
    if (prev && prev.w === mw && prev.h === mh && t > prev.t && t - prev.t < 0.06) {
      let diff = 0;
      for (let i = 0; i < guide.length; i += 7) diff += Math.abs(guide[i] - prev.guide[i]);
      if (diff / (guide.length / 7) < 0.08) for (let i = 0; i < raw.length; i++) raw[i] = 0.6 * raw[i] + 0.4 * prev.mask[i];
    }
    this.last = { t, guide, mask: raw, w: mw, h: mh };
    return { data: raw, width: mw, height: mh };
  }

  /** Forget the last frame (a new render, or a jump). */
  reset() {
    this.last = null;
  }
}

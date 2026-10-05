/**
 * A video file as the analyzer reads it, in the browser: its frames decoded in
 * order and shrunk on a canvas, pictures at chosen times, its sound at 16 kHz,
 * and small pictures of parts of it for the page.
 */
import { VideoSampleSink } from "mediabunny";
import { decodeMono, type Source } from "../../engine/media/sources";
import { FaceFinder } from "../../engine/vision/faces";
import { PersonMasker } from "../../engine/vision/person";
import { FONTS, loadFontsFor } from "../../engine/text/library";
import { PLAIN_STYLE, setStyleFont } from "../../engine/text/style";
import type { Renderer } from "./fontmatch";
import type { Gray } from "./cards";
import type { Picture } from "./ocr";
import type { FrameSource } from "./reference";
import type { Plane } from "./words";

export function frameSource(src: Source): FrameSource {
  const video = src.video;
  if (!video) throw new Error(`${src.info.name} has no picture.`);
  const first = video.getFirstTimestamp().catch(() => 0);
  const canvasFor = (w: number, h: number) => {
    const c = new OffscreenCanvas(w, h);
    return c.getContext("2d", { willReadFrequently: true, alpha: false })!;
  };
  return {
    name: src.info.name,
    duration: src.info.duration,
    width: src.info.width,
    height: src.info.height,
    fps: src.info.fps || 30,
    async frames(w, h, each, signal) {
      const ctx = canvasFor(w, h);
      const t0 = await first;
      for await (const sample of new VideoSampleSink(video).samples()) {
        try {
          if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
          sample.drawWithFit(ctx, { fit: "fill" });
          const px = ctx.getImageData(0, 0, w, h).data;
          const g = new Uint8Array(w * h);
          for (let i = 0; i < w * h; i++) g[i] = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
          each(sample.timestamp - t0, { data: g, width: w, height: h } satisfies Gray);
        } finally {
          sample.close();
        }
      }
    },
    async pictures(times, w, h, each, signal) {
      const ctx = canvasFor(w, h);
      const t0 = await first;
      let i = 0;
      for await (const sample of new VideoSampleSink(video).samplesAtTimestamps(times.map((t) => t + t0))) {
        const t = times[i++];
        if (!sample) continue;
        try {
          if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
          sample.drawWithFit(ctx, { fit: "fill" });
          await each(t, { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h } satisfies Picture);
        } finally {
          sample.close();
        }
      }
    },
    audio: () => (src.info.hasAudio ? decodeMono(src, 16000) : Promise.resolve(new Float32Array(Math.round(src.info.duration * 16000)))),
    async thumb(t, rect) {
      const t0 = await first;
      const sink = new VideoSampleSink(video);
      const sample = await sink.getSample(t + t0);
      if (!sample) return undefined;
      try {
        const W = src.info.width;
        const H = src.info.height;
        const [x, y, w, h] = rect ?? [0, 0, 1, 1];
        const k = 200 / Math.max(w * W, h * H);
        const c = new OffscreenCanvas(Math.max(8, Math.round(w * W * k)), Math.max(8, Math.round(h * H * k)));
        const ctx = c.getContext("2d")!;
        sample.draw(ctx, x * W, y * H, w * W, h * H, 0, 0, c.width, c.height);
        const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.8 });
        return await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.readAsDataURL(blob);
        });
      } finally {
        sample.close();
      }
    },
  };
}

/**
 * Words drawn in the library's faces, their letters cut out (for matching a reference's
 * fonts): every face loaded once, then each word drawn white on a cleared canvas.
 */
export async function fontRenderer(): Promise<Renderer> {
  await loadFontsFor(FONTS.map((f) => f.id));
  const c = new OffscreenCanvas(64, 64);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  return (f, weight, stretch, italic, px, text, tracking = 0) => {
    const st = { ...PLAIN_STYLE, font: f.id, weight, stretch, italic, tracking, shadow: null };
    setStyleFont(ctx, st, px);
    const m = ctx.measureText(text);
    // (Room for the spacing however the canvas counts it in the box.)
    const pad = 2 + Math.ceil(Math.abs(tracking) * px * [...text].length);
    const w = Math.ceil((m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || m.width)) + 2 * pad;
    const asc = Math.ceil(m.actualBoundingBoxAscent || px) + pad;
    const h = asc + Math.ceil(m.actualBoundingBoxDescent || 0.3 * px) + pad;
    if (w < 2 || h < 2 || w > 4000 || h > 2000) return null;
    if (c.width < w || c.height < h) {
      c.width = Math.max(c.width, w);
      c.height = Math.max(c.height, h);
    }
    ctx.clearRect(0, 0, c.width, c.height);
    setStyleFont(ctx, st, px);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, pad + (m.actualBoundingBoxLeft || 0), asc);
    const img = ctx.getImageData(0, 0, w, h).data;
    // Cropped to the ink.
    let x0 = w;
    let x1 = -1;
    let y0 = h;
    let y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (img[(y * w + x) * 4 + 3] > 127) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 < x0) return null;
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;
    const data = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) data[y * cw + x] = img[((y0 + y) * w + x0 + x) * 4 + 3] > 127 ? 1 : 0;
    return { w: cw, h: ch, data, base: asc - y0 };
  };
}

/** The person in an analysis picture (0 to 1 at the masker's working size), with the page's person masker. */
export async function personIn(p: Picture): Promise<Plane | null> {
  const masker = await PersonMasker.get().catch(() => null);
  if (!masker) return null;
  const c = new OffscreenCanvas(p.width, p.height);
  c.getContext("2d")!.putImageData(new ImageData(Uint8ClampedArray.from(p.data), p.width, p.height), 0, 0);
  masker.reset();
  return masker.plane((ctx, w, h) => ctx.drawImage(c, 0, 0, w, h), p.width, p.height, -1);
}

/** Faces in an analysis picture (centre and size as shares of it), with the page's face finder. */
export async function facesIn(p: Picture): Promise<{ x: number; y: number; w: number; h: number }[]> {
  const finder = await FaceFinder.get();
  const img = new ImageData(Uint8ClampedArray.from(p.data), p.width, p.height);
  const c = new OffscreenCanvas(p.width, p.height);
  c.getContext("2d")!.putImageData(img, 0, 0);
  return finder.find((ctx) => ctx.drawImage(c, 0, 0, ctx.canvas.width, ctx.canvas.height), p.width / p.height);
}

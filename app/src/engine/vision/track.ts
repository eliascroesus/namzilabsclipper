/**
 * Following people through an edit, just before it renders: each shot's stretch
 * of footage is looked at eight times a second for faces (a few dozen frames per
 * shot at most), and its crop is set to keep them in frame (framing.ts). Photos
 * get one look, and their slow push drifts towards the face.
 */
import { VideoSampleSink } from "mediabunny";
import type { Scan } from "../media/scan";
import type { Source } from "../media/sources";
import { frameShot, kenBurns, windowSize, type FaceSample } from "../plan/framing";
import { FRAME_SIZE, outputAt, sourceAt, sourceSpan, type EditPlan } from "../plan/types";
import { FaceFinder } from "./faces";

export interface FollowOptions {
  signal?: AbortSignal;
  onProgress?: (p: number) => void;
  /** looks per second of footage */
  rate?: number;
}

const cancelled = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
};

/** Re-frame every shot of a plan around the people in it (in place). */
export async function followFaces(plan: EditPlan, sources: Map<string, Source>, scans: Map<string, Scan>, opts: FollowOptions = {}): Promise<void> {
  const finder = await FaceFinder.get();
  const [W, H] = FRAME_SIZE[plan.aspect];
  const rate = opts.rate ?? 8;
  const sinks = new Map<string, VideoSampleSink>();
  for (const [k, shot] of plan.shots.entries()) {
    cancelled(opts.signal);
    opts.onProgress?.(k / plan.shots.length);
    const src = sources.get(shot.source);
    const scan = scans.get(shot.source);
    if (!src || !scan || shot.crop.fit === "fit") continue;
    // Nothing to choose when the whole picture fills the frame.
    const [fx, fy] = windowSize(scan.width / Math.max(1, scan.height), W / H, Math.max(shot.crop.zoom0, shot.crop.zoom1));
    if (fx >= 0.999 && fy >= 0.999) continue;
    if (shot.kind === "image") {
      const img = src.image;
      if (!img) continue;
      const faces = await finder.find((ctx) => ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height), img.width / img.height, 480);
      if (!faces.length) continue;
      const framed = frameShot({ scan, a: 0, b: 0, aspect: plan.aspect, faces: [{ t: 0, faces }], zoom0: shot.crop.zoom0, zoom1: shot.crop.zoom1 });
      shot.crop = kenBurns(shot.crop, [framed.cx, framed.cy], shot.crop.zoom1 > shot.crop.zoom0);
      continue;
    }
    if (!src.video) continue;
    const a = shot.srcStart;
    const b = a + sourceSpan(shot);
    const d = shot.end - shot.start;
    // Evenly through the shot as it plays (a speed ramp spends longer on some of the footage).
    const n = Math.max(3, Math.min(48, Math.round(d * rate)));
    const times = Array.from({ length: n }, (_, i) => a + sourceAt(shot, ((i + 0.5) * d) / n));
    let sink = sinks.get(shot.source);
    if (!sink) sinks.set(shot.source, (sink = new VideoSampleSink(src.video)));
    const samples: FaceSample[] = [];
    let i = 0;
    for await (const sample of sink.samplesAtTimestamps(times)) {
      const at = times[i++];
      if (!sample) continue;
      try {
        cancelled(opts.signal);
        const faces = await finder.find((ctx) => sample.drawWithFit(ctx, { fit: "fill" }), sample.displayWidth / Math.max(1, sample.displayHeight), 480);
        samples.push({ t: at, faces });
      } finally {
        sample.close();
      }
    }
    const framed = frameShot({ scan, a, b, aspect: plan.aspect, faces: samples, speed: shot.speed, toOut: (t) => outputAt(shot, t - a), zoom0: shot.crop.zoom0, zoom1: shot.crop.zoom1 });
    shot.crop = { ...framed, zoom0: shot.crop.zoom0, zoom1: shot.crop.zoom1 };
  }
  opts.onProgress?.(1);
}

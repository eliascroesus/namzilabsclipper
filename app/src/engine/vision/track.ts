/**
 * Following people through an edit, just before it renders: each shot's stretch
 * of footage is looked at eight times a second for faces (a few dozen frames per
 * shot at most), and its crop is set to keep them in frame (framing.ts). Photos
 * get one look, and their slow push drifts towards the face.
 */
import { VideoSampleSink } from "mediabunny";
import type { Scan } from "../media/scan";
import type { Source } from "../media/sources";
import { centreAt, frameShot, kenBurns, windowSize, type FaceSample } from "../plan/framing";
import { FRAME_SIZE, outputAt, sourceAt, sourceSpan, type EditPlan } from "../plan/types";
import { FaceFinder, type Face } from "./faces";

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

/**
 * The face a picture is of: the biggest, nearer the middle counting for more (the
 * person the shot is about, not a half face at the edge), or when following one through
 * a shot, the one nearest where it was (positions as seen in the frame).
 */
function main(faces: Face[], was?: Face): Face | null {
  const score = (f: Face) => (was ? -Math.hypot(f.x - was.x, f.y - was.y) : f.w * f.h * Math.max(0.1, 1.2 - 2 * Math.hypot(f.x - 0.5, f.y - 0.45)));
  return faces.reduce<Face | null>((b, f) => (!b || score(f) > score(b) ? f : b), null);
}

/**
 * Pictures that go on someone's head (nio.trade's photos landing on the head of whoever
 * is in the shot, one after another on the hits): the shot under each is looked at
 * eight times a second for the face, and the picture follows it, about twice the face's
 * height and a little above its middle; a picture cropped to its own face gets one look
 * for it and fills the card with the face half its height (one with no face in it lands
 * whole, bigger). A picture over a shot where no face turns up is left out. In place.
 */
export async function placeOverlays(plan: EditPlan, sources: Map<string, Source>, opts: FollowOptions = {}): Promise<void> {
  const over = (plan.overlays ?? []).filter((o) => o.place);
  if (!over.length) return;
  const finder = await FaceFinder.get();
  const out = plan.width / plan.height;
  const sinks = new Map<string, VideoSampleSink>();
  const sinkFor = (id: string) => {
    let sink = sinks.get(id);
    const v = sources.get(id)?.video;
    if (!sink && v) sinks.set(id, (sink = new VideoSampleSink(v)));
    return sink;
  };
  const rate = opts.rate ?? 8;
  // The face the last picture on a head followed, in the frame (the next one lands on the same person).
  let was: Face | undefined;
  let wasShot: unknown;
  for (const o of over) {
    cancelled(opts.signal);
    // A picture with no face in it lands whole, bigger, over the person instead of as their head.
    let faceless = false;
    if (o.place?.crop === "face") {
      let faces: Face[] = [];
      let aspect = 1;
      const src = sources.get(o.source);
      if (o.kind === "image" && src?.image) {
        const img = src.image;
        aspect = img.width / Math.max(1, img.height);
        faces = await finder.find((ctx) => ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height), aspect, 480);
      } else {
        const sink = sinkFor(o.source);
        if (sink) {
          for await (const sample of sink.samplesAtTimestamps([o.srcStart])) {
            if (!sample) continue;
            try {
              aspect = sample.displayWidth / Math.max(1, sample.displayHeight);
              faces = await finder.find((ctx) => sample.drawWithFit(ctx, { fit: "fill" }), aspect, 480);
            } finally {
              sample.close();
            }
          }
        }
      }
      const f = main(faces);
      if (f) {
        o.cx = f.x;
        o.cy = f.y - 0.1 * f.h;
        o.zoom = Math.max(1, windowSize(aspect, o.aspect, 1)[1] / Math.min(1, f.h / 0.5));
      } else {
        faceless = true;
        o.aspect = Math.min(1.6, Math.max(0.62, aspect));
        [o.cx, o.cy, o.zoom] = [0.5, 0.5, 1];
      }
    }
    if (o.place?.on !== "head") continue;
    const shot = plan.shots.find((s) => o.start >= s.start - 1e-6 && o.start < s.end - 1e-6);
    const sink = shot?.kind === "video" ? sinkFor(shot.source) : undefined;
    if (!shot || !sink) {
      o.end = o.start;
      continue;
    }
    if (shot !== wasShot) was = undefined;
    wasShot = shot;
    const d = shot.end - shot.start;
    const span = Math.min(o.end, shot.end) - o.start;
    const n = Math.max(2, Math.min(24, Math.round(span * rate) + 1));
    const taus = Array.from({ length: n }, (_, i) => (i * span) / (n - 1));
    const times = taus.map((tau) => shot.srcStart + sourceAt(shot, o.start - shot.start + tau));
    const keys: number[][] = [];
    let i = 0;
    for await (const sample of sink.samplesAtTimestamps(times)) {
      const tau = taus[i++];
      if (!sample) continue;
      try {
        cancelled(opts.signal);
        const aspect = sample.displayWidth / Math.max(1, sample.displayHeight);
        const faces = await finder.find((ctx) => sample.drawWithFit(ctx, { fit: "fill" }), aspect, 480);
        // Where each face is in the frame: through the shot's crop at that moment (as the compositor draws it).
        const c = shot.crop;
        const r = c.rect ?? [0, 0, 1, 1];
        const [rw, rh] = [r[2] - r[0], r[3] - r[1]];
        const q = (o.start - shot.start + tau) / Math.max(1e-6, d);
        const [fx, fy] = windowSize((aspect * rw) / rh, out, c.zoom0 + (c.zoom1 - c.zoom0) * q);
        const [ccx, ccy] = centreAt(c, o.start - shot.start + tau, d);
        const cx = Math.min(Math.max(ccx, fx / 2), 1 - fx / 2);
        const cy = Math.min(Math.max(ccy, fy / 2), 1 - fy / 2);
        const seen: Face[] = faces
          .map((f) => ({ ...f, x: ((f.x - r[0]) / rw - cx) / fx + 0.5, y: ((f.y - r[1]) / rh - cy) / fy + 0.5, w: f.w / rw / fx, h: f.h / rh / fy }))
          .filter((f) => f.x > 0.04 && f.x < 0.96 && f.y > 0.04 && f.y < 0.96);
        // (The one it lands on, then the same one through the shot and from one picture to the next.)
        const f = main(seen, was);
        if (!f) continue;
        was = f;
        keys.push(faceless ? [tau, f.x, f.y + 0.3 * f.h, 2.9 * f.h] : [tau, f.x, f.y - 0.1 * f.h, 1.9 * f.h]);
      } finally {
        sample.close();
      }
    }
    // No face in it after all: no picture on a head that isn't there.
    if (!keys.length) {
      o.end = o.start;
      continue;
    }
    // Steadied: each key the mean of it and its neighbours (a detector's box wobbles a little).
    const path: number[] = [];
    for (let k = 0; k < keys.length; k++) {
      const near = keys.slice(Math.max(0, k - 1), k + 2);
      path.push(keys[k][0], ...[1, 2, 3].map((m) => near.reduce((a, v) => a + v[m], 0) / near.length));
    }
    o.path = path;
  }
  plan.overlays = (plan.overlays ?? []).filter((o) => o.end > o.start);
  opts.onProgress?.(1);
}

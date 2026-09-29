/**
 * The cuts a long video's skim doesn't see. A long video is skimmed a frame every
 * second or two (scan.ts), which is enough to judge its moments but not to find
 * every cut of a vlog that cuts every second: a shot taken from it can run over one
 * and flash to another scene halfway through, off the beat. This looks at every
 * frame of a stretch and finds its cuts to the frame; plan/settle.ts uses it on
 * the stretches an edit uses, and plans around what it finds.
 */
import { VideoSampleSink } from "mediabunny";
import type { Scan } from "./scan";
import type { Source } from "./sources";

const W = 32;
const H = 18;
/**
 * Frames are drawn this many times larger and averaged down. Shrinking a frame 25
 * times in one step samples it rather than averaging it, and the flicker that adds
 * between frames (0.09 where it should be 0.07) raised the bar enough for real cuts
 * to slip under it: on an 8 minute vlog, three that got into an edit.
 */
const OVER = 4;

/** How different two frames look, 0 to 1: colours moving between bins, or the picture changing in place. */
function change(h0: Float32Array, h1: Float32Array, l0: Float32Array, l1: Float32Array): number {
  let hist = 0;
  for (let k = 0; k < h0.length; k++) hist += Math.abs(h0[k] - h1[k]);
  let luma = 0;
  for (let k = 0; k < l0.length; k++) luma += Math.abs(l0[k] - l1[k]);
  return Math.max(hist / 2, (1.6 * luma) / l0.length);
}

/**
 * Where the shot changes between consecutive frames: a jump well above the frames
 * around it (so steady fast motion doesn't count), returned as indexes of the
 * first frame of each new shot. The jump itself can be small (two golden-hour
 * shots share their colours, a cut from black to a dim room) as long as it stands out.
 */
export function cutFrames(changes: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 1; i < changes.length; i++) {
    const around: number[] = [];
    for (let k = Math.max(1, i - 5); k <= Math.min(changes.length - 1, i + 5); k++) if (k !== i) around.push(changes[k]);
    around.sort((a, b) => a - b);
    // The median, halfway between the middle two: a cut from a still shot into a
    // shaky one has five calm frames on one side and five busy ones on the other,
    // and the upper of the middle two would set the bar by the shake alone.
    const m = around.length >> 1;
    const typical = !around.length ? 0 : around.length % 2 ? around[m] : (around[m - 1] + around[m]) / 2;
    if (changes[i] > 0.12 && changes[i] > 3 * typical + 0.05) out.push(i);
  }
  return out;
}

/** The exact cuts in [a, b) of a video, looking at every frame: the times of the first frames of new shots. */
export async function findCuts(src: Source, a: number, b: number, signal?: AbortSignal): Promise<number[]> {
  const { times, changes } = await frameChanges(src, a, b, signal);
  return cutFrames(changes).map((i) => times[i]);
}

/** Every frame of [a, b) of a video, with how different it looks from the frame before (see change). */
export async function frameChanges(src: Source, a: number, b: number, signal?: AbortSignal): Promise<{ times: number[]; changes: number[] }> {
  if (!src.video) return { times: [], changes: [] };
  const canvas = new OffscreenCanvas(W * OVER, H * OVER);
  const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: false })!;
  const times: number[] = [];
  const changes: number[] = [];
  let prevH: Float32Array | null = null;
  let prevL: Float32Array | null = null;
  const rgb = new Float32Array(W * H * 3);
  for await (const sample of new VideoSampleSink(src.video).samples(a, b)) {
    try {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      sample.drawWithFit(ctx, { fit: "fill" });
      const px = ctx.getImageData(0, 0, W * OVER, H * OVER).data;
      rgb.fill(0);
      for (let y = 0; y < H * OVER; y++) {
        const row = ((y / OVER) | 0) * W;
        for (let x = 0; x < W * OVER; x++) {
          const p = (y * W * OVER + x) * 4;
          const q = (row + ((x / OVER) | 0)) * 3;
          rgb[q] += px[p];
          rgb[q + 1] += px[p + 1];
          rgb[q + 2] += px[p + 2];
        }
      }
      const hist = new Float32Array(64);
      const luma = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) {
        const r = rgb[i * 3] / (OVER * OVER);
        const g = rgb[i * 3 + 1] / (OVER * OVER);
        const bl = rgb[i * 3 + 2] / (OVER * OVER);
        hist[((r >> 6) << 4) | ((g >> 6) << 2) | (bl >> 6)] += 1 / (W * H);
        luma[i] = (0.299 * r + 0.587 * g + 0.114 * bl) / 255;
      }
      changes.push(prevH && prevL ? change(prevH, hist, prevL, luma) : 0);
      times.push(sample.timestamp);
      prevH = hist;
      prevL = luma;
    } finally {
      sample.close();
    }
  }
  return { times, changes };
}

/** Finds the exact cuts in the stretch [a, b] of a scanned video's source. */
export type CutFinder = (scan: Scan, a: number, b: number) => Promise<number[]>;

/** Records a stretch looked at frame by frame, and the cuts found in it. */
export function noteChecked(scan: Scan, a: number, b: number, cuts: number[]) {
  const frame = 1 / (scan.fps ?? 30);
  const exact = [...(scan.exactCuts ?? [])];
  for (const c of cuts) if (!exact.some((e) => Math.abs(e - c) < 0.5 * frame)) exact.push(c);
  scan.exactCuts = exact.sort((x, y) => x - y);
  const ranges = [...(scan.checked ?? []), [a, b] as [number, number]].sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [x, y] of ranges) {
    const last = merged[merged.length - 1];
    if (last && x <= last[1] + 1e-6) last[1] = Math.max(last[1], y);
    else merged.push([x, y]);
  }
  scan.checked = merged;
}

/** The finder for real footage: decodes the stretch of the source. */
export const cutFinder =
  (sources: Map<string, Source>, signal?: AbortSignal): CutFinder =>
  async (scan, a, b) => {
    const src = sources.get(scan.id);
    return src ? findCuts(src, a, b, signal) : [];
  };

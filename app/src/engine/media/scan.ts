/**
 * Looking at footage the way an editor skims it: a small frame several times a
 * second, measured for sharpness, exposure, colour, movement and people, plus
 * where in the frame the interest sits (for crops) and where the shots change.
 */
import { EncodedPacketSink, VideoSampleSink, type InputVideoTrack } from "mediabunny";
import type { Source } from "./sources";
import { SheetMaker, type Sheets } from "../vision/sheets";

/** Columns and rows in the saliency profiles. */
export const PROFILE_BINS = 32;
const HIST_BINS = 64; // 4 × 4 × 4 RGB
const ANALYSIS_AREA = 192 * 108;

export interface FrameStats {
  /** sample times, seconds into the source */
  t: Float32Array;
  luma: Float32Array;
  contrast: Float32Array;
  /** log variance of the Laplacian */
  sharp: Float32Array;
  /** Hasler–Süsstrunk colourfulness / 100 */
  color: Float32Array;
  /** share of pixels in the skin-tone range */
  skin: Float32Array;
  /** mean absolute luma change from the previous sample, per second */
  motion: Float32Array;
  /** 4×4×4 RGB histogram per sample, normalised */
  hist: Float32Array;
  /** where the interest sits: per-column and per-row saliency, normalised per sample */
  cols: Float32Array;
  rows: Float32Array;
  /** mean colour per sample, 0 to 1 */
  rgb: Float32Array;
  /** black bars per sample: top, bottom, left and right, as fractions of the frame */
  bars?: Float32Array;
}

export interface Scan {
  id: string;
  kind: "video" | "image";
  /** the first frame's time; every time in a scan is on the file's own clock */
  start: number;
  duration: number;
  width: number;
  height: number;
  rate: number;
  /** the video's own frame rate */
  fps?: number;
  stats: FrameStats;
  /** shot boundaries inside the source, in seconds (not including 0 and the end), as the skim found them */
  cuts: number[];
  /** cuts found to the frame by looking at every frame of a stretch (media/cuts.ts): the first frame of each new shot */
  exactCuts?: number[];
  /** the stretches looked at frame by frame so far, [start, end] in seconds: inside them, exactCuts are all the cuts there are */
  checked?: [number, number][];
  /** set once every source is scanned, 0 to 1 (see scoreInterest) */
  interest?: Float32Array;
  /** how well each sample shows the other side of the life (the desk, the screens, the grind), 0 to 1; with smart picks */
  real?: Float32Array;
  /** a small JPEG of a representative frame */
  thumb?: Blob;
  /** numbered contact sheets of the footage, for smart picks */
  sheets?: Sheets;
  /** what Gemini saw in each sample (smart picks), when it has looked */
  look?: Look;
  /** stretches to leave out: a YouTube video's sponsor reads, intro and outro (SponsorBlock) */
  skip?: [number, number][];
}

/** What's in the picture, as Gemini judged it from the contact sheets. */
export const KINDS = ["car", "watch", "jet", "yacht", "home", "view", "city", "travel", "money", "fashion", "party", "food", "sport", "work", "talking", "people", "text", "other"] as const;
export type Kind = (typeof KINDS)[number];

export interface Look {
  /** per sample, 0 to 1: how much it sells the life (supercars, views, watches...) */
  flex: Float32Array;
  /** per sample, 0 to 1: how striking it is as a picture, whatever it shows */
  wow: Float32Array;
  /** per sample: index into KINDS */
  kind: Uint8Array;
  /** the picture model's embedding of each logged frame (unit length), when it looked */
  embs?: (Float32Array | undefined)[];
  /** per sample: which logged frame it takes its look from (an index into embs) */
  cell?: Int32Array;
}

/** How often to sample: dense for short clips, sparse for long videos. */
export function sampleRate(duration: number): number {
  if (duration <= 60) return 6;
  if (duration <= 180) return 4;
  if (duration <= 600) return 2;
  return 1;
}

function analysisSize(w: number, h: number): [number, number] {
  const k = Math.sqrt(ANALYSIS_AREA / (w * h));
  return [Math.max(16, Math.round(w * k)), Math.max(16, Math.round(h * k))];
}

function allocStats(n: number): FrameStats {
  return {
    t: new Float32Array(n),
    luma: new Float32Array(n),
    contrast: new Float32Array(n),
    sharp: new Float32Array(n),
    color: new Float32Array(n),
    skin: new Float32Array(n),
    motion: new Float32Array(n),
    hist: new Float32Array(n * HIST_BINS),
    cols: new Float32Array(n * PROFILE_BINS),
    rows: new Float32Array(n * PROFILE_BINS),
    rgb: new Float32Array(n * 3),
    bars: new Float32Array(n * 4),
  };
}

/** Rows and columns at the frame's edges that are black (letterbox and pillarbox bars). */
function measureBars(Y: Float32Array, w: number, h: number): [number, number, number, number] {
  const dark = (sum: number, max: number, count: number) => sum / count < 0.045 && max < 0.13;
  const row = (y: number) => {
    let sum = 0;
    let max = 0;
    for (let x = 0; x < w; x++) {
      const v = Y[y * w + x];
      sum += v;
      if (v > max) max = v;
    }
    return dark(sum, max, w);
  };
  const col = (x: number) => {
    let sum = 0;
    let max = 0;
    for (let y = 0; y < h; y++) {
      const v = Y[y * w + x];
      sum += v;
      if (v > max) max = v;
    }
    return dark(sum, max, h);
  };
  let top = 0;
  while (top < h >> 1 && row(top)) top++;
  let bottom = 0;
  while (bottom < h >> 1 && row(h - 1 - bottom)) bottom++;
  let left = 0;
  while (left < w >> 1 && col(left)) left++;
  let right = 0;
  while (right < w >> 1 && col(w - 1 - right)) right++;
  return [top / h, bottom / h, left / w, right / w];
}

/** Measure one RGBA frame into slot i. `prevY` holds the previous sample's luma (updated in place). */
export function measureFrame(px: Uint8ClampedArray, w: number, h: number, s: FrameStats, i: number, prevY: Float32Array | null, dt: number): Float32Array {
  const n = w * h;
  const Y = new Float32Array(n);
  let sumY = 0;
  let sumY2 = 0;
  let sumRg = 0;
  let sumYb = 0;
  let sumRg2 = 0;
  let sumYb2 = 0;
  let skin = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  const hist = s.hist.subarray(i * HIST_BINS, (i + 1) * HIST_BINS);
  const skinMask = new Uint8Array(n);
  for (let p = 0, q = 0; p < n; p++, q += 4) {
    const r = px[q];
    const g = px[q + 1];
    const b = px[q + 2];
    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    Y[p] = y;
    sumY += y;
    sumY2 += y * y;
    sr += r;
    sg += g;
    sb += b;
    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    sumRg += rg;
    sumYb += yb;
    sumRg2 += rg * rg;
    sumYb2 += yb * yb;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && y > 0.2 && y < 0.95) {
      skin++;
      skinMask[p] = 1;
    }
    hist[((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6)] += 1;
  }
  for (let k = 0; k < HIST_BINS; k++) hist[k] /= n;
  const mY = sumY / n;
  s.luma[i] = mY;
  s.contrast[i] = Math.sqrt(Math.max(0, sumY2 / n - mY * mY));
  const mRg = sumRg / n;
  const mYb = sumYb / n;
  const sdRg = Math.sqrt(Math.max(0, sumRg2 / n - mRg * mRg));
  const sdYb = Math.sqrt(Math.max(0, sumYb2 / n - mYb * mYb));
  s.color[i] = (Math.hypot(sdRg, sdYb) + 0.3 * Math.hypot(mRg, mYb)) / 100;
  s.skin[i] = skin / n;
  s.rgb[i * 3] = sr / n / 255;
  s.rgb[i * 3 + 1] = sg / n / 255;
  s.rgb[i * 3 + 2] = sb / n / 255;

  // Sharpness from the Laplacian at full analysis size.
  let lapSum = 0;
  let lapSum2 = 0;
  let lapN = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const lap = 4 * Y[p] - Y[p - 1] - Y[p + 1] - Y[p - w] - Y[p + w];
      lapSum += lap;
      lapSum2 += lap * lap;
      lapN++;
    }
  }

  // Where the subject is: edges at a coarse scale (object outlines, not gravel or
  // leaves), things brighter or darker or more colourful than the frame around
  // them, and skin.
  const cols = s.cols.subarray(i * PROFILE_BINS, (i + 1) * PROFILE_BINS);
  const rows = s.rows.subarray(i * PROFILE_BINS, (i + 1) * PROFILE_BINS);
  const mr = s.rgb[i * 3] * 255;
  const mg = s.rgb[i * 3 + 1] * 255;
  const mb = s.rgb[i * 3 + 2] * 255;
  const cw = w >> 1;
  const ch = h >> 1;
  const C = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const p = 2 * y * w + 2 * x;
      C[y * cw + x] = (Y[p] + Y[p + 1] + Y[p + w] + Y[p + w + 1]) / 4;
    }
  }
  for (let y = 1; y < ch - 1; y++) {
    for (let x = 1; x < cw - 1; x++) {
      const c = y * cw + x;
      const edge = Math.abs(C[c + 1] - C[c - 1]) + Math.abs(C[c + cw] - C[c - cw]);
      const p = 2 * y * w + 2 * x;
      const q = p * 4;
      const dl = Math.abs(C[c] - mY);
      const dc = (Math.abs(px[q] - mr) + Math.abs(px[q + 1] - mg) + Math.abs(px[q + 2] - mb)) / 765;
      const sal = edge + 0.8 * dl + 0.5 * dc + 0.6 * skinMask[p];
      cols[Math.min(PROFILE_BINS - 1, Math.floor((2 * x * PROFILE_BINS) / w))] += sal;
      rows[Math.min(PROFILE_BINS - 1, Math.floor((2 * y * PROFILE_BINS) / h))] += sal;
    }
  }
  const lapMean = lapSum / Math.max(1, lapN);
  s.sharp[i] = Math.log(1e-6 + Math.max(0, lapSum2 / Math.max(1, lapN) - lapMean * lapMean));
  let cs = 0;
  let rs = 0;
  for (let k = 0; k < PROFILE_BINS; k++) {
    cs += cols[k];
    rs += rows[k];
  }
  for (let k = 0; k < PROFILE_BINS; k++) {
    cols[k] = cs > 0 ? cols[k] / cs : 1 / PROFILE_BINS;
    rows[k] = rs > 0 ? rows[k] / rs : 1 / PROFILE_BINS;
  }

  if (s.bars) s.bars.set(measureBars(Y, w, h), i * 4);

  if (prevY && prevY.length === n && dt > 0) {
    let d = 0;
    for (let p = 0; p < n; p++) d += Math.abs(Y[p] - prevY[p]);
    s.motion[i] = d / n / dt;
  }
  return Y;
}

function histDistance(s: FrameStats, a: number, b: number): number {
  let d = 0;
  for (let k = 0; k < HIST_BINS; k++) d += Math.abs(s.hist[a * HIST_BINS + k] - s.hist[b * HIST_BINS + k]);
  return d; // 0 to 2
}

/** Shot changes: a jump in the colour histogram together with a jump in the picture. */
export function detectCuts(s: FrameStats): number[] {
  const n = s.t.length;
  const cuts: number[] = [];
  const dist = new Float32Array(n);
  for (let i = 1; i < n; i++) dist[i] = histDistance(s, i - 1, i);
  for (let i = 1; i < n; i++) {
    // Compare against the neighbourhood so steady fast motion doesn't read as cuts.
    let local = 0;
    let c = 0;
    for (let k = Math.max(1, i - 3); k <= Math.min(n - 1, i + 3); k++) {
      if (k === i) continue;
      local += dist[k];
      c++;
    }
    local /= Math.max(1, c);
    const dt = s.t[i] - s.t[i - 1];
    const jump = s.motion[i] * dt;
    if (dist[i] > 0.45 && dist[i] > 2.2 * local && jump > 0.06) cuts.push((s.t[i - 1] + s.t[i]) / 2);
  }
  return cuts;
}

export interface ScanOptions {
  rate?: number;
  signal?: AbortSignal;
  onProgress?: (p: number) => void;
}

/**
 * The times of a track's key frames, at least `gap` seconds apart. A key frame
 * decodes on its own, so skimming a long video by its key frames skips decoding
 * everything in between.
 */
async function keyFrameTimes(track: InputVideoTrack, gap: number, signal?: AbortSignal): Promise<number[]> {
  const sink = new EncodedPacketSink(track);
  const out: number[] = [];
  let p = await sink.getFirstKeyPacket({ metadataOnly: true });
  for (let guard = 0; p && guard < 200000; guard++) {
    if (signal?.aborted) break;
    if (!out.length || p.timestamp - out[out.length - 1] >= gap) out.push(p.timestamp);
    p = await sink.getNextKeyPacket(p, { metadataOnly: true });
  }
  return out;
}

/** Past this length a video is skimmed by its key frames. */
const LONG_VIDEO = 150;

/** Scan a video source. */
export async function scanVideo(src: Source, opts: ScanOptions = {}): Promise<Scan> {
  const { info, video } = src;
  if (!video) throw new Error(`${info.name} has no video`);
  let rate = opts.rate ?? sampleRate(info.duration);
  const first = await video.getFirstTimestamp().catch(() => 0);
  let times: number[] = [];
  if (!opts.rate && info.duration > LONG_VIDEO) {
    const keys = await keyFrameTimes(video, 1 / rate, opts.signal).catch(() => []);
    // Key frames every few seconds are plenty; much sparser and a plain skim is better.
    if (keys.length >= info.duration / 12) {
      times = keys;
      rate = keys.length / Math.max(1, info.duration);
    }
  }
  if (!times.length) {
    const count = Math.max(2, Math.floor(info.duration * rate));
    for (let i = 0; i < count; i++) times.push(first + (i + 0.5) / rate);
  }
  const [w, h] = analysisSize(info.width, info.height);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: false })!;
  const stats = allocStats(times.length);
  let prevY: Float32Array | null = null;
  let prevT = 0;
  let got = 0;
  let thumbAt = -1;
  let thumbScore = -Infinity;
  let thumb: Blob | undefined;
  // Contact sheets for smart picks: a frame whenever the picture changes, and at
  // least every six seconds (about 400 frames at most, however long the video).
  const sheets = new SheetMaker(info.width / Math.max(1, info.height));
  const minGap = info.duration / 400;
  const maxGap = Math.max(6, minGap);
  let lastCell = -1;
  const sink = new VideoSampleSink(video);
  let i = 0;
  for await (const sample of sink.samplesAtTimestamps(times)) {
    if (opts.signal?.aborted) {
      sample?.close();
      throw new DOMException("Scan cancelled", "AbortError");
    }
    if (!sample) {
      i++;
      continue;
    }
    try {
      sample.drawWithFit(ctx, { fit: "fill" });
      const px = ctx.getImageData(0, 0, w, h).data;
      stats.t[got] = times[i];
      prevY = measureFrame(px, w, h, stats, got, prevY, got ? times[i] - prevT : 0);
      prevT = times[i];
      // The thumbnail: a sharp, well-lit frame from the middle stretch.
      const pos = got / Math.max(1, times.length - 1);
      const score = stats.sharp[got] + 4 * stats.color[got] - 6 * Math.abs(stats.luma[got] - 0.5) - (pos < 0.15 || pos > 0.85 ? 3 : 0);
      if (score > thumbScore) {
        thumbScore = score;
        thumbAt = times[i];
      }
      const since = lastCell < 0 ? Infinity : times[i] - stats.t[lastCell];
      if (since >= maxGap || (since >= minGap && histDistance(stats, lastCell, got) > 0.35)) {
        sheets.add((c, x, y, cw, ch) => sample.draw(c, x, y, cw, ch), got, times[i]);
        lastCell = got;
      }
      got++;
    } finally {
      sample.close();
    }
    i++;
    opts.onProgress?.(i / times.length);
  }
  const trimmed = trimStats(stats, got);
  if (thumbAt >= 0) thumb = await grabThumb(src, thumbAt);
  return { id: info.id, kind: "video", start: first, duration: info.duration, width: info.width, height: info.height, rate, fps: info.fps, stats: trimmed, cuts: detectCuts(trimmed), thumb, sheets: await sheets.finish() };
}

function trimStats(s: FrameStats, n: number): FrameStats {
  const out = allocStats(n);
  for (const key of Object.keys(out) as (keyof FrameStats)[]) {
    const from = s[key];
    const to = out[key];
    if (!from || !to) continue;
    const per = from.length / Math.max(1, s.t.length);
    to.set(from.subarray(0, n * per));
  }
  return out;
}

/** A 360px-wide JPEG of the frame at `t`. */
export async function grabThumb(src: Source, t: number, width = 360): Promise<Blob | undefined> {
  if (src.image) {
    const h = Math.round((width * src.image.height) / src.image.width);
    const c = new OffscreenCanvas(width, h);
    c.getContext("2d")!.drawImage(src.image, 0, 0, width, h);
    return c.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  }
  if (!src.video) return undefined;
  const sink = new VideoSampleSink(src.video);
  const sample = await sink.getSample(t);
  if (!sample) return undefined;
  try {
    const h = Math.round((width * src.info.height) / src.info.width);
    const c = new OffscreenCanvas(width, h);
    sample.drawWithFit(c.getContext("2d")!, { fit: "fill" });
    return await c.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  } finally {
    sample.close();
  }
}

/** Scan a photo: one sample, measured the same way. */
export async function scanImage(src: Source): Promise<Scan> {
  const img = src.image!;
  const [w, h] = analysisSize(img.width, img.height);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: false })!;
  ctx.drawImage(img, 0, 0, w, h);
  const stats = allocStats(1);
  measureFrame(ctx.getImageData(0, 0, w, h).data, w, h, stats, 0, null, 0);
  return { id: src.info.id, kind: "image", start: 0, duration: 0, width: img.width, height: img.height, rate: 0, stats, cuts: [], thumb: await grabThumb(src, 0) };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function pct(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
}

/**
 * How good each sampled moment looks, 0 to 1, judged across every source together
 * so a sharp, bright clip outranks a murky one: sharpness, exposure, colour,
 * movement (lively, not shaky), people, and a nudge away from the fumbled first
 * and last half-second of a phone clip, and from a long video's intro and end
 * screen. With smart picks, what Gemini saw in the frame leads: how much it
 * sells the life and how striking it is, with talking heads and titles pushed
 * right down.
 */
export function scoreInterest(scans: Scan[]): void {
  const sharp: number[] = [];
  const motion: number[] = [];
  const color: number[] = [];
  for (const sc of scans) {
    for (let i = 0; i < sc.stats.t.length; i++) {
      sharp.push(sc.stats.sharp[i]);
      if (sc.kind === "video") motion.push(sc.stats.motion[i]);
      color.push(sc.stats.color[i]);
    }
  }
  const s10 = pct(sharp, 10);
  const s90 = pct(sharp, 90);
  const m50 = pct(motion, 50) || 0.02;
  const m90 = pct(motion, 90) || 0.1;
  const c90 = pct(color, 90) || 0.5;
  const TALKING = KINDS.indexOf("talking");
  const TEXT = KINDS.indexOf("text");
  const WORK = KINDS.indexOf("work");
  const OTHER = KINDS.indexOf("other");
  const PEOPLE = KINDS.indexOf("people");
  for (const sc of scans) {
    const n = sc.stats.t.length;
    const out = new Float32Array(n);
    const real = sc.look ? new Float32Array(n) : undefined;
    for (let i = 0; i < n; i++) {
      const st = sc.stats;
      const qSharp = clamp01((st.sharp[i] - s10) / Math.max(1e-6, s90 - s10));
      const qExpo = 1 - clamp01(Math.abs(st.luma[i] - 0.48) / 0.42) ** 2;
      const qContrast = clamp01(st.contrast[i] / 0.22);
      const qColor = clamp01(st.color[i] / c90);
      let qMotion = 0.35;
      if (sc.kind === "video") {
        const m = st.motion[i];
        // Lively is good up to the busiest tenth of the footage; beyond that it's shake or a whip.
        qMotion = m <= m90 ? clamp01(0.25 + (0.75 * m) / m90) : clamp01(1 - (m - m90) / (2 * m90));
        if (m < 0.25 * m50) qMotion *= 0.6; // frozen
      }
      const qPeople = clamp01(st.skin[i] * 6);
      let q = 0.29 * qSharp + 0.19 * qExpo + 0.1 * qContrast + 0.17 * qColor + 0.21 * qMotion + 0.04 * qPeople;
      if (sc.kind === "video") {
        const t = st.t[i] - sc.start;
        if (t < 0.4 || st.t[i] > sc.duration - 0.4) q *= 0.8;
        // A long video's opening sting and its end screen (the last 20 seconds).
        if (sc.duration > 180 && (t < 4 || st.t[i] > sc.duration - 20)) q *= 0.35;
      }
      // A sponsor read, an intro, an outro: not the content.
      if (sc.skip?.some(([a, b]) => st.t[i] >= a && st.t[i] <= b)) q *= 0.05;
      // Too dark or blown out to use.
      if (st.luma[i] < 0.06) q *= 0.3;
      else if (st.luma[i] > 0.93) q *= 0.5;
      if (sc.look) {
        const kind = sc.look.kind[i];
        const quality = q;
        q = 0.3 * quality + 0.7 * (0.6 * sc.look.flex[i] + 0.4 * sc.look.wow[i]);
        if (kind === TEXT) q *= 0.2;
        else if (kind === TALKING) q *= 0.5;
        // Filler: a room, a blur, people with nothing to show off, a desk. In the edit
        // only once the flex runs out.
        else if (kind === WORK) q *= 0.6;
        else if (kind === OTHER || kind === PEOPLE) q *= 0.85;
        real![i] = kind === WORK ? 0.45 + 0.3 * sc.look.wow[i] + 0.25 * quality : kind === TEXT || kind === TALKING ? 0.02 : 0.1 * quality;
      }
      out[i] = clamp01(q);
    }
    sc.interest = out;
    sc.real = real;
  }
}

/**
 * Rendering an edit to a file, entirely in the browser: each shot's frames are
 * decoded on the media engine as the edit reaches them, drawn by the GPU
 * compositor with the captions and card over them, and encoded straight back
 * on the media engine. H.264 + AAC in MP4 where the browser can (Chrome on a
 * Mac can), VP9 + Opus in WebM otherwise.
 */
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  canEncodeAudio,
  canEncodeVideo,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
  VideoSampleSink,
  WebMOutputFormat,
  type EncodedPacket,
  type VideoCodec,
  type AudioCodec,
  type VideoSample,
} from "mediabunny";
import type { Source } from "../media/sources";
import type { EditPlan, FxEvent, ShotEvent } from "../plan/types";
import { drawCaption } from "./captions";
import { drawCard } from "./card";
import { loadFonts } from "./fonts";
import { Compositor, type LayerDraw, type Rotation } from "./gl";
import { mixPlan } from "./mix";
import { audioDelay, shiftAudio } from "./avsync";

export interface RenderOptions {
  /** bake the song into the file */
  music: boolean;
  /** also make a copy without the song, for adding the sound in the app */
  silentCopy: boolean;
  /** the screenshot on the card's laptop */
  cardImage?: CanvasImageSource & { width: number; height: number };
  prefer?: "mp4" | "webm";
  /** tests only: force a container and codecs */
  codecs?: { container: "mp4" | "webm"; video: VideoCodec; audio: AudioCodec };
  onProgress?: (done: number, stage: string) => void;
  signal?: AbortSignal;
}

export interface RenderResult {
  blob: Blob;
  silent?: Blob;
  mime: string;
  ext: "mp4" | "webm";
  videoCodec: VideoCodec;
  audioCodec: AudioCodec;
  ms: number;
}

interface Codecs {
  container: "mp4" | "webm";
  video: VideoCodec;
  audio: AudioCodec;
}

let aacRegistered = false;

export async function pickCodecs(width: number, height: number, prefer?: "mp4" | "webm"): Promise<Codecs> {
  const bitrate = bitrateFor(width, height);
  const avc = await canEncodeVideo("avc", { width, height, bitrate });
  if (prefer !== "webm" && avc) {
    if (!(await canEncodeAudio("aac", { numberOfChannels: 2, sampleRate: 48000, bitrate: 192e3 })) && !aacRegistered) {
      // No AAC encoder in this browser: bring in a small WASM one.
      const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
      registerAacEncoder();
      aacRegistered = true;
    }
    return { container: "mp4", video: "avc", audio: "aac" };
  }
  for (const video of ["vp9", "av1", "vp8"] as const) {
    if (await canEncodeVideo(video, { width, height, bitrate })) return { container: "webm", video, audio: "opus" };
  }
  throw new Error("This browser can't encode video. Use Chrome on a Mac or PC.");
}

/** About 0.23 bits per pixel per frame: 14 Mbps at 1080 × 1920, 30 fps. */
export const bitrateFor = (w: number, h: number) => Math.round(w * h * 30 * 0.23);

/** Reads one shot's frames in order, a step ahead of the renderer. */
class ShotReader {
  private readonly iter: AsyncGenerator<VideoSample, void, unknown>;
  private cur: VideoSample | null = null;
  private next: VideoSample | null = null;
  private readonly ready: Promise<void>;

  constructor(sink: VideoSampleSink, from: number, to: number) {
    const iter = sink.samples(Math.max(0, from - 0.12), to + 0.12);
    this.iter = iter;
    this.ready = (async () => {
      const a = await iter.next();
      this.cur = a.done ? null : a.value;
      const b = await iter.next();
      this.next = b.done ? null : b.value;
    })();
  }

  /** The frame on screen at source time `t`. */
  async at(t: number): Promise<VideoSample | null> {
    await this.ready;
    while (this.next && this.next.timestamp <= t + 1e-4) {
      this.cur?.close();
      this.cur = this.next;
      const r = await this.iter.next();
      this.next = r.done ? null : r.value;
    }
    return this.cur;
  }

  async close() {
    await this.ready.catch(() => undefined);
    this.cur?.close();
    this.next?.close();
    this.cur = this.next = null;
    await this.iter.return(undefined).catch(() => undefined);
  }
}

function fxAt(fx: FxEvent[], t: number, fps: number) {
  let flash = 0;
  let burn = 0;
  let burnPhase = 0;
  let dim = 0;
  for (const e of fx) {
    if (t < e.start - 1e-6 || t >= e.end - 1e-6) continue;
    const span = Math.max(1e-6, e.end - e.start);
    if (e.kind === "flash") {
      const at = e.at ?? e.start;
      if (t >= at - 1e-6) flash = Math.max(flash, e.strength * (1 - (t - at) / Math.max(1e-6, e.end - at)) ** 2);
    } else if (e.kind === "burn") {
      const p = (t - e.start) / span;
      burn = Math.max(burn, e.strength * Math.sin(Math.PI * Math.min(1, (t - e.start + 1 / fps) / (span + 1 / fps))));
      burnPhase = p;
    } else if (e.kind === "dip") {
      // The last shot dims over three frames, then one frame of black.
      dim = Math.max(dim, Math.min(1, (t - e.start + 1 / fps) / (3 / fps)));
    } else if (e.kind === "fadein") {
      dim = Math.max(dim, 1 - (t - e.start) / span);
    }
  }
  return { flash, burn, burnPhase, dim };
}

async function blobToBase64Parts(blob: Blob, chunk = 6 * 1024 * 1024): Promise<string[]> {
  const parts: string[] = [];
  for (let o = 0; o < blob.size; o += chunk) {
    const buf = new Uint8Array(await blob.slice(o, o + chunk).arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    parts.push(btoa(s));
  }
  return parts;
}
export { blobToBase64Parts };

/**
 * Draws any frame of a plan: the footage (decoded on demand, streaming when the
 * frames come in order), the grade and effects, the captions and the card.
 */
export class FramePainter {
  readonly canvas: OffscreenCanvas;
  private readonly comp: Compositor;
  private readonly overlay: OffscreenCanvas;
  private readonly octx: OffscreenCanvasRenderingContext2D;
  private readonly sinks = new Map<string, VideoSampleSink>();
  private readonly readers = new Map<number, ShotReader>();
  private lastUpload = "";
  private overlayKey = "";
  private lastT = -Infinity;

  constructor(
    private readonly plan: EditPlan,
    private readonly sources: Map<string, Source>,
    private readonly cardImage?: CanvasImageSource & { width: number; height: number },
  ) {
    this.canvas = new OffscreenCanvas(plan.width, plan.height);
    this.comp = new Compositor(this.canvas, plan.width, plan.height);
    this.overlay = new OffscreenCanvas(plan.width, plan.height);
    this.octx = this.overlay.getContext("2d")!;
  }

  private reader(i: number): ShotReader | null {
    const shot = this.plan.shots[i];
    if (!shot || shot.kind !== "video") return null;
    let r = this.readers.get(i);
    if (!r) {
      let sink = this.sinks.get(shot.source);
      if (!sink) {
        const v = this.sources.get(shot.source)?.video;
        if (!v) return null;
        this.sinks.set(shot.source, (sink = new VideoSampleSink(v)));
      }
      r = new ShotReader(sink, shot.srcStart, shot.srcStart + (shot.end - shot.start) * shot.speed);
      this.readers.set(i, r);
    }
    return r;
  }

  private async dropReaders(keep: (i: number) => boolean) {
    for (const [i, r] of [...this.readers]) {
      if (keep(i)) continue;
      this.readers.delete(i);
      await r.close();
    }
  }

  /** Draw the frame at `t` into the canvas. */
  async paint(t: number): Promise<void> {
    const { plan, comp, sources } = this;
    const { width: W, height: H, fps } = plan;
    const f = Math.round(t * fps);
    const idx = plan.shots.findIndex((s) => t >= s.start - 1e-6 && t < s.end - 1e-6);
    // Going backwards restarts decoding; going forwards drops the shots left behind.
    if (t < this.lastT) await this.dropReaders(() => false);
    else if (idx >= 0) await this.dropReaders((i) => i >= idx);
    this.lastT = t;

    const layers: LayerDraw[] = [];
    const inCard = !!plan.card && t >= plan.card.start - 1e-6;
    const shot: ShotEvent | undefined = idx >= 0 ? plan.shots[idx] : undefined;
    if (shot && !inCard) {
      this.reader(idx + 1); // start decoding the next shot now
      const p = (t - shot.start) / Math.max(1e-6, shot.end - shot.start);
      const c = shot.crop;
      const zoom = c.zoom0 + (c.zoom1 - c.zoom0) * p;
      const cx = c.cx + ((c.cx1 ?? c.cx) - c.cx) * p;
      const cy = c.cy + ((c.cy1 ?? c.cy) - c.cy) * p;
      if (shot.kind === "image") {
        const img = sources.get(shot.source)?.image;
        if (img) {
          const key = `img:${shot.source}`;
          if (this.lastUpload !== key) {
            comp.upload(0, img, img.width, img.height);
            this.lastUpload = key;
          }
          layers.push({ slot: 0, srcW: img.width, srcH: img.height, rotation: 0, flip: false, cx, cy, zoom, fit: c.fit, alpha: 1 });
        }
      } else {
        const sample = await this.reader(idx)?.at(shot.srcStart + (t - shot.start) * shot.speed);
        if (sample) {
          const key = `${shot.source}@${sample.timestamp}`;
          if (this.lastUpload !== key) {
            const vf = sample.toVideoFrame();
            comp.upload(0, vf, sample.displayWidth, sample.displayHeight);
            vf.close();
            this.lastUpload = key;
          }
          layers.push({ slot: 0, srcW: sample.displayWidth, srcH: sample.displayHeight, rotation: sample.rotation as Rotation, flip: sample.flip, cx, cy, zoom, fit: c.fit, alpha: 1 });
        }
      }
    }

    // Captions and the card, redrawn only when they change.
    const caps = plan.captions.filter((cap) => t >= cap.start - 1e-6 && t < cap.end - 1e-6);
    const cardT = plan.card && inCard ? t - plan.card.start : -1;
    const key = cardT >= 0 ? `card:${f}` : caps.map((cap) => `${cap.style}:${cap.y}:${cap.text}`).join("|");
    if (key && key !== this.overlayKey) {
      this.octx.clearRect(0, 0, W, H);
      if (cardT >= 0 && plan.card) {
        drawCard(this.octx, W, H, cardT, plan.card.end - plan.card.start, plan.card.spec, { shot: this.cardImage }, plan.card.fadeIn, plan.card.fadeOut);
      } else {
        for (const cap of caps) drawCaption(this.octx, W, H, cap);
      }
      comp.uploadOverlay(this.overlay);
      this.overlayKey = key;
    }
    const e = fxAt(plan.fx, t, fps);
    comp.draw({ layers, grade: plan.grade, flash: e.flash, burn: e.burn, burnPhase: e.burnPhase, dim: inCard ? 0 : e.dim, overlay: !!key, time: t, seed: 1.37 });
  }

  async close() {
    await this.dropReaders(() => false);
    this.comp.dispose();
  }
}

/** Single frames of a plan as PNGs, for previews and checks. */
export async function renderStills(plan: EditPlan, sources: Map<string, Source>, times: number[], cardImage?: CanvasImageSource & { width: number; height: number }): Promise<Blob[]> {
  await loadFonts();
  const painter = new FramePainter(plan, sources, cardImage);
  const out: Blob[] = [];
  try {
    for (const t of times) {
      await painter.paint(Math.round(t * plan.fps) / plan.fps);
      out.push(await painter.canvas.convertToBlob({ type: "image/png" }));
    }
  } finally {
    await painter.close();
  }
  return out;
}

export async function renderPlan(plan: EditPlan, sources: Map<string, Source>, opts: RenderOptions): Promise<RenderResult> {
  const t0 = performance.now();
  const { width: W, height: H, fps } = plan;
  await loadFonts();
  const codecs = opts.codecs ?? (await pickCodecs(W, H, opts.prefer));
  if (opts.codecs?.audio === "aac" && !(await canEncodeAudio("aac", { numberOfChannels: 2, sampleRate: 48000, bitrate: 192e3 })) && !aacRegistered) {
    const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
    registerAacEncoder();
    aacRegistered = true;
  }
  const cancelled = () => {
    if (opts.signal?.aborted) throw new DOMException("Render cancelled", "AbortError");
  };
  opts.onProgress?.(0, "Mixing the sound");
  // Whatever the encoder adds in front of the sound is taken back off, so the song stays on the cuts.
  const delay = await audioDelay(codecs.container, codecs.audio, codecs.audio === "aac" && aacRegistered ? 1024 / 48000 : 0);
  cancelled();
  const audio = shiftAudio(await mixPlan(plan, sources, opts.music), delay);
  cancelled();

  const target = new BufferTarget();
  const output = new Output({ format: codecs.container === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(), target });
  const packets: { packet: EncodedPacket; meta?: EncodedVideoChunkMetadata }[] = [];
  let painter: FramePainter | null = null;
  let finished = false;
  try {
    painter = new FramePainter(plan, sources, opts.cardImage);
    const video = new CanvasSource(painter.canvas, {
      codec: codecs.video,
      bitrate: bitrateFor(W, H),
      keyFrameInterval: 2,
      latencyMode: "quality",
      hardwareAcceleration: "no-preference",
      onEncodedPacket: opts.silentCopy ? (packet, meta) => void packets.push({ packet, meta }) : undefined,
    });
    output.addVideoTrack(video, { frameRate: fps });
    const audioSource = new AudioBufferSource({ codec: codecs.audio, bitrate: 192e3 });
    output.addAudioTrack(audioSource);
    await output.start();
    await audioSource.add(audio);
    audioSource.close();

    const frames = Math.round(plan.duration * fps);
    for (let f = 0; f < frames; f++) {
      cancelled();
      const t = f / fps;
      await painter.paint(t);
      await video.add(t, 1 / fps);
      opts.onProgress?.((f + 1) / frames, "Rendering");
    }
    video.close();
    await output.finalize();
    finished = true;
  } finally {
    if (!finished) await output.cancel().catch(() => undefined);
    await painter?.close();
  }
  const mime = codecs.container === "mp4" ? "video/mp4" : "video/webm";
  const blob = new Blob([target.buffer!], { type: mime });

  let silent: Blob | undefined;
  if (opts.silentCopy && packets.length) {
    cancelled();
    // The same pictures without the song: the encoded frames go straight into a second
    // file, with the footage's own voice if the edit has any, and nothing else.
    const hasVoice = plan.sourceAudio || plan.shots.some((s) => s.audio);
    const voice = hasVoice ? shiftAudio(await mixPlan(plan, sources, false), delay) : null;
    cancelled();
    const t2 = new BufferTarget();
    const out2 = new Output({ format: codecs.container === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(), target: t2 });
    let done2 = false;
    try {
      const src2 = new EncodedVideoPacketSource(codecs.video);
      out2.addVideoTrack(src2, { frameRate: fps });
      const aud2 = voice ? new AudioBufferSource({ codec: codecs.audio, bitrate: 192e3 }) : null;
      if (aud2) out2.addAudioTrack(aud2);
      await out2.start();
      if (aud2 && voice) {
        await aud2.add(voice);
        aud2.close();
      }
      for (const { packet, meta } of packets) await src2.add(packet, meta);
      src2.close();
      await out2.finalize();
      done2 = true;
    } finally {
      if (!done2) await out2.cancel().catch(() => undefined);
    }
    silent = new Blob([t2.buffer!], { type: mime });
  }
  return { blob, silent, mime, ext: codecs.container, videoCodec: codecs.video, audioCodec: codecs.audio, ms: Math.round(performance.now() - t0) };
}

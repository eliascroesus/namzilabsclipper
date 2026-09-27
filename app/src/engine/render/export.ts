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
import { drawLaptopCard } from "./card";
import { loadFonts } from "./fonts";
import { Compositor, type LayerDraw, type Rotation } from "./gl";
import { mixPlan } from "./mix";

export interface RenderOptions {
  /** bake the song into the file */
  music: boolean;
  /** also make a copy without the song, for adding the sound in the app */
  silentCopy: boolean;
  /** the screenshot on the card's laptop */
  cardImage?: CanvasImageSource & { width: number; height: number };
  prefer?: "mp4" | "webm";
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

export async function renderPlan(plan: EditPlan, sources: Map<string, Source>, opts: RenderOptions): Promise<RenderResult> {
  const t0 = performance.now();
  const { width: W, height: H, fps } = plan;
  await loadFonts();
  const codecs = await pickCodecs(W, H, opts.prefer);
  opts.onProgress?.(0, "Mixing the sound");
  const audio = await mixPlan(plan, sources, opts.music);

  const target = new BufferTarget();
  const output = new Output({ format: codecs.container === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(), target });
  const canvas = new OffscreenCanvas(W, H);
  const comp = new Compositor(canvas, W, H);
  const packets: { packet: EncodedPacket; meta?: EncodedVideoChunkMetadata }[] = [];
  const video = new CanvasSource(canvas, {
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

  const overlay = new OffscreenCanvas(W, H);
  const octx = overlay.getContext("2d")!;
  const sinks = new Map<string, VideoSampleSink>();
  const sinkFor = (id: string) => {
    let s = sinks.get(id);
    if (!s) {
      const v = sources.get(id)?.video;
      if (!v) return null;
      sinks.set(id, (s = new VideoSampleSink(v)));
    }
    return s;
  };
  const readers = new Map<number, ShotReader>();
  const reader = (i: number) => {
    const shot = plan.shots[i];
    if (!shot || shot.kind !== "video") return null;
    let r = readers.get(i);
    if (!r) {
      const sink = sinkFor(shot.source);
      if (!sink) return null;
      r = new ShotReader(sink, shot.srcStart, shot.srcStart + (shot.end - shot.start) * shot.speed);
      readers.set(i, r);
    }
    return r;
  };

  const frames = Math.round(plan.duration * fps);
  let lastUpload = "";
  let overlayKey = "";
  let shotIndex = 0;
  try {
    for (let f = 0; f < frames; f++) {
      if (opts.signal?.aborted) throw new DOMException("Render cancelled", "AbortError");
      const t = f / fps;
      while (shotIndex < plan.shots.length && t >= plan.shots[shotIndex].end - 1e-6) {
        await readers.get(shotIndex)?.close();
        readers.delete(shotIndex);
        shotIndex++;
      }
      const layers: LayerDraw[] = [];
      const shot: ShotEvent | undefined = plan.shots[shotIndex];
      const inCard = plan.card && t >= plan.card.start - 1e-6;
      if (shot && t >= shot.start - 1e-6 && !inCard) {
        reader(shotIndex + 1); // start decoding the next shot now
        const p = (t - shot.start) / Math.max(1e-6, shot.end - shot.start);
        const c = shot.crop;
        const zoom = c.zoom0 + (c.zoom1 - c.zoom0) * p;
        const cx = c.cx + ((c.cx1 ?? c.cx) - c.cx) * p;
        const cy = c.cy + ((c.cy1 ?? c.cy) - c.cy) * p;
        if (shot.kind === "image") {
          const img = sources.get(shot.source)?.image;
          if (img) {
            const key = `img:${shotIndex}`;
            if (lastUpload !== key) {
              comp.upload(0, img, img.width, img.height);
              lastUpload = key;
            }
            layers.push({ slot: 0, srcW: img.width, srcH: img.height, rotation: 0, flip: false, cx, cy, zoom, fit: c.fit, alpha: 1 });
          }
        } else {
          const sample = await reader(shotIndex)?.at(shot.srcStart + (t - shot.start) * shot.speed);
          if (sample) {
            const key = `${shot.source}@${sample.timestamp}`;
            if (lastUpload !== key) {
              const vf = sample.toVideoFrame();
              comp.upload(0, vf, sample.displayWidth, sample.displayHeight);
              vf.close();
              lastUpload = key;
            }
            layers.push({ slot: 0, srcW: sample.displayWidth, srcH: sample.displayHeight, rotation: sample.rotation as Rotation, flip: sample.flip, cx, cy, zoom, fit: c.fit, alpha: 1 });
          }
        }
      }

      // Captions and the card, redrawn only when they change.
      const caps = plan.captions.filter((cap) => t >= cap.start - 1e-6 && t < cap.end - 1e-6);
      const cardT = plan.card && inCard ? t - plan.card.start : -1;
      const key = cardT >= 0 ? `card:${f}` : caps.map((cap) => `${cap.style}:${cap.text}`).join("|");
      if (key && key !== overlayKey) {
        octx.clearRect(0, 0, W, H);
        if (cardT >= 0 && plan.card) {
          drawLaptopCard(octx, W, H, cardT, plan.card.end - plan.card.start, plan.card.spec, { shot: opts.cardImage }, plan.card.fadeIn, plan.card.fadeOut);
        } else {
          for (const cap of caps) drawCaption(octx, W, H, cap);
        }
        comp.uploadOverlay(overlay);
        overlayKey = key;
      }
      const e = fxAt(plan.fx, t, fps);
      comp.draw({ layers, grade: plan.grade, flash: e.flash, burn: e.burn, burnPhase: e.burnPhase, dim: inCard ? 0 : e.dim, overlay: !!key, time: t, seed: 1.37 });
      await video.add(t, 1 / fps);
      opts.onProgress?.((f + 1) / frames, "Rendering");
    }
    video.close();
    await output.finalize();
  } catch (err) {
    await output.cancel().catch(() => undefined);
    throw err;
  } finally {
    for (const r of readers.values()) await r.close();
    comp.dispose();
  }
  const mime = codecs.container === "mp4" ? "video/mp4" : "video/webm";
  const blob = new Blob([target.buffer!], { type: mime });

  let silent: Blob | undefined;
  if (opts.silentCopy && packets.length) {
    // The same pictures without the song: the encoded frames go straight into a second file.
    const t2 = new BufferTarget();
    const out2 = new Output({ format: codecs.container === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(), target: t2 });
    const src2 = new EncodedVideoPacketSource(codecs.video);
    out2.addVideoTrack(src2, { frameRate: fps });
    await out2.start();
    for (const { packet, meta } of packets) await src2.add(packet, meta);
    src2.close();
    await out2.finalize();
    silent = new Blob([t2.buffer!], { type: mime });
  }
  return { blob, silent, mime, ext: codecs.container, videoCodec: codecs.video, audioCodec: codecs.audio, ms: Math.round(performance.now() - t0) };
}

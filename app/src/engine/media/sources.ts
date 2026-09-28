/**
 * Opening what the user drops: videos, photos, and sounds (a Reel, an MP3).
 * Files are read in place with Mediabunny, a slice at a time, so a 2 GB video
 * never has to fit in memory.
 */
import { ALL_FORMATS, AudioBufferSink, AudioSampleSink, BlobSource, Input, type InputVideoTrack } from "mediabunny";
import { Resampler } from "../audio/resample";

export type SourceKind = "video" | "image" | "audio";

export interface SourceInfo {
  id: string;
  name: string;
  kind: SourceKind;
  /** seconds; 0 for photos */
  duration: number;
  /** display size, after rotation */
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  bytes: number;
}

export interface Source {
  info: SourceInfo;
  file: Blob;
  input?: Input;
  video?: InputVideoTrack;
  image?: ImageBitmap;
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i;

export function isImage(file: Blob, name: string): boolean {
  return file.type.startsWith("image/") || IMAGE_EXT.test(name);
}

export class UnsupportedFileError extends Error {}

/**
 * A photo at a size the edit can use: enough for a 1080 × 1920 frame with room to
 * zoom (2,560 px on the long side, or 1,920 on the short one for a panorama), and
 * never past 8,192 px, where GPUs stop taking textures. A 48 MP photo would
 * otherwise hold 190 MB for the whole session.
 */
async function loadPhoto(file: Blob, name: string): Promise<ImageBitmap> {
  let full: ImageBitmap;
  try {
    full = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new UnsupportedFileError(`${name} isn't an image Chrome can read.`);
  }
  const long = Math.max(full.width, full.height);
  const short = Math.min(full.width, full.height);
  const k = Math.min(1, Math.max(2560 / long, 1920 / short), 8192 / long);
  if (k >= 0.999) return full;
  try {
    return await createImageBitmap(full, { resizeWidth: Math.round(full.width * k), resizeHeight: Math.round(full.height * k), resizeQuality: "high" });
  } finally {
    full.close();
  }
}

export interface OpenOptions {
  /** only the sound is wanted (the sound for an edit): don't require the video to decode */
  audioOnly?: boolean;
}

export async function openSource(id: string, file: Blob, name: string, opts: OpenOptions = {}): Promise<Source> {
  if (isImage(file, name)) {
    if (opts.audioOnly) throw new UnsupportedFileError(`${name} is a picture, not a sound.`);
    if (/\.(heic|heif)$/i.test(name) || /heic|heif/.test(file.type)) {
      throw new UnsupportedFileError(`${name} is HEIC, which Chrome can't open. Export it as JPEG (Photos: File, Export) and drop that.`);
    }
    const image = await loadPhoto(file, name);
    return {
      file,
      image,
      info: { id, name, kind: "image", duration: 0, width: image.width, height: image.height, fps: 0, hasAudio: false, bytes: file.size },
    };
  }

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  if (!(await input.canRead())) {
    input.dispose();
    throw new UnsupportedFileError(`${name} isn't a video or audio file this browser can read.`);
  }
  // For a sound, the picture doesn't matter: a clip whose video this browser can't
  // decode (HEVC on some PCs, ProRes) still gives its audio.
  const video = opts.audioOnly ? null : await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  if (!video && !audio) {
    input.dispose();
    throw new UnsupportedFileError(opts.audioOnly ? `${name} has no sound in it.` : `${name} has no video or audio in it.`);
  }
  if (video && !(await video.canDecode())) {
    const codec = await video.getCodec();
    input.dispose();
    throw new UnsupportedFileError(`${name} uses ${codec ?? "a video codec"} that this browser can't decode.`);
  }
  const duration = await input.computeDuration();
  let width = 0;
  let height = 0;
  let fps = 0;
  if (video) {
    width = await video.getDisplayWidth();
    height = await video.getDisplayHeight();
    try {
      const packets = await video.computePacketStats(120);
      fps = packets.averagePacketRate;
    } catch {
      fps = 30;
    }
  }
  return {
    file,
    input,
    video: video ?? undefined,
    info: { id, name, kind: video ? "video" : "audio", duration, width, height, fps: fps || 30, hasAudio: !!audio, bytes: file.size },
  };
}

/**
 * A source's audio as mono at `rate` Hz (22,050 for music analysis, 16,000 for
 * speech), from `start` to `end` seconds of the file. Gaps in the track are
 * filled with silence so sample k is always at start + k / rate.
 */
export async function decodeMono(src: Source, rate: number, start = 0, end = Infinity, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<Float32Array> {
  const track = await src.input?.getPrimaryAudioTrack();
  if (!track) return new Float32Array(0);
  const until = Math.min(end, src.info.duration);
  // The rate comes from the decoded audio, not the container: HE-AAC declared at
  // 22.05 kHz decodes at 44.1 kHz.
  let inRate = 0;
  let rs: Resampler | null = null;
  const parts: Float32Array[] = [];
  let length = 0;
  const push = (a: Float32Array) => {
    if (a.length) {
      parts.push(a);
      length += a.length;
    }
  };
  let next = start; // where the next input sample belongs, in seconds
  const sink = new AudioSampleSink(track);
  for await (const sample of sink.samples(start, until)) {
    try {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      if (!rs) {
        inRate = sample.sampleRate;
        rs = new Resampler(inRate, rate);
      }
      const n = sample.numberOfFrames;
      const ch = sample.numberOfChannels;
      let offset = 0;
      // Silence for a gap; drop what overlaps what we already have.
      const gap = Math.round((sample.timestamp - next) * inRate);
      if (gap > 0) push(rs.write(new Float32Array(gap)));
      else if (gap < 0) offset = Math.min(n, -gap);
      if (sample.timestamp + sample.duration <= start) continue;
      if (sample.timestamp < start) offset = Math.max(offset, Math.round((start - sample.timestamp) * inRate));
      const count = n - offset;
      if (count <= 0) continue;
      const mono = new Float32Array(count);
      const plane = new Float32Array(count);
      for (let c = 0; c < ch; c++) {
        sample.copyTo(plane, { planeIndex: c, format: "f32-planar", frameOffset: offset, frameCount: count });
        for (let i = 0; i < count; i++) mono[i] += plane[i];
      }
      if (ch > 1) for (let i = 0; i < count; i++) mono[i] /= ch;
      push(rs.write(mono));
      next = sample.timestamp + (offset + count) / inRate;
      onProgress?.(Math.min(1, (next - start) / Math.max(1e-3, until - start)));
    } finally {
      sample.close();
    }
  }
  if (rs) push(rs.end());
  const want = Math.max(0, Math.round((until - start) * rate));
  const out = new Float32Array(Number.isFinite(want) && want > 0 ? want : length);
  let o = 0;
  for (const p of parts) {
    if (o >= out.length) break;
    out.set(p.subarray(0, out.length - o), o);
    o += p.length;
  }
  return out;
}

/** A stretch of a source's audio as an AudioBuffer, for mixing (at the file's own rate). */
export async function decodeAudioBuffer(src: Source, start: number, end: number, ctxRate = 48000): Promise<AudioBuffer | null> {
  const track = await src.input?.getPrimaryAudioTrack();
  if (!track) return null;
  const channels = Math.min(2, await track.getNumberOfChannels());
  const length = Math.max(1, Math.ceil((end - start) * ctxRate));
  const ctx = new OfflineAudioContext(channels, length, ctxRate);
  const sink = new AudioBufferSink(track);
  for await (const { buffer, timestamp } of sink.buffers(Math.max(0, start - 0.05), end)) {
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    const at = timestamp - start;
    if (at >= 0) node.start(at);
    else if (at + buffer.duration > 0) node.start(0, -at);
  }
  return ctx.startRendering();
}

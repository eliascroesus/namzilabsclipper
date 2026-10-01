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
import { centreAt } from "../plan/framing";
import { NO_GRADE, overlayAt, sourceAt, sourceSpan, TWO_SHOT, type EditPlan, type FxEvent, type OverlayEvent, type ShotEvent } from "../plan/types";
import { BLEND_INDEX, drawCaption, popScale } from "./captions";
import { drawCard } from "./card";
import { loadFonts } from "./fonts";
import { Compositor, OVERLAY_SLOTS, type LayerDraw, type Rotation } from "./gl";
import { mixPlan } from "./mix";
import { balance, lookOf, type Tone } from "./tone";
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

/**
 * What the effects do at `t`: how much flash, burn, dim and so on, how far the punch-ins
 * zoom, and where the designs' transitions have the whole picture (moved, scaled,
 * turned, smeared). `aspect` is the frame's width over its height.
 */
export function fxAt(fx: FxEvent[], t: number, fps: number, aspect = 9 / 16) {
  let flash = 0;
  let burn = 0;
  let burnPhase = 0;
  let dim = 0;
  let punch = 1;
  let zoomBlur = 0;
  let split = 0;
  let mono = 0;
  const shake: [number, number] = [0, 0];
  const move: [number, number] = [0, 0];
  const streak: [number, number] = [0, 0];
  let scale = 1;
  let spin = 0;
  let spinBlur = 0;
  let blur = 0;
  let glitch = 0;
  let invert = 0;
  let bars = 0;
  let leak = 0;
  let leakPhase = 0;
  let vhs = 0;
  // The highlights glowing more than the look has them (a pulse on a hit), and the picture held still (a freeze frame) from this moment.
  let glow = 0;
  let freeze: number | null = null;
  // The picture closer than the shot's own framing (a punch-in step, a crash zoom), round
  // the framing's centre (the subject): held, where a punch settles back.
  let reframe = 1;
  // A transition showing two shots at once: which, how far from the first to the second (0 to 1), which way.
  let mix: { kind: "dissolve" | "push" | "slide"; at: number; p: number; dir: number } | null = null;
  const jolt = (n: number, seed: number) => (Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453) % 1;
  for (const e of fx) {
    if (t < e.start - 1e-6 || t >= e.end - 1e-6) continue;
    const span = Math.max(1e-6, e.end - e.start);
    // A transition's way in (0 to 1, up to the cut) and way out (1 on the cut, down to 0).
    const at = e.at ?? e.start;
    const into = t < at ? Math.min(1, (t - e.start + 1 / fps) / Math.max(1e-6, at - e.start + 1 / fps)) : 0;
    const out = t >= at ? Math.max(0, 1 - (t - at) / Math.max(1e-6, e.end - at)) : 0;
    if (e.kind === "flash") {
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
    } else if (e.kind === "punch") {
      // In over a frame or two to the hit, then settling back over the next eight.
      const env = t < at ? (t - e.start + 1 / fps) / Math.max(1e-6, at - e.start + 1 / fps) : (1 - (t - at) / Math.max(1e-6, e.end - at)) ** 2;
      punch = Math.max(punch, 1 + 0.14 * e.strength * Math.min(1, Math.max(0, env)));
    } else if (e.kind === "zoomblur") {
      const mid = e.at ?? (e.start + e.end) / 2;
      const half = Math.max(1e-6, Math.max(mid - e.start, e.end - mid));
      zoomBlur = Math.max(zoomBlur, e.strength * Math.max(0, 1 - Math.abs(t - mid) / half) ** 1.5);
    } else if (e.kind === "split") {
      // Full on the hit, closing up over the frames after it.
      if (t >= at - 1e-6) split = Math.max(split, e.strength * (1 - (t - at) / Math.max(1e-6, e.end - at)) ** 1.5);
    } else if (e.kind === "mono") {
      mono = Math.max(mono, e.strength);
    } else if (e.kind === "shake") {
      // A few frames of hard, decaying jolts (the same every render), with a touch of zoom so no edge shows.
      const k = Math.round((t - e.start) * fps);
      const decay = 1 - (t - e.start) / span;
      shake[0] += 0.03 * e.strength * decay * jolt(k * 2 + 1, e.start);
      shake[1] += 0.022 * e.strength * decay * jolt(k * 2 + 2, e.start);
      punch = Math.max(punch, 1 + 0.06 * e.strength * decay);
    } else if (e.kind === "zoomin") {
      // Rushing in to the cut, faster and faster, and the next shot landing zoomed in and
      // settling (easing out); pulling out instead when `dir` is -1, the next shot coming
      // in small, from its own mirror images.
      const env = t < at ? into ** 2 : out ** 3;
      const z = 1 + 0.5 * e.strength * env;
      scale *= (e.dir ?? 1) < 0 ? 1 / z : z;
      zoomBlur = Math.max(zoomBlur, Math.min(1, 1.1 * e.strength) * (t < at ? into ** 2 : out ** 2));
    } else if (e.kind === "whip") {
      // Sliding out along `dir`, faster and faster, and the next shot sliding in from the
      // other side, slowing, smeared along the way it goes.
      const a = ((e.dir ?? 0) * Math.PI) / 180;
      const d: [number, number] = [Math.cos(a), Math.sin(a)];
      const off = t < at ? 0.6 * e.strength * into ** 2 : -0.6 * e.strength * out ** 3;
      const smear = 0.4 * e.strength * (t < at ? into : out ** 2);
      move[0] += off * d[0];
      move[1] += off * d[1];
      streak[0] += smear * d[0];
      streak[1] += smear * d[1];
    } else if (e.kind === "spin") {
      // The same, turning: to the cut a quarter turn or so, and the next shot turning in.
      const way = (e.dir ?? 1) < 0 ? -1 : 1;
      spin += way * (t < at ? 1.2 * e.strength * into ** 2 : -1.2 * e.strength * out ** 3);
      spinBlur += way * 0.5 * e.strength * (t < at ? into : out ** 2);
      scale *= 1 + 0.25 * e.strength * (t < at ? into ** 2 : out ** 3);
    } else if (e.kind === "swing") {
      // Knocked round a few degrees on the hit, settling back, zoomed enough that no edge shows.
      const way = (e.dir ?? 1) < 0 ? -1 : 1;
      const th = ((4 * e.strength * Math.PI) / 180) * (t < at ? into : out ** 2);
      spin += way * th;
      const long = Math.max(aspect, 1 / aspect);
      scale *= Math.cos(th) + long * Math.sin(Math.abs(th));
    } else if (e.kind === "blur") {
      blur = Math.max(blur, e.strength * (t < at ? into ** 2 : out ** 2));
    } else if (e.kind === "glitch") {
      // Flickering: a new tear every frame, some frames harder than others.
      const k = Math.round((t - e.start) * fps);
      glitch = Math.max(glitch, e.strength * (0.55 + 0.45 * Math.abs(jolt(k, e.start))));
    } else if (e.kind === "invert") {
      invert = Math.max(invert, e.strength);
    } else if (e.kind === "strobe") {
      // Black every other frame.
      if (Math.round((t - e.start) * fps) % 2 === 1) dim = Math.max(dim, e.strength);
    } else if (e.kind === "leak") {
      const p = (t - e.start) / span;
      leak = Math.max(leak, e.strength * Math.sin(Math.PI * p));
      leakPhase = p;
    } else if (e.kind === "fade") {
      // Down to black into the cut, back up out of it.
      dim = Math.max(dim, e.strength * (t < at ? into : out) ** 1.5);
    } else if (e.kind === "vhs") {
      vhs = Math.max(vhs, e.strength);
    } else if (e.kind === "glow") {
      // Blooming on the hit, fading over the rest.
      glow = Math.max(glow, e.strength * (t < at ? into : out ** 1.5));
    } else if (e.kind === "freeze") {
      freeze = e.start;
    } else if (e.kind === "reframe") {
      // From one frame to the next the picture jumps closer, turned a degree or so, and stays
      // (an editor's punch-in step on a beat, inside a clip: nio.trade's …2531, …5448).
      reframe *= 1 + e.strength;
      if (e.dir) {
        const th = (e.dir * Math.PI) / 180;
        spin += th;
        // (Zoomed enough that no edge shows.)
        scale *= Math.cos(th) + Math.max(aspect, 1 / aspect) * Math.sin(Math.abs(th));
      }
    } else if (e.kind === "crash") {
      // A crash zoom: quick in the middle, easing at both ends, smeared while it moves, landing
      // on `at` and held (or, `dir` -1, back out to the shot's own framing).
      const u = t >= at ? 1 : Math.min(1, Math.max(0, (t - e.start + 1 / fps) / Math.max(1e-6, at - e.start + 1 / fps)));
      const k = u * u * (3 - 2 * u);
      reframe *= 1 + e.strength * ((e.dir ?? 1) < 0 ? 1 - k : k);
      if (t < at) zoomBlur = Math.max(zoomBlur, Math.min(1, 1.2 * e.strength) * 4 * u * (1 - u));
    } else if (e.kind === "choppy") {
      // Twelve frames a second: each held two or three.
      freeze = e.start + Math.floor((t - e.start) * 12 + 1e-6) / 12;
    } else if (e.kind === "bw") {
      // Black and white, harder (the mono curve) and a fifth darker, so the colour coming back is a lift too.
      mono = Math.max(mono, 1);
      dim = Math.max(dim, 0.18 * e.strength);
    } else if (e.kind === "steps") {
      // Zooming in by steps, a new size every two frames, a tenth of the picture each, up to
      // `strength` (nio.trade's …0002 on its chart): choppy on purpose.
      const k = Math.floor(((t - e.start) * fps) / 2 + 1e-6) + 1;
      scale *= 1 + Math.min(e.strength, 0.1 * k);
    } else if ((e.kind === "dissolve" || e.kind === "push" || e.kind === "slide") && e.at !== undefined) {
      // (Its frames evenly between the two shots: a five-frame crossfade shows the next one at
      // 1/6, 2/6 ... 5/6, as nio.trade's do, and whole on the frame after.)
      const u = Math.min(1, Math.max(0, (t - e.start + 1 / fps) / (span + 1 / fps)));
      // A crossfade straight through; a push or a slide quick in the middle, easing at both ends (a slide lands softly).
      const p = e.kind === "dissolve" ? u : e.kind === "push" ? u * u * (3 - 2 * u) : 1 - (1 - u) ** 3;
      mix = { kind: e.kind, at: e.at, p, dir: e.dir ?? 0 };
      if (e.kind === "push") {
        // Smeared along the way the two go, most in the middle.
        const a = ((e.dir ?? 0) * Math.PI) / 180;
        // (A little: enough to read as motion, little enough that the seam between the two shows.)
        const v = 0.08 * e.strength * 4 * u * (1 - u);
        streak[0] += v * Math.cos(a);
        streak[1] += v * Math.sin(a);
      }
    } else if (e.kind === "bars") {
      // Sliding in over their first eighteen frames.
      const p = Math.min(1, (t - e.start + 1 / fps) / (18 / fps));
      bars = Math.max(bars, e.strength * p * p * (3 - 2 * p));
    }
  }
  return { flash, burn, burnPhase, dim, punch, shake, zoomBlur, split, mono, move, scale, spin, streak, spinBlur, blur, glitch, invert, bars, leak, leakPhase, vhs, mix, glow, freeze, reframe };
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
  private readonly overReaders = new Map<OverlayEvent, ShotReader>();
  /** each shot's balance, once measured (render/tone.ts) */
  private readonly tones = new Map<number, { tone?: Tone; tries: number }>();
  /** what's in each overlay slot now */
  private readonly overKeys: string[] = [];
  /** what's in each shot slot now (the shot, and the one it's turning into in a transition that shows both) */
  private readonly uploaded: string[] = [];
  /** the transitions showing two shots at once, and their shots: the one going out and the one coming in */
  private readonly mixes: { e: FxEvent; a: number; b: number }[] = [];
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
    const near = (x: number, y: number) => Math.abs(x - y) < 0.5 / plan.fps;
    for (const e of plan.fx) {
      if (!TWO_SHOT.has(e.kind) || e.at === undefined) continue;
      const a = plan.shots.findIndex((s) => near(s.end, e.at!));
      if (a >= 0 && a + 1 < plan.shots.length && near(plan.shots[a + 1].start, e.at)) this.mixes.push({ e, a, b: a + 1 });
    }
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
      // (Decoded a little before and after its own stretch when a transition shows it there.)
      let pre = 0;
      let post = 0;
      for (const m of this.mixes) {
        if (m.b === i) pre = Math.max(pre, m.e.at! - m.e.start);
        if (m.a === i) post = Math.max(post, m.e.end - m.e.at!);
      }
      r = new ShotReader(sink, shot.srcStart - pre * shot.speed, shot.srcStart + sourceSpan(shot) + post * shot.speed);
      this.readers.set(i, r);
    }
    return r;
  }

  private sinkFor(source: string): VideoSampleSink | null {
    let sink = this.sinks.get(source);
    if (!sink) {
      const v = this.sources.get(source)?.video;
      if (!v) return null;
      this.sinks.set(source, (sink = new VideoSampleSink(v)));
    }
    return sink;
  }

  /**
   * A shot's layer balanced on its own under a look (render/tone.ts): its first frame as
   * it shows, measured once (again on the next frames while there's too little to
   * measure: a black frame, a flat colour).
   */
  private balanced(idx: number, layer: LayerDraw, graded: boolean): LayerDraw {
    if (!graded) return layer;
    let b = this.tones.get(idx);
    if (!b || (!b.tone && b.tries < 6)) {
      const look = lookOf(this.comp.measure(layer));
      b = { tone: look ? balance(look) : undefined, tries: (b?.tries ?? 0) + 1 };
      this.tones.set(idx, b);
    }
    return b.tone ? { ...layer, tone: b.tone } : layer;
  }

  /** An overlay's frame at `tau` seconds into it (a clip in a window plays; a still holds). */
  private async overlayFrame(o: OverlayEvent, tau: number): Promise<VideoSample | null> {
    let r = this.overReaders.get(o);
    if (!r) {
      const sink = this.sinkFor(o.source);
      if (!sink) return null;
      r = new ShotReader(sink, o.srcStart, o.srcStart + Math.max(0.05, (o.end - o.start) * o.speed));
      this.overReaders.set(o, r);
    }
    return r.at(o.srcStart + tau * o.speed);
  }

  private async dropReaders(keep: (i: number) => boolean) {
    for (const [i, r] of [...this.readers]) {
      if (keep(i)) continue;
      this.readers.delete(i);
      await r.close();
    }
  }

  /**
   * Shot `i` as it shows at `t`, in texture `slot`: also a moment just outside it, in a
   * transition showing two shots at once (it plays on past its end, or from a moment before
   * its start).
   */
  private async shotLayer(i: number, t: number, slot: number, punch: number, graded: boolean): Promise<LayerDraw | null> {
    const shot = this.plan.shots[i];
    if (!shot) return null;
    const dur = Math.max(1e-6, shot.end - shot.start);
    const tau = t - shot.start;
    const p = Math.min(1, Math.max(0, tau / dur));
    const c = shot.crop;
    const zoom = (c.zoom0 + (c.zoom1 - c.zoom0) * p) * punch;
    const [cx, cy] = centreAt(c, Math.min(dur, Math.max(0, tau)), dur);
    // A photo flying in: the card settles from its first size to its last, quickly.
    const card = c.inset ? { tilt: c.tilt ?? 0, inset: c.inset[0] + (c.inset[1] - c.inset[0]) * (1 - (1 - p) ** 3) } : c.tilt ? { tilt: c.tilt } : {};
    if (shot.kind === "image") {
      const img = this.sources.get(shot.source)?.image;
      if (!img) return null;
      const key = `img:${shot.source}`;
      if (this.uploaded[slot] !== key) {
        this.comp.upload(slot, img, img.width, img.height);
        this.uploaded[slot] = key;
      }
      return this.balanced(i, { slot, srcW: img.width, srcH: img.height, rotation: 0, flip: false, cx, cy, zoom, fit: c.fit, rect: c.rect, alpha: 1, ...card }, graded);
    }
    const sample = await this.reader(i)?.at(Math.max(0, shot.srcStart + sourceAt(shot, tau)));
    if (!sample) return null;
    const key = `${shot.source}@${sample.timestamp}`;
    if (this.uploaded[slot] !== key) {
      const vf = sample.toVideoFrame();
      this.comp.upload(slot, vf, sample.displayWidth, sample.displayHeight);
      vf.close();
      this.uploaded[slot] = key;
    }
    return this.balanced(i, { slot, srcW: sample.displayWidth, srcH: sample.displayHeight, rotation: sample.rotation as Rotation, flip: sample.flip, cx, cy, zoom, fit: c.fit, rect: c.rect, alpha: 1, ...card }, graded);
  }

  /** Draw the frame at `t` into the canvas. */
  async paint(t: number): Promise<void> {
    const { plan, comp, sources } = this;
    const { width: W, height: H, fps } = plan;
    const f = Math.round(t * fps);
    const idx = plan.shots.findIndex((s) => t >= s.start - 1e-6 && t < s.end - 1e-6);
    const e = fxAt(plan.fx, t, fps, W / H);
    // Two shots showing at once: the one going out and the one coming in.
    const both = e.mix ? this.mixes.find((m) => Math.abs(m.e.at! - e.mix!.at) < 1e-6) : undefined;
    // Going backwards restarts decoding; going forwards drops the shots left behind (not the one still going out).
    if (t < this.lastT) await this.dropReaders(() => false);
    else if (idx >= 0) await this.dropReaders((i) => i >= idx || i === both?.a);
    this.lastT = t;

    const layers: LayerDraw[] = [];
    // (A card of the user's own is a video: it plays as the last shot, as it was made.)
    const ownCard = plan.card?.spec.kind === "video";
    const inCard = !!plan.card && !ownCard && t >= plan.card.start - 1e-6;
    const inOwnCard = !!plan.card && ownCard && t >= plan.card.start - 1e-6;
    const shot: ShotEvent | undefined = idx >= 0 ? plan.shots[idx] : undefined;
    // (Each shot balanced on its own only under a look: "as shot" is as shot.)
    const graded = !inOwnCard && (plan.grade.warmth !== 0 || plan.grade.contrast !== 0);
    // (A shot under a split screen's panels isn't drawn: black where they aren't.)
    if (shot && !inCard && !shot.hide) {
      this.reader(idx + 1); // start decoding the next shot now
      const flat = (i: number) => !plan.shots[i].crop.inset && !plan.shots[i].crop.tilt && !plan.shots[i].hide;
      if (both && e.mix && flat(both.a) && flat(both.b)) {
        // The shot going out and the one coming in, both drawn: crossfading, pushed along
        // together (the next one coming in from the other side), or the next sliding in over the last.
        const [a, b] = [await this.shotLayer(both.a, t, 0, e.punch * e.reframe, graded), await this.shotLayer(both.b, t, 1, e.punch * e.reframe, graded)];
        const { kind, p, dir } = e.mix;
        const ang = (dir * Math.PI) / 180;
        const [dx, dy] = [Math.cos(ang), Math.sin(ang)];
        const at = (k: number) => ({ x: 0.5 + dx * k, y: 0.5 + dy * k, w: 1, h: 1 });
        if (kind === "dissolve") {
          if (a) layers.push(a);
          if (b) layers.push({ ...b, alpha: p });
        } else if (kind === "push") {
          if (a) layers.push({ ...a, card: at(p) });
          if (b) layers.push({ ...b, card: at(p - 1) });
        } else {
          if (a) layers.push(a);
          if (b) layers.push({ ...b, card: at(p - 1) });
        }
      } else {
        // (Held on one frame while a freeze lasts, when it started in this shot.)
        const held = e.freeze !== null && e.freeze >= shot.start - 1e-6 ? e.freeze : t;
        const l = await this.shotLayer(idx, held, 0, e.punch * e.reframe, graded);
        if (l) layers.push(l);
      }
    }

    // Pictures and clips over the shot: each a card in its own slot, the later over the earlier.
    if (!inCard && plan.overlays?.length) {
      for (const [o, r] of [...this.overReaders]) {
        if (t < o.start - 1e-6 || t >= o.end - 1e-6) {
          this.overReaders.delete(o);
          await r.close();
        }
      }
      const over = plan.overlays.filter((o) => t >= o.start - 1e-6 && t < o.end - 1e-6).slice(-OVERLAY_SLOTS);
      for (const [j, o] of over.entries()) {
        const slot = 2 + j;
        const tau = t - o.start;
        const [x, y, size] = overlayAt(o, tau);
        const card = { x, y, w: (size * o.aspect * H) / W, h: size };
        if (o.kind === "image") {
          const img = sources.get(o.source)?.image;
          if (!img) continue;
          const key = `img:${o.source}`;
          if (this.overKeys[j] !== key) {
            comp.upload(slot, img, img.width, img.height);
            this.overKeys[j] = key;
          }
          layers.push({ slot, srcW: img.width, srcH: img.height, rotation: 0, flip: false, cx: o.cx, cy: o.cy, zoom: o.zoom, fit: "cover", alpha: 1, tilt: o.tilt, card, rect: o.rect });
        } else {
          const sample = await this.overlayFrame(o, tau);
          if (!sample) continue;
          const key = `${o.source}@${sample.timestamp}`;
          if (this.overKeys[j] !== key) {
            const vf = sample.toVideoFrame();
            comp.upload(slot, vf, sample.displayWidth, sample.displayHeight);
            vf.close();
            this.overKeys[j] = key;
          }
          layers.push({ slot, srcW: sample.displayWidth, srcH: sample.displayHeight, rotation: sample.rotation as Rotation, flip: sample.flip, cx: o.cx, cy: o.cy, zoom: o.zoom, fit: "cover", alpha: 1, tilt: o.tilt, card, rect: o.rect });
        }
      }
    }

    // Captions and the card, redrawn only when they change (a popping word every frame of its pop).
    const caps = plan.captions.filter((cap) => t >= cap.start - 1e-6 && t < cap.end - 1e-6);
    const cardT = plan.card && inCard ? t - plan.card.start : -1;
    const popOf = (cap: (typeof caps)[number]) => (cap.pop || cap.look?.animate === "pop" ? Math.round((t - cap.start) * fps) : 5);
    // (Fading in over a quarter of a second; typed out at about 25 letters a second, half a second at least.)
    const fadeOf = (cap: (typeof caps)[number]) => (cap.anim === "fade" ? Math.min(1, (t - cap.start) / 0.25) : 1);
    const typedOf = (cap: (typeof caps)[number]) => (cap.anim === "type" ? Math.min(1, (t - cap.start) / Math.max(0.5, cap.text.length / 25)) : 1);
    const key = cardT >= 0 ? `card:${f}` : caps.map((cap) => `${cap.style}:${cap.x}:${cap.y}:${cap.text}:${Math.min(5, popOf(cap))}:${fadeOf(cap).toFixed(3)}:${typedOf(cap).toFixed(3)}`).join("|");
    if (key && key !== this.overlayKey) {
      this.octx.clearRect(0, 0, W, H);
      if (cardT >= 0 && plan.card) {
        drawCard(this.octx, W, H, cardT, plan.card.end - plan.card.start, plan.card.spec, { shot: this.cardImage }, plan.card.fadeIn, plan.card.fadeOut);
      } else {
        for (const cap of caps) drawCaption(this.octx, W, H, cap, fadeOf(cap), popScale(popOf(cap)), typedOf(cap));
      }
      comp.uploadOverlay(this.overlay);
      this.overlayKey = key;
    }
    // (The card and a card of the user's own untouched by the design: no bars, nothing moving.)
    const still = inCard || inOwnCard;
    comp.draw({
      layers,
      grade: inOwnCard ? NO_GRADE : e.glow > 0 ? { ...plan.grade, glow: Math.min(1, (plan.grade.glow ?? 0) + e.glow) } : plan.grade,
      flash: e.flash,
      burn: e.burn,
      burnPhase: e.burnPhase,
      dim: inCard ? 0 : e.dim,
      overlay: !!key,
      // (A caption of the user's own design mixes with the picture its own way: the first one showing sets it.)
      overlayBlend: cardT >= 0 ? 0 : BLEND_INDEX[caps.find((c) => c.look)?.look?.blend ?? "normal"],
      time: t,
      seed: 1.37,
      shake: e.shake,
      zoomBlur: still ? 0 : e.zoomBlur,
      split: still ? 0 : e.split,
      mono: still ? 0 : e.mono,
      ...(still ? {} : { move: e.move, scale: e.scale, spin: e.spin, streak: e.streak, spinBlur: e.spinBlur, blur: e.blur, glitch: e.glitch, invert: e.invert, bars: e.bars, leak: e.leak, leakPhase: e.leakPhase, vhs: e.vhs }),
    });
  }

  async close() {
    await this.dropReaders(() => false);
    for (const r of this.overReaders.values()) await r.close();
    this.overReaders.clear();
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

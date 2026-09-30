/**
 * Drawing and exporting a mimic edit, in the browser: every frame is the
 * footage (cropped, at its zoom) or a cutaway, the cards over it (sliding and
 * cutting as the reference's do, the user's picture cropped into each), and
 * the caption's words as they're said; the sound is the footage's voice with
 * any music and sounds mixed under it, at the level Instagram and TikTok play.
 */
import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, VideoSampleSink, WebMOutputFormat, type VideoSample } from "mediabunny";
import { decodeAudioBuffer, decodeMono, type Source } from "../engine/media/sources";
import { bitrateFor, pickCodecs } from "../engine/render/export";
import { audioDelay, shiftAudio } from "../engine/render/avsync";
import { loadFonts } from "../engine/render/fonts";
import { integratedLoudness, limit, MIX_RATE } from "../engine/render/mix";
import { drawPage, layoutPage, type LaidLine } from "./captions";
import { zoomAt } from "./plan";
import { makeSfx } from "./sfx";
import type { CaptionPage, MimicPlan, Motion, PlanCard } from "./types";

type Ctx = OffscreenCanvasRenderingContext2D;

/** Reads a stretch of a video's frames in order, a frame ahead. */
class ClipReader {
  private readonly iter: AsyncGenerator<VideoSample, void, unknown>;
  private cur: VideoSample | null = null;
  private next: VideoSample | null = null;
  private readonly ready: Promise<void>;

  constructor(sink: VideoSampleSink, from: number, to: number) {
    const iter = sink.samples(Math.max(0, from - 0.1), to + 0.1);
    this.iter = iter;
    this.ready = (async () => {
      const a = await iter.next();
      this.cur = a.done ? null : a.value;
      const b = await iter.next();
      this.next = b.done ? null : b.value;
    })();
  }

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

const easeOut = (u: number) => 1 - (1 - u) ** 2;
const easeIn = (u: number) => u ** 2;

/** How far a card is from where it rests, as a share of the frame (dx, dy), and its opacity. */
export function cardOffset(c: Pick<PlanCard, "start" | "end" | "rect" | "enter" | "exit">, t: number): { dx: number; dy: number; alpha: number; scale: number } | null {
  if (t < c.start - 1e-6 || t >= c.end - 1e-6) return null;
  const [x, y, w, h] = c.rect;
  const move = (m: Motion, u: number, coming: boolean) => {
    // u: 0 at rest, 1 fully off
    const eased = m.ease === "linear" ? u : coming ? (m.ease === "out" ? 1 - easeOut(1 - u) : 1 - easeIn(1 - u)) : m.ease === "in" ? easeIn(u) : easeOut(u);
    if (m.kind === "slide") {
      if (m.from === "right") return { dx: eased * (1 - x), dy: 0, alpha: 1, scale: 1 };
      if (m.from === "left") return { dx: -eased * (x + w), dy: 0, alpha: 1, scale: 1 };
      if (m.from === "bottom") return { dx: 0, dy: eased * (1 - y), alpha: 1, scale: 1 };
      return { dx: 0, dy: -eased * (y + h), alpha: 1, scale: 1 };
    }
    if (m.kind === "fade") return { dx: 0, dy: 0, alpha: 1 - eased, scale: 1 };
    if (m.kind === "pop") return { dx: 0, dy: 0, alpha: 1 - eased, scale: 1 - 0.3 * eased };
    return { dx: 0, dy: 0, alpha: 1, scale: 1 };
  };
  const inDur = c.enter.kind === "cut" ? 0 : c.enter.dur;
  const outDur = c.exit.kind === "cut" ? 0 : c.exit.dur;
  if (inDur > 0 && t < c.start + inDur) return move(c.enter, 1 - (t - c.start) / inDur, true);
  if (outDur > 0 && t > c.end - outDur) return move(c.exit, (t - (c.end - outDur)) / outDur, false);
  return { dx: 0, dy: 0, alpha: 1, scale: 1 };
}

export class MimicPainter {
  readonly canvas: OffscreenCanvas;
  private readonly ctx: Ctx;
  private readonly sinks = new Map<string, VideoSampleSink>();
  private readonly readers = new Map<string, ClipReader>();
  private readonly laid = new Map<CaptionPage, LaidLine[]>();
  private lastT = -Infinity;

  constructor(
    private readonly plan: MimicPlan,
    private readonly sources: Map<string, Source>,
    private readonly rawId: string,
  ) {
    this.canvas = new OffscreenCanvas(plan.width, plan.height);
    this.ctx = this.canvas.getContext("2d", { alpha: false })!;
    this.ctx.imageSmoothingQuality = "high";
  }

  private reader(key: string, id: string, from: number, to: number): ClipReader | null {
    let r = this.readers.get(key);
    if (r) return r;
    const v = this.sources.get(id)?.video;
    if (!v) return null;
    let sink = this.sinks.get(id);
    if (!sink) this.sinks.set(id, (sink = new VideoSampleSink(v)));
    r = new ClipReader(sink, from, to);
    this.readers.set(key, r);
    return r;
  }

  private async drop(keep: (key: string) => boolean) {
    for (const [k, r] of [...this.readers]) {
      if (keep(k)) continue;
      this.readers.delete(k);
      await r.close();
    }
  }

  /** A picture or a clip's frame, drawn to cover the box (x, y, w, h in pixels) about the centre (cx, cy), zoomed. */
  private async drawCover(id: string, key: string, from: number, to: number, srcT: number, box: [number, number, number, number], cx: number, cy: number, zoom: number) {
    const src = this.sources.get(id);
    if (!src) return;
    const [bx, by, bw, bh] = box;
    const sw = src.info.width;
    const sh = src.info.height;
    const k = Math.max(bw / sw, bh / sh) * zoom;
    const vw = bw / k;
    const vh = bh / k;
    const sx = Math.min(sw - vw, Math.max(0, cx * sw - vw / 2));
    const sy = Math.min(sh - vh, Math.max(0, cy * sh - vh / 2));
    if (src.image) {
      this.ctx.drawImage(src.image, sx, sy, vw, vh, bx, by, bw, bh);
      return;
    }
    const sample = await this.reader(key, id, from, to)?.at(srcT);
    if (sample) sample.draw(this.ctx, sx, sy, vw, vh, bx, by, bw, bh);
  }

  async paint(t: number): Promise<void> {
    const { plan, ctx } = this;
    const { width: W, height: H } = plan;
    if (t < this.lastT) await this.drop(() => false);
    this.lastT = t;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const body = plan.duration - plan.tail;
    if (t >= body) return;

    // The picture: a cutaway, or the footage at its zoom.
    const cut = plan.broll.find((b) => t >= b.start && t < b.end);
    const segIdx = plan.segments.findIndex((s) => t >= s.start - 1e-6 && t < s.end - 1e-6);
    await this.drop((k) => (k.startsWith("seg:") ? Number(k.slice(4)) >= segIdx : k.startsWith("b:") ? plan.broll[Number(k.slice(2))]?.end > t : k.startsWith("c:") ? plan.cards[Number(k.slice(2))]?.end > t : true));
    if (cut) {
      const i = plan.broll.indexOf(cut);
      const u = (t - cut.start) / Math.max(1e-6, cut.end - cut.start);
      const z = cut.zoom[0] + (cut.zoom[1] - cut.zoom[0]) * easeOut(u);
      const extra = this.sources.get(cut.extra);
      const clipT = cut.from + (t - cut.start);
      await this.drawCover(cut.extra, `b:${i}`, cut.from, cut.from + (cut.end - cut.start), extra?.info.kind === "video" ? Math.min(clipT, Math.max(0, extra.info.duration - 0.05)) : 0, [0, 0, W, H], cut.crop.cx, cut.crop.cy, Math.max(1, z));
    } else if (segIdx >= 0) {
      const s = plan.segments[segIdx];
      const srcT = s.from + (t - s.start);
      const fr = plan.frames?.find((f) => t >= f.start - 1e-6 && t < f.end - 1e-6) ?? plan.frame;
      const z = fr.zoom * zoomAt(plan.zoom, t);
      const next = plan.segments[segIdx + 1];
      if (next) this.reader(`seg:${segIdx + 1}`, this.rawId, next.from, next.to); // start decoding the next piece now
      await this.drawCover(this.rawId, `seg:${segIdx}`, s.from, s.to, srcT, [0, 0, W, H], fr.cx, fr.cy, z);
    }

    // Cards.
    for (let i = 0; i < plan.cards.length; i++) {
      const c = plan.cards[i];
      const o = cardOffset(c, t);
      if (!o) continue;
      const [x, y, w, h] = c.rect;
      const bw = w * W * o.scale;
      const bh = h * H * o.scale;
      const bx = (x + o.dx) * W + (w * W - bw) / 2;
      const by = (y + o.dy) * H + (h * H - bh) / 2;
      ctx.save();
      ctx.globalAlpha = o.alpha;
      if (c.radius > 0) {
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, c.radius * Math.min(bw, bh));
        ctx.clip();
      }
      const extra = this.sources.get(c.extra);
      const clipT = c.from + (t - c.start);
      await this.drawCover(c.extra, `c:${i}`, c.from, c.from + (c.end - c.start), extra?.info.kind === "video" ? Math.min(clipT, Math.max(0, extra.info.duration - 0.05)) : 0, [bx, by, bw, bh], c.crop.cx, c.crop.cy, c.crop.zoom);
      ctx.restore();
    }

    // The caption.
    const cap = plan.captions;
    if (cap) {
      const page = cap.pages.find((p) => t >= p.start - 1e-6 && t < p.end - 1e-6);
      if (page) {
        let laid = this.laid.get(page);
        if (!laid) this.laid.set(page, (laid = layoutPage(ctx, cap.look, page, W, H)));
        drawPage(ctx, cap.look, laid, page, t);
      }
    }
  }

  async close() {
    await this.drop(() => false);
  }
}

/** The soundtrack: the footage's voice piece by piece, the music under it at the reference's level, the sounds on their events. */
export async function mixMimic(plan: MimicPlan, sources: Map<string, Source>, rawId: string): Promise<AudioBuffer> {
  const length = Math.ceil(plan.duration * MIX_RATE);
  const raw = sources.get(rawId);
  const out = new OfflineAudioContext(2, length, MIX_RATE).createBuffer(2, length, MIX_RATE);
  const och = [out.getChannelData(0), out.getChannelData(1)];
  // The voice, piece by piece, decoded straight to the mix rate (a voice needs one channel),
  // each piece faded in and out over 6 ms so a jump cut doesn't click.
  if (raw?.info.hasAudio) {
    const fade = Math.round(0.006 * MIX_RATE);
    for (const s of plan.segments) {
      const y = await decodeMono(raw, MIX_RATE, s.from, s.to);
      const at = Math.round(s.start * MIX_RATE);
      const n = Math.min(y.length, length - at);
      for (let i = 0; i < n; i++) {
        const v = y[i] * Math.min(1, (i + 1) / fade, (n - i) / fade);
        och[0][at + i] += v;
        och[1][at + i] += v;
      }
    }
  }
  const voiceLoud = integratedLoudness(och);
  // Music, as far under the voice as the reference's bed was.
  const m = plan.music;
  const song = m ? sources.get(m.source) : undefined;
  if (m && song) {
    const span = plan.duration - m.start;
    const buf = await decodeAudioBuffer(song, m.from, m.from + span, MIX_RATE);
    if (buf) {
      const mch = [buf.getChannelData(0), buf.getChannelData(Math.min(1, buf.numberOfChannels - 1))];
      const musicLoud = integratedLoudness(mch);
      const gain = voiceLoud > -69 && musicLoud > -69 ? Math.pow(10, (voiceLoud + m.gain - musicLoud) / 20) : 0.1;
      const at = Math.round(m.start * MIX_RATE);
      const fadeIn = Math.round(0.4 * MIX_RATE);
      const fadeOut = Math.round(m.fadeOut * MIX_RATE);
      const n = Math.min(mch[0].length, length - at);
      for (let i = 0; i < n; i++) {
        const env = Math.min(1, i / fadeIn, (n - i) / Math.max(1, fadeOut));
        for (let c = 0; c < 2; c++) och[c][at + i] += mch[c][i] * gain * env;
      }
    }
  }
  // Sounds on their events, peaking on the moment.
  const made = new Map<string, ReturnType<typeof makeSfx>>();
  const ref = voiceLoud > -69 ? Math.pow(10, (voiceLoud + 14) / 20) : 1;
  for (const s of plan.sfx) {
    let fx = made.get(s.kind);
    if (!fx) made.set(s.kind, (fx = makeSfx(s.kind, MIX_RATE)));
    const at = Math.round((s.t - fx.peak) * MIX_RATE);
    for (let i = 0; i < fx.data.length; i++) {
      const k = at + i;
      if (k < 0 || k >= length) continue;
      const v = fx.data[i] * s.gain * 0.35 * ref;
      och[0][k] += v;
      och[1][k] += v;
    }
  }
  const loud = integratedLoudness(och);
  if (loud > -69) {
    const g = Math.pow(10, (-14 - loud) / 20);
    for (const ch of och) for (let i = 0; i < ch.length; i++) ch[i] *= g;
    limit(och, Math.pow(10, -1.5 / 20));
  }
  return out;
}

export interface MimicRender {
  blob: Blob;
  mime: string;
  ext: "mp4" | "webm";
  ms: number;
}

/** Render the whole edit to a file. */
export async function renderMimic(plan: MimicPlan, sources: Map<string, Source>, rawId: string, opts: { onProgress?: (p: number, stage: string) => void; signal?: AbortSignal } = {}): Promise<MimicRender> {
  const t0 = performance.now();
  const { width: W, height: H, fps } = plan;
  await loadFonts();
  const codecs = await pickCodecs(W, H);
  const cancelled = () => {
    if (opts.signal?.aborted) throw new DOMException("Render cancelled", "AbortError");
  };
  opts.onProgress?.(0, "Mixing the sound");
  const delay = await audioDelay(codecs.container, codecs.audio, 0);
  const audio = shiftAudio(await mixMimic(plan, sources, rawId), delay);
  cancelled();
  const target = new BufferTarget();
  const output = new Output({ format: codecs.container === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(), target });
  const painter = new MimicPainter(plan, sources, rawId);
  let finished = false;
  try {
    const video = new CanvasSource(painter.canvas, { codec: codecs.video, bitrate: bitrateFor(W, H), keyFrameInterval: 2, latencyMode: "quality", hardwareAcceleration: "no-preference" });
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
    await painter.close();
  }
  const mime = codecs.container === "mp4" ? "video/mp4" : "video/webm";
  return { blob: new Blob([target.buffer!], { type: mime }), mime, ext: codecs.container, ms: Math.round(performance.now() - t0) };
}

/** Single frames, for previews and checks. */
export async function mimicStills(plan: MimicPlan, sources: Map<string, Source>, rawId: string, times: number[]): Promise<Blob[]> {
  await loadFonts();
  const painter = new MimicPainter(plan, sources, rawId);
  const out: Blob[] = [];
  try {
    for (const t of times) {
      await painter.paint(Math.round(t * plan.fps) / plan.fps);
      out.push(await painter.canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 }));
    }
  } finally {
    await painter.close();
  }
  return out;
}

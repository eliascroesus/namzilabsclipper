/**
 * Drawing and exporting a mimic edit, in the browser: every frame is the
 * footage (cropped, at its zoom) or a cutaway, the cards over it (sliding and
 * cutting as the reference's do, the user's picture cropped into each), and
 * the caption's words as they're said; the sound is the footage's voice with
 * any music and sounds mixed under it, at the level Instagram and TikTok play.
 */
import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, VideoSampleSink, WebMOutputFormat, type VideoSample } from "mediabunny";
import { decodeMono, type Source } from "../engine/media/sources";
import { bitrateFor, pickCodecs } from "../engine/render/export";
import { audioDelay, shiftAudio } from "../engine/render/avsync";
import { loadFonts } from "../engine/render/fonts";
import { loadFontsFor } from "../engine/text/library";
import { PersonMasker } from "../engine/vision/person";
import { integratedLoudness, limit, MIX_RATE } from "../engine/render/mix";
import { drawPage, layoutPage, type LaidLine } from "./captions";
import { drawDesign, layoutDesign, type LaidDesign } from "./design";
import type { TextDesign } from "./types";
import { decodeStereo } from "./audio";
import { lineAt, zoomAt } from "./plan";
import { isMadeSound, makeSfx, type Sfx } from "./sfx";
import type { CaptionPage, MimicPlan, Motion, PlanCard, SfxCue } from "./types";

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
  private readonly laidDesign = new Map<CaptionPage, LaidDesign>();
  /** the speaker cut out of the frame, for captions set behind them */
  private person: OffscreenCanvas | null = null;
  private masker: PersonMasker | null | "none" = null;
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

    // A caption set behind the speaker goes on now, the speaker cut out of the frame and laid back over it.
    const cap = plan.captions;
    const page = cap?.pages.find((p) => t >= p.start - 1e-6 && t < p.end - 1e-6);
    let captioned = false;
    if (cap && page && cap.look.design && page.behind && !cut && segIdx >= 0 && !this.laidFor(page, cap.look.design).front) {
      await this.behindSpeaker(t, () => this.drawCaption(page, t));
      captioned = true;
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
    if (page && !captioned) this.drawCaption(page, t);
  }

  /** Where a design's caption's words go (worked out once a caption). */
  private laidFor(page: CaptionPage, d: TextDesign): LaidDesign {
    let laid = this.laidDesign.get(page);
    if (!laid) this.laidDesign.set(page, (laid = layoutDesign(this.ctx, d, page, this.plan.width, this.plan.height)));
    return laid;
  }

  /** A caption at t: the design's (several styles, stacked, animated), or the plain look's. */
  private drawCaption(page: CaptionPage, t: number) {
    const { plan, ctx } = this;
    const cap = plan.captions!;
    const { width: W, height: H } = plan;
    const d = cap.look.design;
    if (d) {
      const laid = this.laidFor(page, d);
      // Riding the footage's zoom: scaled about the middle as the picture has been since the caption came on.
      const k = d.ride ? zoomAt(plan.zoom, t) / Math.max(1e-6, zoomAt(plan.zoom, page.start)) : 1;
      if (Math.abs(k - 1) > 1e-4) {
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(k, k);
        ctx.translate(-W / 2, -H / 2);
        drawDesign(ctx, d, laid, page, t);
        ctx.restore();
      } else drawDesign(ctx, d, laid, page, t);
      return;
    }
    let laid = this.laid.get(page);
    if (!laid) this.laid.set(page, (laid = layoutPage(ctx, cap.look, page, W, H)));
    drawPage(ctx, cap.look, laid, page, t);
  }

  /**
   * Text behind the speaker: the frame as drawn so far is cut to the person in it (the
   * segmenter's mask, steadied frame to frame), the caption drawn over the frame, and the
   * cut-out laid back on top. Without the segmenter (it failed to load), the caption simply
   * goes on top.
   */
  private async behindSpeaker(t: number, draw: () => void) {
    const { width: W, height: H } = this.plan;
    if (this.masker === null) this.masker = await PersonMasker.get().catch(() => "none" as const);
    if (this.masker === "none") return draw();
    const mask = this.masker.mask((c, w, h) => c.drawImage(this.canvas, 0, 0, w, h), W, H, t);
    if (!this.person) this.person = new OffscreenCanvas(W, H);
    const pc = this.person.getContext("2d")!;
    pc.globalCompositeOperation = "copy";
    pc.drawImage(this.canvas, 0, 0);
    pc.globalCompositeOperation = "destination-in";
    pc.imageSmoothingEnabled = true;
    pc.imageSmoothingQuality = "high";
    pc.drawImage(mask, 0, 0, W, H);
    pc.globalCompositeOperation = "source-over";
    draw();
    this.ctx.drawImage(this.person, 0, 0);
  }

  async close() {
    await this.drop(() => false);
  }
}

/** What a mix needs besides the plan: the user's own sounds (by id), and the voice decoded last time. */
export interface MixExtras {
  sounds?: Map<string, Sfx>;
  voice?: { key: string; data: Float32Array; loud: number } | null;
  /** the music decoded last time, and its loudness */
  music?: { key: string; ch: [Float32Array, Float32Array]; loud: number } | null;
}

/** Sound effects sit this far under the voice (dB, their loudness against its talking), before their own level. */
export const SFX_UNDER = -8;

/** The voice's loudness: the RMS of the 10 ms blocks where it's talking (within 30 dB of its loudest). */
export function talkRms(y: Float32Array, rate: number): number {
  const block = Math.max(1, Math.round(0.01 * rate));
  const ms: number[] = [];
  for (let i = 0; i < y.length; i += block) {
    let s = 0;
    const n = Math.min(block, y.length - i);
    for (let k = 0; k < n; k++) s += y[i + k] ** 2;
    ms.push(s / n);
  }
  const top = ms.reduce((a, v) => Math.max(a, v), 0);
  const talk = ms.filter((v) => v > top / 1000);
  return talk.length ? Math.sqrt(talk.reduce((a, v) => a + v, 0) / talk.length) : 0;
}

const made = new Map<string, Sfx>();
const madeSound = (id: string) => {
  let fx = made.get(id);
  if (!fx && isMadeSound(id)) made.set(id, (fx = makeSfx(id, MIX_RATE)));
  return fx ?? null;
};

/**
 * Sound effects into a stereo mix: each lined up on its moment by its loudest part, as loud
 * against the voice as its level says, and moving across from one side to the other as the
 * card it's on does (an equal-power pan, the middle at full level in both channels).
 */
export function addSfx(och: [Float32Array, Float32Array], rate: number, cues: SfxCue[], gainDb: number, voiceRms: number, sound: (id: string) => Sfx | null) {
  const len = och[0].length;
  for (const c of cues) {
    const fx = sound(c.sound);
    if (!fx || fx.rms <= 0) continue;
    const g = (Math.max(voiceRms, 0.01) * Math.pow(10, (SFX_UNDER + c.db + gainDb) / 20)) / fx.rms;
    const at = Math.round((c.t - fx.peak) * rate);
    const n = fx.data.length;
    for (let i = 0; i < n; i++) {
      const k = at + i;
      if (k < 0 || k >= len) continue;
      const p = c.pan ? c.pan[0] + ((c.pan[1] - c.pan[0]) * i) / n : 0;
      const a = ((p + 1) * Math.PI) / 4;
      const v = fx.data[i] * g * Math.SQRT2;
      och[0][k] += v * Math.cos(a);
      och[1][k] += v * Math.sin(a);
    }
  }
}

/** The footage's voice on the edit's clock, piece by piece, each faded over 6 ms so a jump cut doesn't click. */
async function voiceTrack(plan: MimicPlan, sources: Map<string, Source>, rawId: string, extra: MixExtras): Promise<Float32Array> {
  const length = Math.ceil(plan.duration * MIX_RATE);
  const key = JSON.stringify([rawId, length, plan.segments.map((s) => [s.from, s.to, s.start])]);
  if (extra.voice?.key === key) return extra.voice.data;
  const data = new Float32Array(length);
  const raw = sources.get(rawId);
  if (raw?.info.hasAudio) {
    const fade = Math.round(0.006 * MIX_RATE);
    for (const s of plan.segments) {
      const y = await decodeMono(raw, MIX_RATE, s.from, s.to);
      const at = Math.round(s.start * MIX_RATE);
      const n = Math.min(y.length, length - at);
      for (let i = 0; i < n; i++) data[at + i] += y[i] * Math.min(1, (i + 1) / fade, (n - i) / fade);
    }
  }
  extra.voice = { key, data, loud: integratedLoudness([data, data]) };
  return data;
}

/** The soundtrack: the footage's voice, the music under it (at the reference's level, then the user's volume line), the sound effects on their moments. */
export async function mixMimic(plan: MimicPlan, sources: Map<string, Source>, rawId: string, extra: MixExtras = {}): Promise<AudioBuffer> {
  const length = Math.ceil(plan.duration * MIX_RATE);
  const out = new OfflineAudioContext(2, length, MIX_RATE).createBuffer(2, length, MIX_RATE);
  const och: [Float32Array, Float32Array] = [out.getChannelData(0), out.getChannelData(1)];
  const voice = await voiceTrack(plan, sources, rawId, extra);
  och[0].set(voice.subarray(0, length));
  och[1].set(voice.subarray(0, length));
  const voiceLoud = extra.voice?.data === voice ? extra.voice.loud : integratedLoudness(och);
  // Music, as far under the voice as the reference's bed was, along the user's volume line.
  const m = plan.music;
  const song = m ? sources.get(m.source) : undefined;
  if (m && song) {
    const span = Math.min(plan.duration, m.end ?? plan.duration) - m.start;
    const key = JSON.stringify([m.source, m.from, Math.round(span * 100)]);
    if (extra.music?.key !== key) {
      const ch = await decodeStereo(song, MIX_RATE, m.from, m.from + span);
      extra.music = ch ? { key, ch, loud: integratedLoudness(ch) } : null;
    }
    if (extra.music) {
      const mch = extra.music.ch;
      const musicLoud = extra.music.loud;
      const gain = voiceLoud > -69 && musicLoud > -69 ? Math.pow(10, (voiceLoud + m.gain - musicLoud) / 20) : 0.1;
      const at = Math.round(m.start * MIX_RATE);
      const fadeIn = Math.round(0.4 * MIX_RATE);
      const fadeOut = Math.round(m.fadeOut * MIX_RATE);
      const n = Math.min(mch[0].length, length - at);
      const BLOCK = 256;
      for (let b = 0; b < n; b += BLOCK) {
        const line = Math.pow(10, lineAt(m.line, (at + b) / MIX_RATE) / 20);
        for (let i = b; i < Math.min(n, b + BLOCK); i++) {
          const env = Math.min(1, i / fadeIn, (n - i) / Math.max(1, fadeOut)) * line * gain;
          och[0][at + i] += mch[0][i] * env;
          och[1][at + i] += mch[1][i] * env;
        }
      }
    }
  }
  addSfx(och, MIX_RATE, plan.sfx, plan.sfxGain ?? 0, talkRms(voice, MIX_RATE), (id) => extra.sounds?.get(id) ?? madeSound(id));
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

/** The fonts a plan's text design uses, loaded. */
export const designFonts = (plan: MimicPlan) => loadFontsFor(plan.captions?.look.design?.styles.map((s) => s.font) ?? []);

/** Render the whole edit to a file. */
export async function renderMimic(plan: MimicPlan, sources: Map<string, Source>, rawId: string, opts: { onProgress?: (p: number, stage: string) => void; signal?: AbortSignal; extra?: MixExtras } = {}): Promise<MimicRender> {
  const t0 = performance.now();
  const { width: W, height: H, fps } = plan;
  await loadFonts();
  await designFonts(plan);
  const codecs = await pickCodecs(W, H);
  const cancelled = () => {
    if (opts.signal?.aborted) throw new DOMException("Render cancelled", "AbortError");
  };
  opts.onProgress?.(0, "Mixing the sound");
  const delay = await audioDelay(codecs.container, codecs.audio, 0);
  const audio = shiftAudio(await mixMimic(plan, sources, rawId, opts.extra), delay);
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
  await designFonts(plan);
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

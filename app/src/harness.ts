/**
 * A bare page the browser tests drive (e2e/run.mjs): each function takes file
 * URLs, runs one part of the engine for real in Chrome, and returns plain data.
 */
import { analyzeSong, pickSection, SR, withVocals } from "./engine/audio/song";
import { cutFinder, cutFrames, frameChanges } from "./engine/media/cuts";
import { settlePlan } from "./engine/plan/settle";
import { findVocals } from "./engine/audio/vocals";
import { decodeMono, openSource, type Source } from "./engine/media/sources";
import { KINDS, scanImage, scanVideo, scoreInterest, type Scan } from "./engine/media/scan";
import { planMontage, usedRanges, type Ranges } from "./engine/plan/montage";
import { planMeme, planTwist } from "./engine/plan/formats";
import type { Aspect, CardSpec } from "./engine/plan/types";
import { blobToBase64Parts, renderPlan, renderStills } from "./engine/render/export";
import { FaceFinder } from "./engine/vision/faces";
import { followFaces } from "./engine/vision/track";

async function save(name: string, blob: Blob) {
  const parts = await blobToBase64Parts(blob);
  // One call per file: the runner concatenates base64 parts written in order.
  for (let i = 0; i < parts.length; i++) await window.__save!(i === 0 ? name : `${name}.part${i}`, parts[i]);
}

async function load(url: string, id = url): Promise<Source> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const blob = await res.blob();
  return openSource(id, blob, url.split("/").pop() ?? url);
}

const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

const harness = {
  montage,
  /** Faces in frames of a video (or a photo) at the given times, looked at `size` px wide. */
  async faces(url: string, times: number[], size = 320) {
    const src = await load(url);
    const finder = await FaceFinder.get();
    const out: { t: number; ms: number; faces: { x: number; y: number; w: number; h: number; score: number }[] }[] = [];
    if (src.image) {
      const img = src.image;
      const t0 = performance.now();
      const faces = await finder.find((ctx) => ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height), img.width / img.height, size);
      return [{ t: 0, ms: Math.round(performance.now() - t0), faces }];
    }
    const { VideoSampleSink } = await import("mediabunny");
    const sink = new VideoSampleSink(src.video!);
    let i = 0;
    for await (const sample of sink.samplesAtTimestamps(times)) {
      const t = times[i++];
      if (!sample) continue;
      const t0 = performance.now();
      const faces = await finder.find((ctx) => sample.drawWithFit(ctx, { fit: "fill" }), sample.displayWidth / sample.displayHeight, size);
      out.push({ t, ms: Math.round(performance.now() - t0), faces: faces.map((f) => ({ x: round(f.x), y: round(f.y), w: round(f.w), h: round(f.h), score: round(f.score, 2) })) });
      sample.close();
    }
    return out;
  },
  async cards() {
    const { drawCard } = await import("./engine/render/card");
    const { loadFonts } = await import("./engine/render/fonts");
    await loadFonts();
    const img = await createImageBitmap(await (await fetch("/demo-dashboard.jpg")).blob());
    const out: string[] = [];
    for (const [kind, W, H] of [["phone", 1080, 1920], ["phone", 1440, 1080], ["laptop", 1080, 1920], ["laptop", 1440, 1080]] as const) {
      const c = new OffscreenCanvas(W, H);
      drawCard(c.getContext("2d")!, W, H, 2, 4, { kind, top: "get the app", bottom: "namzilabs.co", accent: "#568CFF", hold: 4, draw: false }, { shot: img });
      const name = `card-${kind}-${W}x${H}.png`;
      await save(name, await c.convertToBlob({ type: "image/png" }));
      out.push(name);
    }
    return out;
  },
  async avsync() {
    const { audioDelay } = await import("./engine/render/avsync");
    return {
      webmOpus: await audioDelay("webm", "opus"),
      mp4Opus: await audioDelay("mp4", "opus"),
    };
  },

  async song(url: string, length = 14) {
    const src = await load(url);
    const t0 = performance.now();
    const y = await decodeMono(src, SR);
    const t1 = performance.now();
    const song = analyzeSong(y);
    const t2 = performance.now();
    return {
      info: src.info,
      decodeMs: Math.round(t1 - t0),
      analyzeMs: Math.round(t2 - t1),
      samples: y.length,
      bpm: round(song.bpm, 2),
      beats: song.beats.map((b) => round(b)),
      downbeats: song.downbeats.map((b) => round(b)),
      drops: song.drops.map((d) => ({ t: round(d.t), s: round(d.strength, 2) })),
      accents: song.accents.length,
      section: pickSection(song, length, false),
    };
  },

  /** Scan videos and rate their frames with the in-page picture model (no key); per sample: interest, kind, flex. */
  async sense(urls: string[]) {
    const { senseSheets } = await import("./engine/vision/sense");
    const { lookFor } = await import("./engine/vision/look");
    const scans: Scan[] = [];
    const timing: Record<string, number> = {};
    for (const url of urls) {
      const src = await load(url);
      const sc = await scanVideo(src);
      const t0 = performance.now();
      if (sc.sheets) sc.look = lookFor(sc, sc.sheets, await senseSheets(sc.sheets));
      timing[url] = Math.round(performance.now() - t0);
      scans.push(sc);
    }
    const plain = scans.map((sc) => ({ ...sc, look: undefined }) as Scan);
    scoreInterest(plain);
    scoreInterest(scans);
    return scans.map((s, k) => ({
      url: urls[k],
      senseMs: timing[urls[k]],
      frames: s.sheets?.cells.length ?? 0,
      t: Array.from(s.stats.t).map((v) => round(v, 2)),
      before: Array.from(plain[k].interest ?? []).map((v) => round(v, 2)),
      interest: Array.from(s.interest ?? []).map((v) => round(v, 2)),
      flex: Array.from(s.look?.flex ?? []).map((v) => round(v, 2)),
      kind: Array.from(s.look?.kind ?? []).map((k) => KINDS[k]),
    }));
  },
  /** How the page sees a stretch of a video frame by frame: each frame's change from the one before, and the cuts it finds. */
  async changes(url: string, a: number, b: number) {
    const src = await load(url, "clip0");
    const { times, changes } = await frameChanges(src, a, b);
    return { times, changes, cuts: cutFrames(changes).map((i) => times[i]) };
  },

  async scan(urls: string[]) {
    const scans: Scan[] = [];
    const timing: Record<string, number> = {};
    for (const url of urls) {
      const src = await load(url);
      const t0 = performance.now();
      scans.push(src.info.kind === "image" ? await scanImage(src) : await scanVideo(src));
      timing[url] = Math.round(performance.now() - t0);
    }
    scoreInterest(scans);
    return scans.map((s, k) => ({
      url: urls[k],
      ms: timing[urls[k]],
      duration: round(s.duration),
      size: [s.width, s.height],
      samples: s.stats.t.length,
      cuts: s.cuts.map((c) => round(c)),
      interest: Array.from(s.interest ?? []).map((v) => round(v, 2)),
      sharp: Array.from(s.stats.sharp).map((v) => round(v, 1)),
      motion: Array.from(s.stats.motion).map((v) => round(v, 3)),
      luma: Array.from(s.stats.luma).map((v) => round(v, 2)),
      thumbBytes: s.thumb?.size ?? 0,
    }));
  },
};

export interface MontageRun {
  format?: "montage" | "twist" | "meme";
  /** clip indices that go after the flip, in the twist */
  actB?: number[];
  captionB?: string;
  memeText?: string;
  memePosition?: "upper" | "centre";
  song: string;
  clips: string[];
  aspect?: Aspect;
  length?: number;
  variants?: number;
  fromStart?: boolean;
  caption?: { style: "mood" | "pov"; text: string } | null;
  card?: Partial<CardSpec> | null;
  prefer?: "mp4" | "webm";
  codecs?: { container: "mp4" | "webm"; video: "vp9" | "avc" | "av1"; audio: "aac" | "opus" };
  out?: string;
  /** only draw these moments (seconds, "shots" for the middle of every shot, "fx" around each effect's peak) as PNGs */
  stills?: number[] | "shots" | "fx";
  /** follow faces through each shot before drawing */
  faces?: boolean;
  /** speed ramps (a velocity edit) */
  velocity?: boolean;
  /** draw each shot's first, middle and last frame instead of one per shot */
  thirds?: boolean;
  /** listen for the singing (default on) */
  vocals?: boolean;
  /** where in the song the edits start (default: automatic) */
  songStart?: number;
  /** judge the footage with the picture model in the page, as the app does without a key (default on) */
  sense?: boolean;
  /** save the analysed song and footage (and the contact sheets) for tuning the planner outside the page */
  dump?: boolean;
  /** look at every frame the edit uses for the footage's own cuts, and plan again around them (default on) */
  settle?: boolean;
}

/** JSON for the analysis: typed arrays as { $ta, d }, blobs left out. */
function toJSON(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) return { $ta: v.constructor.name, d: Array.from(v as unknown as ArrayLike<number>) };
    if (v instanceof Blob) return undefined;
    return v;
  });
}

async function montage(run: MontageRun) {
  const timing: Record<string, number> = {};
  let t = performance.now();
  const lap = (k: string) => {
    const now = performance.now();
    timing[k] = Math.round(now - t);
    t = now;
  };
  const songSrc = run.song ? await load(run.song, "song") : null;
  let song = null;
  if (songSrc) {
    const y = await decodeMono(songSrc, SR);
    song = analyzeSong(y);
    if (run.vocals !== false) song = withVocals(song, await findVocals(y));
  }
  lap("song");
  const sources = new Map<string, Source>(songSrc ? [["song", songSrc]] : []);
  const scans: Scan[] = [];
  for (const [i, url] of run.clips.entries()) {
    const src = await load(url, `clip${i}`);
    sources.set(src.info.id, src);
    scans.push(src.info.kind === "image" ? await scanImage(src) : await scanVideo(src));
  }
  if (run.sense !== false) {
    const { senseSheets } = await import("./engine/vision/sense");
    const { lookFor } = await import("./engine/vision/look");
    for (const sc of scans) if (sc.kind === "video" && sc.sheets) sc.look = lookFor(sc, sc.sheets, await senseSheets(sc.sheets));
  }
  scoreInterest(scans);
  lap("scan");
  if (run.dump) {
    await save(`${run.out ?? "state"}-state.json`, new Blob([toJSON({ song, scans })]));
    for (const sc of scans) for (const [k, im] of (sc.sheets?.images ?? []).entries()) await save(`${run.out ?? "state"}-sheet-${sc.id}-${k}.jpg`, im);
  }
  const img = await createImageBitmap(await (await fetch("/demo-dashboard.jpg")).blob());
  const card: CardSpec | null = run.card === null ? null : { kind: "laptop", top: "start free", bottom: "namzilabs.co", accent: "#568CFF", hold: 4, draw: false, ...(run.card ?? {}) };
  const results = [];
  const avoid: Ranges = new Map();
  for (let v = 0; v < (run.variants ?? 1); v++) {
    const common = { song: song ?? undefined, songSource: "song", songName: run.song?.split("/").pop() ?? "", fromStart: run.fromStart ?? true, songStart: run.songStart, scans, aspect: run.aspect ?? "9x16", length: run.length ?? 14, card, variant: v, avoid, velocity: run.velocity };
    const make = () =>
      run.format === "twist"
        ? planTwist({ ...common, actB: new Set((run.actB ?? []).map((i) => `clip${i}`)), captionA: run.caption?.text ?? "what they see vs...", captionB: run.captionB ?? "what they don't..." })
        : run.format === "meme"
          ? planMeme({ ...common, text: run.memeText ?? "", position: run.memePosition ?? "upper" })
          : planMontage({ ...common, song: song!, caption: run.caption === undefined ? { style: "mood", text: "Peak life." } : run.caption });
    // As the app does: planned again until no shot runs over one of the footage's own cuts.
    const plan = run.settle === false ? make() : await settlePlan(make, new Map(scans.map((sc) => [sc.id, sc])), cutFinder(sources));
    usedRanges(plan, avoid);
    lap(`plan${v}`);
    if (run.faces) {
      await followFaces(plan, sources, new Map(scans.map((s) => [s.id, s])));
      lap(`faces${v}`);
    }
    if (run.stills) {
      const inShot = (s: { start: number; end: number }) => (run.thirds ? [s.start + 0.5 / 30, (s.start + s.end) / 2, s.end - 1.5 / 30] : [(s.start + s.end) / 2]);
      const times =
        run.stills === "shots"
          ? [...plan.shots.flatMap(inShot), ...(plan.card ? [plan.card.start + 2] : [])]
          : run.stills === "fx"
            ? plan.fx.filter((f) => f.kind !== "dip").flatMap((f) => [-3, -1, 0, 2, 5].map((k) => Math.max(0, (f.at ?? f.start) + k / 30)))
            : run.stills;
      const pngs = await renderStills(plan, sources, times, img);
      for (const [k, png] of pngs.entries()) await save(`${run.out ?? "still"}-v${v + 1}-${String(k).padStart(2, "0")}.png`, png);
      await save(`${run.out ?? "still"}-v${v + 1}.plan.json`, new Blob([JSON.stringify(plan, null, 1)]));
      lap(`stills${v}`);
      results.push({ file: "", bytes: 0, silentBytes: 0, codecs: "", ms: 0, checks: plan.checks, shots: plan.shots.map((s) => [s.start.toFixed(2), s.source, s.srcStart.toFixed(2), s.role, s.score]) });
      continue;
    }
    const res = await renderPlan(plan, sources, { music: !!plan.music, silentCopy: v === 0 && !!plan.music, cardImage: img, prefer: run.prefer, codecs: run.codecs });
    lap(`render${v}`);
    const base = `${run.out ?? "montage"}-v${v + 1}`;
    await save(`${base}.${res.ext}`, res.blob);
    if (res.silent) await save(`${base}-silent.${res.ext}`, res.silent);
    await save(`${base}.plan.json`, new Blob([JSON.stringify(plan, null, 1)]));
    results.push({ file: `${base}.${res.ext}`, bytes: res.blob.size, silentBytes: res.silent?.size, codecs: `${res.videoCodec}/${res.audioCodec}`, ms: res.ms, checks: plan.checks, shots: plan.shots.map((s) => [s.start.toFixed(2), s.source, s.srcStart.toFixed(2), s.role, s.score]) });
  }
  // (Again with what the edits found of the footage's own cuts, to plan exactly as the page did.)
  if (run.dump) await save(`${run.out ?? "state"}-state.json`, new Blob([toJSON({ song, scans })]));
  return { timing, bpm: song?.bpm, results, found: scans.filter((sc) => sc.checked).map((sc) => ({ id: sc.id, exactCuts: sc.exactCuts, checked: sc.checked })) };
}

declare global {
  interface Window {
    harness: typeof harness;
    __save?: (name: string, base64: string) => Promise<void>;
  }
}
window.harness = harness;

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
import type { Pace } from "./engine/plan/rhythm";
import { mixOrder, styleFor, talks, type EditStyle, type Talker } from "./engine/plan/styles";
import { applyDesign, designFor, designOrder, heardBeats, leanOf, ownCaptions, type Design } from "./engine/plan/designs";
import { DEFAULT_LOOK, TEXT_LOOKS } from "./engine/render/captions";
import { detectSpeech, talkingRuns } from "./engine/audio/speech";
import { hearSounds } from "./engine/audio/sounds";
import { planMeme, planTwist } from "./engine/plan/formats";
import type { Aspect, CardSpec, EditPlan, TextLook } from "./engine/plan/types";
import { blobToBase64Parts, renderPlan, renderStills } from "./engine/render/export";
import { mixPlan } from "./engine/render/mix";
import { FaceFinder } from "./engine/vision/faces";
import { followFaces, placeOverlays } from "./engine/vision/track";

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

  /** What the sound model hears in a clip, window by window (sounds.ts), and the voice the speech finder hears that it keeps as talking. */
  async sounds(url: string, seconds = 60) {
    const src = await load(url);
    const y = await decodeMono(src, 16000, 0, seconds);
    const t0 = performance.now();
    const heard = await hearSounds(y, 16000);
    const ms = Math.round(performance.now() - t0);
    const voice = detectSpeech(y, 16000);
    const kept = talkingRuns(voice, heard);
    const sum = (rs: { start: number; end: number }[]) => round(rs.reduce((a, r) => a + r.end - r.start, 0), 1);
    return { ms, heard: heard.map((h) => [round(h.t, 2), round(h.speech, 2), round(h.music, 2)]), voice: sum(voice), talking: sum(kept) };
  },

  /** The voice in a clip's sound, second by second: where speech is heard (speech.ts) and the voice's share of the sound there (vocals.ts), dB. */
  async voice(url: string, seconds = 60) {
    const src = await load(url);
    const y = await decodeMono(src, SR, 0, seconds);
    const runs = detectSpeech(y, SR);
    const v = await findVocals(y);
    const fps = SR / 512;
    const out: { t: number; voiced: number; share: number; level: number }[] = [];
    for (let s = 0; s + 1 <= y.length / SR; s++) {
      const voiced = runs.reduce((a, r) => a + Math.max(0, Math.min(r.end, s + 1) - Math.max(r.start, s)), 0);
      const fr = Array.from(v.ratio.subarray(Math.floor(s * fps), Math.floor((s + 1) * fps))).sort((a, b) => a - b);
      let e = 0;
      for (let i = s * SR; i < (s + 1) * SR; i++) e += y[i] * y[i];
      out.push({ t: s, voiced: round(voiced, 2), share: round(fr[Math.floor(fr.length / 2)] ?? -99, 1), level: round(10 * Math.log10(e / SR + 1e-12), 1) });
    }
    return { duration: src.info.duration, runs: runs.length, out };
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
  /** only draw these moments (seconds, "shots" for the middle of every shot, "fx" around each effect's peak, "cuts" the opening and around the first cuts and the drop) as PNGs */
  stills?: number[] | "shots" | "fx" | "cuts";
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
  /** end on this video (a motion design) instead of the drawn card, as the app does with a card of the user's own */
  cardVideo?: string;
  /** the montage's edit style, or "mix": each edit the next in the mix, as the app does */
  style?: EditStyle | "mix";
  /** the montage's design (plan/designs.ts), or "mix": each edit the next that suits the song; the plain edit when unset */
  design?: Design | "mix";
  /** clip indices the montage opens with, played as they are with their own sound (the app's Open tag) */
  openers?: number[];
  /** the captions in a look of the user's own (the caption editor): a ready-made look's id, changed by the rest */
  captionLook?: Partial<TextLook> & { preset?: string };
  /** with no card: end on the moment the edit opens on */
  loop?: boolean;
  /** how hard a montage cuts on the music (the app's Cutting; the planner's own default, steady, when unset) */
  pace?: Pace;
  /** save only each edit's soundtrack, as 48 kHz 16-bit WAV (no pictures) */
  audioOnly?: boolean;
}

/** An AudioBuffer as a 16-bit WAV file. */
function wavOf(buf: AudioBuffer): Blob {
  const n = buf.length;
  const ch = buf.numberOfChannels;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o: number, t: string) => [...t].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  out.setUint32(4, 36 + n * ch * 2, true);
  str(8, "WAVEfmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  str(36, "data");
  out.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) out.setInt16(44 + (i * ch + c) * 2, Math.max(-1, Math.min(1, data[c][i])) * 32767, true);
  return new Blob([out.buffer], { type: "audio/wav" });
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
  let card: CardSpec | null = run.card === null ? null : { kind: "laptop", top: "start free", bottom: "namzilabs.co", accent: "#568CFF", hold: 4, draw: false, ...(run.card ?? {}) };
  if (run.cardVideo && card) {
    const own = await load(run.cardVideo, "cardvideo");
    sources.set("cardvideo", own);
    card = { ...card, kind: "video", video: "cardvideo", videoAspect: own.info.width / Math.max(1, own.info.height), hold: Math.min(15, Math.max(1, own.info.duration)) };
  }
  // Who talks in the footage, as the app finds them: clips the picture model saw someone
  // talking in for two seconds, with the voice found in their sound.
  const talkers: Talker[] = [];
  if (run.style === "talk" || run.style === "mix") {
    const TALKING = KINDS.indexOf("talking");
    for (const sc of scans) {
      const src = sources.get(sc.id);
      if (sc.kind !== "video" || !sc.look || !src?.info.hasAudio) continue;
      let secs = 0;
      for (let i = 0; i < sc.stats.t.length; i++) if (sc.look.kind[i] === TALKING) secs += Math.min(2, (sc.stats.t[i + 1] ?? sc.duration) - sc.stats.t[i]);
      if (secs < 2) continue;
      const y = await decodeMono(src, 16000, 0, 600);
      const runs = talkingRuns(detectSpeech(y, 16000), await hearSounds(y, 16000));
      if (talks(runs)) talkers.push({ id: sc.id, runs });
    }
    lap("talking");
  }
  const order = mixOrder(scans, talkers.length > 0, run.pace);
  const designs = designOrder(song, scans);
  const results = [];
  const avoid: Ranges = new Map();
  for (let v = 0; v < (run.variants ?? 1); v++) {
    const style = run.style ? styleFor(v, run.style, order) : undefined;
    const design = run.design && (run.format ?? "montage") === "montage" ? designFor(v, run.design, designs, style) : undefined;
    const common = { song: song ?? undefined, songSource: "song", songName: run.song?.split("/").pop() ?? "", fromStart: run.fromStart ?? true, songStart: run.songStart, scans, aspect: run.aspect ?? "9x16", length: run.length ?? 14, card, variant: v, avoid, toCome: (run.variants ?? 1) - v - 1, velocity: run.velocity || design === "velocity" };
    const look = run.captionLook ? { ...(TEXT_LOOKS.find((l) => l.id === run.captionLook?.preset)?.look ?? DEFAULT_LOOK), ...run.captionLook } : undefined;
    // (As the app does: the look on each of the edit's own captions, then brought on as it says.)
    const dress = (plan: EditPlan): EditPlan => {
      if (look) plan.captions = plan.captions.map((c) => ({ ...c, look }));
      return plan;
    };
    const comeOn = (plan: EditPlan): EditPlan => {
      if (look && !plan.design && song) plan.captions = ownCaptions(plan.captions, undefined, heardBeats(plan, song));
      return plan;
    };
    const make = () =>
      run.format === "twist"
        ? comeOn(dress(planTwist({ ...common, actB: new Set((run.actB ?? []).map((i) => `clip${i}`)), captionA: run.caption?.text ?? "what they see vs...", captionB: run.captionB ?? "what they don't..." })))
        : run.format === "meme"
          ? comeOn(dress(planMeme({ ...common, text: run.memeText ?? "", position: run.memePosition ?? "upper" })))
          : design
            ? applyDesign(dress(planMontage({ ...common, song: song!, caption: run.caption === undefined ? { style: "mood", text: "Peak life." } : run.caption, style, talkers, loop: run.loop, pace: run.pace, lean: leanOf(design), openers: run.openers?.map((i) => `clip${i}`) })), design, song!, { scans })
            : comeOn(dress(planMontage({ ...common, song: song!, caption: run.caption === undefined ? { style: "mood", text: "Peak life." } : run.caption, style, talkers, loop: run.loop, pace: run.pace, openers: run.openers?.map((i) => `clip${i}`) })));
    // As the app does: planned again until no shot runs over one of the footage's own cuts.
    const plan = run.settle === false ? make() : await settlePlan(make, new Map(scans.map((sc) => [sc.id, sc])), cutFinder(sources));
    usedRanges(plan, avoid);
    lap(`plan${v}`);
    if (run.faces) {
      await followFaces(plan, sources, new Map(scans.map((s) => [s.id, s])));
      lap(`faces${v}`);
    }
    if (plan.overlays?.some((o) => o.place)) {
      await placeOverlays(plan, sources);
      lap(`overlays${v}`);
    }
    if (run.audioOnly) {
      await save(`${run.out ?? "mix"}-v${v + 1}.wav`, wavOf(await mixPlan(plan, sources, !!plan.music)));
      await save(`${run.out ?? "mix"}-v${v + 1}.plan.json`, new Blob([JSON.stringify(plan, null, 1)]));
      results.push({ file: "", bytes: 0, silentBytes: 0, codecs: "", ms: 0, checks: plan.checks, shots: plan.shots.map((s) => [s.start.toFixed(2), s.source, s.srcStart.toFixed(2), s.role, s.score]) });
      continue;
    }
    if (run.stills) {
      const inShot = (s: { start: number; end: number }) => (run.thirds ? [s.start + 0.5 / 30, (s.start + s.end) / 2, s.end - 1.5 / 30] : [(s.start + s.end) / 2]);
      const times =
        run.stills === "shots"
          ? [...plan.shots.flatMap(inShot), ...(plan.card ? [plan.card.start + 2] : [])]
          : run.stills === "fx"
            ? plan.fx.filter((f) => f.kind !== "dip").flatMap((f) => [-3, -1, 0, 2, 5].map((k) => Math.max(0, (f.at ?? f.start) + k / 30)))
            : run.stills === "cuts"
              ? [
                  ...[1, 3, 6, 12].map((k) => k / 30),
                  ...[...plan.shots.slice(1, 5), ...plan.shots.filter((s) => s.role === "drop")].flatMap((s) => [-2, -1, 0, 1, 3].map((k) => s.start + k / 30)),
                ]
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
  return { timing, bpm: song?.bpm, talkers: talkers.map((t) => ({ id: t.id, voiced: round(t.runs.reduce((a, r) => a + r.end - r.start, 0)) })), results, found: scans.filter((sc) => sc.checked).map((sc) => ({ id: sc.id, exactCuts: sc.exactCuts, checked: sc.checked })) };
}

declare global {
  interface Window {
    harness: typeof harness;
    __save?: (name: string, base64: string) => Promise<void>;
  }
}
window.harness = harness;

/**
 * A bare page the browser tests drive (e2e/run.mjs): each function takes file
 * URLs, runs one part of the engine for real in Chrome, and returns plain data.
 */
import { analyzeSong, pickSection, SR } from "./engine/audio/song";
import { decodeMono, openSource, type Source } from "./engine/media/sources";
import { scanImage, scanVideo, scoreInterest, type Scan } from "./engine/media/scan";
import { planMontage, usedRanges } from "./engine/plan/montage";
import { planMeme, planTwist } from "./engine/plan/formats";
import type { Aspect, CardSpec } from "./engine/plan/types";
import { blobToBase64Parts, renderPlan, renderStills } from "./engine/render/export";

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
  /** only draw these moments (seconds, or "shots" for the middle of every shot) as PNGs */
  stills?: number[] | "shots";
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
  const song = songSrc ? analyzeSong(await decodeMono(songSrc, SR)) : null;
  lap("song");
  const sources = new Map<string, Source>(songSrc ? [["song", songSrc]] : []);
  const scans: Scan[] = [];
  for (const [i, url] of run.clips.entries()) {
    const src = await load(url, `clip${i}`);
    sources.set(src.info.id, src);
    scans.push(src.info.kind === "image" ? await scanImage(src) : await scanVideo(src));
  }
  scoreInterest(scans);
  lap("scan");
  const img = await createImageBitmap(await (await fetch("/demo-dashboard.jpg")).blob());
  const card: CardSpec | null = run.card === null ? null : { kind: "laptop", top: "start free", bottom: "namzilabs.co", accent: "#568CFF", hold: 4, draw: false, ...(run.card ?? {}) };
  const results = [];
  const avoid = new Map<string, [number, number][]>();
  for (let v = 0; v < (run.variants ?? 1); v++) {
    const common = { song: song ?? undefined, songSource: "song", songName: run.song?.split("/").pop() ?? "", fromStart: run.fromStart ?? true, scans, aspect: run.aspect ?? "9x16", length: run.length ?? 14, card, variant: v, avoid };
    const plan =
      run.format === "twist"
        ? planTwist({ ...common, actB: new Set((run.actB ?? []).map((i) => `clip${i}`)), captionA: run.caption?.text ?? "what they see vs...", captionB: run.captionB ?? "what they don't..." })
        : run.format === "meme"
          ? planMeme({ ...common, text: run.memeText ?? "", position: run.memePosition ?? "upper" })
          : planMontage({ ...common, song: song!, caption: run.caption === undefined ? { style: "mood", text: "Peak life." } : run.caption });
    usedRanges(plan, avoid);
    lap(`plan${v}`);
    if (run.stills) {
      const times = run.stills === "shots" ? [...plan.shots.map((s) => (s.start + s.end) / 2), ...(plan.card ? [plan.card.start + 2] : [])] : run.stills;
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
  return { timing, bpm: song?.bpm, results };
}

declare global {
  interface Window {
    harness: typeof harness;
    __save?: (name: string, base64: string) => Promise<void>;
  }
}
window.harness = harness;

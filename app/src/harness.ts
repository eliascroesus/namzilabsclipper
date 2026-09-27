/**
 * A bare page the browser tests drive (e2e/run.mjs): each function takes file
 * URLs, runs one part of the engine for real in Chrome, and returns plain data.
 */
import { analyzeSong, pickSection, SR } from "./engine/audio/song";
import { decodeMono, openSource, type Source } from "./engine/media/sources";
import { scanImage, scanVideo, scoreInterest, type Scan } from "./engine/media/scan";
import { planMontage, usedRanges } from "./engine/plan/montage";
import type { Aspect, CardSpec } from "./engine/plan/types";
import { blobToBase64Parts, renderPlan } from "./engine/render/export";

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
  song: string;
  clips: string[];
  aspect?: Aspect;
  length?: number;
  variants?: number;
  fromStart?: boolean;
  caption?: { style: "mood" | "pov"; text: string } | null;
  card?: Partial<CardSpec> | null;
  prefer?: "mp4" | "webm";
  out?: string;
}

async function montage(run: MontageRun) {
  const timing: Record<string, number> = {};
  let t = performance.now();
  const lap = (k: string) => {
    const now = performance.now();
    timing[k] = Math.round(now - t);
    t = now;
  };
  const songSrc = await load(run.song, "song");
  const song = analyzeSong(await decodeMono(songSrc, SR));
  lap("song");
  const sources = new Map<string, Source>([["song", songSrc]]);
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
    const plan = planMontage({
      song, songSource: "song", songName: run.song.split("/").pop()!, fromStart: run.fromStart ?? true, scans,
      aspect: run.aspect ?? "9x16", length: run.length ?? 14, card, caption: run.caption === undefined ? { style: "mood", text: "Peak life." } : run.caption,
      variant: v, avoid,
    });
    usedRanges(plan, avoid);
    lap(`plan${v}`);
    const res = await renderPlan(plan, sources, { music: true, silentCopy: v === 0, cardImage: img, prefer: run.prefer });
    lap(`render${v}`);
    const base = `${run.out ?? "montage"}-v${v + 1}`;
    await save(`${base}.${res.ext}`, res.blob);
    if (res.silent) await save(`${base}-silent.${res.ext}`, res.silent);
    await save(`${base}.plan.json`, new Blob([JSON.stringify(plan, null, 1)]));
    results.push({ file: `${base}.${res.ext}`, bytes: res.blob.size, silentBytes: res.silent?.size, codecs: `${res.videoCodec}/${res.audioCodec}`, ms: res.ms, checks: plan.checks, shots: plan.shots.map((s) => [s.start.toFixed(2), s.source, s.srcStart.toFixed(2), s.role, s.score]) });
  }
  return { timing, bpm: song.bpm, results };
}

declare global {
  interface Window {
    harness: typeof harness;
    __save?: (name: string, base64: string) => Promise<void>;
  }
}
window.harness = harness;

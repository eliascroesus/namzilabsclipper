/**
 * The app's state and the work behind every button: reading and scanning what
 * the user drops, analysing the sound, planning and rendering the edits. React
 * reads it through useStudio(); the heavy engine objects stay out of React.
 */
import { useSyncExternalStore } from "react";
import { analyzeSong, SR, type SongAnalysis } from "../engine/audio/song";
import { scanImage, scanVideo, scoreInterest, type Scan } from "../engine/media/scan";
import { decodeMono, openSource, type Source } from "../engine/media/sources";
import { planMeme, planTwist } from "../engine/plan/formats";
import { planMontage, usedRanges } from "../engine/plan/montage";
import type { Aspect, CardSpec, EditPlan } from "../engine/plan/types";
import { pickCodecs, renderPlan } from "../engine/render/export";
import { loadKit, saveKit, saveKitShot, loadKitShot, type KitFields } from "./kit";

export type Status = "reading" | "scanning" | "analyzing" | "ready" | "error";

export interface Footage {
  id: string;
  name: string;
  kind: "video" | "image";
  duration: number;
  width: number;
  height: number;
  thumb?: string;
  status: Status;
  progress: number;
  error?: string;
  /** in the twist format: which side of the flip it belongs to */
  act: "a" | "b";
}

export interface Sound {
  id: string;
  name: string;
  duration: number;
  status: Status;
  progress: number;
  error?: string;
  bpm?: number;
  /** from a Reel: start at 0:00 so "Use audio" lines up */
  fromReel: boolean;
  /** loudness bars for the strip, 0 to 1 */
  bars?: number[];
  downbeats?: number[];
  drops?: number[];
}

export interface Kit extends KitFields {
  /** object URL of the screenshot on the laptop */
  shot: string;
  shotName: string;
}

export type Format = "montage" | "twist" | "meme";

export interface Style {
  format: Format;
  aspect: Aspect;
  length: number;
  caption: "none" | "mood" | "pov" | "meme";
  text: string;
  textB: string;
  memeText: string;
  memePosition: "upper" | "centre";
  variants: number;
}

export interface Job {
  id: string;
  label: string;
  status: "waiting" | "planning" | "rendering" | "done" | "error";
  progress: number;
  stage: string;
  plan?: EditPlan;
  url?: string;
  silentUrl?: string;
  ext?: "mp4" | "webm";
  bytes?: number;
  ms?: number;
  error?: string;
}

export interface Support {
  checked: boolean;
  webcodecs: boolean;
  webgl2: boolean;
  mp4: boolean;
}

export interface State {
  footage: Footage[];
  sound: Sound | null;
  kit: Kit;
  style: Style;
  jobs: Job[];
  busy: boolean;
  support: Support;
  notice?: string;
  /** bumps when the card's screenshot has loaded, so previews redraw */
  cardVersion: number;
}

const DEFAULT_SHOT = `${import.meta.env.BASE_URL}demo-dashboard.jpg`;

const DEFAULT_STYLE: Style = {
  format: "montage",
  aspect: "9x16",
  length: 14,
  caption: "mood",
  text: "Peak life.",
  textB: "what they don't...",
  memeText: "",
  memePosition: "upper",
  variants: 3,
};

const LENGTHS: Record<Format, number> = { montage: 14, twist: 18, meme: 9 };

let nextId = 1;
const newId = (p: string) => `${p}${nextId++}`;

class Studio {
  private state: State;
  private readonly listeners = new Set<() => void>();
  private readonly sources = new Map<string, Source>();
  private readonly scans = new Map<string, Scan>();
  private song: SongAnalysis | null = null;
  private cardImage: ImageBitmap | null = null;
  private scanQueue: Promise<void> = Promise.resolve();
  private abort: AbortController | null = null;

  constructor() {
    const fields = loadKit();
    this.state = {
      footage: [],
      sound: null,
      kit: { ...fields, shot: DEFAULT_SHOT, shotName: "Namzilabs dashboard" },
      style: { ...DEFAULT_STYLE },
      jobs: [],
      busy: false,
      support: { checked: false, webcodecs: false, webgl2: false, mp4: false },
      cardVersion: 0,
    };
    void this.init();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  get = () => this.state;

  private set(patch: Partial<State> | ((s: State) => Partial<State>)) {
    const p = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l();
  }
  private patchFootage(id: string, patch: Partial<Footage>) {
    this.set((s) => ({ footage: s.footage.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  }
  private patchJob(id: string, patch: Partial<Job>) {
    this.set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) }));
  }

  private async init() {
    const webcodecs = typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined";
    let webgl2 = false;
    try {
      webgl2 = !!new OffscreenCanvas(4, 4).getContext("webgl2");
    } catch {
      webgl2 = false;
    }
    let mp4 = false;
    if (webcodecs) {
      try {
        mp4 = (await pickCodecs(1080, 1920)).container === "mp4";
      } catch {
        mp4 = false;
      }
    }
    this.set({ support: { checked: true, webcodecs, webgl2, mp4 } });
    const saved = await loadKitShot();
    if (saved) this.set((s) => ({ kit: { ...s.kit, shot: URL.createObjectURL(saved.blob), shotName: saved.name } }));
    await this.loadCardImage();
  }

  private async loadCardImage() {
    try {
      const blob = await (await fetch(this.state.kit.shot)).blob();
      this.cardImage = await createImageBitmap(blob);
    } catch {
      this.cardImage = null;
    }
    this.set((s) => ({ cardVersion: s.cardVersion + 1 }));
  }

  /** The card's screenshot, for the live preview. */
  getCardImage() {
    return this.cardImage;
  }

  // ── footage ──

  addFootage(files: File[]) {
    const sounds: File[] = [];
    for (const file of files) {
      if (file.type.startsWith("audio/") || /\.(mp3|m4a|wav|aac|ogg|flac|opus)$/i.test(file.name)) {
        sounds.push(file);
        continue;
      }
      const id = newId("f");
      this.set((s) => ({ footage: [...s.footage, { id, name: file.name, kind: "video", duration: 0, width: 0, height: 0, status: "reading", progress: 0, act: "a" }] }));
      this.scanQueue = this.scanQueue.then(() => this.readFootage(id, file));
    }
    if (sounds.length) void this.setSound(sounds[0]);
  }

  private async readFootage(id: string, file: File) {
    if (!this.state.footage.some((f) => f.id === id)) return;
    try {
      const src = await openSource(id, file, file.name);
      if (src.info.kind === "audio") {
        // A sound dropped with the footage: use it as the sound.
        this.set((s) => ({ footage: s.footage.filter((f) => f.id !== id) }));
        void this.setSound(file);
        return;
      }
      this.sources.set(id, src);
      this.patchFootage(id, { kind: src.info.kind === "image" ? "image" : "video", duration: src.info.duration, width: src.info.width, height: src.info.height, status: "scanning" });
      const scan = src.info.kind === "image" ? await scanImage(src) : await scanVideo(src, { onProgress: (p) => this.patchFootage(id, { progress: p }) });
      if (!this.state.footage.some((f) => f.id === id)) return;
      this.scans.set(id, scan);
      this.patchFootage(id, { status: "ready", progress: 1, thumb: scan.thumb ? URL.createObjectURL(scan.thumb) : undefined });
    } catch (e) {
      this.patchFootage(id, { status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  removeFootage(id: string) {
    const f = this.state.footage.find((x) => x.id === id);
    if (f?.thumb) URL.revokeObjectURL(f.thumb);
    this.sources.get(id)?.input?.dispose();
    this.sources.delete(id);
    this.scans.delete(id);
    this.set((s) => ({ footage: s.footage.filter((x) => x.id !== id) }));
  }

  setAct(id: string, act: "a" | "b") {
    this.patchFootage(id, { act });
  }

  // ── sound ──

  async setSound(file: File) {
    const id = newId("s");
    this.song = null;
    this.set({ sound: { id, name: file.name, duration: 0, status: "reading", progress: 0, fromReel: true } });
    try {
      const src = await openSource(id, file, file.name);
      if (!src.info.hasAudio) throw new Error(`${file.name} has no sound in it.`);
      this.sources.set("song", src);
      // A short sound is almost always a Reel's: keep its start so "Use audio" lines up.
      const fromReel = src.info.duration < 75;
      this.set((s) => ({ sound: s.sound && s.sound.id === id ? { ...s.sound, duration: src.info.duration, status: "analyzing", fromReel } : s.sound }));
      const y = await decodeMono(src, SR, 0, Infinity, (p) => this.set((s) => ({ sound: s.sound && s.sound.id === id ? { ...s.sound, progress: p * 0.8 } : s.sound })));
      await new Promise((r) => setTimeout(r, 0));
      const song = analyzeSong(y);
      if (this.state.sound?.id !== id) return;
      this.song = song;
      const bars: number[] = [];
      const n = 96;
      for (let i = 0; i < n; i++) {
        const a = Math.floor((i * song.loudness.length) / n);
        const b = Math.max(a + 1, Math.floor(((i + 1) * song.loudness.length) / n));
        let m = 0;
        for (let k = a; k < b; k++) m = Math.max(m, song.loudness[k]);
        bars.push(m);
      }
      this.set((s) => ({
        sound: s.sound && s.sound.id === id ? { ...s.sound, status: "ready", progress: 1, bpm: song.bpm, bars, downbeats: song.downbeats, drops: song.drops.map((d) => d.t) } : s.sound,
      }));
    } catch (e) {
      this.set((s) => ({ sound: s.sound && s.sound.id === id ? { ...s.sound, status: "error", error: e instanceof Error ? e.message : String(e) } : s.sound }));
    }
  }

  setFromReel(fromReel: boolean) {
    this.set((s) => ({ sound: s.sound ? { ...s.sound, fromReel } : s.sound }));
  }

  clearSound() {
    this.sources.get("song")?.input?.dispose();
    this.sources.delete("song");
    this.song = null;
    this.set({ sound: null });
  }

  // ── card and style ──

  setKit(patch: Partial<KitFields>) {
    this.set((s) => ({ kit: { ...s.kit, ...patch } }));
    saveKit(this.state.kit);
  }

  async setKitShot(file: File) {
    const url = URL.createObjectURL(file);
    this.set((s) => ({ kit: { ...s.kit, shot: url, shotName: file.name } }));
    await saveKitShot(file, file.name);
    await this.loadCardImage();
  }

  async resetKitShot() {
    this.set((s) => ({ kit: { ...s.kit, shot: DEFAULT_SHOT, shotName: "Namzilabs dashboard" } }));
    await saveKitShot(null, "");
    await this.loadCardImage();
  }

  setStyle(patch: Partial<Style>) {
    this.set((s) => {
      const style = { ...s.style, ...patch };
      if (patch.format && patch.format !== s.style.format) {
        style.length = LENGTHS[patch.format];
        if (patch.format === "twist") {
          if (style.caption !== "none") style.caption = "meme";
          if (s.style.text === DEFAULT_STYLE.text || !s.style.text.trim()) style.text = "what they see vs...";
        }
        if (patch.format === "montage" && s.style.text === "what they see vs...") {
          style.text = DEFAULT_STYLE.text;
          style.caption = "mood";
        }
      }
      return { style };
    });
  }

  // ── making edits ──

  canGenerate(): string | null {
    const s = this.state;
    if (s.busy) return "Working on it";
    const ready = s.footage.filter((f) => f.status === "ready");
    if (!ready.length) return s.footage.some((f) => f.status === "reading" || f.status === "scanning") ? "Still reading the footage" : "Add footage first";
    if (s.style.format !== "meme") {
      if (!s.sound) return "Add a sound first";
      if (s.sound.status !== "ready") return s.sound.status === "error" ? "The sound didn't load" : "Still listening to the sound";
    } else if (s.sound && s.sound.status !== "ready" && s.sound.status !== "error") return "Still listening to the sound";
    return null;
  }

  cancel() {
    this.abort?.abort();
  }

  clearResults() {
    for (const j of this.state.jobs) {
      if (j.url) URL.revokeObjectURL(j.url);
      if (j.silentUrl) URL.revokeObjectURL(j.silentUrl);
    }
    this.set({ jobs: [] });
  }

  async generate() {
    if (this.canGenerate()) return;
    const s = this.state;
    const ready = s.footage.filter((f) => f.status === "ready");
    const scans = ready.map((f) => this.scans.get(f.id)!).filter(Boolean);
    scoreInterest(scans);
    const card: CardSpec | null = s.kit.enabled ? { kind: "laptop", top: s.kit.top, bottom: s.kit.bottom, accent: s.kit.accent, hold: s.kit.hold, draw: s.kit.draw } : null;
    const style = s.style;
    const song = this.song && s.sound?.status === "ready" ? this.song : null;
    const fromReel = s.sound?.fromReel ?? true;
    const label = style.format === "montage" ? "Montage" : style.format === "twist" ? "Twist" : "Meme";
    const jobs: Job[] = Array.from({ length: style.variants }, (_, v) => ({ id: newId("j"), label: `${label} ${v + 1}`, status: "waiting", progress: 0, stage: "Waiting" }));
    this.set((st) => ({ jobs: [...jobs, ...st.jobs], busy: true, notice: undefined }));
    this.abort = new AbortController();
    const signal = this.abort.signal;
    const avoid = new Map<string, [number, number][]>();
    const songName = s.sound?.name ?? "the song";
    for (const [v, job] of jobs.entries()) {
      if (signal.aborted) {
        this.patchJob(job.id, { status: "error", error: "Cancelled", stage: "Cancelled" });
        continue;
      }
      try {
        this.patchJob(job.id, { status: "planning", stage: "Picking the moments" });
        await new Promise((r) => setTimeout(r, 0));
        let plan: EditPlan;
        const common = { song: song ?? undefined, songSource: "song", songName, fromStart: fromReel, scans, aspect: style.aspect, length: style.length, card, variant: v, avoid };
        if (style.format === "twist") {
          const actB = new Set(ready.filter((f) => f.act === "b").map((f) => f.id));
          plan = planTwist({ ...common, actB, captionA: style.caption === "none" ? "" : style.text, captionB: style.caption === "none" ? "" : style.textB });
        } else if (style.format === "meme") {
          plan = planMeme({ ...common, text: style.memeText, position: style.memePosition });
        } else {
          if (!song) throw new Error("Add a sound first");
          plan = planMontage({ ...common, song, caption: style.caption === "none" ? null : { style: style.caption === "meme" ? "meme" : style.caption, text: style.text } });
        }
        usedRanges(plan, avoid);
        this.patchJob(job.id, { plan, status: "rendering", stage: "Rendering" });
        let last = 0;
        const res = await renderPlan(plan, this.sources, {
          music: !!plan.music,
          silentCopy: !!plan.music,
          cardImage: this.cardImage ?? undefined,
          signal,
          onProgress: (p, stage) => {
            const now = performance.now();
            if (now - last > 120 || p >= 1) {
              last = now;
              this.patchJob(job.id, { progress: p, stage });
            }
          },
        });
        this.patchJob(job.id, {
          status: "done",
          progress: 1,
          stage: "Done",
          url: URL.createObjectURL(res.blob),
          silentUrl: res.silent ? URL.createObjectURL(res.silent) : undefined,
          ext: res.ext,
          bytes: res.blob.size,
          ms: res.ms,
        });
      } catch (e) {
        const cancelled = e instanceof DOMException && e.name === "AbortError";
        this.patchJob(job.id, { status: "error", stage: cancelled ? "Cancelled" : "Failed", error: cancelled ? "Cancelled" : e instanceof Error ? e.message : String(e) });
      }
    }
    this.abort = null;
    this.set({ busy: false });
  }
}

export const studio = new Studio();

export function useStudio(): State {
  return useSyncExternalStore(studio.subscribe, studio.get, studio.get);
}

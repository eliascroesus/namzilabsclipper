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
import { planStory } from "../engine/plan/story";
import { detectSpeech, type Run } from "../engine/audio/speech";
import { pickModel } from "../engine/ai/gemini";
import { findMoments, transcribe, type Moment, type Transcript } from "../engine/story/story";
import { planMontage, usedRanges } from "../engine/plan/montage";
import { NO_GRADE, WARM_GRADE, type Aspect, type CardSpec, type EditPlan } from "../engine/plan/types";
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

export type Format = "montage" | "twist" | "meme" | "story";

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
  /** the grade: nio.trade's warm film look, or the footage as it is */
  look: "warm" | "natural";
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

export interface MomentView extends Moment {
  selected: boolean;
  /** the words, for the card */
  text: string;
}

export interface StoryState {
  status: "idle" | "working" | "ready" | "error";
  stage: string;
  progress: number;
  error?: string;
  /** the footage item being clipped */
  sourceId?: string;
  moments: MomentView[];
  clipLength: "short" | "medium" | "long";
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
  story: StoryState;
  geminiKey: string;
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
  look: "warm",
};

const LENGTHS: Record<Format, number> = { montage: 14, twist: 18, meme: 9, story: 30 };
const CLIP_LENGTHS = { short: [12, 25], medium: [18, 40], long: [30, 60] } as const;
const KEY_STORE = "clipper.gemini.v1";

function loadKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) ?? "";
  } catch {
    return "";
  }
}

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
  private readonly speech = new Map<string, Run[]>();
  /** edits made so far with this footage and sound: the next batch continues from here */
  private made = 0;
  private madeAvoid = new Map<string, [number, number][]>();
  private madeKey = "";
  private readonly transcripts = new Map<string, Transcript>();
  private model: string | null = null;

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
      story: { status: "idle", stage: "", progress: 0, moments: [], clipLength: "medium" },
      geminiKey: loadKey(),
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

  // ── story ──

  setGeminiKey(key: string) {
    const k = key.trim();
    this.model = null;
    try {
      localStorage.setItem(KEY_STORE, k);
    } catch {
      // not remembered
    }
    this.set({ geminiKey: k });
  }

  private patchStory(patch: Partial<StoryState>) {
    this.set((s) => ({ story: { ...s.story, ...patch } }));
  }

  setClipLength(clipLength: StoryState["clipLength"]) {
    this.patchStory({ clipLength });
  }

  /** The video to clip: the longest one with sound. */
  private storySource() {
    const vids = this.state.footage.filter((f) => f.status === "ready" && f.kind === "video" && this.sources.get(f.id)?.info.hasAudio);
    return vids.sort((a, b) => b.duration - a.duration)[0];
  }

  async findMoments() {
    const s = this.state;
    if (s.busy) return;
    const item = this.storySource();
    if (!item) return this.patchStory({ status: "error", error: "Add a video with someone talking in it." });
    if (!s.geminiKey) return this.patchStory({ status: "error", error: "Add your Gemini key first (free, below)." });
    const src = this.sources.get(item.id)!;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.set({ busy: true });
    this.patchStory({ status: "working", stage: "Listening", progress: 0, error: undefined, sourceId: item.id, moments: [] });
    try {
      let tr = this.transcripts.get(item.id);
      if (!tr) {
        const y = await decodeMono(src, 16000, 0, Infinity, (p) => this.patchStory({ progress: p * 0.25, stage: "Listening" }));
        const runs = detectSpeech(y, 16000);
        this.speech.set(item.id, runs);
        if (!runs.length) throw new Error("Nobody seems to be talking in this video.");
        this.model ??= await pickModel(s.geminiKey, signal);
        tr = await transcribe(y, 16000, runs, { key: s.geminiKey, model: this.model, signal, onProgress: (p, label) => this.patchStory({ progress: 0.25 + p * 0.55, stage: label }) });
        if (!tr.phrases.length) throw new Error("Gemini didn't hear any words in this video.");
        this.transcripts.set(item.id, tr);
      }
      this.patchStory({ progress: 0.85, stage: "Picking the moments" });
      this.model ??= await pickModel(s.geminiKey, signal);
      const [minLen, maxLen] = CLIP_LENGTHS[this.state.story.clipLength];
      const found = await findMoments(tr, Math.max(3, this.state.style.variants + 2), { key: s.geminiKey, model: this.model, signal, minLen, maxLen });
      if (!found.length) throw new Error("Gemini didn't find a moment that stands on its own. Try a longer video.");
      const moments = found.map((m, i) => ({
        ...m,
        selected: i < this.state.style.variants,
        text: tr!.phrases.slice(m.first, m.last + 1).map((p) => p.text).join(" "),
      }));
      this.patchStory({ status: "ready", stage: "", progress: 1, moments });
    } catch (e) {
      const cancelled = e instanceof DOMException && e.name === "AbortError";
      this.patchStory({ status: cancelled ? "idle" : "error", error: cancelled ? undefined : e instanceof Error ? e.message : String(e) });
    } finally {
      this.abort = null;
      this.set({ busy: false });
    }
  }

  toggleMoment(id: string) {
    this.patchStory({ moments: this.state.story.moments.map((m) => (m.id === id ? { ...m, selected: !m.selected } : m)) });
  }

  setMomentHook(id: string, hook: string) {
    this.patchStory({ moments: this.state.story.moments.map((m) => (m.id === id ? { ...m, hook } : m)) });
  }

  // ── making edits ──

  canGenerate(): string | null {
    const s = this.state;
    if (s.busy) return "Working on it";
    if (s.style.format === "story") {
      if (!this.storySource()) return s.footage.some((f) => f.status === "reading" || f.status === "scanning") ? "Still reading the footage" : "Add a video with someone talking";
      if (s.story.sourceId !== this.storySource()?.id || s.story.status !== "ready") return s.geminiKey ? null : "Add your Gemini key in Story (it's free)";
      if (!s.story.moments.some((m) => m.selected)) return "Pick at least one moment";
      if (s.sound && s.sound.status !== "ready" && s.sound.status !== "error") return "Still listening to the sound";
      return null;
    }
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

  /** What the main button does next in the story format. */
  storyNeedsMoments(): boolean {
    const s = this.state;
    return s.style.format === "story" && (s.story.status !== "ready" || s.story.sourceId !== this.storySource()?.id);
  }

  async generate() {
    if (this.canGenerate()) return;
    if (this.storyNeedsMoments()) return this.findMoments();
    const s = this.state;
    const ready = s.footage.filter((f) => f.status === "ready");
    const scans = ready.map((f) => this.scans.get(f.id)!).filter(Boolean);
    scoreInterest(scans);
    const card: CardSpec | null = s.kit.enabled ? { kind: s.kit.kind, top: s.kit.top, bottom: s.kit.bottom, accent: s.kit.accent, hold: s.kit.hold, draw: s.kit.draw } : null;
    const style = s.style;
    const song = this.song && s.sound?.status === "ready" ? this.song : null;
    const fromReel = s.sound?.fromReel ?? true;
    const label = style.format === "montage" ? "Montage" : style.format === "twist" ? "Twist" : style.format === "meme" ? "Meme" : "Clip";
    const chosenMoments = style.format === "story" ? s.story.moments.filter((m) => m.selected) : [];
    const count = style.format === "story" ? chosenMoments.length : style.variants;
    const first = this.madeKey === [style.format, style.aspect, ready.map((f) => f.id).join(","), s.sound?.id ?? ""].join("|") ? this.made : 0;
    const jobs: Job[] = Array.from({ length: count }, (_, v) => ({ id: newId("j"), label: style.format === "story" ? chosenMoments[v].hook || `${label} ${first + v + 1}` : `${label} ${first + v + 1}`, status: "waiting", progress: 0, stage: "Waiting" }));
    this.set((st) => ({ jobs: [...jobs, ...st.jobs], busy: true, notice: undefined }));
    this.abort = new AbortController();
    const signal = this.abort.signal;
    // Another batch with the same footage and sound picks up where the last left off.
    const key = [style.format, style.aspect, ready.map((f) => f.id).join(","), s.sound?.id ?? ""].join("|");
    if (key !== this.madeKey) {
      this.madeKey = key;
      this.made = 0;
      this.madeAvoid = new Map();
    }
    const avoid = this.madeAvoid;
    const base = this.made;
    this.made += count;
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
        const common = { song: song ?? undefined, songSource: "song", songName, fromStart: fromReel, scans, aspect: style.aspect, length: style.length, card, variant: base + v, avoid };
        if (style.format === "story") {
          const m = chosenMoments[v];
          const srcId = s.story.sourceId!;
          plan = planStory({
            moment: m,
            transcript: this.transcripts.get(srcId)!,
            speech: this.speech.get(srcId) ?? [],
            source: this.scans.get(srcId)!,
            broll: scans,
            song: song ?? undefined,
            songSource: "song",
            songName,
            aspect: style.aspect,
            card,
            variant: base + v,
          });
        } else if (style.format === "twist") {
          const actB = new Set(ready.filter((f) => f.act === "b").map((f) => f.id));
          plan = planTwist({ ...common, actB, captionA: style.caption === "none" ? "" : style.text, captionB: style.caption === "none" ? "" : style.textB });
        } else if (style.format === "meme") {
          plan = planMeme({ ...common, text: style.memeText, position: style.memePosition });
        } else {
          if (!song) throw new Error("Add a sound first");
          plan = planMontage({ ...common, song, caption: style.caption === "none" ? null : { style: style.caption === "meme" ? "meme" : style.caption, text: style.text } });
        }
        plan.grade = style.look === "natural" ? NO_GRADE : WARM_GRADE;
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

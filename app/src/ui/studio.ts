/**
 * The app's state and the work behind every button: reading and scanning what
 * the user drops, analysing the sound, planning and rendering the edits. React
 * reads it through useStudio(); the heavy engine objects stay out of React.
 */
import { useSyncExternalStore } from "react";
import { analyzeSong, loudnessBars, SR, withVocals, type SongAnalysis } from "../engine/audio/song";
import { findVocals } from "../engine/audio/vocals";
import { cutFinder } from "../engine/media/cuts";
import { settlePlan } from "../engine/plan/settle";
import { scanImage, scanVideo, scoreInterest, type Scan } from "../engine/media/scan";
import { decodeMono, openSource, type Source } from "../engine/media/sources";
import { planMeme, planTwist } from "../engine/plan/formats";
import { planStory } from "../engine/plan/story";
import { detectSpeech, talkingRuns, type Run } from "../engine/audio/speech";
import { hearSounds } from "../engine/audio/sounds";
import { pickModel } from "../engine/ai/gemini";
import { KINDS } from "../engine/media/scan";
import { skipSegments, youtubeId } from "../engine/ai/sponsorblock";
import { lookFor, LOOK_VERSION, photoSheets, rateSheets, restoreLook, storeLook, type StoredLook } from "../engine/vision/look";
import { senseSheets, SENSE_VERSION } from "../engine/vision/sense";
import { findMoments, transcribe, type Moment, type Transcript } from "../engine/story/story";
import { musicWindow, planMontage, usedRanges, type Ranges } from "../engine/plan/montage";
import type { Pace } from "../engine/plan/rhythm";
import { CALM_LABEL, mixOrder, styleFor, styleLabel, talks, type EditStyle, type Talker } from "../engine/plan/styles";
import { applyDesign, designFor, designName, designOrder, heardBeats, leanOf, ownCaptions, type Design } from "../engine/plan/designs";
import { NO_GRADE, WARM_GRADE, type Aspect, type CaptionEvent, type CardSpec, type EditPlan, type TextLook } from "../engine/plan/types";
import { shouted, speechRanges, subtitlesFor, type Heard } from "../engine/plan/subtitles";
import { listen } from "../mimic/asr/client";
import { DEFAULT_LOOK } from "../engine/render/captions";
import { pickCodecs, renderPlan } from "../engine/render/export";
import { followFaces, placeOverlays } from "../engine/vision/track";
import { loadKit, recall, remember, saveKit, saveKitShot, loadKitShot, saveKitVideo, loadKitVideo, type KitFields } from "./kit";

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
  /** in a montage: one of the clips the edit opens with, played as it is with its own sound, before the edit comes in on the drop */
  opener?: boolean;
  /** smart picks: Gemini looking at it */
  look?: "queued" | "rating" | "done" | "failed";
  lookProgress?: number;
  /** who judged the footage: Gemini (smart picks) or the picture model in the page */
  lookBy?: "gemini" | "local";
  /** smart picks: how much flex there is along the clip, 0 to 1 per slice */
  heat?: number[];
  /** smart picks: seconds of it that sell the life */
  flexSeconds?: number;
  /** seconds left out as sponsor reads, intros and outros (SponsorBlock) */
  skipped?: number;
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
  beats?: number[];
  drops?: number[];
  /** where the edits start in the song, when picked (null: chosen automatically) */
  start: number | null;
  /** story clips: the moment of the song that hits as the talking ends (null: its drop) */
  payoff: number | null;
  /** the file, to play it back while picking */
  url?: string;
  /** listening for the singing (vocals.ts), after the beat and the rest are ready */
  vocals?: "listening" | "done" | "failed";
  vocalProgress?: number;
  /** where sung lines start, for the timeline */
  lines?: number[];
}

export interface Kit extends KitFields {
  /** object URL of the screenshot on the laptop */
  shot: string;
  shotName: string;
  /** the user's own card, when there is one: its object URL, name, length (seconds) and width over height */
  video?: { url: string; name: string; length: number; aspect: number };
}

/** A card video plays for its own length, within these bounds (seconds). */
export const CARD_VIDEO_LENGTH: [number, number] = [1, 15];

/** How long the card is on screen: the video's own length for a card of the user's own, none when it's off. */
export function cardHoldOf(kit: Kit): number {
  if (!kit.enabled) return 0;
  if (kit.kind === "video" && kit.video) return Math.min(CARD_VIDEO_LENGTH[1], Math.max(CARD_VIDEO_LENGTH[0], kit.video.length));
  return kit.hold;
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
  /** keep the people in frame when wide footage is cropped (a face detector runs in the page) */
  faces: boolean;
  /** smart picks: Gemini looks at stills of the footage to find the flex (needs the key) */
  smart: boolean;
  /** velocity edits: speed ramps, slow motion on each hit then a rush into the next cut */
  velocity: boolean;
  /** how a montage is shaped (engine/plan/styles.ts), or "mix": each edit in a batch another way */
  edit: "mix" | EditStyle;
  /** how a montage looks (engine/plan/designs.ts), or "mix": each edit in a batch another design, the ones that suit the song first */
  design: "mix" | Design;
  /** how hard a montage cuts on the music (engine/plan/rhythm.ts): steady (the editors' rhythm, on the loudest hits), hard (more of the hits), or relaxed */
  pace: Pace;
  /** with the card off: end on the moment the edit opens on, so the replay loops */
  loop: boolean;
  /** captions in the user's own design (the caption editor) rather than the style's or design's */
  ownCaption: boolean;
  captionLook: TextLook;
  /** subtitles on the talking an edit opens on (the speech model in the page hears the words) */
  subtitles: boolean;
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
  /** the clip a talking edit opens on, when the user picks it (a footage id; "" finds one) */
  talkClip: string;
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
  faces: true,
  smart: true,
  velocity: false,
  edit: "mix",
  design: "mix",
  pace: "beat",
  loop: true,
  ownCaption: false,
  captionLook: DEFAULT_LOOK,
  subtitles: false,
};
const STYLE_STORE = "clipper.style.v1";

function loadStyle(): Style {
  try {
    const raw = localStorage.getItem(STYLE_STORE);
    const stored = raw ? (JSON.parse(raw) as Partial<Style>) : {};
    // (A look saved before a setting was added gets that setting's default.)
    return { ...DEFAULT_STYLE, ...stored, captionLook: { ...DEFAULT_LOOK, ...stored.captionLook } };
  } catch {
    return { ...DEFAULT_STYLE };
  }
}

function saveStyle(style: Style) {
  try {
    localStorage.setItem(STYLE_STORE, JSON.stringify(style));
  } catch {
    // not remembered
  }
}

const LENGTHS: Record<Format, number> = { montage: 14, twist: 18, meme: 9, story: 30 };
/** The longest an edit's footage runs before the card, in seconds. */
export const MAX_LENGTH = 60;
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

/** A clip's flex along its length (24 slices) and how many seconds of it sell the life. */
function heatOf(scan: Scan): { heat: number[]; flexSeconds: number } {
  const look = scan.look;
  if (!look) return { heat: [], flexSeconds: 0 };
  const n = scan.stats.t.length;
  if (scan.kind === "image") return { heat: [0.6 * look.flex[0] + 0.4 * look.wow[0]], flexSeconds: 0 };
  const bins = 24;
  const heat = new Array<number>(bins).fill(0);
  let flexSeconds = 0;
  for (let i = 0; i < n; i++) {
    const t = scan.stats.t[i] - scan.start;
    const b = Math.min(bins - 1, Math.max(0, Math.floor((t / Math.max(1e-6, scan.duration)) * bins)));
    heat[b] = Math.max(heat[b], 0.6 * look.flex[i] + 0.4 * look.wow[i]);
    const next = i + 1 < n ? scan.stats.t[i + 1] : scan.duration;
    if (look.flex[i] >= 0.6) flexSeconds += Math.max(0, next - scan.stats.t[i]);
  }
  return { heat, flexSeconds };
}

/** At most one call every `ms` (the last one, at p = 1, always goes through). */
function throttled(fn: (p: number) => void, ms = 100) {
  let last = 0;
  return (p: number) => {
    const now = performance.now();
    if (p >= 1 || now - last >= ms) {
      last = now;
      fn(p);
    }
  };
}

function closeSource(src: Source | undefined) {
  src?.input?.dispose();
  src?.image?.close();
}

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
  /** where someone talks in each clip the picture model saw talking (its first ten minutes) */
  /** per clip: where a voice is heard (speech.ts), and where that's someone talking, not a song (sounds.ts) */
  private readonly talking = new Map<string, { voice: Run[]; talking: Run[] }>();
  /** words heard in a stretch of a clip (subtitles), by clip and stretch */
  private readonly heardWords = new Map<string, Heard["words"]>();
  /** batches in flight (making edits, finding moments) that may still read the files */
  private inFlight = 0;
  /** files taken out while a batch was using them, closed once it's done */
  private retired: Source[] = [];
  private readonly scanAborts = new Map<string, AbortController>();
  /** the files as dropped, for remembering what smart picks saw in them */
  private readonly files = new Map<string, File>();
  private lookQueue: Promise<void> = Promise.resolve();
  private lookAbort: { id: string; ctl: AbortController } | null = null;
  private keyTimer = 0;
  /** edits made so far with this footage and sound: the next batch continues from here */
  private made = 0;
  private madeAvoid: Ranges = new Map();
  private madeKey = "";
  private readonly transcripts = new Map<string, Transcript>();
  /** each edit's own stop, so one can be deleted while the batch carries on */
  private readonly jobAborts = new Map<string, AbortController>();
  private model: string | null = null;

  constructor() {
    const fields = loadKit();
    this.state = {
      footage: [],
      sound: null,
      kit: { ...fields, shot: DEFAULT_SHOT, shotName: "Namzilabs dashboard" },
      style: loadStyle(),
      jobs: [],
      busy: false,
      support: { checked: false, webcodecs: false, webgl2: false, mp4: false },
      cardVersion: 0,
      story: { status: "idle", stage: "", progress: 0, moments: [], clipLength: "medium" },
      geminiKey: loadKey(),
      talkClip: "",
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
    const own = await loadKitVideo();
    if (own) await this.useCardVideo(own.blob, own.name).catch(() => undefined);
  }

  /** The user's own card video, opened (to check it plays, measure it, and render it). */
  private cardVideo: Source | null = null;

  private async useCardVideo(blob: Blob, name: string) {
    const src = await openSource("cardvideo", blob, name);
    if (!src.video || !(src.info.duration > 0)) throw new Error(`${name} isn't a video this browser can play.`);
    const old = this.state.kit.video?.url;
    if (old) URL.revokeObjectURL(old);
    this.cardVideo = src;
    this.set((s) => ({ kit: { ...s.kit, video: { url: URL.createObjectURL(blob), name, length: src.info.duration, aspect: src.info.width / Math.max(1, src.info.height) } } }));
  }

  async setKitVideo(file: File) {
    try {
      await this.useCardVideo(file, file.name);
      await saveKitVideo(file, file.name);
      this.setKit({ kind: "video" });
    } catch (err) {
      this.set({ notice: err instanceof Error ? err.message : String(err) });
    }
  }

  async clearKitVideo() {
    const old = this.state.kit.video?.url;
    if (old) URL.revokeObjectURL(old);
    this.cardVideo = null;
    this.set((s) => ({ kit: { ...s.kit, video: undefined, kind: s.kit.kind === "video" ? "laptop" : s.kit.kind } }));
    saveKit(this.state.kit);
    await saveKitVideo(null, "");
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
    const abort = new AbortController();
    this.scanAborts.set(id, abort);
    try {
      const src = await openSource(id, file, file.name);
      // Taken out while it was opening: close it and move on.
      if (!this.state.footage.some((f) => f.id === id)) {
        closeSource(src);
        return;
      }
      if (src.info.kind === "audio") {
        // A sound dropped with the footage: use it as the sound.
        closeSource(src);
        this.set((s) => ({ footage: s.footage.filter((f) => f.id !== id) }));
        void this.setSound(file);
        return;
      }
      this.sources.set(id, src);
      this.patchFootage(id, { kind: src.info.kind === "image" ? "image" : "video", duration: src.info.duration, width: src.info.width, height: src.info.height, status: "scanning" });
      const progress = throttled((p) => this.patchFootage(id, { progress: p }));
      const scan = src.info.kind === "image" ? await scanImage(src) : await scanVideo(src, { onProgress: progress, signal: abort.signal });
      if (!this.state.footage.some((f) => f.id === id)) return;
      this.scans.set(id, scan);
      this.files.set(id, file);
      this.patchFootage(id, { status: "ready", progress: 1, thumb: scan.thumb ? URL.createObjectURL(scan.thumb) : undefined });
      this.queueLooks();
      void this.findSkips(id, file.name, scan);
    } catch (e) {
      if (abort.signal.aborted) return;
      this.patchFootage(id, { status: "error", error: e instanceof Error ? e.message : String(e) });
    } finally {
      this.scanAborts.delete(id);
    }
  }

  /** Close a file now, or once the batch using it is done. */
  private retire(src: Source | undefined) {
    if (!src) return;
    if (this.inFlight > 0) this.retired.push(src);
    else closeSource(src);
  }

  private batchStarted() {
    this.inFlight++;
  }

  private batchDone() {
    this.inFlight = Math.max(0, this.inFlight - 1);
    if (this.inFlight === 0) {
      for (const src of this.retired) closeSource(src);
      this.retired = [];
    }
  }

  removeFootage(id: string) {
    if (this.lookAbort?.id === id) this.lookAbort.ctl.abort();
    this.files.delete(id);
    const f = this.state.footage.find((x) => x.id === id);
    if (f?.thumb) URL.revokeObjectURL(f.thumb);
    this.scanAborts.get(id)?.abort();
    this.retire(this.sources.get(id));
    this.sources.delete(id);
    this.scans.delete(id);
    this.set((s) => ({ footage: s.footage.filter((x) => x.id !== id) }));
  }

  /** A clip the montage opens with (or not): played first with its own sound, the edit on the drop after it. */
  setOpener(id: string, opener: boolean) {
    this.patchFootage(id, { opener });
  }

  setAct(id: string, act: "a" | "b") {
    this.patchFootage(id, { act });
  }

  // ── sound ──

  async setSound(file: File) {
    const id = newId("s");
    this.song = null;
    if (this.state.sound?.url) URL.revokeObjectURL(this.state.sound.url);
    this.set({ sound: { id, name: file.name, duration: 0, status: "reading", progress: 0, fromReel: true, start: null, payoff: null, url: URL.createObjectURL(file) } });
    try {
      const src = await openSource(id, file, file.name, { audioOnly: true });
      // Another sound was dropped while this one opened: that one wins.
      if (this.state.sound?.id !== id) {
        closeSource(src);
        return;
      }
      if (!src.info.hasAudio) {
        closeSource(src);
        throw new Error(`${file.name} has no sound in it.`);
      }
      this.retire(this.sources.get("song"));
      this.sources.set("song", src);
      // A short sound is almost always a Reel's: keep its start so "Use audio" lines up.
      const fromReel = src.info.duration < 75;
      this.set((s) => ({ sound: s.sound && s.sound.id === id ? { ...s.sound, duration: src.info.duration, status: "analyzing", fromReel } : s.sound }));
      const progress = throttled((p) => this.set((s) => ({ sound: s.sound && s.sound.id === id ? { ...s.sound, progress: p * 0.8 } : s.sound })));
      const y = await decodeMono(src, SR, 0, Infinity, progress);
      await new Promise((r) => setTimeout(r, 0));
      if (this.state.sound?.id !== id) return;
      const song = analyzeSong(y);
      if (this.state.sound?.id !== id) return;
      this.song = song;
      const bars = loudnessBars(song);
      this.set((s) => ({
        sound: s.sound && s.sound.id === id ? { ...s.sound, status: "ready", progress: 1, bpm: song.bpm, bars, downbeats: song.downbeats, beats: song.beats, drops: song.drops.map((d) => d.t), vocals: "listening", vocalProgress: 0 } : s.sound,
      }));
      void this.listenForVocals(id, y);
    } catch (e) {
      this.set((s) => ({ sound: s.sound && s.sound.id === id ? { ...s.sound, status: "error", error: e instanceof Error ? e.message : String(e) } : s.sound }));
    }
  }

  /**
   * The singing: where lines start and how the voice sits in each section, so a
   * verse is cut on its lines. Without it (the model didn't load), the edits cut
   * on the beat and the song's shape alone.
   */
  private async listenForVocals(id: string, y: Float32Array) {
    const progress = throttled((p) => this.set((s) => ({ sound: s.sound && s.sound.id === id ? { ...s.sound, vocalProgress: p } : s.sound })));
    try {
      const vocals = await findVocals(y, { onProgress: progress });
      if (this.state.sound?.id !== id || !this.song) return;
      this.song = withVocals(this.song, vocals);
      this.set((s) => ({ sound: s.sound && s.sound.id === id ? { ...s.sound, vocals: "done", vocalProgress: 1, lines: vocals.lines } : s.sound }));
    } catch {
      this.set((s) => ({ sound: s.sound && s.sound.id === id ? { ...s.sound, vocals: "failed" } : s.sound }));
    }
  }

  setFromReel(fromReel: boolean) {
    this.set((s) => ({ sound: s.sound ? { ...s.sound, fromReel } : s.sound }));
  }

  /** Where the edits start in the song (null: back to automatic). */
  setSongStart(start: number | null) {
    this.set((s) => ({ sound: s.sound ? { ...s.sound, start } : s.sound }));
  }

  /** How long the edits' footage runs before the card, in seconds. */
  setLength(length: number) {
    this.setStyle({ length: Math.round(Math.min(MAX_LENGTH, Math.max(3, length)) * 10) / 10 });
  }

  /** Story clips: the moment of the song that hits as the talking ends (null: its drop). */
  setPayoff(payoff: number | null) {
    this.set((s) => ({ sound: s.sound ? { ...s.sound, payoff } : s.sound }));
  }

  /**
   * The stretch of the song the edits will use, for the timeline: where it
   * starts, where the card comes in and where it ends (song seconds), and for
   * story clips the moment the burst hits.
   */
  songWindow(): { start: number; cardAt: number; end: number; payoff: number | null; auto: boolean } | null {
    const s = this.state;
    const song = this.song;
    if (!song || !s.sound || s.sound.status !== "ready") return null;
    if (s.style.format === "story") {
      const auto = [...song.drops].sort((x, y) => y.strength - x.strength)[0]?.t ?? song.downbeats[Math.floor(song.downbeats.length / 3)] ?? song.duration / 3;
      const payoff = s.sound.payoff ?? auto;
      return { start: Math.max(0, payoff - 20), cardAt: payoff + 3.2, end: Math.min(song.duration, payoff + 3.2 + (s.kit.enabled ? cardHoldOf(s.kit) : 0.6)), payoff, auto: s.sound.payoff === null };
    }
    const win = musicWindow(song, s.style.length, cardHoldOf(s.kit), s.sound.fromReel, s.sound.start ?? undefined);
    return { start: win.songStart, cardAt: win.songStart + win.cardAt, end: win.songStart + win.duration, payoff: null, auto: s.sound.start === null };
  }

  clearSound() {
    this.retire(this.sources.get("song"));
    this.sources.delete("song");
    this.song = null;
    if (this.state.sound?.url) URL.revokeObjectURL(this.state.sound.url);
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

  /** Change the caption editor's look (switching it on). */
  setCaptionLook(patch: Partial<TextLook>) {
    this.setStyle({ ownCaption: true, captionLook: { ...this.state.style.captionLook, ...patch } });
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
    saveStyle(this.state.style);
    if ("smart" in patch) this.queueLooks();
  }

  /** A YouTube video with its ID in the name: leave out what SponsorBlock's viewers marked (sponsor reads, intros, outros). */
  private async findSkips(id: string, name: string, scan: Scan) {
    const yt = scan.kind === "video" ? youtubeId(name) : null;
    if (!yt) return;
    try {
      const skips = await skipSegments(yt);
      if (!skips.length || !this.scans.has(id)) return;
      scan.skip = skips.map((s) => [s.start, s.end]);
      this.patchFootage(id, { skipped: skips.reduce((a, s) => a + (s.end - s.start), 0) });
    } catch {
      // No SponsorBlock (offline, blocked): the edit just doesn't know about the sponsor read.
    }
  }

  // ── smart picks ──

  /**
   * Queue every clip nothing has judged yet: Gemini when smart picks are on and
   * there's a key (it also takes over from the picture model's judgement), the
   * picture model in the page otherwise.
   */
  private queueLooks() {
    const s = this.state;
    const gemini = s.style.smart && !!s.geminiKey;
    for (const f of s.footage) {
      if (f.status !== "ready" || f.look === "queued" || f.look === "rating") continue;
      if (f.look === "done" && (f.lookBy === "gemini" || !gemini)) continue;
      if (f.look === "failed" && f.lookBy === (gemini ? "gemini" : "local")) continue;
      const scan = this.scans.get(f.id);
      if (!scan) continue;
      if (gemini && f.lookBy === "local") scan.look = undefined;
      this.patchFootage(f.id, { look: "queued", lookProgress: 0, lookBy: gemini ? "gemini" : "local" });
      this.lookQueue = this.lookQueue.then(() => (gemini ? this.rateOne(f.id) : this.senseOne(f.id)));
    }
  }

  /** The picture model in the page judges one clip (or every photo waiting), remembering the answer per file. */
  private async senseOne(id: string) {
    const f = this.state.footage.find((x) => x.id === id);
    const scan = this.scans.get(id);
    if (!f || !scan || scan.look || f.look !== "queued" || f.lookBy !== "local") return;
    const ctl = new AbortController();
    this.lookAbort = { id, ctl };
    const photos = scan.kind === "image" ? this.state.footage.filter((x) => x.kind === "image" && x.status === "ready" && x.look === "queued" && x.lookBy === "local" && !this.scans.get(x.id)?.look).map((x) => x.id) : [id];
    for (const pid of photos) this.patchFootage(pid, { look: "rating", lookProgress: 0 });
    try {
      if (scan.kind === "video" && scan.sheets) {
        const file = this.files.get(id);
        const k = file ? `sense:${SENSE_VERSION}:${file.name}:${file.size}:${file.lastModified}` : null;
        const stored = k ? await recall<StoredLook>(k) : null;
        let ratings = stored ? restoreLook(stored, scan.sheets) : null;
        if (!ratings) {
          ratings = await senseSheets(scan.sheets, { signal: ctl.signal, onProgress: (p) => this.patchFootage(id, { lookProgress: p }) });
          if (k) void remember(k, storeLook(scan.sheets, ratings));
        }
        scan.look = lookFor(scan, scan.sheets, ratings);
        this.patchFootage(id, { look: scan.look ? "done" : "failed", lookProgress: 1, ...heatOf(scan) });
      } else if (scan.kind === "image") {
        const items = photos.map((pid, index) => ({ pid, index, image: this.sources.get(pid)?.image })).filter((x): x is { pid: string; index: number; image: ImageBitmap } => !!x.image);
        const ratings = await senseSheets(await photoSheets(items), { signal: ctl.signal });
        for (const [c, item] of items.entries()) {
          const r = ratings.get(c + 1);
          const ps = this.scans.get(item.pid);
          if (!r || !ps) {
            this.patchFootage(item.pid, { look: "failed" });
            continue;
          }
          ps.look = { flex: Float32Array.of(r.flex / 10), wow: Float32Array.of(r.wow / 10), kind: Uint8Array.of(KINDS.indexOf(r.kind)), ...(r.emb ? { embs: [r.emb], cell: Int32Array.of(0) } : {}) };
          this.patchFootage(item.pid, { look: "done", lookProgress: 1, ...heatOf(ps) });
        }
      } else {
        this.patchFootage(id, { look: undefined, lookBy: undefined });
      }
    } catch (e) {
      const cancelled = e instanceof DOMException && e.name === "AbortError";
      // No model (offline, say): the footage is judged by how it looks, as before.
      for (const pid of photos) this.patchFootage(pid, { look: cancelled ? undefined : "failed" });
    } finally {
      if (this.lookAbort?.ctl === ctl) this.lookAbort = null;
    }
  }

  /** Have Gemini look at one clip (or, for a photo, every photo waiting), remembering the answer per file. */
  private async rateOne(id: string) {
    const f = this.state.footage.find((x) => x.id === id);
    const scan = this.scans.get(id);
    if (!f || !scan || scan.look || f.look !== "queued" || f.lookBy !== "gemini") return;
    const key = this.state.geminiKey;
    if (!this.state.style.smart || !key) {
      // Smart picks went off while it waited: the picture model judges it instead.
      this.patchFootage(id, { look: undefined, lookBy: undefined });
      this.queueLooks();
      return;
    }
    const ctl = new AbortController();
    this.lookAbort = { id, ctl };
    const photos = scan.kind === "image" ? this.state.footage.filter((x) => x.kind === "image" && x.status === "ready" && x.look === "queued" && x.lookBy === "gemini" && !this.scans.get(x.id)?.look).map((x) => x.id) : [id];
    for (const pid of photos) this.patchFootage(pid, { look: "rating", lookProgress: 0 });
    try {
      const sig = (fid: string) => {
        const file = this.files.get(fid);
        return file ? `look:${LOOK_VERSION}:${file.name}:${file.size}:${file.lastModified}` : null;
      };
      if (scan.kind === "video" && scan.sheets) {
        const k = sig(id);
        const stored = k ? await recall<StoredLook>(k) : null;
        let ratings = stored ? restoreLook(stored, scan.sheets) : null;
        if (!ratings) {
          this.model ??= await pickModel(key, ctl.signal);
          ratings = await rateSheets(scan.sheets, { key, model: this.model, signal: ctl.signal, onProgress: (p) => this.patchFootage(id, { lookProgress: p }) });
          if (k) void remember(k, storeLook(scan.sheets, ratings));
        }
        // Gemini says how good each moment is; the picture model in the page adds what
        // the shots have in common (for variety, and no jump cuts), when it loads.
        if (![...ratings.values()].some((r) => r.emb)) {
          try {
            const local = await senseSheets(scan.sheets, { signal: ctl.signal });
            for (const [n, r] of ratings) {
              const emb = local.get(n)?.emb;
              if (emb) ratings.set(n, { ...r, emb });
            }
            if (k) void remember(k, storeLook(scan.sheets, ratings));
          } catch (e) {
            if (e instanceof DOMException && e.name === "AbortError") throw e;
          }
        }
        scan.look = lookFor(scan, scan.sheets, ratings);
        this.patchFootage(id, { look: scan.look ? "done" : "failed", lookProgress: 1, ...heatOf(scan) });
      } else if (scan.kind === "image") {
        // Photos go together, a dozen or more to a sheet.
        const items = photos.map((pid, index) => ({ pid, index, image: this.sources.get(pid)?.image })).filter((x): x is { pid: string; index: number; image: ImageBitmap } => !!x.image);
        const sheets = await photoSheets(items);
        this.model ??= await pickModel(key, ctl.signal);
        const ratings = await rateSheets(sheets, { key, model: this.model, signal: ctl.signal });
        for (const [c, item] of items.entries()) {
          const r = ratings.get(c + 1);
          const ps = this.scans.get(item.pid);
          if (!r || !ps) {
            this.patchFootage(item.pid, { look: "failed" });
            continue;
          }
          ps.look = { flex: Float32Array.of(r.flex / 10), wow: Float32Array.of(r.wow / 10), kind: Uint8Array.of(KINDS.indexOf(r.kind)) };
          this.patchFootage(item.pid, { look: "done", lookProgress: 1, ...heatOf(ps) });
        }
      } else {
        // Nothing to show Gemini (no frames logged): judged by how it looks.
        this.patchFootage(id, { look: undefined });
      }
    } catch (e) {
      const cancelled = e instanceof DOMException && e.name === "AbortError";
      for (const pid of photos) this.patchFootage(pid, { look: cancelled ? undefined : "failed" });
      const msg = (e instanceof Error ? e.message : String(e)).trim().replace(/([^.!?])$/, "$1.");
      if (!cancelled) this.set({ notice: `Smart picks couldn't look at ${f.name}: ${msg} It judges that one by how it looks.` });
    } finally {
      if (this.lookAbort?.ctl === ctl) this.lookAbort = null;
    }
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
    // Once a whole key has been pasted (not on every keystroke), look at what's waiting.
    clearTimeout(this.keyTimer);
    if (/^AIza[\w-]{30,}$/.test(k)) this.keyTimer = window.setTimeout(() => this.queueLooks(), 700);
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
    this.batchStarted();
    this.patchStory({ status: "working", stage: "Listening", progress: 0, error: undefined, sourceId: item.id, moments: [] });
    try {
      let tr = this.transcripts.get(item.id);
      if (!tr) {
        const listening = throttled((p) => this.patchStory({ progress: p * 0.25, stage: "Listening" }));
        const y = await decodeMono(src, 16000, 0, Infinity, listening, signal);
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
      const skip = this.scans.get(item.id)?.skip ?? [];
      const inSkip = (m: Moment) => skip.reduce((a, [x, y]) => a + Math.max(0, Math.min(y, m.end) - Math.max(x, m.start)), 0) > 0.3 * (m.end - m.start);
      // A sponsor read or an intro isn't a moment worth clipping.
      const found = (await findMoments(tr, Math.max(3, this.state.style.variants + 2), { key: s.geminiKey, model: this.model, signal, minLen, maxLen })).filter((m) => !inSkip(m));
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
      this.batchDone();
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

  /** Pick the clip a talking edit opens on ("" to let the page find one). */
  setTalkClip(id: string) {
    this.set({ talkClip: id });
  }

  /**
   * The clips someone may be talking in: the one the user picked, or else videos with
   * sound that the picture model saw someone talking in for two seconds or more.
   */
  private talkingClips(ready: Footage[]): string[] {
    const picked = ready.find((f) => f.id === this.state.talkClip && f.kind === "video" && this.sources.get(f.id)?.info.hasAudio);
    if (picked) return [picked.id];
    const TALKING = KINDS.indexOf("talking");
    return ready
      .filter((f) => {
        const scan = this.scans.get(f.id);
        const src = this.sources.get(f.id);
        if (f.kind !== "video" || !scan?.look || !src?.info.hasAudio) return false;
        let secs = 0;
        const t = scan.stats.t;
        for (let i = 0; i < t.length; i++) if (scan.look.kind[i] === TALKING) secs += Math.min(2, (t[i + 1] ?? scan.duration) - t[i]);
        return secs >= 2;
      })
      .map((f) => f.id);
  }

  /**
   * Where someone is talking in each of those clips (heard once, then remembered): the
   * voice the speech finder hears, less where the sound model hears a song or singing
   * (a clip's music isn't someone talking). A clip the user picked keeps all its voice
   * when the model hears too little talking in it.
   */
  private async talkersFor(ids: string[], signal: AbortSignal): Promise<Talker[]> {
    const out: Talker[] = [];
    for (const id of ids) {
      let heard = this.talking.get(id);
      const src = this.sources.get(id);
      if (!heard && src) {
        const y = await decodeMono(src, 16000, 0, 600, undefined, signal);
        const voice = detectSpeech(y, 16000);
        let talking = voice;
        try {
          talking = talkingRuns(voice, await hearSounds(y, 16000, signal));
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") throw e;
          // (Without the sound model, the speech finder's word for it.)
        }
        heard = { voice, talking };
        this.talking.set(id, heard);
      }
      if (!heard) continue;
      const runs = talks(heard.talking) ? heard.talking : id === this.state.talkClip && talks(heard.voice) ? heard.voice : null;
      if (runs) out.push({ id, runs });
    }
    return out;
  }

  /** Subtitles for the talking an edit plays with its own sound: each stretch heard once by the speech model in the page. */
  private async subtitle(plan: EditPlan, signal: AbortSignal, onProgress: (p: number) => void): Promise<CaptionEvent[]> {
    const ranges = speechRanges(plan);
    const heard: Heard[] = [];
    for (const [i, range] of ranges.entries()) {
      const key = `${range.source}@${range.from.toFixed(2)}-${range.to.toFixed(2)}`;
      let words = this.heardWords.get(key);
      const src = this.sources.get(range.source);
      if (!words && src) {
        const y = await decodeMono(src, 16000, range.from, range.to, undefined, signal);
        if (!y.length) continue;
        const r = await listen(y, (p) => onProgress((i + (p.stage === "listen" ? 0.2 + 0.8 * p.p : 0.2 * p.p)) / ranges.length), signal);
        // (Shouted words, by how loud they are against the rest: their lines go in capitals.)
        const loud = shouted(y, 16000, r.words);
        words = r.words.map((w, k) => ({ ...w, shout: loud[k] }));
        this.heardWords.set(key, words);
      }
      if (words) heard.push({ range, words });
    }
    return subtitlesFor(plan, heard);
  }

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
    if (ready.some((f) => f.look === "queued" || f.look === "rating")) return s.style.smart && s.geminiKey ? "Gemini is still looking at the footage (smart picks)" : "Still looking at the footage";
    if (s.style.format !== "meme") {
      if (!s.sound) return "Add a sound first";
      if (s.sound.status !== "ready") return s.sound.status === "error" ? "The sound didn't load" : "Still listening to the sound";
      if (s.sound.vocals === "listening") return "Still listening for the singing";
    } else if (s.sound && s.sound.status !== "ready" && s.sound.status !== "error") return "Still listening to the sound";
    return null;
  }

  cancel() {
    this.abort?.abort();
  }

  clearResults() {
    for (const j of this.state.jobs) this.removeJob(j.id);
  }

  private hasJob(id: string) {
    return this.state.jobs.some((j) => j.id === id);
  }

  /** Delete one edit: stop it if it's waiting or being made, and let its files go. */
  removeJob(id: string) {
    const job = this.state.jobs.find((j) => j.id === id);
    if (!job) return;
    this.jobAborts.get(id)?.abort();
    if (job.url) URL.revokeObjectURL(job.url);
    if (job.silentUrl) URL.revokeObjectURL(job.silentUrl);
    this.set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) }));
  }

  dismissNotice() {
    this.set({ notice: undefined });
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
    const style = s.style;
    const ready = s.footage.filter((f) => f.status === "ready");
    const scans = ready.map((f) => this.scans.get(f.id)!).filter(Boolean);
    // The batch keeps what it started with (files, analyses, the story's transcript),
    // even if the panels change while it renders; anything taken out meanwhile is
    // closed once the batch is done.
    const sources = new Map(this.sources);
    const song = this.song && s.sound?.status === "ready" ? this.song : null;
    const storyId = s.story.sourceId;
    const story =
      style.format === "story" && storyId
        ? { transcript: this.transcripts.get(storyId), speech: this.speech.get(storyId) ?? [], scan: this.scans.get(storyId) }
        : null;
    // The user's own card video plays whole (within bounds), the song under it; with none
    // uploaded, the laptop card stands in.
    const own = s.kit.kind === "video" && this.cardVideo && s.kit.video ? s.kit.video : null;
    if (own && this.cardVideo) sources.set("cardvideo", this.cardVideo);
    const card: CardSpec | null = !s.kit.enabled
      ? null
      : own
        ? { kind: "video", video: "cardvideo", videoAspect: own.aspect, hold: cardHoldOf(s.kit), top: "", bottom: "", accent: s.kit.accent, draw: false }
        : { kind: s.kit.kind === "video" ? "laptop" : s.kit.kind, top: s.kit.top, bottom: s.kit.bottom, accent: s.kit.accent, hold: s.kit.hold, draw: s.kit.draw };
    const cardImage = this.cardImage ?? undefined;
    const fromReel = s.sound?.fromReel ?? true;
    const songStart = s.sound?.start ?? null;
    const payoff = s.sound?.payoff ?? null;
    const scanMap = new Map(scans.map((sc) => [sc.id, sc]));
    if (story?.scan) scanMap.set(story.scan.id, story.scan);
    const songName = s.sound?.name ?? "the song";
    const label = style.format === "montage" ? "Montage" : style.format === "twist" ? "Twist" : style.format === "meme" ? "Meme" : "Clip";
    const chosenMoments = style.format === "story" ? s.story.moments.filter((m) => m.selected) : [];
    const count = style.format === "story" ? chosenMoments.length : style.variants;
    // A montage's style, edit by edit: the one picked, or each edit the next in the mix
    // (the talking style only when someone talks in the footage).
    const canTalk = style.format === "montage" ? this.talkingClips(ready) : [];
    // The clips the user picked to open the edit with, in their order.
    const openers = style.format === "montage" ? ready.filter((f) => f.opener && (f.kind === "video" || f.kind === "image")).map((f) => f.id) : [];
    const order = mixOrder(scans, canTalk.length > 0, style.pace);
    // And its design: the one picked, or each edit the next that suits the song and footage.
    const designs = designOrder(song, scans);

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
    const editOf = (v: number): EditStyle | undefined => (style.format === "montage" ? styleFor(base + v, style.edit, order) : undefined);
    const designOf = (v: number): Design | undefined => (style.format === "montage" && song ? designFor(base + v, style.design, designs, editOf(v)) : undefined);
    const named = (v: number, name: string, d = designOf(v)) => `${name}${d ? `, ${designName(d)}` : ""} ${base + v + 1}`;
    const jobs: Job[] = Array.from({ length: count }, (_, v) => ({
      id: newId("j"),
      label: style.format === "story" ? chosenMoments[v].hook || `${label} ${base + v + 1}` : named(v, editOf(v) ? styleLabel(editOf(v)!) : label),
      status: "waiting",
      progress: 0,
      stage: "Waiting",
    }));
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.batchStarted();
    this.set((st) => ({ jobs: [...jobs, ...st.jobs], busy: true, notice: undefined }));
    try {
      scoreInterest(scans);
      for (const [v, job] of jobs.entries()) {
        // Deleted while it waited its turn.
        if (!this.hasJob(job.id)) continue;
        if (signal.aborted) {
          this.patchJob(job.id, { status: "error", error: "Cancelled", stage: "Cancelled" });
          continue;
        }
        const own = new AbortController();
        this.jobAborts.set(job.id, own);
        const jobSignal = AbortSignal.any([signal, own.signal]);
        try {
          this.patchJob(job.id, { status: "planning", stage: "Picking the moments" });
          await new Promise((r) => setTimeout(r, 0));
          const edit = editOf(v);
          const design = designOf(v);
          const common = { song: song ?? undefined, songSource: "song", songName, fromStart: fromReel, songStart: songStart ?? undefined, scans, aspect: style.aspect, length: style.length, card, variant: base + v, avoid, toCome: count - v - 1, velocity: style.velocity || design === "velocity" };
          let talkers: Talker[] = [];
          let calm = "";
          if (edit === "talk") {
            if (canTalk.length) {
              this.patchJob(job.id, { stage: "Listening for the talking" });
              talkers = await this.talkersFor(canTalk, jobSignal);
            }
            // No one talking after all: it opens on calm shots in black and white, and says so.
            if (!talkers.length) this.patchJob(job.id, { label: (calm = named(v, CALM_LABEL)) });
            this.patchJob(job.id, { stage: "Picking the moments" });
          }
          // Captions in the user's own design (the caption editor): each of the edit's own.
          const dress = (plan: EditPlan): EditPlan => {
            if (style.ownCaption) plan.captions = plan.captions.map((c) => ({ ...c, look: style.captionLook }));
            return plan;
          };
          // (Without a design: on the song's beats when there is one; subtitles come on with the talking.)
          const comeOn = (plan: EditPlan): EditPlan => {
            if (style.ownCaption) plan.captions = ownCaptions(plan.captions, undefined, song && style.format !== "story" ? heardBeats(plan, song) : []);
            return plan;
          };
          const make = (): EditPlan => {
            if (style.format === "story") {
              if (!story?.transcript || !story.scan) throw new Error("The video for this clip was taken out. Find the moments again.");
              return comeOn(dress(planStory({
                moment: chosenMoments[v],
                transcript: story.transcript,
                speech: story.speech,
                source: story.scan,
                broll: scans,
                song: song ?? undefined,
                songSource: "song",
                songName,
                aspect: style.aspect,
                card,
                variant: base + v,
                avoid,
                payoff: payoff ?? undefined,
              })));
            } else if (style.format === "twist") {
              const actB = new Set(ready.filter((f) => f.act === "b").map((f) => f.id));
              return comeOn(dress(planTwist({ ...common, actB, captionA: style.caption === "none" ? "" : style.text, captionB: style.caption === "none" ? "" : style.textB })));
            } else if (style.format === "meme") {
              return comeOn(dress(planMeme({ ...common, text: style.memeText, position: style.memePosition })));
            }
            if (!song) throw new Error("Add a sound first");
            const plan = dress(planMontage({ ...common, song, caption: style.caption === "none" ? null : { style: style.caption === "meme" ? "meme" : style.caption, text: style.text }, style: edit, talkers, loop: style.loop, pace: style.pace, lean: design && leanOf(design), openers, subtitles: style.subtitles }));
            // The design's effects and colour (a split screen's panels checked with the shots).
            return design ? applyDesign(plan, design, song, { scans }) : comeOn(plan);
          };
          // Planned, then planned again until no shot runs over one of a long video's own
          // cuts (media/cuts.ts: every frame of what the edit uses gets looked at).
          const plan = await settlePlan(make, scanMap, cutFinder(sources, jobSignal));
          // Subtitles on the talking it opens on (a story has its own).
          if (style.subtitles && style.format === "montage" && plan.shots.some((sh) => sh.audio)) {
            this.patchJob(job.id, { stage: "Listening for the words" });
            try {
              const subs = await this.subtitle(plan, jobSignal, throttled((p) => this.patchJob(job.id, { progress: 0.1 * p }), 200));
              const looked = style.ownCaption ? ownCaptions(subs.map((c) => ({ ...c, look: style.captionLook })), undefined, []) : subs;
              plan.captions = [...looked, ...plan.captions];
              plan.checks = { ...plan.checks, subtitles: subs.length };
            } catch (e) {
              if (e instanceof DOMException && e.name === "AbortError") throw e;
              this.set({ notice: `The subtitles couldn't be made in this browser (${e instanceof Error ? e.message : String(e)}), so this edit has none.` });
            }
          }
          // (As shot: no grade, the design's effects still on.)
          if (!plan.design) plan.grade = WARM_GRADE;
          if (style.look === "natural") plan.grade = NO_GRADE;
          // (A split screen with no room for its panels is the zoom design: it says so.)
          if (plan.design && plan.design !== design) this.patchJob(job.id, { label: calm ? named(v, CALM_LABEL, plan.design as Design) : named(v, edit ? styleLabel(edit) : label, plan.design as Design) });
          usedRanges(plan, avoid);
          if (style.faces && plan.shots.some((sh) => sh.crop.fit === "cover")) {
            this.patchJob(job.id, { stage: "Following faces" });
            try {
              await followFaces(plan, sources, scanMap, { signal: jobSignal });
            } catch (e) {
              if (e instanceof DOMException && e.name === "AbortError") throw e;
              this.set({ notice: `Face tracking couldn't start in this browser (${e instanceof Error ? e.message : String(e)}), so these edits are framed without it.` });
            }
          }
          // Pictures on someone's head find the head (and their own faces), whatever the framing.
          if (plan.overlays?.some((o) => o.place)) {
            this.patchJob(job.id, { stage: "Placing the pictures" });
            try {
              await placeOverlays(plan, sources, { signal: jobSignal });
            } catch (e) {
              if (e instanceof DOMException && e.name === "AbortError") throw e;
              // (Without the face model, no pictures at a guess of where a head is.)
              plan.overlays = plan.overlays?.filter((o) => !o.place);
            }
          }
          this.patchJob(job.id, { plan, status: "rendering", stage: "Rendering" });
          let stage = "Rendering";
          const progress = throttled((p) => this.patchJob(job.id, { progress: p, stage }), 120);
          const res = await renderPlan(plan, sources, {
            music: !!plan.music,
            silentCopy: !!plan.music,
            cardImage,
            signal: jobSignal,
            onProgress: (p, st) => {
              if (st !== stage) {
                stage = st;
                this.patchJob(job.id, { progress: p, stage });
              } else progress(p);
            },
          });
          // Deleted while it rendered: nothing to show.
          if (!this.hasJob(job.id)) continue;
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
        } finally {
          this.jobAborts.delete(job.id);
        }
      }
    } finally {
      this.abort = null;
      this.batchDone();
      this.set({ busy: false });
    }
  }
}

export const studio = new Studio();

export function useStudio(): State {
  return useSyncExternalStore(studio.subscribe, studio.get, studio.get);
}

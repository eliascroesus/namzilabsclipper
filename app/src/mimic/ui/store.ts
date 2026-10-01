/**
 * The mimic page's state and the work behind it: studying the reference,
 * hearing the footage, reading the extras, planning and rendering the edit.
 * React reads it through useMimic(); the heavy objects stay out of React.
 */
import { useSyncExternalStore } from "react";
import { pickModel } from "../../engine/ai/gemini";
import { detectSpeech, type Run } from "../../engine/audio/speech";
import { findCuts as exactCuts } from "../../engine/media/cuts";
import { grabThumb } from "../../engine/media/scan";
import { decodeMono, openSource, type Source } from "../../engine/media/sources";
import { analyzeSong, loudnessBars, SR } from "../../engine/audio/song";
import { FaceFinder } from "../../engine/vision/faces";
import { naturalWordGap } from "../analyze/captions";
import { TextReader } from "../analyze/ocr";
import { analyzeReference } from "../analyze/reference";
import { facesIn, frameSource } from "../analyze/source";
import { retime } from "../asr/align";
import { listen, releaseSpeechModel, type Word } from "../asr/client";
import { geminiWords } from "../asr/gemini";
import { DEFAULT_LOOK } from "../captions";
import { geminiExtras, geminiSounds } from "../ai";
import { understand } from "../extras";
import { fold, placeByContent, sentences, soundsByWords, type Place } from "../match";
import { planMimic, type PlanInput } from "../plan";
import { mimicStills, mixMimic, renderMimic, type MixExtras } from "../render";
import { finish, isMadeSound, makeSfx, SOUNDS } from "../sfx";
import type { CaptionLook, Extra, MimicPlan, MimicTemplate, VolumeLine } from "../types";
import { MIX_RATE } from "../../engine/render/mix";
import { recall, remember } from "../../ui/kit";
import { fetchPicture, fingerprint, PASTE_KEY, PasteError, readClipboard, type Pasted } from "./paste";

export type Stage = "idle" | "working" | "ready" | "error";

export interface Item {
  id: string;
  name: string;
  kind: "video" | "image" | "audio";
  duration: number;
  width: number;
  height: number;
  thumb?: string;
  status: "reading" | "ready" | "error";
  error?: string;
  focus?: { x: number; y: number };
  /** what it is (an extra): a name, the user's words, or Gemini's; the words on it; what it looks like; Gemini's keywords */
  label?: string;
  labelByUser?: boolean;
  text?: string;
  tags?: string[];
  /** Gemini's words for what it shows, and what it would be talked about as */
  about?: string;
  keywords?: string[];
  look?: "screenshot" | "photo" | "clip";
  /** still being looked at (its text read, what it shows) */
  looking?: boolean;
}

export interface Job {
  stage: Stage;
  progress: number;
  label: string;
  error?: string;
}

export type Ear = "local" | "gemini";

export interface State {
  reference: Item | null;
  study: Job;
  template: MimicTemplate | null;
  look: CaptionLook;
  footage: Item | null;
  hearing: Job;
  /** the words as heard (source times), and as the user has them now */
  heard: Word[];
  words: Word[];
  text: string;
  extras: Item[];
  assign: Record<string, string | null>;
  clip: boolean;
  tail: boolean;
  ear: Ear;
  geminiKey: string;
  make: Job;
  result: { url: string; name: string; bytes: number; ms: number; duration: number } | null;
  stills: string[];
  /** what the last paste did, shown by the extras or by the cards (a paste into one) */
  pasted: { text: string; bad: boolean; where: "extras" | "slots" } | null;
  /** a card or cutaway waiting for the next paste (when the clipboard can't be read on a click) */
  pasteSlot: string | null;
  /** where the pictures go: where the footage talks about them (each on its word), or in the reference's cards as it has them */
  placement: "auto" | "reference";
  /** Gemini's reading of each picture: the moment it belongs at (source time; null: nowhere), what's said there, and why */
  aiExtras: Record<string, { t: number | null; basis: string; why: string }>;
  /** at most this share of the talk under pictures */
  cover: number;
  /** the user's own choice for a picture: a moment of the footage (source time), the reference's cards, or not at all */
  extraMoved: Record<string, number | "slot" | "out">;
  placing: Job;
  /** the reference was studied, or the footage heard, on an earlier visit (and taken from this browser) */
  remembered: { reference: boolean; footage: boolean };
  /** where the user put a card or cutaway themselves (source times), by slot (a run's first card) */
  moved: Record<string, number>;
  /** sound effects: none, on the moves, or on the moves and moments of the script */
  sfxMode: "none" | "moves" | "script";
  /** the sound the moves make */
  sfxMove: string;
  sfxDb: number;
  /** the user's changes to sound effects, by what they're on */
  cueEdits: Record<string, { dt?: number; sound?: string; db?: number; off?: boolean }>;
  /** sound effects the user put in (output times) */
  myCues: { key: string; t: number; sound: string; db: number; why: string }[];
  /** Gemini's moments for a sound (source times), when asked */
  aiCues: { key: string; t: number; sound: string; why: string }[] | null;
  /** the user's own sounds */
  sounds: Item[];
  music: Item | null;
  musicDb: number;
  /** seconds into the song it starts from */
  musicFrom: number;
  /** where in the edit it comes in: where the reference's music does, from the top, or where the user put it (seconds) */
  musicAt: "bed" | "start" | number;
  /** where in the edit it stops (seconds), when before the end */
  musicEnd: number | null;
  musicLine: VolumeLine;
  /** the song read, to pick its part from: its loudness strip, bar lines, drops (strongest first) and tempo */
  musicSong: { bars: number[]; downbeats: number[]; drops: number[]; bpm: number } | null;
  /** the song playing on its own (picking its part): from where in it, since when (performance.now()) */
  songPlaying: { from: number; since: number } | null;
  /** the soundtrack playing: from where in the edit, since when (performance.now()) */
  playing: { from: number; since: number } | null;
  mixing: boolean;
}

const KEY_STORE = "clipper.gemini.v1";

/**
 * What's remembered in this browser between visits, by file (its name, size and date): the
 * reference as studied, and the footage as heard (its words, where the voice is, its cuts, the
 * speaker's face take by take). Bump a version when what makes it changes.
 */
const STUDY_VERSION = 1;
const HEAR_VERSION = 1;
const fileKey = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;
interface Heard {
  words: Word[];
  speech: Run[];
  cuts: number[];
  face: { x: number; y: number; h: number } | null;
  shots: { start: number; end: number; face: { x: number; y: number; h: number } | null }[];
}
const loadKey = () => {
  try {
    return localStorage.getItem(KEY_STORE) ?? "";
  } catch {
    return "";
  }
};

let nextId = 1;
const newId = (p: string) => `${p}${nextId++}`;
const idle: Job = { stage: "idle", progress: 0, label: "" };


/**
 * The captions as the reference sets them, their words no closer than four fifths of a
 * normal space: a tight gap measured off a reference reads as no space at all on a
 * phone (the word spacing slider goes either way from there).
 */
function readable(look: CaptionLook | null | undefined): CaptionLook {
  if (!look) return DEFAULT_LOOK;
  const floor = 0.8 * naturalWordGap(look);
  return look.wordGap !== undefined && look.wordGap < floor ? { ...look, wordGap: Math.round(floor * 1000) / 1000 } : look;
}

class Mimic {
  private state: State;
  private readonly listeners = new Set<() => void>();
  private readonly sources = new Map<string, Source>();
  private speech: Run[] = [];
  private rawCuts: number[] = [];
  private face: { x: number; y: number; h: number } | null = null;
  private shots: { start: number; end: number; face: { x: number; y: number; h: number } | null }[] = [];
  private studyAbort: AbortController | null = null;
  private hearAbort: AbortController | null = null;
  private makeAbort: AbortController | null = null;
  private model: string | null = null;
  /** pictures pasted so far (for their names), and each one's fingerprint → its extra */
  private pastes = 0;
  private readonly prints = new Map<string, string>();
  private noteTimer: ReturnType<typeof setTimeout> | undefined;
  /** the user's sounds and the voice decoded for the last mix */
  private readonly mixExtra: MixExtras = { sounds: new Map(), voice: null };
  private mixed: { key: string; buf: AudioBuffer } | null = null;
  private audio: AudioContext | null = null;
  private player: AudioBufferSourceNode | null = null;
  /** the music's file, to play the song on its own while its part is picked */
  private songUrl: string | null = null;
  private song: HTMLAudioElement | null = null;
  /** where the script reading put each slot last time the edit was planned */
  lastPlaces: Record<string, { t: number; said: string; by: "words" | "gemini" | "you" }> = {};
  /** where each picture went last time the edit was planned (placed by the footage's words), and why */
  extraPlaces: Record<string, { t: number; said: string; why: string; by: "words" | "gemini" | "you"; sure: number }> = {};
  private looking: Promise<void> = Promise.resolve();
  private content: { key: string; places: Record<string, Place> } | null = null;
  private aiSig = "";
  private aiTimer: ReturnType<typeof setTimeout> | undefined;
  private refFile: File | null = null;
  private footFile: File | null = null;

  constructor() {
    const key = loadKey();
    this.state = {
      reference: null,
      study: idle,
      template: null,
      look: DEFAULT_LOOK,
      footage: null,
      hearing: idle,
      heard: [],
      words: [],
      text: "",
      extras: [],
      music: null,
      assign: {},
      clip: false,
      tail: true,
      ear: key ? "gemini" : "local",
      geminiKey: key,
      make: idle,
      result: null,
      stills: [],
      pasted: null,
      pasteSlot: null,
      placement: "auto",
      aiExtras: {},
      cover: 0.5,
      extraMoved: {},
      placing: idle,
      remembered: { reference: false, footage: false },
      moved: {},
      sfxMode: "moves",
      sfxMove: "whoosh",
      sfxDb: 0,
      cueEdits: {},
      myCues: [],
      aiCues: null,
      sounds: [],
      musicDb: 0,
      musicFrom: 0,
      musicAt: "bed",
      musicEnd: null,
      musicLine: [],
      musicSong: null,
      songPlaying: null,
      playing: null,
      mixing: false,
    };
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

  private async open(file: File, audioOnly = false): Promise<{ src: Source; item: Item }> {
    const id = newId("m");
    const src = await openSource(id, file, file.name, { audioOnly });
    this.sources.set(id, src);
    const kind = src.info.kind;
    let thumb: string | undefined;
    if (kind === "image" && src.image) {
      const c = new OffscreenCanvas(240, Math.round((240 * src.info.height) / Math.max(1, src.info.width)));
      c.getContext("2d")!.drawImage(src.image, 0, 0, c.width, c.height);
      thumb = URL.createObjectURL(await c.convertToBlob({ type: "image/jpeg", quality: 0.8 }));
    } else if (kind === "video") {
      const b = await grabThumb(src, Math.min(1, src.info.duration / 2), 240).catch(() => undefined);
      if (b) thumb = URL.createObjectURL(b);
    }
    return { src, item: { id, name: file.name, kind, duration: src.info.duration, width: src.info.width, height: src.info.height, thumb, status: "ready" } };
  }

  // The reference.

  /** The reference: studied, or as studied before in this browser (unless `fresh`). */
  async setReference(file: File, fresh = false) {
    this.studyAbort?.abort();
    const ctl = (this.studyAbort = new AbortController());
    this.refFile = file;
    this.set((s) => ({ reference: { id: "", name: file.name, kind: "video", duration: 0, width: 0, height: 0, status: "reading" }, template: null, study: { stage: "working", progress: 0, label: "Opening" }, result: null, moved: {}, cueEdits: {}, remembered: { ...s.remembered, reference: false } }));
    try {
      const { src, item } = await this.open(file);
      if (item.kind !== "video") throw new Error(`${file.name} isn't a video. Drop the ad or video to copy.`);
      this.set({ reference: item });
      const key = `mimic-study:${STUDY_VERSION}:${fileKey(file)}`;
      const kept = fresh ? null : await recall<MimicTemplate>(key);
      if (ctl.signal.aborted) return;
      if (kept?.version === 1) {
        this.set((s) => ({ template: kept, look: readable(kept.captions), study: { stage: "ready", progress: 1, label: "" }, assign: {}, remembered: { ...s.remembered, reference: true } }));
        return;
      }
      const reader = await TextReader.get();
      const template = await analyzeReference(frameSource(src), { reader, faces: facesIn }, (p, label) => this.set({ study: { stage: "working", progress: p, label } }), ctl.signal);
      if (ctl.signal.aborted) return;
      this.set({ template, look: readable(template.captions), study: { stage: "ready", progress: 1, label: "" }, assign: {} });
      void remember(key, template);
    } catch (e) {
      if (ctl.signal.aborted) return;
      this.set({ study: { stage: "error", progress: 0, label: "", error: e instanceof Error ? e.message : String(e) } });
    }
  }

  /** Study the reference again (not as remembered). */
  restudy() {
    if (this.refFile) void this.setReference(this.refFile, true);
  }

  setLook(patch: Partial<CaptionLook>) {
    this.set((s) => ({ look: { ...s.look, ...patch } }));
  }

  // The footage.

  private hearKey(file: File) {
    return `mimic-hear:${HEAR_VERSION}:${this.state.ear === "gemini" && this.state.geminiKey ? "gemini" : "local"}:${fileKey(file)}`;
  }

  /** Keep the footage as heard, for the next visit. */
  private rememberFootage() {
    const f = this.footFile;
    if (!f || !this.state.heard.length) return;
    const h: Heard = { words: this.state.heard, speech: this.speech, cuts: this.rawCuts, face: this.face, shots: this.shots };
    void remember(this.hearKey(f), h);
  }

  async setFootage(file: File) {
    this.hearAbort?.abort();
    const ctl = (this.hearAbort = new AbortController());
    this.footFile = file;
    // New words: Gemini is asked about the pictures again.
    this.aiSig = "";
    this.set((s) => ({ footage: { id: "", name: file.name, kind: "video", duration: 0, width: 0, height: 0, status: "reading" }, heard: [], words: [], text: "", hearing: { stage: "working", progress: 0, label: "Opening" }, result: null, moved: {}, aiExtras: {}, extraMoved: {}, aiCues: null, myCues: [], remembered: { ...s.remembered, footage: false } }));
    try {
      const { src, item } = await this.open(file);
      if (item.kind !== "video") throw new Error(`${file.name} isn't a video.`);
      this.set({ footage: item });
      // Heard before in this browser: its words, cuts and faces as they were.
      const kept = await recall<Heard>(this.hearKey(file));
      if (ctl.signal.aborted) return;
      if (kept?.words?.length) {
        this.speech = kept.speech;
        this.rawCuts = kept.cuts;
        this.face = kept.face;
        this.shots = kept.shots;
        this.set((s) => ({ heard: kept.words, words: kept.words, text: kept.words.map((w) => w.text).join(" "), hearing: { stage: "ready", progress: 1, label: "" }, remembered: { ...s.remembered, footage: true } }));
        this.askSoon();
        return;
      }
      // Its cuts and the speaker's face are looked for while it's heard (the speech model has a thread of its own).
      this.rawCuts = [];
      this.face = null;
      this.shots = [];
      const looking = Promise.all([exactCuts(src, 0, src.info.duration, ctl.signal).catch(() => []), this.findFace(src)]).then(async ([cuts, face]) => {
        if (ctl.signal.aborted) return;
        this.rawCuts = cuts;
        this.face = face;
        this.shots = await this.takeFaces(src, cuts);
      });
      await this.hear(ctl.signal);
      if (this.state.hearing.stage === "ready") {
        this.set({ hearing: { stage: "working", progress: 0.97, label: "Finding the cuts in it" } });
        await looking;
        if (ctl.signal.aborted) return;
        this.set({ hearing: { stage: "ready", progress: 1, label: "" } });
        this.rememberFootage();
      }
    } catch (e) {
      if (ctl.signal.aborted) return;
      this.set({ hearing: { stage: "error", progress: 0, label: "", error: e instanceof Error ? e.message : String(e) } });
    }
  }

  /** The speaker's face in each take (between the footage's own cuts), from its middle frame. */
  private async takeFaces(src: Source, cuts: number[]) {
    const bounds = [0, ...cuts, src.info.duration];
    const out: { start: number; end: number; face: { x: number; y: number; h: number } | null }[] = [];
    try {
      const finder = await FaceFinder.get();
      for (let i = 0; i + 1 < bounds.length; i++) {
        const [a, b] = [bounds[i], bounds[i + 1]];
        let face: { x: number; y: number; h: number } | null = null;
        if (b - a > 0.3) {
          const blob = await grabThumb(src, (a + b) / 2, 480);
          if (blob) {
            const bmp = await createImageBitmap(blob);
            const f = (await finder.find((ctx) => ctx.drawImage(bmp, 0, 0, ctx.canvas.width, ctx.canvas.height), bmp.width / bmp.height)).sort((p, q) => q.h - p.h)[0];
            bmp.close();
            if (f) face = { x: f.x, y: f.y, h: f.h };
          }
        }
        out.push({ start: a, end: b, face });
      }
    } catch {
      // no faces: one framing for the whole footage
    }
    return out;
  }

  /** The speaker's face in the footage: its middle on a few frames. */
  private async findFace(src: Source): Promise<{ x: number; y: number; h: number } | null> {
    try {
      const finder = await FaceFinder.get();
      const d = src.info.duration;
      const found: { x: number; y: number; h: number }[] = [];
      for (const t of [0.15, 0.35, 0.5, 0.65, 0.85].map((k) => k * d)) {
        const b = await grabThumb(src, t, 480);
        if (!b) continue;
        const bmp = await createImageBitmap(b);
        const faces = await finder.find((ctx) => ctx.drawImage(bmp, 0, 0, ctx.canvas.width, ctx.canvas.height), bmp.width / bmp.height);
        bmp.close();
        const f = faces.sort((p, q) => q.h - p.h)[0];
        if (f) found.push({ x: f.x, y: f.y, h: f.h });
      }
      if (found.length < 2) return null;
      const mid = (v: number[]) => v.sort((p, q) => p - q)[v.length >> 1];
      return { x: mid(found.map((f) => f.x)), y: mid(found.map((f) => f.y)), h: mid(found.map((f) => f.h)) };
    } catch {
      return null;
    }
  }

  /** Hear the footage: the local model (and Gemini's fixes, with a key). */
  async hear(signal = this.hearAbort?.signal) {
    try {
      await this.listenTo(signal);
    } catch (e) {
      if (signal?.aborted) return;
      releaseSpeechModel();
      this.set({ hearing: { stage: "error", progress: 0, label: "", error: e instanceof Error ? e.message : String(e) } });
    }
  }

  /** Hear the footage again (with the other ear, or after a bad hearing), and keep it as heard now. */
  async hearAgain() {
    await this.hear();
    if (this.state.hearing.stage !== "ready") return;
    this.set((s) => ({ remembered: { ...s.remembered, footage: false } }));
    this.rememberFootage();
  }

  private async listenTo(signal?: AbortSignal) {
    const s = this.state;
    const src = s.footage ? this.sources.get(s.footage.id) : undefined;
    if (!src) return;
    this.set({ hearing: { stage: "working", progress: 0.05, label: "Reading the sound" } });
    const y = await decodeMono(src, 16000, 0, Infinity, undefined, signal);
    this.speech = detectSpeech(y, 16000);
    let heard: Word[] = [];
    const useGemini = s.ear === "gemini" && !!s.geminiKey;
    try {
      const r = await listen(
        y,
        (p) =>
          this.set({
            hearing: {
              stage: "working",
              progress: p.stage === "download" ? 0.05 + 0.45 * p.p : p.stage === "load" ? 0.5 : 0.52 + 0.4 * p.p,
              label: p.stage === "download" ? `Getting the speech model, once (${Math.round((p.bytes ?? 0) / 1e6)} of ${Math.round((p.total ?? 0) / 1e6)} MB)` : p.stage === "load" ? "Starting the speech model" : "Listening",
            },
          }),
        signal,
      );
      heard = r.words;
    } catch (e) {
      if (signal?.aborted) return;
      if (!useGemini) throw e;
    }
    if (useGemini) {
      this.set({ hearing: { stage: "working", progress: 0.93, label: "Gemini checking the words" } });
      this.model ??= await pickModel(s.geminiKey, signal);
      heard = await geminiWords(y, 16000, this.speech, s.geminiKey, this.model, heard.length ? heard : null, signal);
    }
    releaseSpeechModel();
    this.set({ heard, words: heard, text: heard.map((w) => w.text).join(" "), hearing: { stage: "ready", progress: 1, label: "" } });
    this.askSoon();
  }

  /** The user fixed the words: they keep the times they were heard at. */
  setText(text: string) {
    this.set((s) => ({ text, words: retime(s.heard, text) }));
  }

  // Extras and music.

  /** Adds pictures and clips to the extras; each one's id once read (null where it couldn't be). */
  async addExtras(files: File[]): Promise<(string | null)[]> {
    const temps: Item[] = files.map((file) => ({ id: newId("x"), name: file.name, kind: "image", duration: 0, width: 0, height: 0, status: "reading" }));
    this.set((s) => ({ extras: [...s.extras, ...temps] }));
    const ids: (string | null)[] = [];
    for (const [i, file] of files.entries()) {
      const temp = temps[i];
      try {
        const { src, item } = await this.open(file);
        if (item.kind === "audio") throw new Error(`${file.name} is a sound. Drop music under Sound.`);
        item.focus = await this.focusOf(src);
        item.looking = true;
        this.set((s) => ({ extras: s.extras.map((e) => (e.id === temp.id ? item : e)) }));
        ids.push(item.id);
        // One at a time, and one that fails doesn't hold up the rest.
        this.looking = this.looking.then(() => this.lookAt(item.id, src)).catch(() => this.set((s) => ({ extras: s.extras.map((e) => (e.id === item.id ? { ...e, looking: false } : e)) })));
      } catch (e) {
        this.set((s) => ({ extras: s.extras.map((x) => (x.id === temp.id ? { ...x, status: "error", error: e instanceof Error ? e.message : String(e) } : x)) }));
        ids.push(null);
      }
    }
    return ids;
  }

  /** What a picture is: the words on it, what it looks like, a name worth matching (in the background, one at a time). */
  private async lookAt(id: string, src: Source) {
    let img: ImageBitmap | null = null;
    try {
      if (src.image) img = src.image;
      else {
        const b = await grabThumb(src, Math.min(1, src.info.duration / 3), 720);
        if (b) img = await createImageBitmap(b);
      }
    } catch {
      img = null;
    }
    const item = this.state.extras.find((e) => e.id === id);
    const u = await understand(img, item?.name ?? "", src.info.kind === "video");
    if (img && img !== src.image) img.close();
    this.set((s) => ({ extras: s.extras.map((e) => (e.id === id ? { ...e, label: e.labelByUser ? e.label : e.label || u.label, text: u.text, tags: u.tags, look: u.look, looking: false } : e)) }));
    this.askSoon();
  }

  /** The user's words for what a picture is. */
  setLabel(id: string, label: string) {
    this.set((s) => ({ extras: s.extras.map((e) => (e.id === id ? { ...e, label, labelByUser: true } : e)) }));
    this.askSoon(3000);
  }

  /** A card's or cutaway's name on the page ("Card 4", "Cutaway 1"). */
  private slotName(id: string): string {
    const t = this.state.template;
    const c = t?.cards.findIndex((x) => x.id === id) ?? -1;
    if (c >= 0) return `Card ${c + 1}`;
    const b = t?.broll.findIndex((x) => x.id === id) ?? -1;
    return b >= 0 ? `Cutaway ${b + 1}` : "the slot";
  }

  private note(text: string, bad = false, where: "extras" | "slots" = "extras") {
    clearTimeout(this.noteTimer);
    this.set({ pasted: { text, bad, where } });
    this.noteTimer = setTimeout(() => this.set({ pasted: null }), bad ? 9000 : 5000);
  }

  /** The number the next pasted picture is named with. */
  nextPaste = () => this.pastes + 1;

  /**
   * Pictures pasted: added to the extras (one already there isn't added twice), and put in
   * a card or cutaway when one was picked (or is waiting for this paste).
   */
  async paste(p: Pasted, slot: string | null = this.state.pasteSlot) {
    this.set({ pasteSlot: null });
    const where = slot ? "slots" : "extras";
    let files = p.files;
    try {
      if (!files.length && p.link) files = [await fetchPicture(p.link.url, this.nextPaste(), p.link.alt)];
    } catch (e) {
      return this.note(e instanceof Error ? e.message : String(e), true, where);
    }
    if (!files.length) return this.note("There's no picture on the clipboard. Right-click a picture, pick Copy image, and paste again.", true, where);
    this.pastes += files.length;
    const fresh: { file: File; print: string }[] = [];
    let known: string | null = null;
    for (const file of files) {
      const print = await fingerprint(file);
      const had = this.prints.get(print);
      if (had && this.state.extras.some((e) => e.id === had && e.status === "ready")) known ??= had;
      else fresh.push({ file, print });
    }
    const ids = await this.addExtras(fresh.map((f) => f.file));
    ids.forEach((id, i) => id && this.prints.set(fresh[i].print, id));
    // (One taken out again while it was being read doesn't count.)
    const added = ids.filter((id): id is string => !!id && this.state.extras.some((e) => e.id === id));
    const first = added[0] ?? known;
    const into = slot && first ? ` into ${this.slotName(slot)}` : "";
    if (slot && first) this.assignSlot(slot, first);
    const names = (id: string) => this.state.extras.find((e) => e.id === id)?.name ?? "";
    if (added.length) this.note(`Pasted ${added.length > 1 ? `${added.length} pictures` : names(added[0])}${into}.`, false, where);
    else if (known) this.note(`That picture is already in your extras${into ? `; it's now in ${this.slotName(slot!)}` : ""}.`, false, where);
    else this.note("That couldn't be read as a picture.", true, where);
  }

  /** The clipboard, read on a click; if the browser won't, the slot waits for the keyboard's paste. */
  async pasteFromClipboard(slot: string | null = null) {
    try {
      await this.paste(await readClipboard(this.nextPaste()), slot);
    } catch (e) {
      if (!(e instanceof PasteError)) throw e;
      this.set({ pasteSlot: slot });
      this.note(slot ? `Press ${PASTE_KEY} to paste into ${this.slotName(slot)}.` : e.message, !slot, slot ? "slots" : "extras");
    }
  }

  /** Stop waiting for a paste into a slot. */
  cancelPaste() {
    this.set({ pasteSlot: null });
  }

  /** Where a picture's subject is: the biggest face, else the middle. */
  private async focusOf(src: Source): Promise<{ x: number; y: number } | undefined> {
    try {
      const finder = await FaceFinder.get();
      let bmp: ImageBitmap | null = null;
      if (src.image) bmp = src.image;
      else {
        const b = await grabThumb(src, Math.min(1, src.info.duration / 3), 480);
        if (b) bmp = await createImageBitmap(b);
      }
      if (!bmp) return undefined;
      const img = bmp;
      const faces = await finder.find((ctx) => ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height), img.width / img.height, 480, 0.5);
      if (!src.image) img.close();
      const f = faces.sort((p, q) => q.w * q.h - p.w * p.h)[0];
      return f ? { x: f.x, y: f.y } : undefined;
    } catch {
      return undefined;
    }
  }

  removeExtra(id: string) {
    this.set((s) => ({ extras: s.extras.filter((e) => e.id !== id), assign: Object.fromEntries(Object.entries(s.assign).filter(([, v]) => v !== id)) }));
  }

  moveExtra(id: string, dir: -1 | 1) {
    this.set((s) => {
      const i = s.extras.findIndex((e) => e.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.extras.length) return {};
      const extras = [...s.extras];
      [extras[i], extras[j]] = [extras[j], extras[i]];
      return { extras };
    });
  }

  async setMusic(file: File | null) {
    this.stopSong();
    if (this.songUrl) URL.revokeObjectURL(this.songUrl);
    this.songUrl = null;
    // (A new song starts from its top, where the reference's music comes in, at its level, with no volume line.)
    const fresh = { musicFrom: 0, musicAt: "bed" as const, musicEnd: null, musicLine: [], musicSong: null };
    if (!file) return this.set({ music: null, ...fresh });
    try {
      const { src, item } = await this.open(file, true);
      this.songUrl = URL.createObjectURL(file);
      this.set({ music: { ...item, kind: "audio" }, ...fresh });
      // Read it for the strip to pick its part from (its loudness, bar lines and drops).
      const y = await decodeMono(src, SR, 0, Infinity);
      await new Promise((r) => setTimeout(r, 0));
      if (this.state.music?.id !== item.id || !y.length) return;
      const song = analyzeSong(y);
      if (this.state.music?.id !== item.id) return;
      const drops = [...song.drops].sort((a, b) => b.strength - a.strength).map((d) => d.t);
      this.set({ musicSong: { bars: loudnessBars(song), downbeats: song.downbeats, drops, bpm: song.bpm } });
    } catch (e) {
      this.set({ music: { id: "", name: file.name, kind: "audio", duration: 0, width: 0, height: 0, status: "error", error: e instanceof Error ? e.message : String(e) }, ...fresh });
    }
  }

  /** The song on its own from `from` seconds in (picking its part), for `seconds` at most. */
  hearSong(from: number, seconds = 20) {
    this.stopListening();
    this.stopSong();
    if (!this.songUrl) return;
    const a = new Audio(this.songUrl);
    a.currentTime = Math.max(0, from);
    const stop = from + seconds;
    a.ontimeupdate = () => {
      if (a.currentTime >= stop) this.stopSong();
    };
    a.onended = () => this.stopSong();
    this.song = a;
    void a.play().then(
      () => this.song === a && this.set({ songPlaying: { from: a.currentTime, since: performance.now() } }),
      () => this.stopSong(),
    );
  }

  stopSong() {
    const a = this.song;
    this.song = null;
    a?.pause();
    if (this.state.songPlaying) this.set({ songPlaying: null });
  }

  assignSlot(slot: string, extra: string | null | undefined) {
    this.set((s) => {
      const assign = { ...s.assign };
      if (extra === undefined) delete assign[slot];
      else assign[slot] = extra;
      return { assign };
    });
  }

  setOption(patch: Partial<Pick<State, "clip" | "tail" | "ear">>) {
    this.set(patch);
    if (patch.ear) this.askSoon();
  }

  setKey(k: string) {
    try {
      localStorage.setItem(KEY_STORE, k);
    } catch {
      // private mode: keep it for this visit only
    }
    this.model = null;
    this.set({ geminiKey: k });
    this.askSoon();
  }

  // Making the edit.

  why(): string | null {
    const s = this.state;
    if (!s.reference) return "Drop the reference to copy";
    if (s.study.stage === "working") return "Studying the reference";
    if (s.study.stage === "error") return "The reference couldn't be read";
    if (!s.footage) return "Drop your footage";
    if (s.hearing.stage === "working") return "Listening to your footage";
    if (s.hearing.stage === "error") return "Your footage couldn't be heard";
    return null;
  }

  private planInput(): PlanInput | null {
    const s = this.state;
    const src = s.footage ? this.sources.get(s.footage.id) : undefined;
    if (!s.template || !src) return null;
    const extras: Extra[] = s.extras
      .filter((e) => e.status === "ready")
      .map((e) => ({ id: e.id, name: e.name, kind: e.kind === "video" ? "video" : "image", width: e.width, height: e.height, duration: e.duration, focus: e.focus, label: e.label, text: e.text, tags: e.tags, about: e.about, keywords: e.keywords, look: e.look }));
    return {
      template: s.template,
      raw: { id: s.footage!.id, duration: src.info.duration, width: src.info.width, height: src.info.height, cuts: this.rawCuts, face: this.face, shots: this.shots },
      words: s.words,
      speech: this.speech,
      extras,
      assign: s.assign,
      clip: s.clip,
      tail: s.tail,
      music: s.music && s.music.status === "ready" ? { id: s.music.id, duration: s.music.duration, db: s.musicDb, from: s.musicFrom, at: s.musicAt, ...(s.musicEnd !== null ? { end: s.musicEnd } : {}), line: s.musicLine } : null,
      look: s.look,
      sfx: {
        mode: s.sfxMode,
        move: s.sfxMove,
        db: s.sfxDb,
        edits: s.cueEdits,
        mine: s.myCues,
        script: s.sfxMode === "script" ? (s.aiCues ?? soundsByWords(s.words)) : undefined,
      },
    };
  }

  /** Where the footage's words put each picture (worked out again only when the words or the pictures change). */
  private contentPlaces(extras: Extra[]): Record<string, Place> {
    const w = this.state.words;
    const key = JSON.stringify([w.length, w[0]?.start, w[w.length - 1]?.end, this.state.text.length, extras.map((e) => [e.id, e.label, e.text, e.tags, e.about, e.keywords, e.kind])]);
    if (this.content?.key !== key) this.content = { key, places: placeByContent(w, extras) };
    return this.content.places;
  }

  plan(): MimicPlan | null {
    // (Planned once per state: the page asks from more than one place.)
    if (this.planned?.state === this.state) return this.planned.plan;
    const plan = this.planNow();
    this.planned = { state: this.state, plan };
    return plan;
  }

  private planned: { state: State; plan: MimicPlan | null } | null = null;

  private planNow(): MimicPlan | null {
    const s = this.state;
    const base = this.planInput();
    if (!base) return null;
    const said = (t: number) => sentences(s.words).find((x) => x.start <= t + 0.05 && x.end >= t - 0.05)?.text ?? "";
    // In the reference's cards: where the user moved them.
    const places: typeof this.lastPlaces = {};
    for (const [id, t] of Object.entries(s.moved)) places[id] = { t, said: said(t), by: "you" };
    this.lastPlaces = places;
    const anchor = Object.fromEntries(Object.entries(places).map(([k, v]) => [k, v.t]));
    this.extraPlaces = {};
    if (s.placement !== "auto" || !s.words.length) return planMimic({ ...base, anchor });
    // Each picture where the footage talks about it: the user's choice, Gemini's, or the words'
    // (one the user put in a card of the reference's stays there).
    const local = this.contentPlaces(base.extras);
    const placed: Record<string, number> = {};
    // How sure each place is (the opening, the ending and the cover keep only the surest): the user's own, a name, figure or words said there, or only a topic.
    const strength: Record<string, number> = {};
    const out = new Set<string>();
    const inCards = new Set(Object.values(s.assign).filter(Boolean));
    for (const e of base.extras) {
      const mine = s.extraMoved[e.id];
      if (mine === "out") out.add(e.id);
      if (mine === "out" || mine === "slot" || inCards.has(e.id)) continue;
      if (typeof mine === "number") {
        placed[e.id] = mine;
        strength[e.id] = 3;
        this.extraPlaces[e.id] = { t: mine, said: said(mine), why: "you put it here", by: "you", sure: 3 };
        continue;
      }
      const ai = s.aiExtras[e.id];
      const l = local[e.id];
      // Gemini's place, unless it found none where the name itself is said.
      if (ai && (ai.t !== null || !l || l.score < 1.1)) {
        if (ai.t !== null) {
          placed[e.id] = ai.t;
          strength[e.id] = ai.basis === "topic" ? 1 : 2;
          this.extraPlaces[e.id] = { t: ai.t, said: said(ai.t), why: ai.why, by: "gemini", sure: strength[e.id] };
        }
        continue;
      }
      if (l) {
        placed[e.id] = l.t;
        strength[e.id] = l.basis === "topic" ? 1 : 2;
        this.extraPlaces[e.id] = { t: l.t, said: l.said, why: l.why, by: "words", sure: strength[e.id] };
      }
    }
    return planMimic({ ...base, extras: base.extras.filter((e) => !out.has(e.id)), placed, strength, cover: s.cover, anchor });
  }

  // Where the pictures go.

  setPlacement(placement: State["placement"]) {
    this.set({ placement });
    this.askSoon();
  }

  /** At most this share of the talk under pictures. */
  setCover(cover: number) {
    this.set({ cover });
  }

  /** Gemini is used only where the user chose it (for the words) and gave a key. */
  canAsk = () => this.state.ear === "gemini" && !!this.state.geminiKey;

  /** Ask Gemini where the pictures go, once the words and the pictures are ready, and again when they change. */
  askSoon(wait = 1200) {
    const s = this.state;
    if (!this.canAsk() || s.placement !== "auto" || !s.words.length) return;
    const ready = s.extras.filter((e) => e.status === "ready");
    if (!ready.length || ready.some((e) => e.looking)) return;
    // (Only what the user or the page changed: a name Gemini gave doesn't ask it again.)
    const sig = JSON.stringify([s.geminiKey, s.words.length, s.text.length, ready.map((e) => [e.id, e.labelByUser ? e.label : e.name, e.text?.length])]);
    if (sig === this.aiSig) return;
    clearTimeout(this.aiTimer);
    this.aiTimer = setTimeout(() => {
      this.aiSig = sig;
      void this.askGeminiExtras();
    }, wait);
  }

  async askGeminiExtras() {
    const s = this.state;
    if (!s.words.length || !this.canAsk()) return;
    const ready = s.extras.filter((e) => e.status === "ready");
    if (!ready.length) return;
    this.set({ placing: { stage: "working", progress: 0.3, label: "Gemini reading your pictures and script" } });
    try {
      this.model ??= await pickModel(s.geminiKey);
      const copies = await Promise.all(ready.map((e) => this.forGemini(e.id)));
      let r: Awaited<ReturnType<typeof geminiExtras>>;
      try {
        r = await geminiExtras({
          key: s.geminiKey,
          model: this.model,
          words: s.words,
          sentences: sentences(s.words),
          extras: ready.map((e, i) => ({ id: e.id, label: e.label ?? "", text: e.text ?? "", kind: e.kind === "video" ? "clip" : e.look === "screenshot" ? "screenshot" : "picture", picture: copies[i] ?? e.thumb })),
        });
      } finally {
        for (const u of copies) if (u) URL.revokeObjectURL(u);
      }
      const aiExtras: State["aiExtras"] = {};
      for (const [id, x] of Object.entries(r)) aiExtras[id] = { t: x.word >= 0 ? s.words[x.word].start : null, basis: x.basis, why: x.why ? `Gemini: ${x.why}` : "Gemini" };
      // Gemini's words for what each shows (the page's title for a picture whose name says nothing), and its keywords help the words' matching.
      this.set((st) => ({ aiExtras, placing: { stage: "ready", progress: 1, label: "" }, extras: st.extras.map((e) => (r[e.id] ? { ...e, about: r[e.id].label, keywords: r[e.id].keywords } : e)) }));
    } catch (e) {
      // (Asked again on the next change, or with the button.)
      this.aiSig = "";
      this.set({ placing: { stage: "error", progress: 0, label: "", error: e instanceof Error ? e.message : String(e) } });
    }
  }

  /** A copy of a picture (or a clip's frame) for Gemini: 640 px on its long side, enough for a face or a logo. */
  private async forGemini(id: string): Promise<string | undefined> {
    const src = this.sources.get(id);
    if (!src) return undefined;
    try {
      if (src.image) {
        const k = Math.min(1, 640 / Math.max(src.info.width, src.info.height));
        const c = new OffscreenCanvas(Math.max(1, Math.round(src.info.width * k)), Math.max(1, Math.round(src.info.height * k)));
        c.getContext("2d")!.drawImage(src.image, 0, 0, c.width, c.height);
        return URL.createObjectURL(await c.convertToBlob({ type: "image/jpeg", quality: 0.85 }));
      }
      const w = src.info.width >= src.info.height ? 640 : Math.round((640 * src.info.width) / Math.max(1, src.info.height));
      const b = await grabThumb(src, Math.min(1, src.info.duration / 3), w);
      return b ? URL.createObjectURL(b) : undefined;
    } catch {
      return undefined;
    }
  }

  /** The user puts a picture at a moment of the footage (source time), in the reference's cards, or out; null lets the page choose again. */
  placeExtra(id: string, at: number | "slot" | "out" | null) {
    this.set((s) => {
      const extraMoved = { ...s.extraMoved };
      if (at === null) delete extraMoved[id];
      else extraMoved[id] = at;
      return { extraMoved };
    });
  }

  /** The user puts a card (its run) or cutaway at a moment of the footage (source time); null puts it back. */
  moveSlot(slot: string, t: number | null) {
    this.set((s) => {
      const moved = { ...s.moved };
      if (t === null) delete moved[slot];
      else moved[slot] = t;
      return { moved };
    });
  }

  // Sound effects.

  setSfx(patch: Partial<Pick<State, "sfxMode" | "sfxMove" | "sfxDb">>) {
    this.set(patch);
    if (patch.sfxMode === "script" && this.canAsk() && !this.state.aiCues) void this.askGeminiSounds();
  }

  async askGeminiSounds() {
    const s = this.state;
    if (!s.words.length || !this.canAsk()) return;
    this.set({ placing: { stage: "working", progress: 0.3, label: "Gemini picking moments for sounds" } });
    try {
      const sents = sentences(s.words);
      this.model ??= await pickModel(s.geminiKey);
      const r = await geminiSounds({ key: s.geminiKey, model: this.model, sentences: sents, sounds: SOUNDS, max: Math.max(3, Math.round((s.words[s.words.length - 1]?.end ?? 60) / 12)) });
      const aiCues: NonNullable<State["aiCues"]> = [];
      for (const [i, x] of r.entries()) {
        const sent = sents[x.sentence];
        if (!sent) continue;
        const want = fold(x.word);
        let t = sent.start;
        for (let w = sent.w0; w < sent.w1; w++)
          if (want && fold(s.words[w].text).includes(want.slice(0, 6))) {
            t = s.words[w].start;
            break;
          }
        aiCues.push({ key: `ai:${i}`, t, sound: x.sound, why: x.why || `"${x.word}"` });
      }
      this.set({ aiCues, placing: { stage: "ready", progress: 1, label: "" } });
    } catch (e) {
      this.set({ placing: { stage: "error", progress: 0, label: "", error: e instanceof Error ? e.message : String(e) } });
    }
  }

  editCue(key: string, patch: { dt?: number; sound?: string; db?: number; off?: boolean }) {
    this.set((s) => {
      const mine = s.myCues.find((c) => c.key === key);
      if (mine) {
        if (patch.off) return { myCues: s.myCues.filter((c) => c.key !== key) };
        return { myCues: s.myCues.map((c) => (c.key === key ? { ...c, t: c.t + (patch.dt ?? 0), sound: patch.sound ?? c.sound, db: patch.db ?? c.db } : c)) };
      }
      const old = s.cueEdits[key] ?? {};
      return { cueEdits: { ...s.cueEdits, [key]: { ...old, ...patch, dt: (old.dt ?? 0) + (patch.dt ?? 0) } } };
    });
  }

  addCue(t: number, sound: string) {
    this.set((s) => ({ myCues: [...s.myCues, { key: `mine:${newId("c")}`, t, sound, db: 0, why: "yours" }] }));
  }

  resetCues() {
    this.set({ cueEdits: {}, myCues: [] });
  }

  /** The user's own sounds (a whoosh they like, a sound of their brand). */
  async addSounds(files: File[]) {
    for (const file of files) {
      const id = newId("s");
      this.set((s) => ({ sounds: [...s.sounds, { id, name: file.name, kind: "audio", duration: 0, width: 0, height: 0, status: "reading" }] }));
      try {
        const { src } = await this.open(file, true);
        const y = await decodeMono(src, MIX_RATE, 0, Math.min(src.info.duration, 8));
        this.mixExtra.sounds!.set(id, finish(Float32Array.from(y), MIX_RATE, 0.8));
        this.set((s) => ({ sounds: s.sounds.map((x) => (x.id === id ? { ...x, duration: y.length / MIX_RATE, status: "ready" } : x)) }));
      } catch (e) {
        this.set((s) => ({ sounds: s.sounds.map((x) => (x.id === id ? { ...x, status: "error", error: e instanceof Error ? e.message : String(e) } : x)) }));
      }
    }
  }

  removeSound(id: string) {
    this.mixExtra.sounds!.delete(id);
    this.set((s) => ({ sounds: s.sounds.filter((x) => x.id !== id), sfxMove: s.sfxMove === id ? "whoosh" : s.sfxMove }));
  }

  // Music.

  setMusicOption(patch: Partial<Pick<State, "musicDb" | "musicFrom" | "musicAt" | "musicEnd" | "musicLine">>) {
    this.set(patch);
  }

  // Listening before making.

  private ctx(): AudioContext {
    this.audio ??= new AudioContext({ sampleRate: MIX_RATE });
    return this.audio;
  }

  /** One sound on its own. */
  async hearSound(id: string) {
    const fx = this.mixExtra.sounds!.get(id) ?? (isMadeSound(id) ? makeSfx(id, MIX_RATE) : null);
    if (!fx) return;
    const ctx = this.ctx();
    await ctx.resume();
    const buf = ctx.createBuffer(1, fx.data.length, MIX_RATE);
    buf.copyToChannel(Float32Array.from(fx.data), 0);
    const node = ctx.createBufferSource();
    node.buffer = buf;
    node.connect(ctx.destination);
    node.start();
  }

  /** The edit's sound as it will be (voice, music, sound effects), mixed again only when something in it changed. */
  async soundtrack(): Promise<{ plan: MimicPlan; buf: AudioBuffer } | null> {
    const plan = this.plan();
    if (!plan || !this.state.footage) return null;
    const key = JSON.stringify([plan.duration, plan.segments, plan.music, plan.sfx, plan.sfxGain, [...this.mixExtra.sounds!.keys()]]);
    if (this.mixed?.key !== key) {
      this.set({ mixing: true });
      try {
        this.mixed = { key, buf: await mixMimic(plan, this.sources, this.state.footage.id, this.mixExtra) };
      } finally {
        this.set({ mixing: false });
      }
    }
    return { plan, buf: this.mixed.buf };
  }

  /** The edit's sound (voice, music, sound effects), from `from` seconds in. */
  async listen(from = 0) {
    this.stopListening();
    this.stopSong();
    const mix = await this.soundtrack();
    if (!mix) return;
    const { plan } = mix;
    const ctx = this.ctx();
    await ctx.resume();
    const node = ctx.createBufferSource();
    node.buffer = mix.buf;
    node.connect(ctx.destination);
    const at = Math.max(0, Math.min(from, plan.duration - 0.05));
    node.start(0, at);
    node.onended = () => {
      if (this.player === node) {
        this.player = null;
        this.set({ playing: null });
      }
    };
    this.player = node;
    this.set({ playing: { from: at, since: performance.now() } });
  }

  stopListening() {
    const p = this.player;
    this.player = null;
    try {
      p?.stop();
    } catch {
      // already stopped
    }
    if (this.state.playing) this.set({ playing: null });
  }

  /** A frame of the footage (source time), for the caption preview. */
  async frameAt(t: number, width = 540): Promise<ImageBitmap | null> {
    const src = this.state.footage ? this.sources.get(this.state.footage.id) : undefined;
    if (!src) return null;
    const b = await grabThumb(src, Math.max(0, Math.min(t, src.info.duration - 0.05)), width).catch(() => undefined);
    return b ? createImageBitmap(b) : null;
  }

  async preview(times: number[]): Promise<string[]> {
    const plan = this.plan();
    if (!plan || !this.state.footage) return [];
    const blobs = await mimicStills(plan, this.sources, this.state.footage.id, times);
    return blobs.map((b) => URL.createObjectURL(b));
  }

  async make() {
    const why = this.why();
    if (why) return;
    const plan = this.plan();
    if (!plan) return;
    this.makeAbort?.abort();
    const ctl = (this.makeAbort = new AbortController());
    const old = this.state.result;
    this.set({ make: { stage: "working", progress: 0, label: "Starting" }, result: null });
    if (old) URL.revokeObjectURL(old.url);
    try {
      const r = await renderMimic(plan, this.sources, this.state.footage!.id, { signal: ctl.signal, extra: this.mixExtra, onProgress: (p, label) => this.set({ make: { stage: "working", progress: p, label } }) });
      const base = (this.state.footage?.name ?? "edit").replace(/\.[^.]+$/, "");
      this.set({ result: { url: URL.createObjectURL(r.blob), name: `${base}-mimic.${r.ext}`, bytes: r.blob.size, ms: r.ms, duration: plan.duration }, make: { stage: "ready", progress: 1, label: "" } });
    } catch (e) {
      if (ctl.signal.aborted) return this.set({ make: idle });
      this.set({ make: { stage: "error", progress: 0, label: "", error: e instanceof Error ? e.message : String(e) } });
    }
  }

  cancel() {
    this.makeAbort?.abort();
  }
}

export const mimic = new Mimic();

export function useMimic(): State {
  return useSyncExternalStore(mimic.subscribe, mimic.get, mimic.get);
}

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
import { FaceFinder } from "../../engine/vision/faces";
import { TextReader } from "../analyze/ocr";
import { analyzeReference } from "../analyze/reference";
import { facesIn, frameSource } from "../analyze/source";
import { retime } from "../asr/align";
import { listen, releaseSpeechModel, type Word } from "../asr/client";
import { geminiWords } from "../asr/gemini";
import { DEFAULT_LOOK } from "../captions";
import { geminiPlaces, geminiSounds, type AiSlot } from "../ai";
import { fold, placeByWords, refSaid, sentences, soundsByWords, type Slot } from "../match";
import { planMimic, type PlanInput } from "../plan";
import { mimicStills, mixMimic, renderMimic, type MixExtras } from "../render";
import { finish, isMadeSound, makeSfx, SOUNDS } from "../sfx";
import type { CaptionLook, Extra, MimicPlan, MimicTemplate, VolumeLine } from "../types";
import { MIX_RATE } from "../../engine/render/mix";
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
  /** where the cards and cutaways go: as in the reference, or where the footage's script says what they show */
  placement: "reference" | "script";
  /** Gemini's reading of where each belongs (source times), when asked */
  aiPlaces: Record<string, { t: number; said: string }>;
  placing: Job;
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
  musicAt: "bed" | "start";
  musicLine: VolumeLine;
  /** the soundtrack playing: from where in the edit, since when (performance.now()) */
  playing: { from: number; since: number } | null;
  mixing: boolean;
}

const KEY_STORE = "clipper.gemini.v1";
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
  /** where the script reading put each slot last time the edit was planned */
  lastPlaces: Record<string, { t: number; said: string; by: "words" | "gemini" | "you" }> = {};

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
      placement: "reference",
      aiPlaces: {},
      placing: idle,
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
      musicLine: [],
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

  async setReference(file: File) {
    this.studyAbort?.abort();
    const ctl = (this.studyAbort = new AbortController());
    this.set({ reference: { id: "", name: file.name, kind: "video", duration: 0, width: 0, height: 0, status: "reading" }, template: null, study: { stage: "working", progress: 0, label: "Opening" }, result: null, moved: {}, aiPlaces: {}, cueEdits: {} });
    try {
      const { src, item } = await this.open(file);
      if (item.kind !== "video") throw new Error(`${file.name} isn't a video. Drop the ad or video to copy.`);
      this.set({ reference: item });
      const reader = await TextReader.get();
      const template = await analyzeReference(frameSource(src), { reader, faces: facesIn }, (p, label) => this.set({ study: { stage: "working", progress: p, label } }), ctl.signal);
      if (ctl.signal.aborted) return;
      this.set({ template, look: template.captions ?? DEFAULT_LOOK, study: { stage: "ready", progress: 1, label: "" }, assign: {} });
    } catch (e) {
      if (ctl.signal.aborted) return;
      this.set({ study: { stage: "error", progress: 0, label: "", error: e instanceof Error ? e.message : String(e) } });
    }
  }

  setLook(patch: Partial<CaptionLook>) {
    this.set((s) => ({ look: { ...s.look, ...patch } }));
  }

  // The footage.

  async setFootage(file: File) {
    this.hearAbort?.abort();
    const ctl = (this.hearAbort = new AbortController());
    this.set({ footage: { id: "", name: file.name, kind: "video", duration: 0, width: 0, height: 0, status: "reading" }, heard: [], words: [], text: "", hearing: { stage: "working", progress: 0, label: "Opening" }, result: null, moved: {}, aiPlaces: {}, aiCues: null, myCues: [] });
    try {
      const { src, item } = await this.open(file);
      if (item.kind !== "video") throw new Error(`${file.name} isn't a video.`);
      this.set({ footage: item });
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
        if (!ctl.signal.aborted) this.set({ hearing: { stage: "ready", progress: 1, label: "" } });
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
        this.set((s) => ({ extras: s.extras.map((e) => (e.id === temp.id ? item : e)) }));
        ids.push(item.id);
      } catch (e) {
        this.set((s) => ({ extras: s.extras.map((x) => (x.id === temp.id ? { ...x, status: "error", error: e instanceof Error ? e.message : String(e) } : x)) }));
        ids.push(null);
      }
    }
    return ids;
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
    if (!file) return this.set({ music: null });
    try {
      const { item } = await this.open(file, true);
      this.set({ music: { ...item, kind: "audio" } });
    } catch (e) {
      this.set({ music: { id: "", name: file.name, kind: "audio", duration: 0, width: 0, height: 0, status: "error", error: e instanceof Error ? e.message : String(e) } });
    }
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
  }

  setKey(k: string) {
    try {
      localStorage.setItem(KEY_STORE, k);
    } catch {
      // private mode: keep it for this visit only
    }
    this.model = null;
    this.set({ geminiKey: k });
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
    const extras: Extra[] = s.extras.filter((e) => e.status === "ready").map((e) => ({ id: e.id, name: e.name, kind: e.kind === "video" ? "video" : "image", width: e.width, height: e.height, duration: e.duration, focus: e.focus }));
    return {
      template: s.template,
      raw: { id: s.footage!.id, duration: src.info.duration, width: src.info.width, height: src.info.height, cuts: this.rawCuts, face: this.face, shots: this.shots },
      words: s.words,
      speech: this.speech,
      extras,
      assign: s.assign,
      clip: s.clip,
      tail: s.tail,
      music: s.music && s.music.status === "ready" ? { id: s.music.id, duration: s.music.duration, db: s.musicDb, from: s.musicFrom, at: s.musicAt, line: s.musicLine } : null,
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

  /** Each slot (a run's first card, or a cutaway) with where the reference has it and the user's pictures in it, as the edit fills them. */
  private slotsOf(first: MimicPlan): (Slot & { kind: "pictures" | "clip"; pictures: string[] })[] {
    const t = this.state.template!;
    const item = (id: string) => this.state.extras.find((e) => e.id === id);
    const out: (Slot & { kind: "pictures" | "clip"; pictures: string[] })[] = [];
    const runs = new Map<number, MimicTemplate["cards"]>();
    for (const c of t.cards) runs.set(c.run, [...(runs.get(c.run) ?? []), c]);
    for (const r of runs.values()) {
      const inIt = first.cards.filter((c) => r.some((x) => x.id === c.slot)).map((c) => item(c.extra)).filter((e): e is Item => !!e);
      if (inIt.length) out.push({ id: r[0].id, start: r[0].start, end: r[r.length - 1].end, names: inIt.map((e) => e.name), kind: "pictures", pictures: inIt.map((e) => e.thumb).filter((u): u is string => !!u) });
    }
    for (const b of t.broll) {
      const e = first.broll.find((x) => x.slot === b.id);
      const it = e ? item(e.extra) : undefined;
      if (it) out.push({ id: b.id, start: b.start, end: b.end, names: [it.name], kind: "clip", pictures: it.thumb ? [it.thumb] : [] });
    }
    return out;
  }

  plan(): MimicPlan | null {
    const s = this.state;
    const base = this.planInput();
    if (!base) return null;
    const places: typeof this.lastPlaces = {};
    if (s.placement === "script" && s.words.length) {
      // Where the script says what each shows: by its words, or as Gemini read it.
      const first = planMimic(base);
      for (const [id, p] of Object.entries(placeByWords(s.template!, this.slotsOf(first), s.words))) places[id] = { t: p.t, said: p.said, by: "words" };
      for (const [id, p] of Object.entries(s.aiPlaces)) places[id] = { ...p, by: "gemini" };
    }
    for (const [id, t] of Object.entries(s.moved)) {
      const w = s.words.find((x) => x.start >= t - 0.05);
      places[id] = { t, said: sentences(s.words).find((x) => x.start <= t + 0.05 && x.end >= t - 0.05)?.text ?? w?.text ?? "", by: "you" };
    }
    this.lastPlaces = places;
    return planMimic({ ...base, anchor: Object.fromEntries(Object.entries(places).map(([k, v]) => [k, v.t])) });
  }

  // Where the cards go.

  setPlacement(placement: State["placement"]) {
    this.set({ placement });
    if (placement === "script" && this.canAsk()) void this.askGeminiPlaces();
  }

  /** Gemini is used only where the user chose it (for the words) and gave a key. */
  canAsk = () => this.state.ear === "gemini" && !!this.state.geminiKey;

  async askGeminiPlaces() {
    const s = this.state;
    const base = this.planInput();
    if (!base || !s.words.length || !this.canAsk()) return;
    this.set({ placing: { stage: "working", progress: 0.3, label: "Gemini reading where your pictures belong" } });
    try {
      const slots = this.slotsOf(planMimic(base));
      const sents = sentences(s.words);
      this.model ??= await pickModel(s.geminiKey);
      const ai: AiSlot[] = slots.map((x) => ({ id: x.id, kind: x.kind, said: refSaid(s.template!, x.start, x.end), names: x.names, pictures: x.pictures }));
      const r = await geminiPlaces({ key: s.geminiKey, model: this.model, sentences: sents, slots: ai });
      const aiPlaces: State["aiPlaces"] = {};
      for (const [id, p] of Object.entries(r)) {
        const sent = sents[p.sentence];
        if (sent) aiPlaces[id] = { t: sent.start, said: sent.text };
      }
      this.set({ aiPlaces, placing: { stage: "ready", progress: 1, label: "" } });
    } catch (e) {
      this.set({ placing: { stage: "error", progress: 0, label: "", error: e instanceof Error ? e.message : String(e) } });
    }
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

  setMusicOption(patch: Partial<Pick<State, "musicDb" | "musicFrom" | "musicAt" | "musicLine">>) {
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

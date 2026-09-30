/**
 * The mimic edit: the user's footage laid out the way the reference was. The
 * footage keeps its words (pauses cut to the reference's own when asked); the
 * captions follow the reference's look; its zooms step in and out as the
 * reference's do, and hide every jump in the footage; its cards and cutaways
 * come at the same point of the talk (the hook's at the same second), with the
 * user's pictures and clips in them, cropped to the reference's shapes; and it
 * sounds and ends as the reference does.
 */
import { keepSpeech, type Run } from "../engine/audio/speech";
import { paginate, DEFAULT_LOOK } from "./captions";
import type { CardSlot, Edge, Extra, MimicPlan, MimicTemplate, PlanBroll, PlanCard, PlanWord, Segment, SfxCue, VolumeLine } from "./types";
import type { Word } from "./asr/parakeet";

export interface PlanInput {
  template: MimicTemplate;
  raw: {
    id: string;
    duration: number;
    width: number;
    height: number;
    /** cuts already in the footage (source times) */
    cuts: number[];
    /** the speaker's face in it, when found */
    face?: { x: number; y: number; h: number } | null;
    /** the speaker's face take by take (source times), when found */
    shots?: { start: number; end: number; face: { x: number; y: number; h: number } | null }[];
  };
  words: Word[];
  speech: Run[];
  extras: Extra[];
  /** slot id → extra id (null: leave the slot empty); slots not named are filled in order */
  assign?: Record<string, string | null>;
  /** slot id → output time the user moved it to */
  at?: Record<string, number>;
  /**
   * slot id (a run's first card, or a cutaway) → the moment of the footage (source time) it
   * belongs at: where its script says what it shows, or where the user put it
   */
  anchor?: Record<string, number>;
  sfx?: SfxOptions;
  /** cut the footage's pauses down to the reference's */
  clip: boolean;
  /** music: its level against the reference's (dB), where in the song it starts, where in the edit (with the reference's music, or from the top), and the user's volume line */
  music?: { id: string; duration: number; db?: number; from?: number; at?: "bed" | "start"; line?: VolumeLine } | null;
  width?: number;
  height?: number;
  fps?: number;
  /** include the reference's black ending */
  tail?: boolean;
  /** the captions' look, as the user tuned it */
  look?: MimicTemplate["captions"];
}

export interface SfxOptions {
  /** none; on the cards' and cutaways' moves; those and moments in the script */
  mode: "none" | "moves" | "script";
  /** the sound a card or cutaway moves with (a made one, or one of the user's) */
  move: string;
  /** all of them up or down (dB) */
  db: number;
  /** the user's changes, by cue key: moved (seconds), another sound, its own level, or taken out */
  edits?: Record<string, { dt?: number; sound?: string; db?: number; off?: boolean }>;
  /** sounds the user put in themselves (output times) */
  mine?: Omit<SfxCue, "pan">[];
  /** moments in the script for a sound (source times), read off the words or by Gemini */
  script?: { key: string; t: number; sound: string; why: string }[];
}

const panFrom = (e: Edge | undefined) => (e === "right" ? 0.7 : e === "left" ? -0.7 : 0);

/** A clock that maps source time to edit time through the kept segments. */
export function segmentClock(segs: Segment[]) {
  const toOut = (t: number): number | null => {
    for (const s of segs) if (t >= s.from - 1e-6 && t <= s.to + 1e-6) return s.start + (t - s.from);
    return null;
  };
  return { toOut };
}

/** Share of the voice heard by time t, through a list of voiced runs. */
export function progress(runs: { start: number; end: number }[]): { at: (t: number) => number; time: (p: number) => number; total: number } {
  const total = runs.reduce((a, r) => a + Math.max(0, r.end - r.start), 0) || 1;
  const at = (t: number) => {
    let s = 0;
    for (const r of runs) {
      if (t <= r.start) break;
      s += Math.min(t, r.end) - r.start;
    }
    return s / total;
  };
  const time = (p: number) => {
    let need = p * total;
    for (const r of runs) {
      const d = r.end - r.start;
      if (need <= d) return r.start + need;
      need -= d;
    }
    return runs.length ? runs[runs.length - 1].end : 0;
  };
  return { at, time, total };
}

/** The word start nearest to t (a caption's first word first), within `reach`. */
function snap(t: number, words: PlanWord[], starts: Set<number>, reach = 1.5): number {
  let best = t;
  let bestD = reach;
  for (const w of words) {
    const d = Math.abs(w.start - t) - (starts.has(w.start) ? 0.4 : 0);
    if (d < bestD) {
      bestD = d;
      best = w.start;
    }
  }
  return best;
}

function coverCrop(extra: Extra, rect: [number, number, number, number], W: number, H: number): { cx: number; cy: number; zoom: number } {
  // The picture fills the card; its subject (a face) kept in view.
  const cardAspect = (rect[2] * W) / Math.max(1e-6, rect[3] * H);
  const aspect = extra.width / Math.max(1, extra.height);
  const fx = extra.focus?.x ?? 0.5;
  const fy = extra.focus?.y ?? (aspect < cardAspect ? 0.4 : 0.5);
  // Visible share of the picture across and down.
  const visW = aspect > cardAspect ? cardAspect / aspect : 1;
  const visH = aspect > cardAspect ? 1 : aspect / cardAspect;
  return { cx: Math.min(1 - visW / 2, Math.max(visW / 2, fx)), cy: Math.min(1 - visH / 2, Math.max(visH / 2, fy)), zoom: 1 };
}

export function planMimic(inp: PlanInput): MimicPlan {
  const tpl = inp.template;
  // The reference's shape: 9:16, 4:5, square or wide, at 1080 on its short side.
  const ar = tpl.width / Math.max(1, tpl.height);
  const [W, H] = inp.width && inp.height ? [inp.width, inp.height] : ar > 1.2 ? [1920, 1080] : ar > 0.9 ? [1080, 1080] : ar > 0.7 ? [1080, 1350] : [1080, 1920];
  const fps = inp.fps ?? 30;
  const look = inp.look ?? tpl.captions ?? DEFAULT_LOOK;

  // 1. The footage: whole, or with its pauses cut to the reference's.
  let segments: Segment[];
  if (inp.clip && inp.speech.length) {
    const pause = Math.min(0.4, Math.max(0.15, tpl.maxPause || 0.3));
    const kept = keepSpeech(inp.speech, 0, inp.raw.duration, pause, 0.08, 0.14);
    let at = 0;
    segments = kept.map((r) => {
      const s = { from: r.start, to: r.end, start: at, end: at + (r.end - r.start) };
      at = s.end;
      return s;
    });
  } else segments = [{ from: 0, to: inp.raw.duration, start: 0, end: inp.raw.duration }];
  const clock = segmentClock(segments);
  const body = segments.length ? segments[segments.length - 1].end : 0;

  // 2. Words on the edit's clock.
  const words: PlanWord[] = [];
  for (const w of inp.words) {
    const s = clock.toOut(w.start);
    const e = clock.toOut(Math.max(w.start, w.end - 0.01));
    if (s === null) continue;
    words.push({ text: w.text, start: s, end: e ?? s + Math.max(0.05, w.end - w.start) });
  }
  const pages = paginate(words, look);
  const pageStarts = new Set(pages.map((p) => p.start));

  // Where in the edit a moment of the reference falls: the same share of the talk through.
  const refTalk = progress(tpl.speech);
  const outRuns: { start: number; end: number }[] = [];
  for (const w of words) {
    const last = outRuns[outRuns.length - 1];
    if (last && w.start - last.end < 0.3) last.end = Math.max(last.end, w.end);
    else outRuns.push({ start: w.start, end: w.end });
  }
  const outTalk = progress(outRuns.length ? outRuns : [{ start: 0, end: body }]);
  const HOOK = 5;
  const place = (refT: number) => {
    // The hook is kept to the second; later moments go by how far through the talk they are.
    if (refT < HOOK) return Math.min(refT, body);
    return snap(outTalk.time(refTalk.at(refT)), words, pageStarts);
  };

  // 3. Cards and cutaways, with the user's pictures in them.
  const extras = new Map(inp.extras.map((e) => [e.id, e]));
  const used = new Set<string>();
  const assigned = inp.assign ?? {};
  for (const v of Object.values(assigned)) if (v) used.add(v);
  type Slot = { kind: "card"; slot: CardSlot } | { kind: "broll"; slot: MimicTemplate["broll"][number] };
  const slots: Slot[] = [...tpl.cards.map((slot) => ({ kind: "card" as const, slot })), ...tpl.broll.map((slot) => ({ kind: "broll" as const, slot }))].sort((a, b) => a.slot.start - b.slot.start);
  // Clips go to cutaways and clip cards, pictures to cards, in order; only then does a slot
  // left empty take whatever is left (so an early card doesn't take a later cutaway's clip).
  const fill = new Map<Slot, Extra | null>();
  const take = (want: (e: Extra) => boolean) => {
    const e = inp.extras.find((x) => !used.has(x.id) && want(x)) ?? null;
    if (e) used.add(e.id);
    return e;
  };
  for (const s of slots) {
    const id = s.slot.id;
    if (id in assigned) fill.set(s, assigned[id] ? (extras.get(assigned[id]!) ?? null) : null);
    else {
      const wantVideo = s.kind === "broll" || s.slot.content === "video";
      const e = take((x) => (x.kind === "video") === wantVideo);
      if (e) fill.set(s, e);
    }
  }
  for (const s of slots) if (!fill.has(s)) fill.set(s, take(() => true));
  // A moment of the footage on the edit's clock (the next moment kept, if that one was cut),
  // on the start of the word said there.
  const toOutNear = (t: number) => {
    const d = clock.toOut(t);
    if (d !== null) return d;
    const next = segments.find((sg) => sg.from >= t);
    return next ? next.start : body;
  };
  const anchored = (id: string) => (inp.anchor && id in inp.anchor ? snap(toOutNear(inp.anchor[id]), words, pageStarts, 0.6) : undefined);
  let cards: PlanCard[] = [];
  let broll: PlanBroll[] = [];
  // A run of cards moves together: its first card is placed, the rest keep their gaps.
  const runStart = new Map<number, number>();
  const runOf = new Map<string, number>();
  for (const s of slots) {
    const e = fill.get(s);
    if (!e) continue;
    if (s.kind === "card") {
      const c = s.slot;
      const first = tpl.cards.find((x) => x.run === c.run)!;
      if (!runStart.has(c.run)) runStart.set(c.run, inp.at?.[first.id] ?? anchored(first.id) ?? place(first.start));
      const start = inp.at?.[c.id] ?? runStart.get(c.run)! + (c.start - first.start);
      const end = start + (c.end - c.start);
      if (start >= body - 0.3) continue;
      runOf.set(c.id, c.run);
      cards.push({ slot: c.id, start, end: Math.min(end, body), rect: c.rect, enter: c.enter, exit: c.exit, radius: c.radius, extra: e.id, crop: coverCrop(e, c.rect, W, H), from: 0 });
    } else {
      const b = s.slot;
      const start = inp.at?.[b.id] ?? anchored(b.id) ?? place(b.start);
      let end = start + (b.end - b.start);
      if (e.kind === "video" && e.duration > 0) end = Math.min(end, start + e.duration);
      if (start >= body - 0.3) continue;
      broll.push({ slot: b.id, start, end: Math.min(end, body), extra: e.id, from: 0, zoom: [b.zoom[0], Math.max(0.8, Math.min(1.6, b.zoom[1]))], crop: { cx: e.focus?.x ?? 0.5, cy: e.focus?.y ?? 0.5 } });
    }
  }
  // Nothing lands on top of anything else: where two come together (a run the script moved
  // onto another), the later one waits for the earlier to go.
  type Block = { start: number; end: number; cards: PlanCard[]; cut: PlanBroll | null };
  const blocks: Block[] = [];
  for (const run of new Set(cards.map((c) => runOf.get(c.slot)))) {
    const cs = cards.filter((c) => runOf.get(c.slot) === run);
    blocks.push({ start: Math.min(...cs.map((c) => c.start)), end: Math.max(...cs.map((c) => c.end)), cards: cs, cut: null });
  }
  for (const b of broll) blocks.push({ start: b.start, end: b.end, cards: [], cut: b });
  blocks.sort((a, b) => a.start - b.start);
  let free = 0;
  for (const b of blocks) {
    const shift = Math.max(0, free + 0.15 - b.start);
    if (shift > 0) {
      b.start += shift;
      b.end += shift;
      for (const c of b.cards) (c.start += shift), (c.end = Math.min(body, c.end + shift));
      if (b.cut) (b.cut.start += shift), (b.cut.end = Math.min(body, b.cut.end + shift));
    }
    if (b.start < body - 0.3) free = b.end;
  }
  cards = cards.filter((c) => c.start < body - 0.3 && c.end > c.start);
  broll = broll.filter((b) => b.start < body - 0.3 && b.end > b.start);

  // 4. Zoom: the reference's steps between wide and close, at the same points of the talk,
  // and a jump at every cut in the footage (to hide it).
  const zoom: [number, number][] = [];
  const close = Math.min(1.35, Math.max(1.06, tpl.zoom?.close ?? 1.12));
  const dur = tpl.zoom?.dur ?? 0.2;
  const jumps = new Set<number>();
  for (let i = 1; i < segments.length; i++) jumps.add(Math.round(segments[i].start * 1000) / 1000);
  for (const c of inp.raw.cuts) {
    const t = clock.toOut(c);
    if (t !== null && t > 0.2 && t < body - 0.2) jumps.add(Math.round(t * 1000) / 1000);
  }
  const changes: { t: number; jump: boolean }[] = [];
  for (const t of [...jumps].sort((a, b) => a - b)) if (!changes.length || t - changes[changes.length - 1].t > 0.3) changes.push({ t, jump: true });
  for (const ch of tpl.zoom?.changes ?? []) {
    const t = place(ch.t);
    if (changes.some((c) => Math.abs(c.t - t) < 0.8)) continue;
    changes.push({ t, jump: false });
  }
  changes.sort((a, b) => a.t - b.t);
  let level = 1;
  zoom.push([0, 1]);
  for (const c of changes) {
    const next = level === 1 ? close : 1;
    if (c.jump) {
      zoom.push([c.t, level], [c.t, next]);
    } else {
      zoom.push([c.t, level], [c.t + dur, next]);
    }
    level = next;
  }
  zoom.push([body + 10, level]);

  // 5. The footage's framing: the speaker's face as big, and where, the reference has it.
  let frame = { cx: 0.5, cy: 0.5, zoom: 1 };
  const f = inp.raw.face;
  if (f && tpl.speaker) {
    const z = Math.min(1.3, Math.max(1, tpl.speaker.h / Math.max(0.02, f.h)));
    // The window's centre so the face lands at the reference's spot.
    const cx = f.x + (0.5 - tpl.speaker.x) / z;
    const cy = f.y + (0.5 - tpl.speaker.y) / z;
    frame = { cx: Math.min(1 - 0.5 / z, Math.max(0.5 / z, cx)), cy: Math.min(1 - 0.5 / z, Math.max(0.5 / z, cy)), zoom: z };
  } else if (f) frame = { cx: f.x, cy: Math.min(0.6, Math.max(0.4, f.y + 0.2)), zoom: 1 };

  // Take by take: each take framed so the face is as big (and where) the reference has it,
  // or, without a reference face, as big as in the footage's typical take.
  const frames: NonNullable<MimicPlan["frames"]> = [];
  const shots = inp.raw.shots ?? [];
  const faceHs = shots.map((s) => s.face?.h).filter((h): h is number => !!h).sort((a, b) => a - b);
  const target = tpl.speaker ? { x: tpl.speaker.x, y: tpl.speaker.y, h: tpl.speaker.h } : faceHs.length ? { x: 0.5, y: 0.33, h: faceHs[faceHs.length >> 1] } : null;
  if (target)
    for (const sh of shots) {
      if (!sh.face) continue;
      const z = Math.min(1.3, Math.max(1, target.h / Math.max(0.02, sh.face.h)));
      const cx = sh.face.x + (0.5 - target.x) / z;
      const cy = sh.face.y + (0.5 - target.y) / z;
      const fr = { cx: Math.min(1 - 0.5 / z, Math.max(0.5 / z, cx)), cy: Math.min(1 - 0.5 / z, Math.max(0.5 / z, cy)), zoom: z };
      for (const seg of segments) {
        const a = Math.max(seg.from, sh.start);
        const b = Math.min(seg.to, sh.end);
        if (b - a < 0.02) continue;
        frames.push({ start: seg.start + (a - seg.from), end: seg.start + (b - seg.from), ...fr });
      }
    }
  frames.sort((a, b) => a.start - b.start);

  // 6. Sound effects: a whoosh as a card lands and as it goes (from the side it comes from), a
  // swipe as a run's picture changes, a whoosh into a cutaway (or the reference's own sounds
  // on these, where it had some); sounds on moments of the script; the user's own; and the
  // user's changes to any of them, kept by what they're on.
  const so: SfxOptions = inp.sfx ?? { mode: "moves", move: "whoosh", db: 0 };
  const heard = new Map(tpl.sound.sfx.map((x) => [x.on, x.kind]));
  const sfx: SfxCue[] = [];
  const cue = (key: string, t: number, sound: string, db: number, why: string, pan?: [number, number]) => {
    const e = so.edits?.[key];
    if (e?.off) return;
    const at = t + (e?.dt ?? 0);
    if (at < 0 || at > body + 0.5) return;
    sfx.push({ key, t: at, sound: e?.sound ?? sound, db: e?.db ?? db, why, ...(pan ? { pan } : {}) });
  };
  if (so.mode !== "none") {
    const runs = new Map<number, PlanCard[]>();
    for (const c of [...cards].sort((a, b) => a.start - b.start)) runs.set(runOf.get(c.slot) ?? -1, [...(runs.get(runOf.get(c.slot) ?? -1) ?? []), c]);
    for (const r of runs.values()) {
      const [first, last] = [r[0], r[r.length - 1]];
      if (first.enter.kind === "cut") cue(`in:${first.slot}`, first.start, heard.get("card-in") ?? "pop", -4, "a card cuts in");
      else cue(`in:${first.slot}`, first.start + first.enter.dur * 0.7, heard.get("card-in") ?? so.move, 0, "a card slides in", [panFrom(first.enter.from), 0]);
      for (const c of r.slice(1)) if (c.enter.kind === "cut") cue(`swap:${c.slot}`, c.start, "swipe", -5, "the card's picture changes");
      if (last.exit.kind !== "cut") cue(`out:${last.slot}`, last.end - last.exit.dur * 0.6, heard.get("card-out") ?? so.move, -3, "a card slides out", [0, panFrom(last.exit.from)]);
    }
    for (const b of broll) cue(`cut:${b.slot}`, b.start, heard.get("broll") ?? so.move, -2, "a cutaway");
    const zoomSound = heard.get("zoom");
    if (zoomSound) changes.filter((c) => !c.jump).forEach((c, i) => cue(`zoom:${i}`, c.t, zoomSound, -6, "a zoom"));
  }
  if (so.mode === "script")
    for (const x of so.script ?? []) {
      const t = clock.toOut(x.t);
      if (t !== null) cue(x.key, t, x.sound, -2, x.why);
    }
  for (const m of so.mine ?? []) cue(m.key, m.t, m.sound, m.db, m.why);
  sfx.sort((a, b) => a.t - b.t);

  // 7. Music under it, from where the reference's bed comes in (or from the top), as far under
  // the voice, then the user's level and volume line.
  const tail = inp.tail === false ? 0 : Math.min(4, tpl.tail);
  const m = inp.music;
  const music = m ? { source: m.id, start: m.at === "start" || !tpl.sound.bed ? 0 : place(tpl.sound.bed.start), from: Math.max(0, m.from ?? 0), gain: (tpl.sound.bed ? tpl.sound.bed.level : -18) + (m.db ?? 0), fadeOut: Math.max(0.5, tail), ...(m.line?.length ? { line: m.line } : {}) } : null;

  return { width: W, height: H, fps, duration: body + tail, segments, zoom, frame, frames, broll, cards: cards.sort((a, b) => a.start - b.start), captions: { look, pages }, sfx, sfxGain: so.db, music, tail };
}

/** The music's own level at t (dB) along the user's volume line: flat before the first key and after the last. */
export function lineAt(line: VolumeLine | undefined, t: number): number {
  if (!line?.length) return 0;
  if (t <= line[0][0]) return line[0][1];
  for (let i = 1; i < line.length; i++) {
    const [t1, d1] = line[i];
    if (t <= t1) {
      const [t0, d0] = line[i - 1];
      return t1 > t0 ? d0 + ((d1 - d0) * (t - t0)) / (t1 - t0) : d1;
    }
  }
  return line[line.length - 1][1];
}

/** The level of the footage's zoom at t, from the plan's keyframes (a jump is two keys at one time). */
export function zoomAt(keys: [number, number][], t: number): number {
  if (!keys.length) return 1;
  let i = -1;
  for (let k = 0; k < keys.length; k++) {
    if (keys[k][0] <= t + 1e-9) i = k;
    else break;
  }
  if (i < 0) return keys[0][1];
  if (i === keys.length - 1) return keys[i][1];
  const [t0, z0] = keys[i];
  const [t1, z1] = keys[i + 1];
  if (t1 <= t0) return z1;
  return z0 + ((z1 - z0) * (t - t0)) / (t1 - t0);
}

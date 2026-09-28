/**
 * Planning edits cut to music. The building blocks here (the stretch of song,
 * the cut grid, filling each slot with the best moment, and finishing the edit
 * with its flourish, captions and demo card) make the music montage of the mico
 * and nio.trade Reels (docs/edit-analysis.md, format 3), and the twist and meme
 * formats in formats.ts.
 */
import { pickSection, type Accent, type SongAnalysis } from "../audio/song";
import type { Scan } from "../media/scan";
import { frameShot, kenBurns } from "./framing";
import { FPS, FRAME_SIZE, sourceSpan, WARM_GRADE, type Aspect, type CaptionEvent, type CardSpec, type Crop, type EditPlan, type FxEvent, type Ramp, type ShotEvent } from "./types";

/**
 * Cuts sit this far ahead of the beat. Measured on the reference montage: mico's
 * cuts land on average 45 ms before the beat times our analysis reports, which is
 * also where a cut reads as "on the beat" (the eye expects the picture first).
 */
export const CUT_LEAD = 0.04;
export const MIN_SHOT = 0.3;
const MAX_SHOT = 2.1;

export type Role = NonNullable<ShotEvent["role"]>;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const frame = (t: number) => Math.round(t * FPS) / FPS;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** The song's loudness (0 to 1) averaged over a stretch of the edit. */
export function loudnessOver(song: SongAnalysis, songStart: number, a: number, b: number): number {
  const fps = song.sr / song.hop;
  const f0 = Math.max(0, Math.floor((songStart + a) * fps));
  const f1 = Math.min(song.loudness.length, Math.max(f0 + 1, Math.ceil((songStart + b) * fps)));
  let s = 0;
  for (let f = f0; f < f1; f++) s += song.loudness[f];
  return f1 > f0 ? s / (f1 - f0) : 0;
}

// ── the stretch of music ─────────────────────────────────────────────────────

export interface MusicWindow {
  songStart: number;
  /** when the card comes in (edit time), on a downbeat */
  cardAt: number;
  duration: number;
  dropAt?: number;
}

/** Where to put the card: on a downbeat near the target length. */
function cardTime(song: SongAnalysis, songStart: number, target: number, available: number): number {
  let best = Math.min(target, available);
  let bestScore = -Infinity;
  song.beats.forEach((b, i) => {
    const t = b - songStart;
    // Near the target, and never much short of it (a short edit can't give up seconds).
    if (t < Math.max(target - 1.8, target * 0.85) || t > Math.min(target + 1.8, available)) return;
    const score = (song.beatInBar[i] === 0 ? 1 : 0) + 0.5 * song.beatStrength[i] - 0.35 * Math.abs(t - target);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  });
  return best;
}

/**
 * The part of the song an edit uses: `length` seconds of footage, then the card
 * for `cardHold` seconds with the music still playing under it. It starts at
 * `start` when the user picked where; otherwise at the Reel's 0:00, or on the
 * song's strongest stretch.
 */
export function musicWindow(song: SongAnalysis, length: number, cardHold: number, fromStart: boolean, start?: number): MusicWindow {
  const picked = start !== undefined && Number.isFinite(start);
  const section = picked ? { start: 0, drop: undefined } : pickSection(song, length + cardHold, fromStart);
  const songStart = picked ? clamp(start, 0, Math.max(0, song.duration - 3)) : fromStart ? 0 : section.start;
  const available = song.duration - songStart;
  // A short sound shortens the card first (to 2.5 s), then the footage (to 3 s);
  // past that the card runs on after the song ends.
  const hold = cardHold > 0 ? Math.max(Math.min(cardHold, 2.5), Math.min(cardHold, available - Math.min(length, 3) - 0.2)) : 0;
  const len = Math.max(3, Math.min(length, available - hold - 0.2));
  const cardAt = frame(cardTime(song, songStart, len, Math.max(len, available - hold)));
  const duration = frame(cardAt + hold);
  const dropSong = section.drop ?? [...song.drops].filter((d) => d.t - songStart > 1.2 && d.t - songStart < cardAt - 1.2).sort((a, b) => b.strength - a.strength)[0]?.t;
  const dropEdit = dropSong !== undefined ? dropSong - songStart : undefined;
  const dropAt = dropEdit !== undefined && dropEdit > 1.2 && dropEdit < cardAt - 1.2 ? dropEdit : undefined;
  return { songStart, cardAt, duration, dropAt };
}

// ── the cut grid ─────────────────────────────────────────────────────────────

interface Cand {
  t: number;
  w: number;
  down: boolean;
  drop: boolean;
}

/**
 * A hit worth cutting or punching in on: a kick or something in the middle (a
 * clap, a snare, a vocal stab), not a hi-hat on its own. In a lot of dance music
 * the hats are the loudest thing on the "and", and a cut on them reads as off the
 * beat. Between beats it also has to stand out from what always plays there (a
 * house track's open hat): a syncopated kick does, the groove itself doesn't.
 */
export function hitsHard(song: SongAnalysis, a: Accent): boolean {
  const between = Math.abs(a.beat - Math.floor(a.beat) - 0.5) <= 0.12;
  const base = between && song.offbeat ? song.offbeat : { kick: 0, mid: 0 };
  return a.kick >= Math.max(0.6, base.kick + 0.25) || (a.mid ?? 1) >= Math.max(0.7, base.mid + 0.25);
}

/**
 * Where an accent sits on a steady grid (song time): exactly on its beat, or exactly
 * halfway to the next, when it's within an eighth of a beat of either. The onset
 * detector only reads whole analysis frames (23 ms); the grid is exact. Anything
 * else (a swung hit, a song without a steady grid) stays where it was heard.
 */
export function gridTime(song: SongAnalysis, a: Accent): number {
  if (!song.steady) return a.t;
  const i = Math.floor(a.beat);
  if (i < 0 || i + 1 >= song.beats.length) return a.t;
  const frac = a.beat - i;
  const q = Math.round(frac * 2) / 2;
  if (Math.abs(frac - q) > 0.12) return a.t;
  return song.beats[i] + q * (song.beats[i + 1] - song.beats[i]);
}

/** Cut candidates in edit time: every beat, plus strong hits on the "and" between beats. */
function candidates(song: SongAnalysis, songStart: number, from: number, until: number, dropAt?: number): Cand[] {
  const out: Cand[] = [];
  const inWindow: number[] = [];
  song.beats.forEach((b, i) => {
    const t = b - songStart;
    if (t > from + 0.2 && t < until) inWindow.push(i);
  });
  // Rank each beat's strength within the window, blended with its absolute strength.
  const ranked = [...inWindow].sort((a, b) => song.beatStrength[a] - song.beatStrength[b]);
  const rank = new Map(ranked.map((i, k) => [i, ranked.length > 1 ? k / (ranked.length - 1) : 1]));
  for (const i of inWindow) {
    const t = song.beats[i] - songStart;
    const down = song.beatInBar[i] === 0;
    const w = 0.25 + 0.35 * (rank.get(i) ?? 0.5) + 0.35 * song.beatStrength[i] + (down ? 0.25 : 0);
    out.push({ t, w, down, drop: false });
  }
  // Hits on the "and" between beats: a syncopated kick, a clap or a vocal stab, not
  // just a hi-hat. On a steady grid the cut goes exactly halfway.
  for (const a of song.accents) {
    const frac = a.beat - Math.floor(a.beat);
    if (a.s < 0.6 || Math.abs(frac - 0.5) > 0.12 || !hitsHard(song, a)) continue;
    const exact = gridTime(song, a);
    const t = exact - songStart;
    if (t <= from + 0.2 || t >= until) continue;
    if (song.beats.some((b) => Math.abs(b - exact) < 0.07)) continue;
    out.push({ t, w: 0.1 + 0.45 * a.s, down: false, drop: false });
  }
  out.sort((a, b) => a.t - b.t);
  if (dropAt !== undefined) {
    let best: Cand | undefined;
    for (const c of out) if (!best || Math.abs(c.t - dropAt) < Math.abs(best.t - dropAt)) best = c;
    if (best && Math.abs(best.t - dropAt) < 0.12) {
      best.drop = true;
      best.w += 3;
    }
  }
  return out;
}

export interface CutOptions {
  /** where the stretch starts (edit time) */
  from?: number;
  /** 1 = the reference montages; above 1 holds shots longer */
  pace?: number;
  maxShot?: number;
  dropAt?: number;
  /** how readily it cuts: below 1 more cuts (every beat that has anything on it), above 1 fewer */
  busy?: number;
}

/**
 * Choose the cuts between `from` and `end`: a path through the candidates that
 * lands on the strongest accents, keeps shots near a length that suits how loud
 * the music is there (long in the build, short after the drop), and doesn't
 * settle into one length for long (mico runs 1, 1, 2, 1, 3 beats). Returns the
 * musical times, without the lead.
 */
export function planCuts(song: SongAnalysis, songStart: number, end: number, opts: CutOptions = {}): number[] {
  const from = opts.from ?? 0;
  const pace = opts.pace ?? 1;
  const maxShot = opts.maxShot ?? MAX_SHOT * Math.max(1, pace);
  const { dropAt } = opts;
  const cands = [{ t: from, w: 0, down: true, drop: false }, ...candidates(song, songStart, from, end - MIN_SHOT, dropAt), { t: end, w: 0, down: true, drop: false }];
  const n = cands.length;
  const pref = (a: number, b: number) => {
    const L = b - a;
    const e = loudnessOver(song, songStart, a, b);
    let target = (1.12 - 0.68 * e) * pace;
    if (dropAt !== undefined) target *= b <= dropAt + 0.05 ? 1.25 : 0.85;
    return (-0.5 * Math.log(L / clamp(target, 0.38, 1.6 * pace)) ** 2) / (2 * 0.5 ** 2);
  };
  // Each cut has to earn its place: only accents stronger than a typical beat pay for
  // themselves (a busier edit lets weaker ones in, a calmer one only the strongest).
  const ws = cands.slice(1, -1).map((c) => c.w).sort((a, b) => a - b);
  const q = clamp(0.3 * (opts.busy ?? 1) ** 3, 0.08, 0.65);
  const cost = ws.length ? ws[Math.floor(ws.length * q)] : 0;
  // best[j] maps a predecessor i to the best score of a path ending ..., i, j.
  const best: Map<number, { score: number; prev: number }>[] = Array.from({ length: n }, () => new Map());
  for (let j = 1; j < n; j++) {
    const L = cands[j].t - from;
    if (L >= MIN_SHOT && L <= maxShot) best[j].set(0, { score: (j === n - 1 ? 0 : cands[j].w - cost) + pref(from, cands[j].t), prev: -1 });
  }
  for (let j = 1; j < n; j++) {
    for (const [i, st] of best[j]) {
      const Lp = cands[j].t - cands[i].t;
      for (let k = j + 1; k < n; k++) {
        const L = cands[k].t - cands[j].t;
        if (L < MIN_SHOT) continue;
        if (L > maxShot) break;
        // Skipping a drop is not allowed.
        let skipsDrop = false;
        for (let m = j + 1; m < k; m++) if (cands[m].drop) skipsDrop = true;
        if (skipsDrop) continue;
        const same = Math.abs(L - Lp) < 0.06 ? 0.2 : 0;
        const score = st.score + (k === n - 1 ? 0 : cands[k].w - cost) + pref(cands[j].t, cands[k].t) - same;
        const cur = best[k].get(j);
        if (!cur || score > cur.score) best[k].set(j, { score, prev: i });
      }
    }
  }
  let bestEnd = -1;
  let bestScore = -Infinity;
  for (const [i, st] of best[n - 1]) {
    if (st.score > bestScore) {
      bestScore = st.score;
      bestEnd = i;
    }
  }
  if (bestEnd < 0) {
    // No musical path (no pulse): an even grid.
    const k = Math.max(1, Math.round((end - from) / (0.8 * pace)));
    return Array.from({ length: k - 1 }, (_, i) => from + ((i + 1) * (end - from)) / k);
  }
  const cuts: number[] = [];
  let j = n - 1;
  let i = bestEnd;
  while (i > 0) {
    cuts.push(cands[i].t);
    const prev = best[j].get(i)!.prev;
    j = i;
    i = prev;
  }
  return cuts.reverse();
}

// ── filling the slots ────────────────────────────────────────────────────────

export interface Slot {
  start: number;
  end: number;
  role: Role;
}

interface Segment {
  scan: Scan;
  start: number;
  score: number;
  peak: number;
  motion: number;
  rgb: [number, number, number];
}

/** The crop for a stretch of a source: where its interest sits, inside any black bars (see framing.ts). */
export function cropFor(scan: Scan, a: number, b: number, aspect: Aspect): Crop {
  return frameShot({ scan, a, b, aspect });
}

const colourDistance = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The longest stretch of a source without a cut in it (or at all, `acrossCuts`). */
export function longestStretch(scan: Scan, acrossCuts = false): number {
  if (scan.kind === "image") return Infinity;
  const bounds = acrossCuts ? [scan.start, scan.duration] : [scan.start, ...scan.cuts, scan.duration];
  let best = 0;
  for (let i = 0; i + 1 < bounds.length; i++) best = Math.max(best, bounds[i + 1] - bounds[i] - 0.16);
  return best;
}

/** What a slot is looking for: the flex (most of an edit), or the other side of it (a twist's second act). */
export type Purpose = "flex" | "real";

/** Every usable stretch of every source for a slot `d` seconds long. */
function segmentsFor(scans: Scan[], d: number, motionScale: number, acrossCuts = false, purpose: Purpose = "flex"): Segment[] {
  const out: Segment[] = [];
  for (const scan of scans) {
    const st = scan.stats;
    const interest = purpose === "real" && scan.real ? scan.real : scan.interest!;
    if (scan.kind === "image") {
      out.push({ scan, start: 0, score: interest[0], peak: interest[0], motion: 0, rgb: [st.rgb[0], st.rgb[1], st.rgb[2]] });
      continue;
    }
    const bounds = acrossCuts ? [scan.start, scan.duration] : [scan.start, ...scan.cuts, scan.duration];
    const step = 1 / scan.rate;
    for (let s = 0; s + 1 < bounds.length; s++) {
      const lo = bounds[s] + 0.08;
      const hi = bounds[s + 1] - 0.08;
      if (hi - lo < d - 1e-6) continue;
      // Where a slot can start: an even grid, or, when the samples are sparser than
      // the slot is long (a long video skimmed by its key frames), centred on each
      // sample so every window has one.
      const starts: number[] = [];
      if (step > d) {
        for (let i = 0; i < st.t.length; i++) if (st.t[i] >= lo && st.t[i] <= hi) starts.push(Math.min(Math.max(lo, st.t[i] - d / 2), hi - d));
      } else {
        for (let start = lo; start + d <= hi + 1e-6; start += step) starts.push(start);
      }
      for (const start of starts) {
        let sum = 0;
        let peak = 0;
        let motion = 0;
        let c = 0;
        const rgb: [number, number, number] = [0, 0, 0];
        const take = (i: number) => {
          sum += interest[i];
          peak = Math.max(peak, interest[i]);
          motion += st.motion[i];
          rgb[0] += st.rgb[i * 3];
          rgb[1] += st.rgb[i * 3 + 1];
          rgb[2] += st.rgb[i * 3 + 2];
          c++;
        };
        for (let i = 0; i < st.t.length; i++) if (st.t[i] >= start && st.t[i] <= start + d) take(i);
        if (!c) {
          // No sample inside: judge it by the nearest one.
          let near = -1;
          for (let i = 0; i < st.t.length; i++) if (near < 0 || Math.abs(st.t[i] - start - d / 2) < Math.abs(st.t[near] - start - d / 2)) near = i;
          if (near < 0) continue;
          take(near);
        }
        out.push({ scan, start, score: sum / c, peak, motion: clamp(motion / c / motionScale, 0, 1.5), rgb: [rgb[0] / c, rgb[1] / c, rgb[2] / c] });
      }
    }
  }
  return out;
}

/** A stretch of a source an edit used, in source seconds, and whether it opened the edit or hit the drop. */
export type Range = [start: number, end: number, hero?: boolean];
export type Ranges = Map<string, Range[]>;

const overlaps = (ranges: Range[] | undefined, a: number, b: number) => !!ranges?.some(([x, y]) => a < y && b > x);

/**
 * How far apart two moments of one source have to be to read as different
 * footage: a second or two in a phone clip, most of a minute in a long video
 * (where the next ten seconds are usually the same scene from the same angle).
 */
export const spread = (scan: Scan) => clamp(scan.duration * 0.012, 1.5, 25);

/**
 * How far the edits in a batch keep from each other's moments. Tighter than
 * `spread`: when a long video has only a few minutes worth showing, the later
 * edits take other moments of the same scenes rather than falling back on the
 * dull ones.
 */
export const apart = (scan: Scan) => clamp(scan.duration * 0.005, 1.5, 12);

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Each edit's own leaning, -1 to 1, the same over a stretch of footage: one edit
 * favours some scenes, the next others, so a batch shares the best moments out
 * instead of the first edit taking them all and the last getting what's left.
 */
function taste(variant: number, scan: Scan, t: number): number {
  const bucket = scan.kind === "video" ? Math.floor(t / (2 * apart(scan))) : 0;
  let h = hashString(scan.id) ^ Math.imul(variant + 1, 0x9e3779b1) ^ Math.imul(bucket + 7, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

/** 1 where [a, b] overlaps one of the ranges, falling away with the gap to the nearest (over `scale` seconds). */
function nearness(ranges: Range[] | undefined, a: number, b: number, scale: number, heroesOnly = false): number {
  let near = 0;
  for (const [x, y, hero] of ranges ?? []) {
    if (heroesOnly && !hero) continue;
    near = Math.max(near, Math.exp(-Math.max(0, x - b, a - y) / scale));
  }
  return near;
}

/**
 * The stretches that can fill a slot `d` seconds long: whole ones inside a shot;
 * failing that, the longest there are (played slower); failing that, stretches
 * running across the source's own cuts.
 */
function candidatesFor(scans: Scan[], d: number, motionScale: number, purpose: Purpose = "flex"): { segs: Segment[]; len: number } {
  let segs = segmentsFor(scans, d, motionScale, false, purpose);
  if (segs.length) return { segs, len: d };
  const inShot = Math.max(...scans.map((s) => longestStretch(s)));
  if (inShot >= d * 0.5) {
    const len = Math.max(MIN_SHOT, Math.min(d, inShot));
    segs = segmentsFor(scans, len, motionScale, false, purpose);
    if (segs.length) return { segs, len };
  }
  segs = segmentsFor(scans, d, motionScale, true, purpose);
  if (segs.length) return { segs, len: d };
  const whole = Math.max(...scans.map((s) => longestStretch(s, true)));
  const len = Math.max(0.1, Math.min(d, whole));
  segs = segmentsFor(scans, len, motionScale, true, purpose);
  if (segs.length) return { segs, len };
  // Clips too short for even that: each one from its start, whatever its length.
  return {
    segs: scans.map((scan) => ({ scan, start: scan.start, score: scan.interest?.[0] ?? 0.5, peak: scan.interest?.[0] ?? 0.5, motion: 0, rgb: [scan.stats.rgb[0] ?? 0, scan.stats.rgb[1] ?? 0, scan.stats.rgb[2] ?? 0] as [number, number, number] })),
    len: Math.max(0.1, Math.min(d, whole)),
  };
}

export interface AssignContext {
  song?: SongAnalysis;
  songStart: number;
  aspect: Aspect;
  variant: number;
  /** source ranges earlier variants used, to spread the footage around */
  avoid?: Ranges;
  /** ranges already used in this edit (shared between acts) */
  used?: Ranges;
  /** what the slots want (default: the flex) */
  purpose?: Purpose;
  /** velocity edit: shots ramp from slow motion on the hit to a rush into the next cut */
  velocity?: boolean;
}

/** A velocity ramp takes this much more footage than the slot is long. */
const RAMP_FOOTAGE = 1.1;
/** Shots shorter than this just cut (a ramp needs room to read). */
const RAMP_MIN = 0.45;

/**
 * The ramp for a shot `d` seconds long playing `need` seconds of footage: slow
 * motion on the hit (slower, and held longer, on the drop; slower still with
 * 50 or 60 fps footage, which slows down smoothly), then easing up to a rush.
 */
export function rampFor(d: number, need: number, fps: number, drop: boolean): Ramp {
  const hold = drop ? Math.min(0.5 * d, 0.6) : Math.min(0.35 * d, 0.4);
  const smooth = fps >= 48;
  const slow = drop ? (smooth ? 0.25 : 0.4) : smooth ? 0.35 : 0.5;
  // Whatever's left of the footage plays over the rest of the shot, ending at `fast`.
  const fast = Math.min(4, Math.max(1.2, (2 * (need - hold * slow)) / Math.max(1e-6, d - hold) - slow));
  return { slow, fast, hold };
}

/**
 * The best moment for each slot: the hook and the drop get the most striking
 * footage, energy in the footage follows energy in the music, neighbours come
 * from different clips and look different, and the edit spreads over all the
 * footage rather than leaning on one clip or one stretch of a long video.
 * Across a batch, each edit keeps well away from the moments the earlier ones
 * used and never opens on (or drops into) the same moment.
 */
export function assignShots(slots: Slot[], scans: Scan[], ctx: AssignContext): ShotEvent[] {
  if (!scans.length) throw new Error("No footage to fill the edit");
  const rand = mulberry32(0x9e3779b9 ^ (ctx.variant * 7919 + 17));
  const motionAll: number[] = [];
  for (const s of scans) if (s.kind === "video") for (const m of s.stats.motion) motionAll.push(m);
  motionAll.sort((a, b) => a - b);
  const motionScale = motionAll.length ? motionAll[Math.floor(motionAll.length * 0.9)] || 0.1 : 0.1;
  const importance: Record<Role, number> = { hook: 0, drop: 1, closer: 2, build: 3, body: 3 };
  const order = slots.map((_, i) => i).sort((a, b) => importance[slots[a].role] - importance[slots[b].role] || a - b);
  const fairShare = Math.ceil(slots.length / scans.length) + (scans.length < 4 ? 2 : 1);
  const used: Ranges = ctx.used ?? new Map();
  const uses = new Map<string, number>();
  const chosen: (Segment & { d: number; len: number })[] = new Array(slots.length);
  const cache = new Map<number, { segs: Segment[]; len: number }>();
  for (const i of order) {
    const slot = slots[i];
    const d = slot.end - slot.start;
    const key = Math.round(d * FPS);
    const need = ctx.velocity && d >= RAMP_MIN ? d * RAMP_FOOTAGE : d;
    if (!cache.has(key)) cache.set(key, candidatesFor(scans, need, motionScale, ctx.purpose));
    const { segs, len } = cache.get(key)!;
    const energy = ctx.song ? loudnessOver(ctx.song, ctx.songStart, slot.start, slot.end) : 0.5;
    const r = slot.role;
    const hero = r === "hook" || r === "drop";
    // The dull stays out while there's anything good left (a talking head next to a
    // supercar, a title card): only moments within reach of the best are in the running.
    let top = 0;
    for (const seg of segs) top = Math.max(top, seg.score);
    const floor = top * 0.4;
    let best: Segment | undefined;
    let bestScore = -Infinity;
    for (const relax of [false, true]) {
      for (const seg of segs) {
        const id = seg.scan.id;
        const video = seg.scan.kind === "video";
        const a = seg.start;
        const b = seg.start + len;
        if (!relax && ((video && overlaps(used.get(id), a - 0.05, b + 0.05)) || seg.score < floor)) continue;
        let s = seg.score;
        if (hero) s += 0.35 * seg.peak + 0.15 * Math.min(1, seg.motion);
        if (r === "closer") s += 0.1 * seg.peak;
        if (video) s -= 0.22 * Math.abs(Math.min(1, seg.motion) - energy);
        else s -= 0.12 * energy + (hero ? 0.1 : 0);
        const far = video ? spread(seg.scan) : 0;
        for (const nb of [i - 1, i + 1]) {
          const other = chosen[nb];
          if (!other) continue;
          if (other.scan.id === id) s -= video ? 0.12 + 0.28 * Math.exp(-Math.abs(other.start - a) / Math.max(2, far / 3)) : 0.4;
          s -= 0.12 * Math.max(0, 1 - colourDistance(other.rgb, seg.rgb) / 0.12);
        }
        const u = uses.get(id) ?? 0;
        s -= 0.16 * u + (u >= fairShare ? 0.6 : 0);
        if (video) {
          // Earlier edits in the batch: never the same moment, rarely one next to it, and
          // never an opening (or a drop) near one they opened on.
          const gap = apart(seg.scan);
          s -= 0.25 * nearness(ctx.avoid?.get(id), a, b, gap) + (overlaps(ctx.avoid?.get(id), a, b) ? 0.35 : 0);
          if (hero) s -= 0.6 * nearness(ctx.avoid?.get(id), a, b, 3 * gap, true);
          // This edit: spread over the footage instead of taking several shots from one stretch.
          s -= 0.15 * nearness(used.get(id), a - 0.05, b + 0.05, far / 2);
        } else {
          if (u > 0) s -= 0.5;
          if (ctx.avoid?.has(id)) s -= hero ? 0.6 : 0.3;
        }
        if (relax && overlaps(used.get(id), a - 0.05, b + 0.05)) s -= 0.6;
        s += 0.12 * taste(ctx.variant, seg.scan, a);
        s += (rand() - 0.5) * 0.1;
        if (s > bestScore) {
          bestScore = s;
          best = seg;
        }
      }
      if (best) break;
    }
    if (!best) throw new Error("No footage to fill the edit");
    chosen[i] = { ...best, d, len };
    const id = best.scan.id;
    if (!used.has(id)) used.set(id, []);
    used.get(id)!.push([best.start, best.start + len]);
    uses.set(id, (uses.get(id) ?? 0) + 1);
  }

  let kb = ctx.variant;
  return slots.map((slot, i) => {
    const seg = chosen[i];
    const d = slot.end - slot.start;
    // A velocity edit ramps the shot when there's footage for it; otherwise a stretch
    // shorter than the slot plays slower to fill it (down to half speed; past that its
    // last frame holds).
    const ramp = ctx.velocity && seg.scan.kind === "video" && d >= RAMP_MIN && seg.len >= d * RAMP_FOOTAGE - 1e-6 ? rampFor(d, seg.len, seg.scan.fps ?? 30, slot.role === "drop") : undefined;
    const speed = !ramp && seg.scan.kind === "video" && seg.len < d - 1e-6 ? Math.max(0.5, seg.len / d) : 1;
    let crop = cropFor(seg.scan, seg.start, seg.start + (ramp ? seg.len : d * speed), ctx.aspect);
    if (seg.scan.kind === "image") {
      // Ken Burns: a slow push, alternating in and out, drifting towards the subject.
      crop = kenBurns(crop, [crop.cx, crop.cy], kb++ % 2 === 0);
    } else if (seg.motion < 0.18) {
      // A still shot gets a barely-there push (a pull, in every other edit) so it doesn't look frozen.
      if (ctx.variant % 2) crop.zoom0 = 1.045;
      else crop.zoom1 = 1.04;
    }
    return { start: slot.start, end: slot.end, source: seg.scan.id, kind: seg.scan.kind, srcStart: seg.start, speed, ...(ramp ? { ramp } : {}), crop, role: slot.role, score: Math.round(seg.score * 100) / 100 };
  });
}

/** Slots between cut points, with the drop, hook and closer marked. */
export function slotsBetween(bounds: number[], dropCut?: number): Slot[] {
  const slots: Slot[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const start = bounds[i];
    let role: Role = "body";
    if (i === 0) role = "hook";
    else if (dropCut !== undefined && Math.abs(start - dropCut) < 0.07) role = "drop";
    else if (i === bounds.length - 2) role = "closer";
    else if (dropCut !== undefined && start < dropCut) role = "build";
    slots.push({ start, end: bounds[i + 1], role });
  }
  return slots;
}

// ── finishing ────────────────────────────────────────────────────────────────

export interface FinishOptions {
  id: string;
  label: string;
  format: EditPlan["format"];
  aspect: Aspect;
  shots: ShotEvent[];
  window: MusicWindow;
  songSource?: string;
  songName?: string;
  fromStart: boolean;
  card: CardSpec | null;
  captions: CaptionEvent[];
  variant: number;
  /** where the flourish goes (a cut on the drop), if anywhere */
  flourishAt?: number;
  /** strong hits in the music (edit time) that get a small punch-in */
  hits?: number[];
  /** cuts that open a new phrase of the music (edit time): a zoom blur across them */
  phrases?: number[];
  fadeIn?: number;
  bpm?: number;
}

/** The flourish, the dip into the card, the card, the music and the post note. */
export function finishPlan(o: FinishOptions): EditPlan {
  const [W, H] = FRAME_SIZE[o.aspect];
  const { cardAt, duration, songStart } = o.window;
  const cardHold = duration - cardAt;
  const fx: FxEvent[] = [];
  if (o.fadeIn) fx.push({ kind: "fadein", start: 0, end: o.fadeIn, strength: 1 });
  // The drop's flourish turns over through a batch: a flash with a punch-in, a film
  // burn, a punch-in with a shake. Smaller punches ride the music's strongest hits.
  const flourish = (["flash", "burn", "shake"] as const)[((o.variant % 3) + 3) % 3];
  const at = o.flourishAt;
  if (at !== undefined && flourish === "flash") fx.push({ kind: "flash", start: at, end: at + 5 / FPS, strength: 0.85, at });
  if (at !== undefined && flourish === "burn") fx.push({ kind: "burn", start: at - 2 / FPS, end: at + 4 / FPS, strength: 0.9, at });
  if (at !== undefined && flourish !== "burn") fx.push({ kind: "punch", start: at - 1 / FPS, end: at + 9 / FPS, strength: 1, at });
  if (at !== undefined && flourish === "shake") fx.push({ kind: "shake", start: at, end: at + 8 / FPS, strength: 1, at });
  if (flourish !== "burn") for (const h of o.hits ?? []) fx.push({ kind: "punch", start: h - 1 / FPS, end: h + 8 / FPS, strength: 0.5, at: h });
  // A zoom blur across the cuts that open a phrase: six frames either side, peaking on the cut.
  for (const p of o.phrases ?? []) fx.push({ kind: "zoomblur", start: p - 6 / FPS, end: p + 6 / FPS, strength: 1, at: p });
  if (o.card) fx.push({ kind: "dip", start: cardAt - 4 / FPS, end: cardAt, strength: 1 });
  const fadeOut = o.card ? Math.min(0.8, cardHold * 0.2) : 0.6;
  const lengths = o.shots.map((s) => s.end - s.start).sort((a, b) => a - b);
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  return {
    id: `${o.id}-${o.aspect}-v${o.variant + 1}`,
    label: o.label,
    format: o.format,
    aspect: o.aspect,
    width: W,
    height: H,
    fps: FPS,
    duration,
    shots: o.shots,
    fx,
    captions: o.captions,
    card: o.card ? { spec: o.card, start: cardAt, end: duration, fadeIn: 8 / FPS, fadeOut } : undefined,
    music: o.songSource ? { source: o.songSource, songStart, start: 0, end: duration, fadeIn: 0.01, fadeOut, gain: 1 } : undefined,
    sourceAudio: false,
    grade: WARM_GRADE,
    note: {
      caption: o.captions.map((c) => c.text).join(" "),
      hashtags: [],
      sound: !o.songSource
        ? "No sound in this one: add one in the app."
        : o.fromStart && songStart < 0.05
          ? "Post the version with the song, or add the sound from the Reel you took it from (tap the sound, then Use audio): the edit starts at the Reel's 0:00, so every cut lands on the beat. If your file was a screen recording, post the version with the song."
          : o.fromStart
            ? `Post the version with the song, or add the sound from the Reel you took it from (tap the sound, then Use audio) and set it to start at ${mmss(songStart)}: every cut lands on the beat from there. If your file was a screen recording, post the version with the song.`
            : `Song: ${o.songName ?? "the song you dropped"}, from ${mmss(songStart)}. In the app, start the sound at ${mmss(songStart)}.`,
    },
    checks: {
      shots: o.shots.length,
      medianShot: lengths.length ? Math.round(lengths[Math.floor(lengths.length / 2)] * 100) / 100 : 0,
      shortest: lengths.length ? Math.round(lengths[0] * 100) / 100 : 0,
      longest: lengths.length ? Math.round(lengths[lengths.length - 1] * 100) / 100 : 0,
      bpm: o.bpm ? Math.round(o.bpm) : "none",
      songStart: Math.round(songStart * 100) / 100,
      drop: o.window.dropAt !== undefined ? Math.round(o.window.dropAt * 100) / 100 : "none",
      cardAt,
      sources: new Set(o.shots.map((s) => s.source)).size,
    },
  };
}

/** The source ranges a plan uses (its hook and drop marked), to steer the next variant elsewhere. */
export function usedRanges(plan: EditPlan, into: Ranges = new Map()): Ranges {
  for (const s of plan.shots) {
    if (!into.has(s.source)) into.set(s.source, []);
    into.get(s.source)!.push([s.srcStart, s.srcStart + sourceSpan(s), s.role === "hook" || s.role === "drop"]);
  }
  return into;
}

/**
 * Each edit in a batch cuts at its own pace (the first as the references do,
 * the next a touch faster, then a touch slower...), so the edits differ in
 * rhythm as well as in footage while every cut stays on the music.
 */
export const VARIANT_PACE = [1, 0.86, 1.14, 0.93, 1.07];
export const variantPace = (variant: number) => VARIANT_PACE[((variant % VARIANT_PACE.length) + VARIANT_PACE.length) % VARIANT_PACE.length];

// ── the music montage ────────────────────────────────────────────────────────

export interface MontageOptions {
  song: SongAnalysis;
  songSource: string;
  songName: string;
  /** the sound came from a Reel: start at its 0:00 so "Use audio" lines up */
  fromStart: boolean;
  /** where in the song the edit starts, when the user picked it */
  songStart?: number;
  scans: Scan[];
  aspect: Aspect;
  /** seconds of footage before the card */
  length: number;
  card: CardSpec | null;
  caption: { style: "mood" | "pov" | "meme"; text: string } | null;
  variant: number;
  avoid?: Ranges;
  /** speed ramps on every shot long enough (a velocity edit) */
  velocity?: boolean;
}

export function planMontage(o: MontageOptions): EditPlan {
  const win = musicWindow(o.song, o.length, o.card ? o.card.hold : 0, o.fromStart, o.songStart);
  const pace = variantPace(o.variant);
  const cuts = planCuts(o.song, win.songStart, win.cardAt, { dropAt: win.dropAt, pace, busy: pace }).map((t) => frame(Math.max(1 / FPS, t - CUT_LEAD)));
  const dropCut = win.dropAt !== undefined ? frame(win.dropAt - CUT_LEAD) : undefined;
  const slots = slotsBetween([0, ...cuts, win.cardAt], dropCut);
  const shots = assignShots(slots, o.scans, { song: o.song, songStart: win.songStart, aspect: o.aspect, variant: o.variant, avoid: o.avoid, velocity: o.velocity });
  const drop = shots.find((s) => s.role === "drop");
  const captions: CaptionEvent[] = o.caption?.text.trim() ? [{ style: o.caption.style, text: o.caption.text.trim(), start: 0, end: o.card ? win.cardAt - 4 / FPS : win.duration }] : [];
  const hits = strongHits(o.song, win.songStart, 0.8, win.cardAt - 0.6, drop?.start);
  // A velocity edit also zoom-blurs across the cuts that open a four-bar phrase.
  const phrases = o.velocity ? phraseCuts(o.song, win.songStart, shots, drop?.start) : [];
  return finishPlan({
    id: "montage",
    label: `Montage ${o.variant + 1}`,
    format: "montage",
    aspect: o.aspect,
    shots,
    window: win,
    songSource: o.songSource,
    songName: o.songName,
    fromStart: o.fromStart,
    card: o.card,
    captions,
    variant: o.variant,
    flourishAt: drop?.start,
    hits,
    phrases,
    bpm: o.song.bpm,
  });
}

/** Cuts that fall on the first beat of a four-bar phrase (not the first cut, not the drop's), at most three. */
export function phraseCuts(song: SongAnalysis, songStart: number, shots: ShotEvent[], drop?: number): number[] {
  if (song.downbeats.length < 5) return [];
  const first = song.downbeats.findIndex((d) => d >= songStart - 0.05);
  if (first < 0) return [];
  const starts = song.downbeats.filter((_, i) => i >= first && (i - first) % 4 === 0).map((d) => d - songStart - CUT_LEAD);
  const out: number[] = [];
  for (const s of shots.slice(1)) {
    if (drop !== undefined && Math.abs(s.start - drop) < 1.5) continue;
    if (starts.some((p) => Math.abs(p - s.start) <= 1.5 / FPS)) out.push(s.start);
  }
  return out.slice(0, 3);
}

/**
 * The music's two strongest hits between `from` and `to` (edit time, less the
 * cut lead), well apart from each other and from the drop: where a small
 * punch-in lands. Kicks and claps, on the grid; never a hi-hat on its own.
 */
export function strongHits(song: SongAnalysis, songStart: number, from: number, to: number, drop?: number): number[] {
  const hits: number[] = [];
  const found = song.accents
    .filter((a) => hitsHard(song, a))
    .map((a) => ({ t: frame(gridTime(song, a) - songStart - CUT_LEAD), s: a.s }))
    .filter((a) => a.s >= 0.8 && a.t >= from && a.t <= to && (drop === undefined || Math.abs(a.t - drop) > 1))
    .sort((a, b) => b.s - a.s);
  for (const a of found) {
    if (hits.every((h) => Math.abs(h - a.t) >= 2.5)) hits.push(a.t);
    if (hits.length === 2) break;
  }
  return hits.sort((a, b) => a - b);
}

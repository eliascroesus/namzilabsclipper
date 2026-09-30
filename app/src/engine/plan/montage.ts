/**
 * Planning edits cut to music. The building blocks here (the stretch of song,
 * the cut grid, filling each slot with the best moment, and finishing the edit
 * with its flourish, captions and demo card) make the music montage of the mico
 * and nio.trade Reels (docs/edit-analysis.md, format 3), and the twist and meme
 * formats in formats.ts.
 */
import { pickSection, type Accent, type SongAnalysis } from "../audio/song";
import type { Bar } from "../audio/structure";
import { KINDS, PROFILE_BINS, type Scan } from "../media/scan";
import { boundsOf, type Bound } from "./bounds";
import { frameShot, kenBurns } from "./framing";
import { heardAt, rhythmCuts, type Pace, type RhythmCut, type RhythmOptions } from "./rhythm";
import { mono, monoFlips, paceOf, photoBurst, styleLabel, TALK_DROP, talkEnd, talkingIntro, talky, windows, type EditStyle, type Talker } from "./styles";
import { FPS, FRAME_SIZE, sourceSpan, WARM_GRADE, type Aspect, type CaptionEvent, type CardSpec, type Crop, type EditPlan, type FxEvent, type OverlayEvent, type Ramp, type ShotEvent } from "./types";

/**
 * Cuts sit this far ahead of the hit. The song's beats and accents are where each hit
 * starts (audio/attacks.ts), and people forgive a picture that changes a little before
 * the sound far more readily than one that changes after it (a sound that comes first
 * is noticed from about 45 ms, one that comes second only from about 125 ms). A cut
 * rounds to the nearest frame (33 ms at 30 fps), so 12 ms ahead keeps every cut
 * between 29 ms before its hit and 5 ms after it.
 */
export const CUT_LEAD = 0.012;
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

/**
 * How hard the music hits over a stretch of the edit, 0 to 1: the bars' drums and
 * level (see structure.ts), or the loudness when there's no structure. A sparse
 * verse can be as loud as the chorus without anything like its drive.
 */
export function energyOver(song: SongAnalysis, songStart: number, a: number, b: number): number {
  return overBars(song, songStart, a, b, (bar) => bar.energy) ?? loudnessOver(song, songStart, a, b);
}

/** Something about the bars averaged over a stretch of the edit, by how much of it each covers (undefined without bars). */
function overBars(song: SongAnalysis, songStart: number, a: number, b: number, of: (bar: Bar) => number): number | undefined {
  const bars = song.structure?.bars;
  if (!bars?.length) return undefined;
  const s0 = songStart + a;
  const s1 = songStart + Math.max(b, a + 0.01);
  let sum = 0;
  let w = 0;
  for (let i = 0; i < bars.length; i++) {
    const lo = bars[i].t;
    const hi = i + 1 < bars.length ? bars[i + 1].t : lo + 4 * song.period;
    const o = Math.min(hi, s1) - Math.max(lo, s0);
    if (o <= 0) continue;
    sum += o * of(bars[i]);
    w += o;
  }
  return w > 0 ? sum / w : undefined;
}

/**
 * How hard an edit should hit over a stretch of it, 0 to 1: the music's energy, with
 * the drums counting for more than the level (a quiet build with a clap on every
 * eighth drives an edit on as much as a loud verse does), and from the drop on at
 * least a drop's. An edit plays its drop as its peak, hardest for the first two bars,
 * whatever the song does next: a garage track's drop can be quieter than its build,
 * with its kicks and claps between the beats.
 */
export function driveOver(song: SongAnalysis, songStart: number, a: number, b: number, dropAt?: number): number {
  let e = energyOver(song, songStart, a, b);
  const drums = overBars(song, songStart, a, b, (bar) => (bar.kick + bar.snare + bar.hats) / 3);
  if (drums !== undefined) e = Math.max(e, 0.8 * drums);
  if (dropAt !== undefined && a >= dropAt - 0.05) e = Math.max(e, a - dropAt < 8 * song.period ? 0.78 : 0.68);
  return e;
}

/** Inside a break, where the song has dropped out (song time). */
export const inBreak = (song: SongAnalysis, t: number) => song.structure?.breaks.some(([s, e]) => t > s + 0.05 && t < e - 0.05) ?? false;

/**
 * How much the song's shape wants a cut on a beat (song time): the start of a
 * section most (a new picture for a new part), the moment it comes back after a
 * break, then the start of every four-bar phrase (where a verse's lines land).
 */
export function structureWeight(song: SongAnalysis, t: number): number {
  const st = song.structure;
  if (!st) return 0;
  let w = 0;
  for (const s of st.sections) if (Math.abs(s.t - t) < 0.05) w = Math.max(w, 0.55 * s.strength);
  // (The return counts only when no section starts on the bar line right after it:
  // a pickup back into the song is part of that bar, and the bar line is the moment.)
  for (const [, e] of st.breaks) if (Math.abs(e - t) < 0.05 && !st.sections.some((s) => s.t > e + 0.05 && s.t - e < 1.1 * song.period)) w = Math.max(w, 0.45);
  if (st.phrases.some((p) => Math.abs(p - t) < 0.05)) w = Math.max(w, 0.2);
  // Where a sung line lands: the bar line its pickup leads into, or the beat it starts on.
  for (const l of song.vocals?.lines ?? []) if (Math.abs(lineArrival(song, l) - t) < 0.05) w = Math.max(w, 0.35);
  // A syllable on the beat: a little more reason to cut there.
  if (song.vocals?.syllables.some((y) => Math.abs(y - t) < 0.06)) w += 0.08;
  return w;
}

/** The beat a sung line lands on: the next bar line when the line starts with a pickup into it, else the beat nearest its start. */
export function lineArrival(song: SongAnalysis, start: number): number {
  const bar = song.downbeats.find((d) => d >= start - 0.08 && d - start <= 1.6 * song.period);
  if (bar !== undefined) return bar;
  let best = song.beats[0] ?? start;
  for (const b of song.beats) if (Math.abs(b - start) < Math.abs(best - start)) best = b;
  return best;
}

/** How much of a stretch of the edit has singing in it, 0 to 1 (0 when it hasn't been listened for). */
export function vocalOver(song: SongAnalysis, songStart: number, a: number, b: number): number {
  const v = song.vocals;
  if (!v) return 0;
  const fps = song.sr / song.hop;
  const f0 = Math.max(0, Math.floor((songStart + a) * fps));
  const f1 = Math.min(v.active.length, Math.max(f0 + 1, Math.ceil((songStart + b) * fps)));
  let n = 0;
  for (let f = f0; f < f1; f++) n += v.active[f];
  return f1 > f0 ? n / (f1 - f0) : 0;
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
export function musicWindow(song: SongAnalysis, length: number, cardHold: number, fromStart: boolean, start?: number, dropIn?: [number, number]): MusicWindow {
  const picked = start !== undefined && Number.isFinite(start);
  const section = picked ? { start: 0, drop: undefined } : pickSection(song, length + cardHold, fromStart, dropIn);
  const songStart = picked ? clamp(start, 0, Math.max(0, song.duration - 3)) : fromStart ? 0 : section.start;
  const available = song.duration - songStart;
  // A short sound shortens the card first (to 2.5 s), then the footage (to 3 s);
  // past that the card runs on after the song ends.
  const hold = cardHold > 0 ? Math.max(Math.min(cardHold, 2.5), Math.min(cardHold, available - Math.min(length, 3) - 0.2)) : 0;
  const len = Math.max(3, Math.min(length, available - hold - 0.2));
  const cardAt = frame(cardTime(song, songStart, len, Math.max(len, available - hold)));
  const duration = frame(cardAt + hold);
  let dropSong = section.drop ?? [...song.drops].filter((d) => d.t - songStart > 1.2 && d.t - songStart < cardAt - 1.2).sort((a, b) => b.strength - a.strength)[0]?.t;
  // A hit the song then drops out after isn't where the edit takes off: the return
  // is (the section that comes back on the other side), and the shot on the hit
  // holds through the silence.
  const brk = dropSong !== undefined ? song.structure?.breaks.find(([s]) => s > dropSong! - 0.05 && s - dropSong! < 1.6) : undefined;
  if (brk) dropSong = song.structure!.sections.find((s) => s.t >= brk[1] - 0.05 && s.t - brk[1] < 2.5)?.t ?? brk[1];
  // A drop read off the loudness can land a beat early, off the bar line, just after the
  // last of a run of stabs: when nothing hits on it and a loud hit comes on the bar line
  // within the next beat, that's the drop.
  if (dropSong !== undefined) {
    const d = dropSong;
    const onBar = (t: number) => song.downbeats.some((b) => Math.abs(b - t) <= 0.07);
    const hitOn = song.accents.some((a) => Math.abs(a.t - d) <= 0.07 && a.s >= 0.3);
    const next = song.accents.find((a) => a.t > d + 0.07 && a.t <= d + 1.05 * song.period && (a.ls ?? a.s) >= 0.6 && a.s >= 0.25);
    if (!hitOn && !onBar(d) && next && onBar(next.t)) dropSong = next.t;
  }
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
 * halfway to the next, when it's as near either as its own time can be trusted (a
 * hit whose start was found is placed to 3 ms, one read off the onset envelope only
 * to its 23 ms frame). Anything else (a swung hit, a hit between, a song without a
 * steady grid) stays where it starts.
 */
export function gridTime(song: SongAnalysis, a: Accent): number {
  if (!song.steady) return a.t;
  const i = Math.floor(a.beat);
  if (i < 0 || i + 1 >= song.beats.length) return a.t;
  const frac = a.beat - i;
  const q = Math.round(frac * 2) / 2;
  if (Math.abs(frac - q) > (a.exact ? 0.04 : 0.12)) return a.t;
  return song.beats[i] + q * (song.beats[i + 1] - song.beats[i]);
}

/**
 * A kick between the beats (or an 808, a bass stab): the low end drives the hit, and
 * on the "and" it stands out from what always plays there (a techno track's rolling
 * bass). In a broken beat (garage, breaks) the kicks land between the beats as often
 * as on them, and a cut on the empty beat next to one reads as off. (A clap or a hat
 * between the beats takes a cut only on the "and", and only a strong one.)
 */
function kickBetween(song: SongAnalysis, a: Accent): boolean {
  const frac = a.beat - Math.floor(a.beat);
  const usual = Math.abs(frac - 0.5) <= 0.12 ? (song.offbeat?.kick ?? 0) : 0;
  return a.s >= 0.3 && a.kick >= Math.max(0.45, usual + 0.25) && a.kick >= 0.8 * a.s;
}

/** Cut candidates in edit time: every beat, plus strong hits on the "and" and kicks anywhere between the beats. */
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
  // A cut needs something to hear under it: a beat where the music barely makes a
  // sound (a sparse verse's empty beats) can't take one.
  const strengths = inWindow.map((i) => song.beatStrength[i]).sort((a, b) => a - b);
  const quiet = Math.max(0.06, 0.3 * (strengths[strengths.length >> 1] ?? 0));
  for (const i of inWindow) {
    // Nothing cuts in the silence of a break: the shot on the last hit holds through it.
    if (inBreak(song, song.beats[i]) || song.beatStrength[i] < quiet) continue;
    const t = song.beats[i] - songStart;
    const down = song.beatInBar[i] === 0;
    // Against the beats around it (two bars either way): a bar line pulls a cut as far
    // as something plays on it (a soft one between two finger snaps hardly does), and a
    // beat whose hit stands out from them (the snap on 2 and 4) pulls one of its own.
    const near: number[] = [];
    for (let j = Math.max(0, i - 8); j <= Math.min(song.beats.length - 1, i + 8); j++) near.push(song.beatStrength[j]);
    near.sort((a, b) => a - b);
    const top = near[near.length - 1];
    const heard = clamp(song.beatStrength[i] / Math.max(0.1, 0.6 * top), 0, 1);
    const standout = song.beatStrength[i] >= 0.7 * top && song.beatStrength[i] >= 1.4 * near[near.length >> 1] ? 0.25 : 0;
    const w = 0.25 + 0.35 * (rank.get(i) ?? 0.5) + 0.35 * song.beatStrength[i] + (down ? 0.25 * heard : 0) + standout + structureWeight(song, song.beats[i]);
    out.push({ t, w, down, drop: false });
  }
  // Hits between the beats: a strong one on the "and" (a syncopated kick, a clap or a
  // vocal stab, not just a hi-hat), and a kick wherever it lands (a broken beat's).
  // The cut goes where the hit starts, exactly halfway when it's on the "and" of a
  // steady grid.
  for (const a of song.accents) {
    const frac = a.beat - Math.floor(a.beat);
    if (frac < 0.15 || frac > 0.85) continue;
    const exact = gridTime(song, a);
    const t = exact - songStart;
    if (t <= from + 0.2 || t >= until || inBreak(song, exact)) continue;
    if (song.beats.some((b) => Math.abs(b - exact) < 0.07)) continue;
    let w = -Infinity;
    if (a.s >= 0.6 && Math.abs(frac - 0.5) <= 0.12 && hitsHard(song, a)) w = 0.1 + 0.45 * a.s;
    if (kickBetween(song, a)) w = Math.max(w, 0.15 + 0.3 * a.s + 0.3 * a.kick);
    if (w > -Infinity) out.push({ t, w, down: false, drop: false });
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
 * How long a shot wants to be, in beats, for how hard the music hits (the
 * reference montages and editors' rules of thumb): a bar in a breakdown or a
 * quiet intro, two to four beats in a verse, about one beat in the drop.
 */
export function beatsFor(energy: number): number {
  const x = clamp((energy - 0.3) / 0.45, 0, 1);
  return 2 ** (2 - x * (2 - Math.log2(1.2)));
}

/**
 * The cuts between `from` and `end` (edit time), musical times without the lead: on
 * the beat, every two beats before the drop and one two-bar pattern repeated after
 * it (rhythm.ts). A stretch with no drop that doesn't hit hard cuts every two beats.
 * Plain cuts only; the montage adds re-cuts of one clip itself.
 */
export function planCuts(song: SongAnalysis, songStart: number, end: number, opts: CutOptions = {}): number[] {
  const calm = opts.dropAt === undefined && driveOver(song, songStart, opts.from ?? 0, end) < 0.6;
  return rhythmCuts(song, songStart, end, { from: opts.from, dropAt: opts.dropAt, pace: opts.pace, maxShot: opts.maxShot, calm }).map((c) => c.t);
}

/**
 * The cuts between `from` and `end` on the strongest accents: a path through them
 * that keeps shots near a length that suits how loud the music is there. For a
 * stretch that holds one long shot where the footage allows (the twist's second
 * act), not for cutting to the beat. Musical times, without the lead.
 */
export function accentCuts(song: SongAnalysis, songStart: number, end: number, opts: CutOptions = {}): number[] {
  const from = opts.from ?? 0;
  const pace = opts.pace ?? 1;
  const maxShot = opts.maxShot ?? MAX_SHOT * Math.max(1, pace);
  // A shot that holds through a break may run as much longer as the silence lasts.
  const silence = (a: number, b: number) => {
    let d = 0;
    for (const [s0, s1] of song.structure?.breaks ?? []) d += Math.max(0, Math.min(b, s1 - songStart) - Math.max(a, s0 - songStart));
    return d;
  };
  const longest = (a: number, b: number) => maxShot + silence(a, b);
  const { dropAt } = opts;
  // What a build builds to: the drop, or, when the song drops out just before it, the
  // moment it drops out (the silence is the held breath; the shot on the last hit
  // holds through it and the drop lands on the return).
  let peak = dropAt;
  if (dropAt !== undefined) for (const [s0] of song.structure?.breaks ?? []) if (s0 - songStart < dropAt && dropAt - (s0 - songStart) < 8 * song.period) peak = Math.min(peak!, s0 - songStart);
  const cands = [{ t: from, w: 0, down: true, drop: false }, ...candidates(song, songStart, from, end - MIN_SHOT, dropAt), { t: end, w: 0, down: true, drop: false }];
  const n = cands.length;
  const pref = (a: number, b: number) => {
    // A break's silence doesn't count against a shot's length: it's a held breath.
    const L = Math.max(MIN_SHOT, b - a - silence(a, b));
    const energy = energyOver(song, songStart, a, b);
    let beats = beatsFor(driveOver(song, songStart, a, b, dropAt));
    // While a voice carries a verse over sparse drums, a line gets room to land: two
    // beats at least (a sung chorus over the full kit still cuts at the chorus's pace,
    // and so does everything after the drop).
    const afterDrop = dropAt !== undefined && a >= dropAt - 0.05;
    if (!afterDrop && energy < 0.6 && vocalOver(song, songStart, a, b) >= 0.5) beats = Math.max(beats, 2);
    // Before the drop the song holds back and so do the cuts: on the beat, two beats a
    // shot at least, settling on two over the last two bars into it; the pace picks up
    // after the drop. (The shot on the last hit before the song drops out sounds for
    // about a beat of it and holds through the silence.)
    if (peak !== undefined && b <= peak + 0.05) {
      const bars = (peak - b) / (4 * song.period);
      beats = bars < 2 ? 2 : Math.max(2, beats);
    } else if (peak !== undefined && peak !== dropAt && a < peak - 0.05) beats = Math.min(beats, 1);
    const target = beats * song.period * pace;
    return (-0.5 * Math.log(L / clamp(target, 0.38, 2.2 * pace)) ** 2) / (2 * 0.5 ** 2);
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
    if (L >= MIN_SHOT && L <= longest(from, cands[j].t)) best[j].set(0, { score: (j === n - 1 ? 0 : cands[j].w - cost) + pref(from, cands[j].t), prev: -1 });
  }
  for (let j = 1; j < n; j++) {
    for (const [i, st] of best[j]) {
      const Lp = cands[j].t - cands[i].t;
      for (let k = j + 1; k < n; k++) {
        const L = cands[k].t - cands[j].t;
        // The shot on the drop holds for a beat at least: the hit lands on it. Before the
        // drop no shot is shorter than two beats (not counting a break's silence).
        if (L < MIN_SHOT || (cands[j].drop && L < 0.95 * song.period)) continue;
        if (dropAt !== undefined && cands[k].t <= dropAt + 0.05 && L - silence(cands[j].t, cands[k].t) < 1.9 * song.period) continue;
        if (L > longest(cands[j].t, cands[k].t)) break;
        // Skipping a drop is not allowed.
        let skipsDrop = false;
        for (let m = j + 1; m < k; m++) if (cands[m].drop) skipsDrop = true;
        if (skipsDrop) continue;
        // Shots of one length after another read as mechanical, except in a build,
        // where a run of the same short length is the build.
        const inBuild = peak !== undefined && cands[k].t <= peak + 0.05 && peak - cands[k].t < 2 * 4 * song.period;
        const same = Math.abs(L - Lp) < 0.06 && !inBuild ? 0.2 : 0;
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
  /** one clip re-cut on the beat: the pieces' lengths (adding up to the slot's), each a jump further into the clip */
  pieces?: number[];
}

/** How far a re-cut jumps into its clip, past what the piece before showed (seconds). */
const RECUT_JUMP = 0.35;
/** Each re-cut punches in a little further. */
const RECUT_ZOOM = 0.1;
/**
 * Back to a clip within this many seconds of leaving it, with another in between, is
 * the edit hopping back and forth (A, B, A a second later). The references never do it
 * outside a conversation's shot and reverse shot: a clip either carries on, a jump
 * further into it, or comes back well after (docs/edit-analysis.md).
 */
const RETURN_GAP = 2.5;

interface Segment {
  scan: Scan;
  start: number;
  score: number;
  peak: number;
  motion: number;
  rgb: [number, number, number];
  /** mean brightness, 0 to 1 */
  luma?: number;
  /** movement at the in-point (scaled like `motion`): a cut into movement hides itself */
  enter?: number;
  /** the picture model's embedding of the moment (unit length), when it looked */
  emb?: Float32Array;
  /** how much it sells the life, 0 to 1 (smart picks' or the picture model's judgement), when judged */
  flex?: number;
  /** how striking it is as a picture, 0 to 1, when judged */
  wow?: number;
  /** filler, when judged: talking, text, a desk, a room, people with nothing to show off, anything with next to no flex */
  filler?: boolean;
  /** which of the source's shots it's in (an index between its cuts; -1 when it runs across them) */
  scene: number;
  /** the source samples at its in-point and out-point (for how the cuts either side of it look) */
  head?: number;
  tail?: number;
  /** seconds of footage it has, when shorter than the slot's (a short clip played slower to fill it) */
  len?: number;
}

/** The crop for a stretch of a source: where its interest sits, inside any black bars (see framing.ts). */
export function cropFor(scan: Scan, a: number, b: number, aspect: Aspect): Crop {
  return frameShot({ scan, a, b, aspect });
}

const colourDistance = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The correlation of row `i` of `a` with row `j` of `b` (rows `n` long), -1 to 1. */
function correlation(a: Float32Array, i: number, b: Float32Array, j: number, n: number): number {
  let ma = 0;
  let mb = 0;
  for (let k = 0; k < n; k++) (ma += a[i * n + k]), (mb += b[j * n + k]);
  ma /= n;
  mb /= n;
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let k = 0; k < n; k++) {
    const x = a[i * n + k] - ma;
    const y = b[j * n + k] - mb;
    ab += x * y;
    aa += x * x;
    bb += y * y;
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

/**
 * How alike two frames look as pictures, 0 to 1: the same colours in the same
 * places, the subject where it was (the colour histograms overlapping, and where
 * the interest sits across and down the frame lining up). Two shots of one
 * subject that look this alike either side of a cut make a jump cut.
 */
function lookAlike(a: Scan, i: number, b: Scan, j: number): number {
  const ha = a.stats.hist;
  const hb = b.stats.hist;
  let sa = 0;
  let sb = 0;
  for (let k = 0; k < 64; k++) (sa += ha[i * 64 + k]), (sb += hb[j * 64 + k]);
  if (!(sa > 0 && sb > 0)) return 0;
  let common = 0;
  for (let k = 0; k < 64; k++) common += Math.min(ha[i * 64 + k] / sa, hb[j * 64 + k] / sb);
  const across = correlation(a.stats.cols, i, b.stats.cols, j, PROFILE_BINS);
  const down = correlation(a.stats.rows, i, b.stats.rows, j, PROFILE_BINS);
  return common * Math.max(0, across) * Math.max(0, down);
}

const wholeSource = (scan: Scan): Bound[] => [
  { t: scan.start, margin: 0.08 },
  { t: scan.duration, margin: 0.08 },
];

/** The longest stretch of a source without a cut in it (or at all, `acrossCuts`). */
export function longestStretch(scan: Scan, acrossCuts = false): number {
  if (scan.kind === "image") return Infinity;
  const bounds = acrossCuts ? wholeSource(scan) : boundsOf(scan);
  let best = 0;
  for (let i = 0; i + 1 < bounds.length; i++) best = Math.max(best, bounds[i + 1].t - bounds[i + 1].margin - (bounds[i].t + (bounds[i].after ?? bounds[i].margin)));
  return best;
}

/** What a slot is looking for: the flex (most of an edit), or the other side of it (a twist's second act). */
export type Purpose = "flex" | "real";

/** What the picture model calls filler: in a flex edit only once the flex runs out. */
const FILLER = new Set((["talking", "text", "work", "other", "people"] as const).map((k) => KINDS.indexOf(k)));
/** Filler whoever picked the clip: someone talking to the camera, a screen of text. */
const NEVER = new Set((["talking", "text"] as const).map((k) => KINDS.indexOf(k)));

/**
 * The clips the user picked one by one (short clips and pictures, when there are several):
 * each was chosen for the edit, so each gets a turn, and what the picture model calls
 * filler in them (people, a laptop at dinner, a hotel room) is the life too. A long video
 * is footage to pick from: the flex in it is found and the rest left out.
 */
export function handPicked(scans: Scan[]): Set<string> {
  const picked = scans.filter((s) => s.kind === "image" || s.duration <= 90);
  return new Set(picked.length >= 2 ? picked.map((s) => s.id) : []);
}

/** Every usable stretch of every source for a slot `d` seconds long. */
function segmentsFor(scans: Scan[], d: number, motionScale: number, acrossCuts = false, purpose: Purpose = "flex", hand: Set<string> = new Set()): Segment[] {
  const out: Segment[] = [];
  for (const scan of scans) {
    const st = scan.stats;
    const interest = purpose === "real" && scan.real ? scan.real : scan.interest!;
    if (scan.kind === "image") {
      out.push({ scan, start: 0, score: interest[0], peak: interest[0], motion: 0, rgb: [st.rgb[0], st.rgb[1], st.rgb[2]], flex: scan.look?.flex[0], wow: scan.look?.wow[0], emb: scan.look?.embs?.[scan.look.cell?.[0] ?? 0], scene: 0 });
      continue;
    }
    const bounds = acrossCuts ? wholeSource(scan) : boundsOf(scan);
    const step = 1 / scan.rate;
    for (let s = 0; s + 1 < bounds.length; s++) {
      const lo = bounds[s].t + (bounds[s].after ?? bounds[s].margin);
      const hi = bounds[s + 1].t - bounds[s + 1].margin;
      if (hi - lo < d - 1e-6) continue;
      // Where a slot can start: an even grid, or, when the samples are sparser than
      // the slot is long (a long video skimmed by its key frames), centred on each
      // sample so every window has one.
      // (A sample on the scene's first frame is the scene's: a video skimmed by key
      // frames that start its scenes has most of its samples there.)
      const starts: number[] = [];
      if (step > d) {
        for (let i = 0; i < st.t.length; i++) if (st.t[i] >= bounds[s].t - 1e-6 && st.t[i] <= hi) starts.push(Math.min(Math.max(lo, st.t[i] - d / 2), hi - d));
      } else {
        for (let start = lo; start + d <= hi + 1e-6; start += step) starts.push(start);
      }
      for (const start of starts) {
        let sum = 0;
        let peak = 0;
        let motion = 0;
        let luma = 0;
        let c = 0;
        let first = -1;
        let last = -1;
        const rgb: [number, number, number] = [0, 0, 0];
        const take = (i: number) => {
          sum += interest[i];
          peak = Math.max(peak, interest[i]);
          motion += st.motion[i];
          luma += st.luma[i];
          rgb[0] += st.rgb[i * 3];
          rgb[1] += st.rgb[i * 3 + 1];
          rgb[2] += st.rgb[i * 3 + 2];
          if (first < 0) first = i;
          last = i;
          c++;
        };
        for (let i = 0; i < st.t.length; i++) if (st.t[i] >= start && st.t[i] <= start + d) take(i);
        if (!c) {
          // No sample inside: judge it by the nearest one in the same shot of the source
          // (one across a cut shows something else); with none, there's no telling.
          let near = -1;
          for (let i = 0; i < st.t.length; i++) {
            if (st.t[i] < bounds[s].t || st.t[i] > bounds[s + 1].t) continue;
            if (near < 0 || Math.abs(st.t[i] - start - d / 2) < Math.abs(st.t[near] - start - d / 2)) near = i;
          }
          if (near < 0) continue;
          take(near);
        }
        let mid = first;
        for (let i = first; i < st.t.length && st.t[i] <= start + d / 2; i++) mid = i;
        const look = scan.look;
        const emb = look?.embs && look.cell ? look.embs[look.cell[Math.max(0, mid)]] : undefined;
        let flex: number | undefined;
        let wow: number | undefined;
        if (look) {
          let f = 0;
          let w = 0;
          let n = 0;
          for (let i = 0; i < st.t.length; i++) if (st.t[i] >= start && st.t[i] <= start + d) (f += look.flex[i]), (w += look.wow[i]), n++;
          flex = n ? f / n : look.flex[Math.max(0, mid)];
          wow = n ? w / n : look.wow[Math.max(0, mid)];
        }
        // (Or anything it rates as showing nothing off, whatever it calls it: someone standing in
        // a kitchen. In a clip the user picked, only talking and text, and all of a talking clip
        // but its real flex.)
        const kind = look?.kind[Math.max(0, mid)];
        const filler = look ? (hand.has(scan.id) ? NEVER.has(kind!) || (talky(scan) && (flex ?? 0) < 0.7) : FILLER.has(kind!) || (flex ?? 1) < 0.33) : undefined;
        out.push({ scan, start, score: sum / c, peak, motion: clamp(motion / c / motionScale, 0, 1.5), rgb: [rgb[0] / c, rgb[1] / c, rgb[2] / c], luma: luma / c, enter: clamp(st.motion[first] / motionScale, 0, 1.5), emb, flex, wow, filler, scene: acrossCuts ? -1 : s, head: first, tail: last });
      }
    }
  }
  return out;
}

/** A stretch of a source an edit used, in source seconds, and whether it opened the edit, hit the drop or closed it. */
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

/**
 * 1 where [a, b] overlaps one of the ranges, falling away with the gap to the
 * nearest (over `scale` seconds). Only ranges inside `within` count: across one of
 * the source's own cuts is another shot, however close in time.
 */
function nearness(ranges: Range[] | undefined, a: number, b: number, scale: number, heroesOnly = false, within: [number, number] = [-Infinity, Infinity]): number {
  let near = 0;
  for (const [x, y, hero] of ranges ?? []) {
    if (heroesOnly && !hero) continue;
    if (y <= within[0] || x >= within[1]) continue;
    near = Math.max(near, Math.exp(-Math.max(0, x - b, a - y) / scale));
  }
  return near;
}

/**
 * Which moment of the footage a time is: the source's shot it's in, and in a long
 * shot, which stretch of it (six seconds, or a couple of `spread`s in a long video:
 * a walk around a car shows another side of it every few seconds; a phone clip of
 * a car is one moment).
 */
function momentOf(scan: Scan, t: number, scene?: number): string {
  if (scan.kind === "image") return scan.id;
  const bounds = boundsOf(scan);
  const k = scene !== undefined && scene >= 0 ? scene : sceneAt(scan, t);
  return `${scan.id}|${k}|${Math.floor((t - bounds[k].t) / Math.max(6, 2 * spread(scan)))}`;
}

/** Which of a source's shots a time is in (an index between its cuts). */
function sceneAt(scan: Scan, t: number): number {
  const bounds = boundsOf(scan);
  let k = 0;
  while (k + 2 < bounds.length && t >= bounds[k + 1].t) k++;
  return k;
}

/**
 * Whether two stretches show the same footage: one picture; one shot of a clip the user
 * picked (a phone clip is one place, whichever second of it); or in a long video, the
 * same shot within a few seconds. (Another of a compilation's shots, even of the same
 * car from another angle, is a new shot: a cutaway and back to it is how montages cut.)
 */
function sameFootage(a: Pick<Segment, "scan" | "start" | "scene">, b: Pick<Segment, "scan" | "start" | "scene">, hand: Set<string>): boolean {
  if (a.scan !== b.scan) return false;
  if (a.scan.kind === "image") return true;
  const scene = (g: Pick<Segment, "scan" | "start" | "scene">) => (g.scene >= 0 ? g.scene : sceneAt(g.scan, g.start));
  if (scene(a) !== scene(b)) return false;
  return hand.has(a.scan.id) || Math.abs(a.start - b.start) < Math.max(4, 2 * spread(a.scan));
}

/** The source's shot a segment is in, as [start, end) seconds (the whole source when it runs across cuts). */
function sceneOf(seg: Segment): [number, number] {
  const scan = seg.scan;
  if (seg.scene < 0 || scan.kind === "image") return [-Infinity, Infinity];
  const bounds = boundsOf(scan);
  return [bounds[seg.scene]?.t ?? -Infinity, bounds[seg.scene + 1]?.t ?? Infinity];
}

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += a[k] * b[k];
  return s;
};

interface Moment {
  score: number;
  /** what its best stretch shows (the picture model's embedding), when it looked */
  emb?: ArrayLike<number>;
}

/** Each moment of the footage (see momentOf) at the best any of the stretches scores, with what that stretch shows. */
function momentScores(segs: Segment[]): Map<string, Moment> {
  const best = new Map<string, Moment>();
  for (const seg of segs) {
    const key = momentOf(seg.scan, seg.start, seg.scene);
    const cur = best.get(key);
    if (!cur || seg.score > cur.score) best.set(key, { score: seg.score, emb: seg.emb });
  }
  return best;
}

/**
 * The editor's selects: the `k` best moments of the footage (all of them, when
 * there are no more), each also as unlike the ones already picked as the footage
 * allows. A long video of talking and screens with a few supercars in it gives the
 * supercars; a few phone clips of a car give every clip; but a long stretch of one
 * car, cut into a dozen moments, gives its best two or three and then the jet and
 * the yacht (when the picture model has looked: a moment showing what an earlier
 * pick shows counts for less).
 */
function selectsOf(moments: Map<string, Moment>, k: number, spreadBy = 0.08): Set<string> {
  const left = [...moments].sort((a, b) => b[1].score - a[1].score);
  // How many of the picks so far show what each moment left shows (the same car in
  // the same place: an embedding within about 0.1 of it).
  const same = new Float64Array(left.length);
  const out: string[] = [];
  const taken = new Uint8Array(left.length);
  while (out.length < k && out.length < left.length) {
    let bi = -1;
    let bv = -Infinity;
    for (let i = 0; i < left.length; i++) {
      if (taken[i]) continue;
      const v = left[i][1].score - spreadBy * same[i];
      if (v > bv) {
        bv = v;
        bi = i;
      }
    }
    taken[bi] = 1;
    out.push(left[bi][0]);
    const e = left[bi][1].emb;
    if (e) for (let i = 0; i < left.length; i++) if (!taken[i] && left[i][1].emb) same[i] += clamp((dot(left[i][1].emb!, e) - 0.8) / 0.12, 0, 1);
  }
  return new Set(out);
}

/**
 * The stretches that can fill a slot `d` seconds long: whole ones inside a shot;
 * failing that, the longest there are (played slower); failing that, stretches
 * running across the source's own cuts.
 */
function candidatesFor(scans: Scan[], d: number, motionScale: number, purpose: Purpose = "flex", hand: Set<string> = new Set()): { segs: Segment[]; len: number } {
  let segs = segmentsFor(scans, d, motionScale, false, purpose, hand);
  if (segs.length) return { segs, len: d };
  const inShot = Math.max(...scans.map((s) => longestStretch(s)));
  if (inShot >= d * 0.5) {
    const len = Math.max(MIN_SHOT, Math.min(d, inShot));
    segs = segmentsFor(scans, len, motionScale, false, purpose, hand);
    if (segs.length) return { segs, len };
  }
  segs = segmentsFor(scans, d, motionScale, true, purpose, hand);
  if (segs.length) return { segs, len: d };
  const whole = Math.max(...scans.map((s) => longestStretch(s, true)));
  const len = Math.max(0.1, Math.min(d, whole));
  segs = segmentsFor(scans, len, motionScale, true, purpose, hand);
  if (segs.length) return { segs, len };
  // Clips too short for even that: each one from its start, whatever its length.
  return {
    segs: scans.map((scan) => ({ scan, start: scan.start, score: scan.interest?.[0] ?? 0.5, peak: scan.interest?.[0] ?? 0.5, motion: 0, rgb: [scan.stats.rgb[0] ?? 0, scan.stats.rgb[1] ?? 0, scan.stats.rgb[2] ?? 0] as [number, number, number], scene: -1 })),
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
  /** how many more edits this batch makes after this one: each needs a hook and a drop of its own */
  toCome?: number;
  /** ranges already used in this edit (shared between acts) */
  used?: Ranges;
  /** what the slots want (default: the flex) */
  purpose?: Purpose;
  /** velocity edit: shots ramp from slow motion on the hit to a rush into the next cut */
  velocity?: boolean;
  /**
   * end on the moment the edit opens on (a loop): the last shot is the footage just
   * before the first shot's first frame (or the first shot again), known before the
   * shots around it are picked, so none of them repeats it
   */
  loop?: boolean;
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

/** The index of the source's sample nearest `t`. */
function nearestSample(scan: Scan, t: number): number {
  const ts = scan.stats.t;
  let lo = 0;
  let hi = ts.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (ts[m] < t) lo = m + 1;
    else hi = m;
  }
  return lo > 0 && Math.abs(ts[lo - 1] - t) <= Math.abs(ts[lo] - t) ? lo - 1 : Math.max(0, lo);
}

/**
 * The best moment for each slot, the way an editor works: pick the selects (the
 * best moments of all the footage, so a talking head or a friend in a van stays
 * out while there are supercars), give the hook, the drop and the closer the most
 * striking of them, match energy in the footage to energy in the music, and keep
 * the edit varied by what the shots show rather than by which file they came from
 * (eight scenes of one Reel are eight shots; four clips of one car from one side
 * are one). Clips the user picked one by one each get a turn: none comes back while one
 * of them hasn't been in yet (see handPicked). Across a batch, each edit keeps away from
 * the moments the earlier ones used, and never opens on or drops into a moment they opened
 * on, dropped into or closed on, or one that looks like it.
 */
export function assignShots(slots: Slot[], scans: Scan[], ctx: AssignContext): ShotEvent[] {
  if (!scans.length) throw new Error("No footage to fill the edit");
  const rand = mulberry32(0x9e3779b9 ^ (ctx.variant * 7919 + 17));
  const motionAll: number[] = [];
  for (const s of scans) if (s.kind === "video") for (const m of s.stats.motion) motionAll.push(m);
  motionAll.sort((a, b) => a - b);
  const motionScale = motionAll.length ? motionAll[Math.floor(motionAll.length * 0.9)] || 0.1 : 0.1;
  // The hook, the drop and the closer first; then the shots after the drop, where the
  // edit pays off, before the build that sets it up (so the build doesn't use up the
  // best of the flex).
  const importance: Record<Role, number> = { hook: 0, drop: 1, closer: 2, body: 3, build: 4 };
  const dropStart = slots.find((sl) => sl.role === "drop")?.start;
  // A cut (edit time) that opens a new section of the song.
  const newSection = (cut: number) => !!ctx.song?.structure?.sections.some((sec) => Math.abs(sec.t - ctx.songStart - CUT_LEAD - cut) < 0.1);
  const order = slots.map((_, i) => i).sort((a, b) => importance[slots[a].role] - importance[slots[b].role] || a - b);
  const fairShare = Math.ceil(slots.length / scans.length) + (scans.length < 4 ? 2 : 1);
  const hand = handPicked(scans);
  const used: Ranges = ctx.used ?? new Map();
  const uses = new Map<string, number>();
  const momentUses = new Map<string, number>();
  const chosen: (Segment & { d: number; len: number })[] = new Array(slots.length);
  const cache = new Map<number, { segs: Segment[]; len: number; best: Map<string, Moment> }>();
  const v = ctx.variant;
  // What the earlier edits in the batch opened on, dropped into and closed on, as
  // pictures: this one's hook and drop should look different, not just come from
  // another minute of the same walk around the same car.
  const heroLooks: ArrayLike<number>[] = [];
  for (const [id, ranges] of ctx.avoid ?? []) {
    const scan = scans.find((sc) => sc.id === id);
    const look = scan?.look;
    if (!scan || !look?.embs || !look.cell) continue;
    for (const [x, y, hero] of ranges) {
      const e = hero ? look.embs[look.cell[nearestSample(scan, (x + y) / 2)]] : undefined;
      if (e) heroLooks.push(e);
    }
  }
  // The selects, judged on half-second moments whatever the slots' lengths: the edit
  // comes from about 1.75 times as many moments as it has shots, the closer from a few
  // of the best (a few more for each edit already made), and the hook and the drop
  // (slot by slot, below) from the three best still fresh. Any good stretch of a
  // select will do, so the edits in a batch can share a great scene without
  // repeating each other's shots.
  const halfSeconds = segmentsFor(scans, 0.5, motionScale, false, ctx.purpose, hand);
  const moments = momentScores(halfSeconds);
  // Each edit draws its selects first from the good moments (four fifths as good as
  // the footage's best, or better) no earlier edit in the batch used, in any role:
  // three edits from one vlog shouldn't share their shots. When those run short, the
  // best of the rest top them up: a strong shot seen in another edit beats filler.
  const earlier = new Set<string>();
  for (const [id, ranges] of ctx.avoid ?? []) {
    const scan = scans.find((sc) => sc.id === id);
    if (scan) for (const [x, y] of ranges) for (const t of [x + 0.02, (x + y) / 2, y - 0.02]) earlier.add(momentOf(scan, t));
  }
  let bestMoment = 0;
  for (const m of moments.values()) bestMoment = Math.max(bestMoment, m.score);
  const unused = new Map([...moments].filter(([k, m]) => !earlier.has(k) && m.score >= 0.8 * bestMoment));
  const topUp = (k: number) => {
    const out = selectsOf(unused, k);
    for (const m of selectsOf(moments, k)) if (out.size < k) out.add(m);
    return out;
  };
  const pool = { closer: topUp(5 + v), rest: topUp(Math.ceil(1.75 * slots.length)) };
  // The clips the user picked, scene by scene (a phone clip is one scene, a compilation
  // Reel eight), that are worth a turn: anything but a talking head, a screen of text or
  // footage too dark or dull to use. Each one's best moment is a select, and a scene comes
  // back only once all of them are in (a turn costs more the more there are to share it
  // with); one the picture model sees as weak (under three fifths of the best) gets just the
  // one turn, so the second round goes to the flex.
  const turnOf = (g: Pick<Segment, "scan" | "start" | "scene">) => (g.scan.kind === "image" ? g.scan.id : `${g.scan.id}|${g.scene >= 0 ? g.scene : momentOf(g.scan, g.start).split("|")[1]}`);
  const turns = new Map<string, { score: number; moment: string }>();
  for (const g of halfSeconds) {
    if (!hand.has(g.scan.id) || g.filler) continue;
    const cur = turns.get(turnOf(g));
    if (!cur || g.score > cur.score) turns.set(turnOf(g), { score: g.score, moment: momentOf(g.scan, g.start, g.scene) });
  }
  for (const [k, t] of turns) if (t.score < 0.3 * bestMoment) turns.delete(k);
  for (const t of turns.values()) pool.rest.add(t.moment);
  const turnCost = 0.2 + 0.05 * Math.min(3, turns.size - 1);
  const turnUses = new Map<string, number>();
  const fewestTurns = () => Math.min(...[...turns.keys()].map((k) => turnUses.get(k) ?? 0));
  const turnPenalty = (turn: string, fewest: number) => turnCost * Math.max(0, (turnUses.get(turn) ?? 0) - fewest);
  const hadItsTurn = (turn: string) => !!turnUses.get(turn) && turns.get(turn)!.score < 0.6 * bestMoment;
  // Fresh for a hook or a drop: not a moment an earlier edit opened on, dropped into
  // or closed on, not footage any earlier edit showed (from its first frames), and not
  // a moment this edit has used. (One that only looks like theirs is let in, and marked
  // down below: better a strong shot like another edit's than a dull one.)
  const heroMoments = new Set<string>();
  for (const [id, ranges] of ctx.avoid ?? []) {
    const scan = scans.find((sc) => sc.id === id);
    if (scan) for (const [x, y, hero] of ranges) if (hero) heroMoments.add(momentOf(scan, (x + y) / 2));
  }
  const fresh = (m: Segment) => {
    const moment = momentOf(m.scan, m.start, m.scene);
    return !heroMoments.has(moment) && !momentUses.has(moment) && !(m.scan.kind === "video" && overlaps(ctx.avoid?.get(m.scan.id), m.start, m.start + 0.5));
  };
  // Better still, one no earlier edit used at all, well away from where they opened
  // and dropped (a long video's next minute is often the same scene).
  const unusedAnywhere = (m: Segment) => fresh(m) && !earlier.has(momentOf(m.scan, m.start, m.scene));
  const clearOfHeroes = (m: Segment) => m.scan.kind !== "video" || !(ctx.avoid?.get(m.scan.id) ?? []).some(([x, y, hero]) => hero && Math.max(0, x - m.start, m.start - y) < spread(m.scan));
  const heroTiers = [(m: Segment) => unusedAnywhere(m) && clearOfHeroes(m), (m: Segment) => fresh(m) && clearOfHeroes(m), unusedAnywhere, fresh];
  // The edits still to come in the batch need hooks and drops too: once this one has
  // its own, it leaves them the best of the rest to open on and drop into (two each),
  // rather than spending them in its body. (Judged as the hook and the drop are: the
  // most striking picture of the most flex, moving; and each unlike the others, since
  // a later edit won't open on what an earlier one opened on: a yacht, a jet, a car.)
  let reserved: Set<string> | null = null;
  const reserve = () => {
    const heroish = new Map<string, Moment>();
    if (!ctx.toCome) return new Set<string>();
    for (const g of halfSeconds) {
      const key = momentOf(g.scan, g.start, g.scene);
      if (earlier.has(key) || momentUses.has(key) || g.filler) continue;
      const score = g.score + 0.3 * g.peak + 0.15 * Math.min(1, g.motion) + 0.25 * (g.flex ?? 0) + 0.25 * (g.wow ?? 0);
      if (!(heroish.get(key)?.score! >= score)) heroish.set(key, { score, emb: g.emb });
    }
    return selectsOf(heroish, 2 * ctx.toCome, 0.4);
  };
  // Back to footage the edit left a moment ago, something else in between (see
  // RETURN_GAP): the less in between, the worse, and with just one shot between (A, B,
  // A) only when nothing else will do. (A run of it all the way, the clip carried on,
  // isn't a return.)
  const returning = (seg: Segment, i: number) => {
    let cost = 0;
    let hop = false;
    for (let j = 0; j < chosen.length; j++) {
      const other = chosen[j];
      const between = Math.abs(j - i) - 1;
      if (!other || between < 1) continue;
      const gap = j < i ? slots[i].start - slots[j].end : slots[j].start - slots[i].end;
      if (gap >= RETURN_GAP || !sameFootage(other, seg, hand)) continue;
      let run = true;
      for (let k = Math.min(i, j) + 1; k < Math.max(i, j) && run; k++) run = !!chosen[k] && sameFootage(chosen[k], seg, hand);
      if (run) continue;
      cost += between === 1 ? 0.7 : between === 2 ? 0.6 : 0.12;
      hop ||= between === 1;
    }
    return { cost, hop };
  };
  // The loop's last shot: the hook's footage, from just before it (or the hook again).
  const last = slots.length - 1;
  const looping = !!ctx.loop && slots.length >= 3 && slots[last].role === "closer";
  if (looping) slots[last] = { ...slots[last], pieces: undefined };
  const take = (i: number, best: Segment, len: number) => {
    chosen[i] = { ...best, d: slots[i].end - slots[i].start, len };
    const id = best.scan.id;
    if (!used.has(id)) used.set(id, []);
    used.get(id)!.push([best.start, best.start + len]);
    uses.set(id, (uses.get(id) ?? 0) + 1);
    const moment = momentOf(best.scan, best.start, best.scene);
    momentUses.set(moment, (momentUses.get(moment) ?? 0) + 1);
    turnUses.set(turnOf(best), (turnUses.get(turnOf(best)) ?? 0) + 1);
  };
  for (const i of order) {
    const slot = slots[i];
    const d = slot.end - slot.start;
    if (looping && i === last && chosen[0]) {
      const hook = chosen[0];
      let start = hook.start;
      if (hook.scan.kind === "video") {
        const [lo] = sceneOf(hook);
        const bounds = boundsOf(hook.scan);
        const floor = Math.max(hook.scan.start + 0.05, Number.isFinite(lo) ? lo + (bounds[hook.scene]?.after ?? bounds[hook.scene]?.margin ?? 0.08) : hook.scan.start + 0.05);
        if (hook.start - d >= floor) start = hook.start - d;
      }
      take(i, { ...hook, start }, d);
      continue;
    }
    // A re-cut run needs the footage its jumps pass over too.
    const need = slot.pieces ? d + (slot.pieces.length - 1) * RECUT_JUMP : ctx.velocity && d >= RAMP_MIN ? d * RAMP_FOOTAGE : d;
    const key = Math.round(need * FPS);
    if (!cache.has(key)) {
      const c = candidatesFor(scans, need, motionScale, ctx.purpose, hand);
      cache.set(key, { ...c, best: momentScores(c.segs) });
    }
    const { segs: fit, len, best: bestOf } = cache.get(key)!;
    // A clip the user picked that's too short for the slot still gets its turn, played
    // slower to fill it (down to three fifths of its speed): better than a clip seen already.
    let segs = fit;
    if (turns.size && slot.role !== "hook" && slot.role !== "drop") {
      const short = scans.filter((sc) => sc.kind === "video" && hand.has(sc.id) && !fit.some((g) => g.scan === sc));
      for (const sc of short) {
        const L = longestStretch(sc);
        if (L < Math.max(MIN_SHOT, 0.6 * len) || L >= len) continue;
        const more = segmentsFor([sc], L, motionScale, false, ctx.purpose, hand).map((g) => ({ ...g, len: L }));
        if (more.length) segs = [...segs, ...more];
      }
    }
    const energy = ctx.song ? driveOver(ctx.song, ctx.songStart, slot.start, slot.end, dropStart) : 0.5;
    const r = slot.role;
    const hero = r === "hook" || r === "drop";
    let top = 0;
    for (const seg of segs) top = Math.max(top, seg.score);
    // Filler stays out of a flex edit while anything else fits the slot (and so out of the
    // running for the hook and the drop).
    const flexLeft = ctx.purpose !== "real" && segs.some((g) => g.filler === false && !(g.scan.kind === "video" && overlaps(used.get(g.scan.id), g.start - 0.05, g.start + len + 0.05)));
    // (The first of those whose best is nearly as good as any fresh moment: an unused
    // moment isn't worth a dull hook. Judged on pictures unlike what the earlier edits
    // opened on, dropped into and closed on, while there are any: one like theirs is
    // marked down below, and shouldn't decide where the rest come from.)
    const likeAHero = (g: Segment) => !!g.emb && heroLooks.some((e) => dot(g.emb!, e) > 0.9);
    const unlike = hero && segs.some((g) => fresh(g) && !likeAHero(g));
    const bestIn = (ok: (m: Segment) => boolean) => segs.reduce((b, g) => (ok(g) && !(unlike && likeAHero(g)) && !(flexLeft && g.filler) ? Math.max(b, g.score) : b), -Infinity);
    const bar = 0.85 * bestIn(fresh);
    const tier = heroTiers.find((ok) => bestIn(ok) >= bar) ?? fresh;
    const heroPool = segs.filter((g) => tier(g) && !(flexLeft && g.filler));
    if (!hero && reserved === null) reserved = reserve();
    const allowed = hero ? selectsOf(momentScores(heroPool), 3) : r === "closer" ? pool.closer : pool.rest;
    const fewest = turns.size ? fewestTurns() : 0;
    let best: Segment | undefined;
    let bestScore = -Infinity;
    // A stretch of one of the selects nearly as good as the moment's best, or else
    // (not for the hook or the drop) anything but filler within reach of the best that
    // fits, marked down for not being a select and for how far short of the best it
    // falls (the dull, a title card, stays out): it gets in when the selects left
    // would only repeat what's around the slot (the same parked car six times over),
    // or when a long slot only the weaker footage has a long enough stretch for.
    // Failing all that, anything.
    for (const relax of [false, true]) {
      for (const seg of segs) {
        const id = seg.scan.id;
        const video = seg.scan.kind === "video";
        const a = seg.start;
        const b = seg.start + (seg.len ?? len);
        let offList = 0;
        const turn = turns.has(turnOf(seg)) ? turnOf(seg) : null;
        // (Never the same picture twice in a row: that's the same shot again, not a cut.)
        const twice = !video && [i - 1, i + 1].some((nb) => chosen[nb]?.scan.id === id);
        const back = returning(seg, i);
        if (!relax) {
          if ((video && overlaps(used.get(id), a - 0.05, b + 0.05)) || seg.score < top * (turn ? 0.25 : 0.45) || (flexLeft && seg.filler) || (turn && hadItsTurn(turn)) || twice || back.hop) continue;
          // (The hook and the drop from their tier itself, not just a moment of it: a long
          // video's moment runs most of a minute.)
          if (hero && !tier(seg)) continue;
          const moment = momentOf(seg.scan, a, seg.scene);
          if (!allowed.has(moment) || seg.score < 0.8 * (bestOf.get(moment)?.score ?? 0)) {
            if (hero || seg.filler) continue;
            offList = 0.3 + 3 * Math.max(0, top * 0.6 - seg.score);
          }
        }
        // Played slower to fill the slot: a little less welcome the slower it goes.
        let s = seg.score - offList - (seg.len ? 0.1 + 0.3 * (1 - seg.len / len) : 0);
        // The hook and the drop: the most striking picture of the most flex, moving.
        if (hero) s += 0.3 * seg.peak + 0.15 * Math.min(1, seg.motion) + 0.25 * (seg.flex ?? 0) + 0.25 * (seg.wow ?? 0);
        // The first frame has to read at a glance on a phone: not a dark club.
        if (r === "hook" && seg.luma !== undefined) s -= 1.2 * Math.max(0, 0.32 - seg.luma);
        // After the drop the edit pays off: the flex goes there (the build sets it up).
        if (r === "body" && dropStart !== undefined && slot.start >= dropStart - 0.05) s += 0.12 * (seg.flex ?? 0) + 0.08 * (seg.wow ?? 0);
        // The last shot is what the replay loops from: strong too.
        if (r === "closer") s += 0.1 * seg.peak + 0.2 * (seg.flex ?? 0) + 0.15 * (seg.wow ?? 0);
        if (video) s -= 0.22 * Math.abs(Math.min(1, seg.motion) - energy);
        else s -= 0.12 * energy + (hero ? 0.1 : 0);
        const far = video ? spread(seg.scan) : 0;
        const scene = sceneOf(seg);
        let carries = false;
        for (const nb of [i - 1, i + 1]) {
          const other = chosen[nb];
          if (!other) continue;
          if (other.scan.id === id) {
            // Two shots of one clip back to back: fine from different scenes of a
            // compilation, a jump cut from the same one; unless it carries the clip on, a
            // jump further into it past what the shot before showed (a re-cut, the way the
            // references cut one car eight times), which is better than coming back to it
            // (below). Not into the drop or out of the hook: those are new pictures.
            const sameScene = other.scene === seg.scene || other.scene < 0 || seg.scene < 0;
            const onward = video && sameScene && r !== "drop" && r !== "hook" && slots[nb].role !== "drop" && slots[nb].role !== "hook" && (nb < i ? a >= other.start + other.len + 0.3 : other.start >= b + 0.3);
            s -= !video ? 0.4 : onward ? 0.1 : sameScene ? 0.12 + 0.28 * Math.exp(-Math.abs(other.start - a) / Math.max(2, far / 3)) : 0.05;
            carries ||= onward;
          }
          s -= 0.12 * Math.max(0, 1 - colourDistance(other.rgb, seg.rgb) / 0.12);
          // What the two shots show (the picture model's view): nearly the same picture
          // twice reads as a jump cut; inside a section, related pictures flow (a run of
          // the car from different angles); where a new section starts, a clear change.
          // Either side of the cut, the frames themselves: the same subject framed the same
          // way (the car from the same side at the same size) is a jump cut, not a new shot.
          const [x, xi, y, yi] = nb < i ? [other.scan, other.tail, seg.scan, seg.head] : [seg.scan, seg.tail, other.scan, other.head];
          const alike = xi !== undefined && yi !== undefined && xi >= 0 && yi >= 0 ? lookAlike(x, xi, y, yi) : 0;
          if (seg.emb && other.emb) {
            const sim = dot(seg.emb, other.emb);
            const cut = nb < i ? slot.start : slots[nb].start;
            if (sim > 0.93) s -= 0.3;
            else if (newSection(cut)) s += 0.1 * (1 - sim);
            else s += 0.06 * clamp((sim - 0.5) / 0.4, 0, 1);
            s -= 0.8 * clamp((sim - 0.7) / 0.15, 0, 1) * alike;
          } else s -= 0.3 * clamp((alike - 0.6) / 0.3, 0, 1);
        }
        s -= back.cost;
        if (seg.emb) {
          // Variety over the whole edit: each shot already in it that looks like this one
          // (the same car in the same place, from another angle) makes it less welcome,
          // so the fifth shot of the car loses to the first of the jet.
          let alike = 0;
          for (let j = 0; j < chosen.length; j++) {
            const e = chosen[j]?.emb;
            if (e && j !== i) alike += clamp((dot(seg.emb, e) - 0.7) / 0.25, 0, 1);
          }
          // Two shots of one thing in a row flow; a third reads as the edit running out
          // of footage, a fourth as it being stuck. (The shots either side of the slot
          // already chosen count: the closer is chosen early.)
          let run = 0;
          for (const dir of [-1, 1]) {
            for (let j = i + dir; j >= 0 && j < chosen.length; j += dir) {
              const e = chosen[j]?.emb;
              if (!e || dot(seg.emb, e) < 0.85) break;
              run++;
            }
          }
          if (run >= 2) s -= run === 2 ? 0.25 : 0.5;
          s -= 0.06 * alike;
          if (hero && heroLooks.length) {
            let sim = 0;
            for (const e of heroLooks) sim = Math.max(sim, dot(seg.emb, e));
            s -= 0.35 * clamp((sim - 0.8) / 0.15, 0, 1);
          }
        }
        // A cut into movement hides itself; one into a still start shows.
        if (video && seg.enter !== undefined) s += 0.06 * Math.min(1, seg.enter);
        // Contrast into the drop: the shots just before it darker, the drop's brighter.
        if (seg.luma !== undefined && dropStart !== undefined) {
          if (r === "drop") s += 0.12 * seg.luma;
          else if (slot.end <= dropStart + 0.05 && dropStart - slot.end < 8 * (ctx.song?.period ?? 0.5)) s -= 0.12 * Math.max(0, seg.luma - 0.45);
        }
        const u = uses.get(id) ?? 0;
        // Spread over the clips a little, never at the cost of the flex: the picture
        // model's variety (above) keeps a clip's best moments from all looking alike. A clip
        // the user picked, though, waits for the others' turns before it comes back.
        // The same moment twice in one edit is a repeat, whatever it shows (though with
        // too little footage to go round, a third or fourth time costs less than a jump cut).
        // (Carrying a clip on is its moment again by design.)
        const again = carries ? 0 : momentUses.get(momentOf(seg.scan, a, seg.scene)) ?? 0;
        s -= (turn ? turnPenalty(turn, fewest) : 0.04 * u + (u >= 2 * fairShare ? 0.3 : 0)) + (again ? 0.45 + 0.1 * (again - 1) : 0);
        if (video) {
          // Earlier edits in the batch: never the same moment, rarely one next to it, and
          // never an opening (or a drop) near one of their openings, drops or closers.
          const gap = apart(seg.scan);
          s -= 0.25 * nearness(ctx.avoid?.get(id), a, b, gap, false, scene) + (overlaps(ctx.avoid?.get(id), a, b) ? 0.35 : 0);
          // (A moment an earlier edit showed at all, from any angle: seen already; one it
          // opened on, dropped into or closed on, the shots a viewer remembers it by, more
          // so. One kept back for a later edit's hook or drop: not in this one's body.)
          if (earlier.has(momentOf(seg.scan, a, seg.scene))) s -= 0.2;
          if (!hero && heroMoments.has(momentOf(seg.scan, a, seg.scene))) s -= 0.3;
          if (!hero && reserved?.has(momentOf(seg.scan, a, seg.scene))) s -= 0.3;
          if (hero) s -= 0.6 * nearness(ctx.avoid?.get(id), a, b, 3 * gap, true, scene);
          // This edit: spread over the footage instead of taking several shots from one stretch.
          if (!carries) s -= 0.15 * nearness(used.get(id), a - 0.05, b + 0.05, far / 2, false, scene);
        } else {
          if (u > 0) s -= 0.5;
          if (ctx.avoid?.has(id)) s -= hero ? 0.6 : 0.3;
        }
        if (relax && overlaps(used.get(id), a - 0.05, b + 0.05)) s -= 0.6;
        if (relax && flexLeft && seg.filler) s -= 0.5;
        s += 0.12 * taste(ctx.variant, seg.scan, a);
        s += (rand() - 0.5) * 0.04;
        if (s > bestScore) {
          bestScore = s;
          best = seg;
        }
      }
      if (best) break;
    }
    if (!best) throw new Error("No footage to fill the edit");
    take(i, best, best.len ?? len);
    // The drop shouldn't look like the hook either.
    if (hero && best.emb) heroLooks.push(best.emb);
  }

  let kb = ctx.variant;
  const out: ShotEvent[] = [];
  for (const [i, slot] of slots.entries()) out.push(...shotsFor(slot, i, out[out.length - 1]));
  return out;

  function shotsFor(slot: Slot, i: number, before?: ShotEvent): ShotEvent[] {
    const seg = chosen[i];
    const d = slot.end - slot.start;
    if (looping && i === last && out[0]) {
      // Framed as the first shot starts, and still, so the replay runs straight on.
      const first = out[0];
      const zoom = first.crop.zoom0;
      return [{ start: slot.start, end: slot.end, source: seg.scan.id, kind: seg.scan.kind, srcStart: seg.start, speed: 1, crop: { ...first.crop, zoom0: zoom, zoom1: zoom, cx1: undefined, cy1: undefined, path: undefined }, role: slot.role, score: Math.round(seg.score * 100) / 100 }];
    }
    if (slot.pieces && slot.pieces.length > 1) {
      // One clip re-cut on the beat: each piece a jump further into it (as far as the
      // footage goes), each punched in a little more.
      const k = slot.pieces.length;
      const jump = seg.scan.kind === "video" ? Math.max(0, Math.min(RECUT_JUMP, (seg.len - d) / (k - 1))) : 0;
      const crop = cropFor(seg.scan, seg.start, seg.start + d + (k - 1) * jump, ctx.aspect);
      let t = slot.start;
      let src = seg.start;
      return slot.pieces.map((len, j) => {
        const zoom = crop.zoom0 * (1 + RECUT_ZOOM * j);
        const piece: ShotEvent = { start: t, end: j === k - 1 ? slot.end : t + len, source: seg.scan.id, kind: seg.scan.kind, srcStart: src, speed: 1, crop: { ...crop, zoom0: zoom, zoom1: zoom, path: undefined }, role: slot.role, score: Math.round(seg.score * 100) / 100, ...(j ? { again: true } : {}) };
        t += len;
        src += len + jump;
        return piece;
      });
    }
    // A velocity edit ramps the shot when there's footage for it; otherwise a stretch
    // shorter than the slot plays slower to fill it (down to half speed; past that its
    // last frame holds).
    const ramp = ctx.velocity && seg.scan.kind === "video" && d >= RAMP_MIN && seg.len >= d * RAMP_FOOTAGE - 1e-6 ? rampFor(d, seg.len, seg.scan.fps ?? 30, slot.role === "drop") : undefined;
    const speed = !ramp && seg.scan.kind === "video" && seg.len < d - 1e-6 ? Math.max(0.5, seg.len / d) : 1;
    let crop = cropFor(seg.scan, seg.start, seg.start + (ramp ? seg.len : d * speed), ctx.aspect);
    // The clip carried on from the shot before, a jump further into it: a re-cut, framed
    // as that shot was and punched in a little further.
    const prev = i > 0 ? chosen[i - 1] : undefined;
    const onward = !!before && !!prev && seg.scan.kind === "video" && before.source === seg.scan.id && before.kind === "video" && sameFootage(prev, seg, hand) && seg.start >= before.srcStart + sourceSpan(before) + 0.25 - 1e-6;
    if (onward) {
      const zoom = Math.min(1.35, Math.max(before.crop.zoom0, before.crop.zoom1) * (1 + RECUT_ZOOM));
      crop = { ...before.crop, zoom0: zoom, zoom1: zoom, path: undefined };
    } else if (seg.scan.kind === "image") {
      // Ken Burns: a slow push, alternating in and out, drifting towards the subject.
      crop = kenBurns(crop, [crop.cx, crop.cy], kb++ % 2 === 0);
    } else if (seg.motion < 0.18) {
      // A still shot gets a barely-there push (a pull, in every other edit) so it doesn't look frozen.
      if (ctx.variant % 2) crop.zoom0 = 1.045;
      else crop.zoom1 = 1.04;
    }
    return [{ start: slot.start, end: slot.end, source: seg.scan.id, kind: seg.scan.kind, srcStart: seg.start, speed, ...(ramp ? { ramp } : {}), crop, role: slot.role, score: Math.round(seg.score * 100) / 100, ...(onward ? { again: true } : {}) }];
  }
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
  // burn, a punch-in with a shake. Whichever it is, the hit itself smears out from the
  // middle for a few frames and splits red from blue as it lands. Smaller punches ride
  // the music's strongest hits.
  const flourish = (["flash", "burn", "shake"] as const)[((o.variant % 3) + 3) % 3];
  const at = o.flourishAt;
  if (at !== undefined && flourish === "flash") fx.push({ kind: "flash", start: at, end: at + 5 / FPS, strength: 0.85, at });
  if (at !== undefined && flourish === "burn") fx.push({ kind: "burn", start: at - 2 / FPS, end: at + 5 / FPS, strength: 0.95, at });
  if (at !== undefined && flourish !== "burn") fx.push({ kind: "punch", start: at - 1 / FPS, end: at + 10 / FPS, strength: 1.3, at });
  if (at !== undefined && flourish === "shake") fx.push({ kind: "shake", start: at, end: at + 8 / FPS, strength: 1, at });
  if (at !== undefined) fx.push({ kind: "zoomblur", start: at - 2 / FPS, end: at + 4 / FPS, strength: 0.9, at }, { kind: "split", start: at, end: at + 6 / FPS, strength: 1, at });
  if (flourish !== "burn") for (const h of o.hits ?? []) fx.push({ kind: "punch", start: h - 1 / FPS, end: h + 8 / FPS, strength: 0.5, at: h });
  // A zoom blur across the cuts that open a phrase: six frames either side, peaking on the cut.
  for (const p of o.phrases ?? []) fx.push({ kind: "zoomblur", start: p - 6 / FPS, end: p + 6 / FPS, strength: 1, at: p });
  if (o.card) fx.push({ kind: "dip", start: cardAt - 4 / FPS, end: cardAt, strength: 1 });
  const fadeOut = o.card ? Math.min(0.8, cardHold * 0.2) : 0.6;
  const lengths = o.shots.map((s) => s.end - s.start).sort((a, b) => a - b);
  // A card of the user's own (a motion design) is the edit's last shot, played whole:
  // filling the frame when it's the edit's shape, inside it (over a blur of itself)
  // when it isn't.
  const shots = [...o.shots];
  if (o.card?.kind === "video" && o.card.video) {
    const same = Math.abs(Math.log((o.card.videoAspect ?? W / H) / (W / H))) < 0.03;
    shots.push({ start: cardAt, end: duration, source: o.card.video, kind: "video", srcStart: 0, speed: 1, crop: { cx: 0.5, cy: 0.5, zoom0: 1, zoom1: 1, fit: same ? "cover" : "fit" } });
  }
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
    shots,
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
    into.get(s.source)!.push([s.srcStart, s.srcStart + sourceSpan(s), s.role === "hook" || s.role === "drop" || s.role === "closer"]);
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
  /** how many more edits this batch makes after this one (see AssignContext) */
  toCome?: number;
  /** speed ramps on every shot long enough (a velocity edit) */
  velocity?: boolean;
  /** how the edit is shaped (styles.ts); the straight montage, on the beat, when absent */
  style?: EditStyle;
  /** clips with someone talking in them, and where: a talking edit opens on one */
  talkers?: Talker[];
  /** with no card: end on the moment the edit opens on, so the replay loops without a seam */
  loop?: boolean;
  /** how hard it cuts on the music (rhythm.ts); the style's own when it has one (slow: relaxed, fast re-cuts: hard), steady ("beat") when unset */
  pace?: Pace;
}

/** A pace's cutting against the references' (the template's shot length, times this). */
const PACE_LENGTH: Record<Pace, number> = { hard: 0.62, beat: 1, relaxed: 1.5 };

export function planMontage(o: MontageOptions): EditPlan {
  const style = o.style ?? "beat";
  const song = o.song;
  const win = musicWindow(song, o.length, o.card ? o.card.hold : 0, o.fromStart, o.songStart, style === "talk" ? TALK_DROP : undefined);
  const pace = variantPace(o.variant);
  const lead = (t: number) => frame(Math.max(1 / FPS, t - CUT_LEAD));
  const calm = win.dropAt === undefined && driveOver(song, win.songStart, 0, win.cardAt) < 0.6;
  // A talking edit: someone talking up to the drop (or a bar line two fifths in), then
  // the edit. Where the clip runs out of talking first, calm shots a bar each carry on
  // to the drop, as TJR's build does; with no one talking, they're the whole build.
  const handover = style === "talk" ? talkEnd(song, win.songStart, win.cardAt, win.dropAt) : undefined;
  const intro = handover !== undefined ? talkingIntro(o.scans, o.talkers ?? [], lead(handover), o.aspect, o.variant, o.avoid) : null;
  const dropAt = handover ?? win.dropAt;
  // (Talking that runs out just short of the drop holds on to it.)
  if (intro && handover !== undefined && lead(handover) - intro.end < 0.35) {
    intro.shots[intro.shots.length - 1].end = lead(handover);
    intro.end = lead(handover);
  }
  // Cutting steady: every two beats into the drop, one two-bar pattern after it with
  // one clip carried over a beat in every bar, and at the end of every four bars (two,
  // in every other edit) one clip re-cut on the half beat (rhythm.ts). Hard: on more of
  // the hits, every beat into the drop and the half beats of the run into it, faster
  // after it, re-cut every two bars. Relaxed: two beats a shot or more. Every pace cuts
  // on the hits nobody can miss. Fast re-cuts: hard, re-cut every bar. Slow: relaxed,
  // a bar a shot, then two beats.
  const hard = paceOf(style, o.pace ?? "beat");
  const cutPace = pace * PACE_LENGTH[hard];
  const beat = { pace: cutPace, calm, stutter: (hard === "hard" || o.variant % 2 ? "often" : true) as boolean | "often", carry: (o.variant % 2 ? 1 : 0) as 0 | 1, hits: hard, push: hard === "hard" };
  // (Fast re-cuts keep two beats a clip into the drop, re-cut on the beat, below.)
  const opts: RhythmOptions = style === "recut" ? { pace: 0.9 * cutPace, calm, stutter: "bar", carry: o.variant % 2 ? 0 : 1, hits: hard } : style === "slow" ? { pace: cutPace, calm, slow: true, hits: hard } : beat;
  let rhythm: RhythmCut[];
  if (handover !== undefined) {
    const build = rhythmCuts(song, win.songStart, handover, { from: intro ? intro.end + CUT_LEAD : 0, slow: true, ...(intro ? {} : { hits: hard }) }).filter((c) => c.t < handover - 0.3);
    rhythm = [...build, { t: handover }, ...rhythmCuts(song, win.songStart, win.cardAt, { ...opts, from: handover })];
  } else rhythm = rhythmCuts(song, win.songStart, win.cardAt, { ...opts, dropAt: win.dropAt });
  const cuts = rhythm.filter((c) => !c.again).map((c) => lead(c.t));
  const recuts = rhythm.filter((c) => c.again).map((c) => lead(c.t));
  const dropCut = dropAt !== undefined ? frame(dropAt - CUT_LEAD) : undefined;
  const from = intro ? intro.end : 0;
  const slots = slotsBetween([from, ...cuts.filter((t) => t > from + 0.2), win.cardAt], dropCut);
  // (After the talking, the first shot is the build's, or the drop.)
  if (intro && slots.length) slots[0].role = dropCut !== undefined && Math.abs(slots[0].start - dropCut) < 0.07 ? "drop" : "build";
  // Fast re-cuts start at once: the build's clips are re-cut on the beat too, one clip
  // over two beats (nio.trade's Ferrari, eight times in its first two seconds), on the
  // beats the song hits (between a run of stabs, the clip plays on).
  if (style === "recut") {
    const beats = song.beats.filter((b) => heardAt(song, b)).map((b) => lead(b - win.songStart));
    for (const slot of slots) if (slot.role === "build" || slot.role === "hook") recuts.push(...beats.filter((t) => t > slot.start + 0.3 && t < slot.end - 0.3));
  }
  for (const slot of slots) {
    const inner = recuts.filter((t) => t > slot.start + 0.02 && t < slot.end - 0.02);
    if (inner.length) slot.pieces = [slot.start, ...inner, slot.end].slice(1).map((t, j, a) => t - (j ? a[j - 1] : slot.start));
  }
  const used: Ranges = new Map();
  if (intro) used.set(intro.shots[0].source, [[intro.range[0] - 1, intro.range[1] + 1]]);
  const looped = !!o.loop && !o.card && style !== "talk";
  // After the talking, the edit is the other footage (TJR's build and payoff are two
  // places), unless there's hardly any.
  const rest = intro ? o.scans.filter((sc) => sc.id !== intro.shots[0].source) : o.scans;
  let shots = assignShots(slots, rest.length >= 2 ? rest : o.scans, { song, songStart: win.songStart, aspect: o.aspect, variant: o.variant, avoid: o.avoid, toCome: o.toCome, velocity: o.velocity, used, loop: looped });
  if (intro) shots = [...intro.shots, ...shots];
  // The beats and half beats the song hits, as cut (for pictures landing on the music).
  const grid = song.beats
    .flatMap((b, i) => [b, ...(i + 1 < song.beats.length ? [(b + song.beats[i + 1]) / 2] : [])])
    .filter((b) => heardAt(song, b))
    .map((b) => lead(b - win.songStart));
  let overlays: OverlayEvent[] = [];
  if (style === "burst") ({ shots, overlays } = photoBurst(shots, o.scans, song.period, o.aspect, o.variant, 5, grid));
  const drop = shots.find((s) => s.role === "drop");
  // The shot into the drop pushes in as it holds (through the silence, when the song
  // drops out first), and the drop lands on the push.
  const into = drop ? shots.find((s) => Math.abs(s.end - drop.start) < 1e-6) : undefined;
  if (into && into.end - into.start >= 0.6 && !into.audio) {
    into.crop.zoom0 = Math.min(into.crop.zoom0, 1);
    into.crop.zoom1 = Math.max(into.crop.zoom1, 1.12);
  }
  // Slow: every clip pushes in or pulls out, slowly (the photos already do).
  if (style === "slow") {
    let k = o.variant;
    for (const s of shots) {
      if (s.kind !== "video" || s.again || s === shots[shots.length - 1]) continue;
      const z = Math.max(1, s.crop.zoom0, s.crop.zoom1);
      [s.crop.zoom0, s.crop.zoom1] = k++ % 2 ? [z * 1.07, z] : [z, z * 1.07];
    }
  }
  // TJR's window with the next clip in it, once after the drop (talking edits, and every other straight one).
  if (style === "talk" || (style === "beat" && o.variant % 2 === 1)) {
    const w = windows(shots, song.beats.map((b) => lead(b - win.songStart)), o.scans, drop?.start ?? 1, FRAME_SIZE[o.aspect][0] / FRAME_SIZE[o.aspect][1]);
    shots = w.shots;
    overlays.push(...w.overlays);
  }
  const captions: CaptionEvent[] = o.caption?.text.trim() ? [{ style: o.caption.style, text: o.caption.text.trim(), start: 0, end: o.card ? win.cardAt - 4 / FPS : win.duration }] : [];
  // Punch-ins come after the drop: the build holds back, so the drop is its first hit.
  // (None in a slow edit, and no flourish on its drop: the cut is enough.)
  const quiet = style === "slow";
  const hits = quiet ? [] : strongHits(song, win.songStart, drop ? drop.start : 0.8, win.cardAt - 0.6, drop?.start);
  // A velocity edit also zoom-blurs across the cuts that open a four-bar phrase.
  const phrases = o.velocity && !quiet ? phraseCuts(song, win.songStart, shots, drop?.start) : [];
  const plan = finishPlan({
    id: style === "beat" ? "montage" : style,
    label: `${styleLabel(style)} ${o.variant + 1}`,
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
    flourishAt: quiet ? undefined : drop?.start,
    hits,
    phrases,
    bpm: song.bpm,
    // Up from black (nio.trade's edits all start so): a quarter of a second, longer in a slow one.
    fadeIn: style === "slow" ? 12 / FPS : style === "burst" || style === "mono" || (style === "beat" && o.variant % 2 === 0) ? 8 / FPS : undefined,
  });
  if (overlays.length) plan.overlays = overlays;
  // Black and white: a talking edit's build and a flipping edit's, up to the drop (a
  // flipping edit with no drop turns at the bar line two fifths in); and in a flipping
  // edit, a shot or two after the drop turning to colour on a beat.
  const flipAt = style === "mono" ? (dropCut ?? lead(talkEnd(song, win.songStart, win.cardAt))) : style === "talk" ? dropCut : undefined;
  if (flipAt !== undefined && flipAt > 0.5) plan.fx.push(mono(0, flipAt));
  if (style === "mono") {
    const beats = song.beats.map((b) => frame(b - win.songStart - CUT_LEAD));
    plan.fx.push(...monoFlips(shots, beats, (flipAt ?? 0) + 4 * song.period));
  }
  if (intro && plan.music) {
    // The voice over the song, the song coming up under the calm shots after it, and all
    // the way on the drop.
    const end = intro.end;
    const drop = dropCut ?? end;
    plan.music.gainPoints = [[0, 0.22], [Math.max(0, end - 0.12), 0.22], ...(drop - end > 0.3 ? ([[end + 0.1, 0.55], [drop - 0.03, 0.55]] as [number, number][]) : []), [drop, 1]];
    plan.note.sound = "The talking at the start is in the file with its own voice, the song under it: post the version with the song.";
    // A phone's voice against a mastered song: brought up to 3 dB under the song in full.
    plan.levelVoice = -3;
  }
  if (looped && plan.music) plan.music.fadeOut = 0.04;
  plan.checks = { ...plan.checks, style, ...(intro ? { talking: Math.round(intro.end * 100) / 100 } : {}), ...(looped ? { loop: true } : {}) };
  return plan;
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
  // (Kicks and 808s only: a punch on a sung syllable or a clap reads as a glitch.)
  const found = song.accents
    .filter((a) => a.kick >= 0.6 && hitsHard(song, a))
    .map((a) => ({ t: frame(gridTime(song, a) - songStart - CUT_LEAD), s: a.s }))
    .filter((a) => a.s >= 0.8 && a.t >= from && a.t <= to && (drop === undefined || Math.abs(a.t - drop) > 1))
    .sort((a, b) => b.s - a.s);
  for (const a of found) {
    if (hits.every((h) => Math.abs(h - a.t) >= 2.5)) hits.push(a.t);
    if (hits.length === 2) break;
  }
  return hits.sort((a, b) => a - b);
}

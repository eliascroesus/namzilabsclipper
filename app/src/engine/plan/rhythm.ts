/**
 * Where a music edit cuts, the way the reference editors cut: on the beat, and the
 * same way every two bars.
 *
 * Taken apart cut by cut against their songs' beat grids (docs/edit-analysis.md),
 * the reference montages hold one rhythm from the drop to the end: mico cuts 1, 1,
 * 2, 1 and 3 beats and repeats it three times, every cut within a frame of the
 * beat; nio.trade's lyric montage cuts on every beat after its drop (11 frames, 11,
 * 11, then 13 to stay on it at 155 bpm) and every two beats or more before it. Where
 * they go faster it's inside a shot: one clip re-cut on the half beats, a jump
 * forward in it each time (a restaurant three times in 0.7 s, a Ferrari eight). The
 * longest shot after any of their drops is about 1.3 s. What they never do is what a
 * planner chasing every accent does: three seconds, then one, then three, then a run
 * of one-beat shots.
 *
 * So after the drop an edit is laid out as one two-bar template repeated to the card:
 * which sixteenths of the two bars get a cut, chosen from the hits the song repeats
 * there (its kick and snare, averaged over every two bars from the drop on), on the
 * beat unless the song hits hard between beats (a broken beat's kicks), each shot
 * near the length the references hold after a drop (0.45 s: a beat at 134 bpm, a
 * half beat at 67). Before the drop it cuts every two beats on the bar's beats,
 * holding through a break's silence, and the drop lands on the return. At the end of
 * every four bars after the drop, the last beat is one clip re-cut on the half beat.
 *
 * Over that, the hits nobody can miss: a stab out of silence, a snare fill, the hit
 * that opens a section (standouts). Each is a cut, as many of them as the pace hears;
 * before the drop, where they are the rhythm (a run of stabs), the grid gives way
 * around them (withHits).
 */
import type { Accent, SongAnalysis } from "../audio/song";

export interface RhythmCut {
  /** where it cuts, edit seconds on the music (the cut lead not yet taken off) */
  t: number;
  /** a quick re-cut of the shot before it: the same clip, a moment further on */
  again?: boolean;
}

export interface RhythmOptions {
  /** where the stretch starts (edit time) */
  from?: number;
  /** where the drop lands (edit time) */
  dropAt?: number;
  /** 1 as the references cut; above 1 holds shots longer, below 1 cuts faster */
  pace?: number;
  /** the longest shot after the drop, seconds */
  maxShot?: number;
  /** re-cut a clip on the half beat at the end of every four bars ("often": every two, "bar": every bar) */
  stutter?: boolean | "often" | "bar";
  /**
   * after the drop, carry one clip over a beat in every bar (the second beat into the
   * third, or with 1 the third into the fourth): a jump cut on the beat, not a new clip
   */
  carry?: 0 | 1;
  /** a stretch with no drop that doesn't hit hard (a verse): every two beats throughout */
  calm?: boolean;
  /**
   * long holds, a mood piece (brezscales' twist, TJR's build): every bar before the drop
   * (and throughout, with none), every two beats after it; no template, no re-cuts
   */
  slow?: boolean;
  /** cut on every hit that stands out from the music around it, as hard as this pace hears them (see PACES); relaxed, two beats a shot at least */
  hits?: Pace;
  /**
   * cutting hard: every beat into the drop, the run into it on the half beats (its last
   * two beats, or bar when a beat is long), and after it the half beats too where a beat
   * runs well past the shots wanted
   */
  push?: boolean;
}

/**
 * How hard an edit cuts on the music: hard, steady ("beat", the reference editors' own
 * rhythm) or relaxed. Every pace cuts on the hits nobody can miss (a stab out of
 * silence, a snare fill); a harder one on more of them, closer together, and pushed (see
 * RhythmOptions) on every beat into the drop and faster after it.
 */
export type Pace = "hard" | "beat" | "relaxed";

/**
 * Per pace: how far a hit has to rise above the music within a second of it (its onset
 * over their median: a stab out of silence is 10 and more, a kick in a busy groove 2 or
 * 3), how loud it has to be (against the song, or the loudest hits around it), and how
 * close two cuts can come (a hard edit's three frames).
 */
export const PACES: Record<Pace, { pop: number; s: number; gap: number }> = {
  hard: { pop: 3, s: 0.2, gap: 0.1 },
  beat: { pop: 4.5, s: 0.3, gap: 0.17 },
  relaxed: { pop: 7, s: 0.55, gap: 0.3 },
};

/**
 * The hits no one can miss between `from` and `end` (edit seconds on the music), as a
 * pace hears them: with some body to them (a kick, a snare or clap, a stab, an 808; a
 * hat alone is never one), loud enough, rising far enough above the music around them,
 * and not the groove's own (a hit much like it a bar or two bars either side, twice or
 * more, is the rhythm the template already cuts to: a run of stabs, a fill or a hit on
 * a new section is not).
 */
export function standouts(song: SongAnalysis, songStart: number, from: number, end: number, pace: Pace, drop?: number): { t: number; s: number }[] {
  const p = PACES[pace];
  const bodied = song.accents.filter((a) => Math.max(a.kick, a.mid) >= 0.4);
  // (Its echoes: a hit much like it a period on either side and two periods on, a bar or
  // three beats (a riff in dotted eighths); two or more make it the groove's. Only on
  // the same side of the drop: an intro's stabs on the beat aren't the groove's kicks
  // after it.)
  const side = (t: number) => drop !== undefined && t >= songStart + drop - 0.05;
  const like = (a: Accent, b: number) => bodied.some((x) => x !== a && Math.abs(x.beat - b) <= 0.12 && x.s >= 0.6 * a.s && side(x.t) === side(a.t));
  const echoes = (a: Accent) => Math.max(...[3, 4].map((d) => [-2 * d, -d, d, 2 * d].filter((k) => like(a, a.beat + k)).length));
  // (On the grid: a sung syllable pops out of a sparse song as much as a stab does, but
  // lands anywhere. Halfway between beats only with the low end carrying it, a kick, an
  // 808 or a whole stab: a melody's note there is the tune.)
  const onBeat = (a: Accent) => Math.abs(a.beat - Math.round(a.beat)) <= 0.1;
  const onHalf = (a: Accent) => Math.abs(a.beat * 2 - Math.round(a.beat * 2)) <= 0.2 && a.kick >= 0.5 && (a.low ?? 0) >= 1;
  const T = song.period;
  const standing = (a: Accent) => {
    const t = a.t - songStart;
    return Math.max(a.kick, a.mid) >= 0.5 && t > from - 2 * T && t < end + 2 * T && (a.pop ?? 0) >= p.pop && Math.max(a.s, a.ls ?? 0) >= p.s && echoes(a) < 2;
  };
  const beats = bodied.filter((a) => onBeat(a) && standing(a));
  // (One between the beats counts in a hard edit, or in a run of them: within a beat and
  // a half of one on the beat.)
  const halves = bodied.filter((a) => !onBeat(a) && onHalf(a) && standing(a) && (pace === "hard" || beats.some((b) => Math.abs(b.beat - a.beat) <= 1.5)));
  // (A cut on one only where the first and the last shot keep a beat: finish's rule.)
  const inside = (a: Accent) => a.t - songStart > from + Math.min(T, 0.5) - 0.02 && a.t - songStart < end - Math.max(T, 0.4) + 0.02;
  return [...beats, ...halves]
    .filter(inside)
    .map((a) => ({ t: a.t - songStart, s: Math.max(a.s, a.ls ?? 0) }))
    .sort((x, y) => x.t - y.t);
}

/**
 * The cuts with the standout hits in: each hit takes the cut nearest it (within 75 ms)
 * or gets one of its own, the strongest first; then a cut on nothing gives way, when it
 * comes closer to a hit than the pace lets two cuts come, and before the drop anywhere
 * within a beat and a half of one (where the hits are the rhythm: a run of stabs, not
 * the grid under them).
 */
export function withHits(song: SongAnalysis, songStart: number, cuts: RhythmCut[], hits: { t: number; s: number }[], pace: Pace, drop?: number): RhythmCut[] {
  const { gap } = PACES[pace];
  const T = song.period;
  const out = cuts.map((c) => ({ ...c, hit: false }));
  for (const h of [...hits].sort((a, b) => b.s - a.s)) {
    // (A harder hit's cut too close already: this one goes by in its shot.)
    if (out.some((c) => c.hit && Math.abs(c.t - h.t) < gap)) continue;
    let near: (typeof out)[number] | undefined;
    for (const c of out) if (!c.hit && Math.abs(c.t - h.t) <= 0.075 && (!near || Math.abs(c.t - h.t) < Math.abs(near.t - h.t))) near = c;
    // (A re-cut that takes a hit stays one: the clip jumps on, on the hit.)
    if (near) Object.assign(near, { t: h.t, hit: true });
    else out.push({ t: h.t, again: false, hit: true });
  }
  const on = out.filter((c) => c.hit);
  if (!on.length) return cuts;
  // (Heard: something under the cut that counts next to the hits around it, not a
  // hat's tick between two stabs.)
  const audible = (t: number, next: number) => song.accents.some((a) => Math.abs(a.t - songStart - t) <= 0.07 && Math.max(a.s, 0.5 * (a.ls ?? 0)) >= 0.4 * next);
  const kept = out.filter((c) => {
    if (c.hit) return true;
    let nearest: { t: number; s: number } | undefined;
    for (const h of on) if (!nearest || Math.abs(c.t - h.t) < Math.abs(c.t - nearest.t)) nearest = { t: h.t, s: hits.find((x) => x.t === h.t)?.s ?? 1 };
    const d = Math.abs(c.t - nearest!.t);
    if (d < gap) return false;
    if ((drop === undefined || c.t < drop - 0.05) && d < 1.5 * T && !audible(c.t, nearest!.s)) return false;
    return true;
  });
  return kept.sort((a, b) => a.t - b.t).map(({ t, again }) => (again ? { t, again } : { t }));
}

/** Sixteenths in two bars of 4/4: the length of the template. */
const STEPS = 32;
/** How long a shot after the drop wants to be, seconds (the references' median, 0.37 to 0.47 s). */
const TARGET = 0.45;

/** The time (song seconds) of a fractional beat on the song's grid, carried on at the tempo past its ends. */
export function beatTime(song: Pick<SongAnalysis, "beats" | "period">, k: number): number {
  const b = song.beats;
  const n = b.length;
  if (!n) return k * song.period;
  if (k <= 0) return b[0] + k * song.period;
  if (k >= n - 1) return b[n - 1] + (k - (n - 1)) * song.period;
  const i = Math.floor(k);
  return b[i] + (k - i) * (b[i + 1] - b[i]);
}

/** Where a song time falls on the beat grid, as a fractional beat. */
export function beatIndex(song: Pick<SongAnalysis, "beats" | "period">, t: number): number {
  const b = song.beats;
  const n = b.length;
  if (!n) return t / song.period;
  if (t <= b[0]) return (t - b[0]) / song.period;
  if (t >= b[n - 1]) return n - 1 + (t - b[n - 1]) / song.period;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (b[m] <= t) lo = m;
    else hi = m;
  }
  return lo + (t - b[lo]) / (b[hi] - b[lo]);
}

/**
 * How hard the song hits on each sixteenth of two bars, averaged over up to eight
 * two-bar stretches from beat `anchor` on, 0 to 1. Kicks, snares, claps and stabs
 * count; a hi-hat on its own counts for little.
 */
export function hitProfile(song: SongAnalysis, anchor: number): Float64Array {
  const sum = new Float64Array(STEPS);
  for (let c = 0; c < 8; c++) {
    const a0 = anchor + 8 * c;
    if (beatTime(song, a0 + 8) > song.duration + 0.05) break;
    const here = new Float64Array(STEPS);
    for (const a of song.accents) {
      const rel = (a.beat - a0) * 4;
      if (rel < -0.4 || rel >= STEPS - 0.4) continue;
      const p = Math.round(rel);
      if (Math.abs(rel - p) > 0.4) continue;
      const q = (p + STEPS) % STEPS;
      here[q] = Math.max(here[q], a.s * (0.4 + 0.6 * Math.max(a.kick, a.mid)));
    }
    for (let p = 0; p < STEPS; p++) sum[p] += here[p];
  }
  let max = 0;
  for (let p = 0; p < STEPS; p++) max = Math.max(max, sum[p]);
  if (max > 0) for (let p = 0; p < STEPS; p++) sum[p] /= max;
  return sum;
}

/**
 * The two-bar template: the sixteenths (0 to 31) that get a cut. A cut goes on a beat
 * the song hits (the bar's first beat above all), and passes over a beat with nothing
 * on it unless the shot would run too long (mico's song hits beats 1, 2, 3, 5 and 6
 * of every eight, and its editor cuts 1, 1, 2, 1, 3); between the beats only on a hit
 * the song really makes there (a broken beat's kicks). Every shot is between
 * `minShot` and `maxShot` seconds and as near `target` as the hits allow, and the
 * first shot of the two bars holds a beat at least: it lands the phrase.
 */
export function template(profile: ArrayLike<number>, sixteenth: number, target: number, minShot: number, maxShot: number, loose = false): number[] {
  const value = (p: number) => {
    const here = profile[p];
    if (p % 4 === 0) {
      // A beat with nothing on it, or whose hit is really a harder one a sixteenth off
      // (a broken beat's kick), is empty.
      const beside = Math.max(profile[(p + 1) % STEPS], profile[(p + STEPS - 1) % STEPS]);
      return here < 0.2 || beside > here + 0.3 ? -0.3 : here - 0.05 + (p % 16 === 0 ? 0.1 : 0);
    }
    // (Loose: where a beat runs well past the shots wanted, the half beats count, on
    // anything the song plays there and, when the shots need it, on nothing: the
    // references cut a slow song's eighths.)
    if (p % 2 === 0) return loose ? (here >= 0.3 ? here - 0.1 : -0.15) : here >= 0.5 ? here - 0.3 : -Infinity;
    return here >= 0.6 ? here - 0.4 : -Infinity;
  };
  // Shorter than the target costs more than longer: a slow song cut on every half beat
  // reads as frantic.
  const pref = (len: number) => {
    const x = Math.log(len / target);
    return x < 0 ? -3 * x * x : -0.5 * x * x;
  };
  const f = new Float64Array(STEPS + 1).fill(-Infinity);
  const prev = new Int32Array(STEPS + 1).fill(-1);
  f[0] = 0;
  for (let j = 1; j <= STEPS; j++) {
    const v = j === STEPS ? 0 : value(j);
    if (v === -Infinity) continue;
    for (let i = 0; i < j; i++) {
      if (f[i] === -Infinity) continue;
      const L = j - i;
      const len = L * sixteenth;
      if (len < minShot - 1e-9 || len > maxShot + 1e-9 || (i === 0 && L < 4)) continue;
      const s = f[i] + v + pref(len);
      if (s > f[j]) {
        f[j] = s;
        prev[j] = i;
      }
    }
  }
  if (f[STEPS] === -Infinity) return [0];
  const out: number[] = [];
  for (let j = prev[STEPS]; j > 0; j = prev[j]) out.push(j);
  out.push(0);
  return out.reverse();
}

/**
 * The cuts between `from` and `end` (edit time; the song starts at `songStart`),
 * in order, as the reference editors place them (see the top of this file), with the
 * song's standout hits cut on as the pace asks.
 */
export function rhythmCuts(song: SongAnalysis, songStart: number, end: number, opts: RhythmOptions = {}): RhythmCut[] {
  const cuts = gridCuts(song, songStart, end, opts);
  if (!opts.hits) return cuts;
  const from = opts.from ?? 0;
  const drop = opts.dropAt !== undefined && opts.dropAt > from + song.period && opts.dropAt < end - song.period ? opts.dropAt : undefined;
  return withHits(song, songStart, cuts, standouts(song, songStart, from, end, opts.hits, drop), opts.hits, drop);
}

/** The cuts on the grid: every two beats into the drop and one pattern after it (see the top of this file). */
function gridCuts(song: SongAnalysis, songStart: number, end: number, opts: RhythmOptions = {}): RhythmCut[] {
  const from = opts.from ?? 0;
  const pace = opts.pace ?? 1;
  const T = song.period;
  const at = (k: number) => beatTime(song, k) - songStart;
  const breaks = (song.structure?.breaks ?? []).map(([a, b]) => [a - songStart, b - songStart] as [number, number]);
  // Inside a break's silence, or starting a shot just as the song drops out.
  const silent = (t: number) => breaks.some(([a, b]) => t > a - 0.5 * T && t < b - 0.05);
  const cuts: RhythmCut[] = [];
  const add = (t: number, again = false) => {
    if (t > from + 0.05 && t < end - 0.05 && !silent(t)) cuts.push({ t, again });
  };
  // Every two beats (a bar at a very fast tempo, one beat at a very slow one, or when
  // pushed), on the beats `anchor` falls on, between `lo` and `hi`.
  const u = (opts.push && T >= 0.3) || 2 * T > 1.8 ? 1 : 2 * T < 0.55 ? 4 : 2;
  const steady = (anchor: number, lo: number, hi: number, every = u) => {
    const k0 = anchor + every * Math.ceil((beatIndex(song, songStart + lo) - anchor) / every);
    for (let k = k0; at(k) < hi; k += every) if (at(k) > lo) add(at(k));
  };
  // The song coming back after a break is a cut.
  const returns = (after: number) => {
    for (const [, b] of breaks) if (b > after + 0.3 && !cuts.some((c) => Math.abs(c.t - b) < 0.3)) add(b);
  };
  const first = from + Math.max(T, 0.5);
  const drop = opts.dropAt !== undefined && opts.dropAt > from + T && opts.dropAt < end - T ? opts.dropAt : undefined;
  const k0 = beatIndex(song, songStart + from);
  const bar = song.downbeats.map((d) => beatIndex(song, d)).find((k) => k >= k0 - 0.05);
  if (opts.slow) {
    const anchor = Math.round(drop !== undefined ? beatIndex(song, songStart + drop) : bar ?? Math.ceil(k0 - 0.05));
    const long = Math.min(8, 2 * u);
    if (drop !== undefined) {
      steady(anchor, first, drop - 0.5 * T, long);
      add(drop);
      steady(anchor, drop + 0.5 * T, end);
    } else steady(anchor, first, end, long);
    returns(drop ?? from);
    return finish(cuts, from, end, T);
  }
  if (drop === undefined && opts.calm) {
    // A stretch that doesn't hit hard: every two beats from the bar line, on the pair
    // of beats the song hits harder (1 and 3, or a snap's 2 and 4).
    let anchor = Math.round(bar ?? Math.ceil(k0 - 0.05));
    if (u === 2) {
      const prof = hitProfile(song, anchor);
      let even = 0;
      let odd = 0;
      for (let p = 0; p < STEPS; p += 4) {
        if ((p / 4) % 2) odd += prof[p];
        else even += prof[p];
      }
      if (odd > even) anchor += 1;
    }
    steady(anchor, first, end);
    returns(from);
    return finish(cuts, from, end, T);
  }
  let anchor: number;
  if (drop !== undefined) {
    anchor = Math.round(beatIndex(song, songStart + drop));
    // Before the drop: every two beats, the first shot a beat at least.
    steady(anchor, first, drop - 0.5 * T);
    // The run into it on the half beats, where a half beat is a sixth of a second or more.
    if (opts.push && T >= 0.36) steady(anchor, Math.max(first, drop - (T >= 0.6 ? 4 : 2) * T - 0.02), drop - 0.3 * T, 0.5);
    add(drop);
  } else {
    // No drop: from the first bar line, or the first beat when the bar line is more
    // than two beats in (a burst starts at once).
    anchor = Math.round(bar !== undefined && at(bar) - from <= 2 * T + 0.02 && at(bar) < end - 4 * T ? bar : Math.ceil(k0 - 0.05));
  }
  // After the drop: one template, repeated.
  const maxShot = opts.maxShot !== undefined ? Math.max(opts.maxShot, T) : Math.max(1.5 * Math.max(1, pace), 2 * T);
  // (Relaxed: two beats a shot, or one where a beat is long.)
  const minShot = opts.hits === "relaxed" ? Math.min(0.65, 1.8 * T) : Math.min(0.3 * pace, 0.9 * T);
  const loose = !!opts.push && T > 1.4 * TARGET * pace;
  const shape = template(hitProfile(song, anchor), T / 4, TARGET * pace, minShot, maxShot, loose);
  // A cut between the beats needs its hit in that bar too (the pattern repeats, a
  // syncopated hit doesn't always): where there's none, the beat before it, or no cut
  // at all when that beat is too close to the one before.
  const heard = (k: number) => song.accents.some((a) => a.s >= 0.45 && Math.abs(a.beat - k) <= 0.1);
  let last = -Infinity;
  // In every bar, one beat carries the clip before it on (a jump cut on the beat, the
  // way the references cut one clip three or eight times): the third, or the fourth.
  const carried = opts.carry === undefined ? [] : [8 + 4 * opts.carry, 24 + 4 * opts.carry].filter((p) => shape.includes(p) && shape.includes(p - 4));
  for (let c = 0; at(anchor + 8 * c) < end; c++) {
    for (const p of shape) {
      let k = anchor + 8 * c + p / 4;
      if (p % 4 && !(loose && p % 2 === 0) && !heard(k)) {
        k = Math.floor(k + 1e-6);
        if (at(k) - last < minShot - 0.02) continue;
      }
      const t = at(k);
      last = t;
      // (The drop is a cut already, wherever it landed.)
      if (drop === undefined || Math.abs(t - drop) > 0.1) add(t, carried.includes(p));
    }
  }
  returns(drop ?? from);
  // The last beat of every four bars (two, in a busier edit): one clip, re-cut on the
  // half beat (on the sixteenth when the half beat is long), not into the card.
  if (opts.stutter) {
    const every = opts.stutter === "bar" ? 4 : opts.stutter === "often" ? 8 : 16;
    const piece = T / 2 >= 0.32 ? 0.25 : 0.5;
    for (let B = anchor + every; at(B) < end - Math.max(T, 0.4) - 0.02; B += every) {
      const s0 = at(B - 1);
      const s1 = at(B);
      if (s0 <= (drop ?? from) + T || silent(s0) || silent(s1)) continue;
      // Clear the beat of the template's own cuts; the shot before it keeps half a beat at least.
      for (let i = cuts.length - 1; i >= 0; i--) if (cuts[i].t > s0 + 0.02 && cuts[i].t < s1 - 0.02) cuts.splice(i, 1);
      const before = cuts.filter((c) => c.t < s0 - 0.02).reduce((m, c) => Math.max(m, c.t), from);
      if (s0 - before < 0.5 * T - 0.02) continue;
      if (!cuts.some((c) => Math.abs(c.t - s0) < 0.02)) add(s0);
      for (let k = piece; k < 1 - 1e-6; k += piece) add(at(B - 1 + k), true);
    }
  }
  return finish(cuts, from, end, T);
}

/** In order, one per moment (a re-cut gives way to a cut), the first shot and the last a beat at least. */
function finish(cuts: RhythmCut[], from: number, end: number, T: number): RhythmCut[] {
  const sorted = [...cuts].sort((a, b) => a.t - b.t || Number(a.again) - Number(b.again));
  const out: RhythmCut[] = [];
  for (const c of sorted) {
    const last = out[out.length - 1];
    if (last && c.t - last.t < 0.04) continue;
    out.push(c);
  }
  while (out.length && out[0].t - from < Math.min(T, 0.5) - 0.02) out.shift();
  if (out.length && out[0].again) out[0] = { t: out[0].t };
  while (out.length && end - out[out.length - 1].t < Math.max(T, 0.4) - 0.02) out.pop();
  return out;
}

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
 */
import type { SongAnalysis } from "../audio/song";

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
  /** re-cut a clip on the half beat at the end of every four bars ("often": every two) */
  stutter?: boolean | "often";
  /**
   * after the drop, carry one clip over a beat in every bar (the second beat into the
   * third, or with 1 the third into the fourth): a jump cut on the beat, not a new clip
   */
  carry?: 0 | 1;
  /** a stretch with no drop that doesn't hit hard (a verse): every two beats throughout */
  calm?: boolean;
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
export function template(profile: ArrayLike<number>, sixteenth: number, target: number, minShot: number, maxShot: number): number[] {
  const value = (p: number) => {
    const here = profile[p];
    if (p % 4 === 0) {
      // A beat with nothing on it, or whose hit is really a harder one a sixteenth off
      // (a broken beat's kick), is empty.
      const beside = Math.max(profile[(p + 1) % STEPS], profile[(p + STEPS - 1) % STEPS]);
      return here < 0.1 || beside > here + 0.3 ? -0.3 : here - 0.05 + (p % 16 === 0 ? 0.1 : 0);
    }
    if (p % 2 === 0) return here >= 0.5 ? here - 0.3 : -Infinity;
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
 * in order, as the reference editors place them. See the top of this file.
 */
export function rhythmCuts(song: SongAnalysis, songStart: number, end: number, opts: RhythmOptions = {}): RhythmCut[] {
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
  // Every two beats (a bar at a very fast tempo, one beat at a very slow one), on the
  // beats `anchor` falls on, between `lo` and `hi`.
  const u = 2 * T < 0.55 ? 4 : 2 * T > 1.8 ? 1 : 2;
  const steady = (anchor: number, lo: number, hi: number) => {
    const k0 = anchor + u * Math.ceil((beatIndex(song, songStart + lo) - anchor) / u);
    for (let k = k0; at(k) < hi; k += u) if (at(k) > lo) add(at(k));
  };
  // The song coming back after a break is a cut.
  const returns = (after: number) => {
    for (const [, b] of breaks) if (b > after + 0.3 && !cuts.some((c) => Math.abs(c.t - b) < 0.3)) add(b);
  };
  const first = from + Math.max(T, 0.5);
  const drop = opts.dropAt !== undefined && opts.dropAt > from + T && opts.dropAt < end - T ? opts.dropAt : undefined;
  const k0 = beatIndex(song, songStart + from);
  const bar = song.downbeats.map((d) => beatIndex(song, d)).find((k) => k >= k0 - 0.05);
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
    add(drop);
  } else {
    // No drop: from the first bar line, or the first beat when the bar line is more
    // than two beats in (a burst starts at once).
    anchor = Math.round(bar !== undefined && at(bar) - from <= 2 * T + 0.02 && at(bar) < end - 4 * T ? bar : Math.ceil(k0 - 0.05));
  }
  // After the drop: one template, repeated.
  const maxShot = opts.maxShot !== undefined ? Math.max(opts.maxShot, T) : Math.max(1.5 * Math.max(1, pace), 2 * T);
  const minShot = Math.min(0.3 * pace, 0.9 * T);
  const shape = template(hitProfile(song, anchor), T / 4, TARGET * pace, minShot, maxShot);
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
      if (p % 4 && !heard(k)) {
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
    const every = opts.stutter === "often" ? 8 : 16;
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

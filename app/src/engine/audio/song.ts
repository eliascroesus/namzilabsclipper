/**
 * Everything the planner needs to know about a song: the beat grid with bar
 * lines, every accent with its strength, how loud each moment is, where it
 * drops, and which stretch of it makes the best edit.
 */
import { beatShift, hitStart } from "./attacks";
import { melFilterbank, melSpectrogram, onsetStrength, percentile, powerSpectrogram, powerToDb, rms, smooth } from "./dsp";
import { keepsHits, standoutHits, steadyAt, steadyGrid, trackTheHits } from "./grid";
import { songStructure, type Structure } from "./structure";
import type { Vocals } from "./vocals";
import { beatTrack, detectOnsets, estimateTempo } from "./rhythm";

export const SR = 22050;
export const HOP = 512;
const N_FFT = 2048;
const N_MELS = 128;

export interface Accent {
  /** seconds */
  t: number;
  /** onset strength, 0 to 1 (1 = the song's strongest hits) */
  s: number;
  /** how much of it is low end (kick, 808), 0 to 1 */
  kick: number;
  /** how much of it is in the middle (snare, clap, voice, a stab), 0 to 1 */
  mid: number;
  /** position on the beat grid, fractional (3.5 = halfway between beats 3 and 4) */
  beat: number;
  /** its start was found to 3 ms (attacks.ts); otherwise it's read off its 23 ms frame */
  exact?: boolean;
  /** strength against the music around it (the loudest hits within two seconds), 0 to 1 */
  ls?: number;
  /** how far it rises above the music within a second of it: its onset over their median (a stab out of silence, 10 and more; a kick in a busy groove, 2 or 3) */
  pop?: number;
  /** how much of its onset is low end: the kick band's onset over the whole spectrum's (a kick or an 808, 2 and more; a plucked note, under 1) */
  low?: number;
}

export interface Drop {
  t: number;
  /** the loudness step into it, 0 to 1 */
  strength: number;
}

export interface SongAnalysis {
  sr: number;
  hop: number;
  duration: number;
  bpm: number;
  /** the beats are a steady grid measured to the exact tempo (not the tracker's own) */
  steady: boolean;
  /** how far the hits start from where the onset envelope puts the beats (seconds, usually negative: ahead); the times here are already moved by it */
  shift?: number;
  /** what usually plays halfway between beats, kick and middle, 0 to 1 like an accent's */
  offbeat?: { kick: number; mid: number };
  /** bars, breaks, sections and phrases (see structure.ts) */
  structure?: Structure;
  /** per beat, the kick, snare and hats (0 to 1), which the structure is built from */
  beatDrums?: { kick: number[]; snare: number[]; hats: number[] };
  /** the singing, when it's been listened for (vocals.ts; see withVocals) */
  vocals?: Vocals;
  /** seconds per beat */
  period: number;
  beats: number[];
  /** 0 on the bar's first beat, then 1, 2, 3 */
  beatInBar: number[];
  downbeats: number[];
  /** the onset at or right next to each beat, 0 to 1 */
  beatStrength: number[];
  /** loudness over each beat, 0 to 1 */
  beatLoudness: number[];
  accents: Accent[];
  drops: Drop[];
  /** per analysis frame (sr / hop per second) */
  env: Float32Array;
  kick: Float32Array;
  /** smoothed loudness per frame, 0 to 1 over the song's own range */
  loudness: Float32Array;
  rms: Float32Array;
}

/**
 * The music around every frame of an onset envelope: the level of its loudest hits
 * within two seconds (the 95th percentile, never under 4% of the song's loudest: a
 * near silence isn't a groove) and its median within a second (what a hit has to rise
 * above to stand out). Measured every eighth frame and joined by straight lines.
 */
export function localLevels(env: Float32Array, fps: number): { ref: Float32Array; median: Float32Array } {
  const n = env.length;
  const ref = new Float32Array(n);
  const median = new Float32Array(n);
  if (!n) return { ref, median };
  const floor = 0.04 * Math.max(1e-9, percentile(env, 99.5));
  const stride = 8;
  const wide = Math.round(2 * fps);
  const near = Math.round(fps);
  const at = (f: number, r: number, q: number) => {
    const w = Array.from(env.subarray(Math.max(0, f - r), Math.min(n, f + r + 1))).sort((a, b) => a - b);
    return w[Math.min(w.length - 1, Math.floor(q * w.length))];
  };
  const ks: number[] = [];
  for (let f = 0; f < n; f += stride) ks.push(f);
  if (ks[ks.length - 1] !== n - 1) ks.push(n - 1);
  const refK = ks.map((f) => Math.max(floor, at(f, wide, 0.95)));
  const medK = ks.map((f) => at(f, near, 0.5));
  for (let j = 0; j + 1 < ks.length; j++) {
    const [a, b] = [ks[j], ks[j + 1]];
    for (let f = a; f <= b; f++) {
      const u = b > a ? (f - a) / (b - a) : 0;
      ref[f] = refK[j] + (refK[j + 1] - refK[j]) * u;
      median[f] = medK[j] + (medK[j + 1] - medK[j]) * u;
    }
  }
  return { ref, median };
}

/**
 * Onsets picked against the music around them (see localLevels): a peak that's the
 * highest within 30 ms, a tenth above the average of the tenth of a second around it,
 * and at least a third of the loudest hits nearby, 30 ms after the one before.
 */
export function localOnsets(env: Float32Array, ref: Float32Array, fps: number): number[] {
  const n = env.length;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = env[i] / Math.max(1e-9, ref[i]);
  const pre = Math.max(1, Math.round(0.03 * fps));
  const avg = Math.max(1, Math.round(0.1 * fps));
  const wait = Math.max(1, Math.round(0.03 * fps));
  const out: number[] = [];
  let last = -Infinity;
  for (let i = 1; i + 1 < n; i++) {
    if (x[i] < 0.33 || i - last <= wait) continue;
    let top = true;
    for (let k = Math.max(0, i - pre); k <= Math.min(n - 1, i + 1) && top; k++) if (x[k] > x[i]) top = false;
    if (!top) continue;
    let m = 0;
    let c = 0;
    for (let k = Math.max(0, i - avg); k <= Math.min(n - 1, i + avg); k++) (m += x[k]), c++;
    if (x[i] < m / c + 0.1) continue;
    out.push(i);
    last = i;
  }
  return out;
}

/** The analysis frame nearest a time. */
export const frameAt = (song: Pick<SongAnalysis, "sr" | "hop">, t: number) => Math.round((t * song.sr) / song.hop);
export const timeOf = (song: Pick<SongAnalysis, "sr" | "hop">, f: number) => (f * song.hop) / song.sr;

function zscore(a: number[]): number[] {
  const m = a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  const sd = Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length)) || 1;
  return a.map((v) => (v - m) / sd);
}

export interface AnalyzeOptions {
  /** look for a steady grid (default); false keeps the tracker's beats, for comparison */
  steady?: boolean;
}

/** Analyse mono audio at 22,050 Hz. */
export function analyzeSong(y: Float32Array, sr = SR, opts: AnalyzeOptions = {}): SongAnalysis {
  const hop = HOP;
  const spec = powerSpectrogram(y, N_FFT, hop);
  const bank = melFilterbank(sr, N_FFT, N_MELS);
  const melDb = powerToDb(melSpectrogram(spec, bank));
  const frames = spec.frames;
  const env = onsetStrength(melDb, frames, N_MELS, N_FFT, hop);
  let kickBands = 0;
  while (kickBands < N_MELS && bank.centres[kickBands] < 150) kickBands++;
  const kick = onsetStrength(melDb, frames, N_MELS, N_FFT, hop, [0, Math.max(2, kickBands)]);
  // The middle of the spectrum: snare, clap, voice, stabs.
  let midLo = 0;
  while (midLo < N_MELS && bank.centres[midLo] < 200) midLo++;
  let midHi = midLo;
  while (midHi < N_MELS && bank.centres[midHi] < 2000) midHi++;
  const mid = onsetStrength(melDb, frames, N_MELS, N_FFT, hop, [midLo, Math.max(midLo + 2, midHi)]);
  // The top: hi-hats, shakers, rides.
  let highLo = midHi;
  while (highLo < N_MELS && bank.centres[highLo] < 5000) highLo++;
  const high = onsetStrength(melDb, frames, N_MELS, N_FFT, hop, [Math.min(highLo, N_MELS - 2), N_MELS]);
  const level = rms(y, N_FFT, hop);
  const duration = y.length / sr;

  // Loudness: dB, smoothed over a quarter second, stretched over the song's own range.
  const db = new Float32Array(frames);
  for (let f = 0; f < frames; f++) db[f] = 20 * Math.log10(level[f] + 1e-5);
  const dbs = smooth(db, Math.round((0.12 * sr) / hop));
  const lo = percentile(dbs, 5);
  const hi = percentile(dbs, 99);
  const loudness = new Float32Array(frames);
  for (let f = 0; f < frames; f++) loudness[f] = Math.min(1, Math.max(0, (dbs[f] - lo) / Math.max(1e-6, hi - lo)));

  const envRef = Math.max(1e-6, percentile(env, 99.5));
  const kickRef = Math.max(1e-6, percentile(kick, 99.5));
  const midRef = Math.max(1e-6, percentile(mid, 99.5));

  const onsetFrames = detectOnsets(env, sr, hop);
  // The hits, judged against the music around them as well as against the whole song:
  // after a loud intro, a quieter groove's hits still count (librosa's picking, used
  // for the tempo, sets one threshold from the song's loudest moments).
  const local = localLevels(env, sr / hop);
  const hitFrames = [...onsetFrames];
  // (Only the ones among the loudest around them: a groove's hits, not the ghost notes
  // between a loud song's hits.)
  for (const f of localOnsets(env, local.ref, sr / hop)) if (env[f] >= 0.5 * local.ref[f] && !onsetFrames.some((g) => Math.abs(g - f) <= 2)) hitFrames.push(f);
  hitFrames.sort((a, b) => a - b);
  let track = beatTrack(env, sr, hop);
  // A song made at one exact tempo gets a steady grid at that tempo, on the kick and
  // snare; anything else keeps the tracker's beats.
  let grid: ReturnType<typeof steadyGrid> = null;
  if (opts.steady !== false && track.beats.length >= 8) {
    // A second guess at the tempo from the kick and snare alone, without the hats.
    const drums = new Float32Array(frames);
    for (let i = 0; i < frames; i++) drums[i] = kick[i] + mid[i];
    const drumBpm = estimateTempo(drums, sr, hop);
    grid = steadyGrid(env, kick, mid, (60 / track.bpm) * (sr / hop), sr / hop, [(60 / drumBpm) * (sr / hop)]);
    // A kick on 1, the "and" of 2 and 4 (3-3-2: trap, afrobeats, reggaeton, a lot of
    // pop) repeats every beat and a half, and a steady grid can hold there too, at two
    // thirds of the tempo: a song at 155 heard at 103, where a third of the claps fall a
    // third of a beat off the grid and an edit cut on it misses them. The level the
    // standout hits keep (on its beats or exactly between them) and the drums keep to
    // at least as tightly is the beat. (Judged on equal terms: a faster level has more
    // stretches to hold through, so either is let off one.)
    const hits = grid ? standoutHits(env, sr / hop, onsetFrames) : [];
    if (grid && hits.length >= 8) {
      const first = steadyAt(env, kick, mid, grid.period, sr / hop, 0.5) ?? grid;
      let keep = keepsHits(hits, first, sr / hop);
      let r = first.r ?? 0;
      for (const m of [2 / 3, 3 / 2]) {
        const other = steadyAt(env, kick, mid, first.period * m, sr / hop, 0.5);
        if (!other) continue;
        const k = keepsHits(hits, other, sr / hop);
        if (k >= keep + 0.2 && (other.r ?? 0) >= r) {
          grid = other;
          keep = k;
          r = other.r ?? 0;
        }
      }
    }
  }
  // Without one, the tracker's beats have to keep the song's standout hits (a snap on
  // 2 and 4): when another tempo keeps them clearly better, the song is tracked at that
  // one, or put on its steady grid there. (A steady grid stands: in a broken beat the
  // kicks fall between its beats on purpose.)
  if (!grid && opts.steady !== false) {
    const fps = sr / hop;
    const other = trackTheHits(env, fps, track.bpm, track.beats, onsetFrames, (tempo) => {
      const g = steadyAt(env, kick, mid, (60 / tempo) * fps, fps);
      const t = beatTrack(env, sr, hop, tempo);
      const beats: number[] = [];
      if (g) for (let f = g.phase; f < frames - 1; f += g.period) beats.push(Math.round(f));
      return { beats: g ? beats : t.beats, grid: g, track: t };
    });
    if (other) {
      track = other.track;
      grid = other.grid;
    }
  }
  let beatFrames = track.beats;
  let bpm = track.bpm;
  let exact: number[] | null = null;
  if (grid) {
    exact = [];
    for (let f = grid.phase; f < frames - 1; f += grid.period) exact.push((f * hop) / sr);
    beatFrames = exact.map((t) => Math.round((t * sr) / hop));
    bpm = (60 * sr) / hop / grid.period;
  } else if (beatFrames.length < 4) {
    // No usable pulse (speech, ambience): a nominal 120 bpm grid keeps the planner working.
    bpm = 120;
    const step = (0.5 * sr) / hop;
    beatFrames = [];
    for (let f = 0; f < frames; f += step) beatFrames.push(Math.round(f));
  }
  // The tracker (like librosa) trims weak beats off both ends of the song; an
  // editor still feels the pulse through a quiet intro or outro, so carry the
  // grid on at the tracked spacing.
  if (!grid && track.beats.length >= 4) {
    const gaps = beatFrames.slice(1).map((f, i) => f - beatFrames[i]).sort((x, y) => x - y);
    const step = gaps[Math.floor(gaps.length / 2)];
    const head: number[] = [];
    for (let f = beatFrames[0] - step; f >= 1; f -= step) head.unshift(Math.round(f));
    const tail: number[] = [];
    for (let f = beatFrames[beatFrames.length - 1] + step; f < frames - 1; f += step) tail.push(Math.round(f));
    beatFrames = [...head, ...beatFrames, ...tail];
  }
  const period = 60 / bpm;
  // The beats as the envelope places them sit some way into each hit (attacks.ts); a
  // viewer hears a hit where it starts, so every time the planner reads (beats, bar
  // lines, accents, drops, breaks) moves onto the starts. What's measured per frame
  // (the envelopes, loudness, the features per beat) stays where it was measured.
  const heard = exact ?? beatFrames.map((f) => (f * hop) / sr);
  const lead = beatShift(y, sr, heard, onsetFrames.map((f) => (f * hop) / sr));
  const beats = heard.map((t) => t + lead);

  const peakNear = (a: Float32Array, f: number, r: number) => {
    let m = 0;
    for (let i = Math.max(0, f - r); i <= Math.min(frames - 1, f + r); i++) m = Math.max(m, a[i]);
    return m;
  };
  // Every onset's hit: where it starts, about as far ahead of its frame as the song's
  // beats are, and exactly where its attack stands out there (looked for on the hits
  // strong enough to cut on; the rest only count towards the groove).
  const hits = hitFrames.map((f) => {
    const near = (f * hop) / sr + lead;
    const ls = Math.min(1, env[f] / Math.max(1e-9, local.ref[f]));
    const hit = env[f] >= 0.25 * envRef || ls >= 0.5 ? hitStart(y, sr, near - 0.035, near + 0.035) : null;
    return { t: hit?.t ?? near, s: Math.min(1, env[f] / envRef), ls, pop: env[f] / Math.max(0.02 * envRef, local.median[f]), low: peakNear(kick, f, 1) / Math.max(1e-9, env[f]), kick: Math.min(1, peakNear(kick, f, 1) / kickRef), mid: Math.min(1, peakNear(mid, f, 1) / midRef), ...(hit ? { exact: true } : {}) };
  });
  // A tracked beat (not a steady grid's) is only as exact as its 23 ms frame: where it
  // falls on a hit strong enough to cut on, it moves onto where the hit starts, so a
  // cut on it lands with the snap or the clap, not a frame before or after.
  if (!exact) {
    for (let i = 0; i < beats.length; i++) {
      let on: (typeof hits)[number] | undefined;
      for (const h of hits) if (h.exact && Math.abs(h.t - beats[i]) <= 0.035 && (!on || h.s > on.s)) on = h;
      if (on) beats[i] = on.t;
    }
  }
  const beatStrength = beatFrames.map((f) => Math.min(1, peakNear(env, f, 2) / envRef));
  const beatKick = beatFrames.map((f) => Math.min(1, peakNear(kick, f, 2) / kickRef));
  const beatSnare = beatFrames.map((f) => Math.min(1, peakNear(mid, f, 2) / midRef));
  const highRef = Math.max(1e-6, percentile(high, 99.5));
  const beatHats = beatFrames.map((f, i) => {
    const and = Math.round(((i + 1 < beatFrames.length ? beatFrames[i + 1] : f + (period * sr) / hop) + f) / 2);
    return Math.min(1, Math.max(peakNear(high, f, 2), peakNear(high, and, 2)) / highRef);
  });
  const beatLoudness = beatFrames.map((f, i) => {
    const end = i + 1 < beatFrames.length ? beatFrames[i + 1] : Math.min(frames, f + Math.round((period * sr) / hop));
    let s = 0;
    for (let k = f; k < end; k++) s += loudness[k];
    return end > f ? s / (end - f) : loudness[Math.min(frames - 1, f)];
  });

  // Chroma per beat, for harmonic change: magnitude summed into pitch classes over a
  // range of the spectrum (55 Hz to 4 kHz for the chords, 30 to 250 Hz for the bass line).
  const change = (lo: number, hi: number) => {
    const pcOfBin = new Int8Array(spec.bins).fill(-1);
    for (let k = 1; k < spec.bins; k++) {
      const hz = (k * sr) / N_FFT;
      if (hz < lo || hz > hi) continue;
      const midi = Math.round(12 * Math.log2(hz / 440) + 69);
      pcOfBin[k] = ((midi % 12) + 12) % 12;
    }
    const chroma = beatFrames.map((f, i) => {
      const end = i + 1 < beatFrames.length ? beatFrames[i + 1] : Math.min(frames, f + 8);
      const c = new Float64Array(12);
      for (let fr = f; fr < end; fr++) {
        const row = fr * spec.bins;
        for (let k = 1; k < spec.bins; k++) if (pcOfBin[k] >= 0) c[pcOfBin[k]] += Math.sqrt(spec.data[row + k]);
      }
      const norm = Math.hypot(...c) || 1;
      return c.map((v) => v / norm);
    });
    return chroma.map((c, i) => (i === 0 ? 0 : 1 - c.reduce((s, v, k) => s + v * chroma[i - 1][k], 0)));
  };
  const harmonicChange = change(55, 4000);
  const bassChange = change(30, 250);

  // Bar lines, assuming 4/4: the phase where the kick lands, the bass line moves and
  // the chords change. The chords count for less (songs often push them ahead of the
  // bar), and a jump in level not at all (a garage track's pickups make beat 4 the loudest).
  const zH = zscore(harmonicChange);
  const zB = zscore(bassChange);
  const zK = zscore(beatKick);
  let phase = 0;
  let bestPhase = -Infinity;
  for (let p = 0; p < 4; p++) {
    let s = 0;
    let c = 0;
    for (let i = p; i < beats.length; i += 4) {
      s += zK[i] + 0.8 * zB[i] + 0.5 * zH[i];
      c++;
    }
    if (c && s / c > bestPhase) {
      bestPhase = s / c;
      phase = p;
    }
  }
  const beatInBar = beats.map((_, i) => (((i - phase) % 4) + 4) % 4);
  const downbeats = beats.filter((_, i) => beatInBar[i] === 0);

  // Every onset, placed on the beat grid.
  const beatPos = (t: number) => {
    if (t <= beats[0]) return (t - beats[0]) / period;
    for (let i = 0; i + 1 < beats.length; i++) {
      if (t < beats[i + 1]) return i + (t - beats[i]) / (beats[i + 1] - beats[i]);
    }
    return beats.length - 1 + (t - beats[beats.length - 1]) / period;
  };
  const accents: Accent[] = hits.map((h) => ({ ...h, beat: beatPos(h.t) }));

  // What usually plays halfway between the beats (a house track's open hat on every
  // "and"), read the way the accents are: a hit there has to stand out from it to be
  // worth a cut.
  const halfKick = new Float64Array(Math.max(0, beats.length - 1));
  const halfMid = new Float64Array(halfKick.length);
  for (const a of accents) {
    const i = Math.floor(a.beat);
    if (i < 0 || i >= halfKick.length || Math.abs(a.beat - i - 0.5) > 0.12) continue;
    halfKick[i] = Math.max(halfKick[i], a.kick);
    halfMid[i] = Math.max(halfMid[i], a.mid);
  }
  // The upper quartile: the groove's hits on the "and" vary (a hat after the snare reads louder).
  const usual = (v: Float64Array) => (v.length ? [...v].sort((x, y) => x - y)[Math.floor(v.length * 0.75)] : 0);
  const offbeat = { kick: usual(halfKick), mid: usual(halfMid) };

  // Drops: bar lines where the next two bars are clearly louder and heavier than the last two.
  const drops: Drop[] = [];
  const scores: { i: number; s: number }[] = [];
  for (let i = 0; i < beats.length; i++) {
    if (beatInBar[i] !== 0 || i < 4) continue;
    const span = (a: number, b: number, arr: number[]) => {
      const lo2 = Math.max(0, a);
      const hi2 = Math.min(arr.length, b);
      let s = 0;
      for (let k = lo2; k < hi2; k++) s += arr[k];
      return hi2 > lo2 ? s / (hi2 - lo2) : 0;
    };
    const rise = span(i, i + 8, beatLoudness) - span(i - 8, i, beatLoudness);
    const kickRise = span(i, i + 8, beatKick) - span(i - 8, i, beatKick);
    scores.push({ i, s: rise + 0.35 * kickRise });
  }
  for (let j = 0; j < scores.length; j++) {
    const { i, s } = scores[j];
    const prev = j > 0 ? scores[j - 1].s : -Infinity;
    const next = j + 1 < scores.length ? scores[j + 1].s : -Infinity;
    if (s <= 0.12 || s < prev || s <= next) continue;
    // The drop is the beat it actually hits on: usually the bar line, but a section
    // can come in on beat 3, or a beat early with a pickup.
    let at = i;
    let jump = -Infinity;
    for (let k = Math.max(1, i - 1); k <= Math.min(beats.length - 1, i + 3); k++) {
      const step = beatLoudness[k] - beatLoudness[k - 1] + (k === i ? 0.02 : 0);
      if (step > jump) {
        jump = step;
        at = k;
      }
    }
    drops.push({ t: beats[at], strength: Math.min(1, s / 0.5) });
  }

  const structure = songStructure({ beats, beatInBar, beatLoudness, beatKick, beatSnare, beatHats });

  return { sr, hop, duration, bpm, steady: !!grid, shift: lead, offbeat, structure, beatDrums: { kick: beatKick, snare: beatSnare, hats: beatHats }, period, beats, beatInBar, downbeats, beatStrength, beatLoudness, accents, drops, env, kick, loudness, rms: level };
}

/**
 * The song with its singing: the vocals attached, and the structure rebuilt so a
 * section can start where the voice comes in or drops out.
 */
export function withVocals(song: SongAnalysis, vocals: Vocals): SongAnalysis {
  const fps = song.sr / song.hop;
  const beatVocal = song.beats.map((b, i) => {
    const f0 = Math.max(0, Math.round(b * fps));
    const f1 = Math.min(vocals.active.length, Math.max(f0 + 1, Math.round((i + 1 < song.beats.length ? song.beats[i + 1] : b + song.period) * fps)));
    let n = 0;
    for (let f = f0; f < f1; f++) n += vocals.active[f];
    return f1 > f0 ? n / (f1 - f0) : 0;
  });
  const d = song.beatDrums;
  const structure = d ? songStructure({ beats: song.beats, beatInBar: song.beatInBar, beatLoudness: song.beatLoudness, beatKick: d.kick, beatSnare: d.snare, beatHats: d.hats, beatVocal }) : song.structure;
  return { ...song, vocals, structure };
}

export interface Section {
  start: number;
  end: number;
  /** the drop inside it, if any, as a time in the song */
  drop?: number;
  score: number;
}

/**
 * The best stretch of the song for an edit `length` seconds long. A sound taken
 * from a Reel starts where that Reel starts (0:00), so "Use audio" in the app lines
 * up with the cuts; a full song gets its strongest stretch, ideally one that
 * drops early.
 */
export function pickSection(song: SongAnalysis, length: number, fromStart: boolean, dropIn?: [number, number]): Section {
  const len = Math.min(length, song.duration);
  // Where in the stretch a drop counts (fractions of it): early by default, so the edit
  // takes off soon; later for an edit that opens on someone talking.
  const [lo, hi] = dropIn ?? [0, 0.45];
  if (fromStart || song.duration <= length + 1) {
    const drop = song.drops.find((d) => d.t > Math.max(0.8, lo * len) && d.t < len * (dropIn ? hi : 0.6));
    return { start: 0, end: len, drop: drop?.t, score: 0 };
  }
  const fps = song.sr / song.hop;
  let best: Section = { start: 0, end: len, score: -Infinity };
  const candidates = song.downbeats.length ? song.downbeats : song.beats;
  for (const start of candidates) {
    const end = start + len;
    if (end > song.duration - 0.5) break;
    const f0 = Math.floor(start * fps);
    const f1 = Math.floor(end * fps);
    let loud = 0;
    for (let f = f0; f < f1; f++) loud += song.loudness[f];
    loud /= Math.max(1, f1 - f0);
    // Opening on near silence reads as a mistake.
    let openLoud = 0;
    const fo = Math.min(f1, f0 + Math.round(fps * 0.6));
    for (let f = f0; f < fo; f++) openLoud += song.loudness[f];
    openLoud /= Math.max(1, fo - f0);
    const drop = song.drops.find((d) => d.t >= start + Math.max(0.8, lo * len) && d.t <= start + len * hi);
    const score = loud + (drop ? 0.35 * drop.strength : 0) - (openLoud < 0.25 ? 0.3 : 0) - 0.02 * (start / Math.max(1, song.duration));
    if (score > best.score) best = { start, end, drop: drop?.t, score };
  }
  return best;
}

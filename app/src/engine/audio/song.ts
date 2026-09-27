/**
 * Everything the planner needs to know about a song: the beat grid with bar
 * lines, every accent with its strength, how loud each moment is, where it
 * drops, and which stretch of it makes the best edit.
 */
import { melFilterbank, melSpectrogram, onsetStrength, percentile, powerSpectrogram, powerToDb, rms, smooth } from "./dsp";
import { beatTrack, detectOnsets } from "./rhythm";

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
  /** position on the beat grid, fractional (3.5 = halfway between beats 3 and 4) */
  beat: number;
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

/** The analysis frame nearest a time. */
export const frameAt = (song: Pick<SongAnalysis, "sr" | "hop">, t: number) => Math.round((t * song.sr) / song.hop);
export const timeOf = (song: Pick<SongAnalysis, "sr" | "hop">, f: number) => (f * song.hop) / song.sr;

function zscore(a: number[]): number[] {
  const m = a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  const sd = Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length)) || 1;
  return a.map((v) => (v - m) / sd);
}

/** Analyse mono audio at 22,050 Hz. */
export function analyzeSong(y: Float32Array, sr = SR): SongAnalysis {
  const hop = HOP;
  const spec = powerSpectrogram(y, N_FFT, hop);
  const bank = melFilterbank(sr, N_FFT, N_MELS);
  const melDb = powerToDb(melSpectrogram(spec, bank));
  const frames = spec.frames;
  const env = onsetStrength(melDb, frames, N_MELS, N_FFT, hop);
  let kickBands = 0;
  while (kickBands < N_MELS && bank.centres[kickBands] < 150) kickBands++;
  const kick = onsetStrength(melDb, frames, N_MELS, N_FFT, hop, [0, Math.max(2, kickBands)]);
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

  const track = beatTrack(env, sr, hop);
  let beatFrames = track.beats;
  let bpm = track.bpm;
  if (beatFrames.length < 4) {
    // No usable pulse (speech, ambience): a nominal 120 bpm grid keeps the planner working.
    bpm = 120;
    const step = (0.5 * sr) / hop;
    beatFrames = [];
    for (let f = 0; f < frames; f += step) beatFrames.push(Math.round(f));
  }
  // The tracker (like librosa) trims weak beats off both ends of the song; an
  // editor still feels the pulse through a quiet intro or outro, so carry the
  // grid on at the tracked spacing.
  if (track.beats.length >= 4) {
    const gaps = beatFrames.slice(1).map((f, i) => f - beatFrames[i]).sort((x, y) => x - y);
    const step = gaps[Math.floor(gaps.length / 2)];
    const head: number[] = [];
    for (let f = beatFrames[0] - step; f >= 1; f -= step) head.unshift(Math.round(f));
    const tail: number[] = [];
    for (let f = beatFrames[beatFrames.length - 1] + step; f < frames - 1; f += step) tail.push(Math.round(f));
    beatFrames = [...head, ...beatFrames, ...tail];
  }
  const period = 60 / bpm;
  const beats = beatFrames.map((f) => (f * hop) / sr);

  const peakNear = (a: Float32Array, f: number, r: number) => {
    let m = 0;
    for (let i = Math.max(0, f - r); i <= Math.min(frames - 1, f + r); i++) m = Math.max(m, a[i]);
    return m;
  };
  const beatStrength = beatFrames.map((f) => Math.min(1, peakNear(env, f, 2) / envRef));
  const beatKick = beatFrames.map((f) => Math.min(1, peakNear(kick, f, 2) / kickRef));
  const beatLoudness = beatFrames.map((f, i) => {
    const end = i + 1 < beatFrames.length ? beatFrames[i + 1] : Math.min(frames, f + Math.round((period * sr) / hop));
    let s = 0;
    for (let k = f; k < end; k++) s += loudness[k];
    return end > f ? s / (end - f) : loudness[Math.min(frames - 1, f)];
  });

  // Chroma per beat, for harmonic change: magnitude summed into pitch classes, 55 Hz to 4 kHz.
  const pcOfBin = new Int8Array(spec.bins).fill(-1);
  for (let k = 1; k < spec.bins; k++) {
    const hz = (k * sr) / N_FFT;
    if (hz < 55 || hz > 4000) continue;
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
  const harmonicChange = chroma.map((c, i) => (i === 0 ? 0 : 1 - c.reduce((s, v, k) => s + v * chroma[i - 1][k], 0)));
  const loudRise = beatLoudness.map((v, i) => (i === 0 ? 0 : Math.max(0, v - beatLoudness[i - 1])));

  // Bar lines, assuming 4/4: the phase where harmony changes, kicks land and the level steps up.
  const zH = zscore(harmonicChange);
  const zK = zscore(beatKick);
  const zL = zscore(loudRise);
  const zS = zscore(beatStrength);
  let phase = 0;
  let bestPhase = -Infinity;
  for (let p = 0; p < 4; p++) {
    let s = 0;
    let c = 0;
    for (let i = p; i < beats.length; i += 4) {
      s += zH[i] + 0.7 * zK[i] + 0.5 * zL[i] + 0.3 * zS[i];
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
  const accents: Accent[] = detectOnsets(env, sr, hop).map((f) => {
    const t = (f * hop) / sr;
    return { t, s: Math.min(1, env[f] / envRef), kick: Math.min(1, peakNear(kick, f, 1) / kickRef), beat: beatPos(t) };
  });

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
    if (s > 0.12 && s >= prev && s > next) drops.push({ t: beats[i], strength: Math.min(1, s / 0.5) });
  }

  return { sr, hop, duration, bpm, period, beats, beatInBar, downbeats, beatStrength, beatLoudness, accents, drops, env, kick, loudness, rms: level };
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
export function pickSection(song: SongAnalysis, length: number, fromStart: boolean): Section {
  const len = Math.min(length, song.duration);
  if (fromStart || song.duration <= length + 1) {
    const drop = song.drops.find((d) => d.t > 0.8 && d.t < len * 0.6);
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
    const drop = song.drops.find((d) => d.t >= start + 0.8 && d.t <= start + len * 0.45);
    const score = loud + (drop ? 0.35 * drop.strength : 0) - (openLoud < 0.25 ? 0.3 : 0) - 0.02 * (start / Math.max(1, song.duration));
    if (score > best.score) best = { start, end, drop: drop?.t, score };
  }
  return best;
}

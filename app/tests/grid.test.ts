import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { melFilterbank, melSpectrogram, onsetStrength, powerSpectrogram, powerToDb } from "../src/engine/audio/dsp";
import { steadyGrid } from "../src/engine/audio/grid";
import { analyzeSong, type SongAnalysis } from "../src/engine/audio/song";
import { PROFILE_BINS, type Scan } from "../src/engine/media/scan";
import { CUT_LEAD, mulberry32, planMontage } from "../src/engine/plan/montage";
import { FPS } from "../src/engine/plan/types";

const SR = 22050;

/** A drum machine: hits at times, each a decaying tone (a kick low, a clap in the middle), or hats: a cluster of high partials. */
function drums(seconds: number, hits: { t: number; hz: number; amp: number; decay: number; hat?: boolean }[]): Float32Array {
  const y = new Float32Array(Math.round(seconds * SR));
  const partials = [6300, 7100, 8200, 9400, 10300];
  for (const h of hits) {
    const s0 = Math.round(h.t * SR);
    for (let i = 0; i < 4000 && s0 + i < y.length; i++) {
      const tone = h.hat ? partials.reduce((a, f, k) => a + Math.sin((2 * Math.PI * f * i) / SR + k), 0) / partials.length : Math.sin((2 * Math.PI * h.hz * i) / SR);
      y[s0 + i] += h.amp * Math.exp(-i / h.decay) * tone;
    }
  }
  return y;
}

/**
 * A garage groove at 134 bpm (not a whole number of analysis frames per beat): a
 * kick on 1 and 3, a clap on 2 and 4, and hi-hats on every "and", louder than
 * both. From `drop` seconds on, a bass stab joins on every beat.
 */
function garage(seconds: number, bpm = 134, offset = 0.1, drop?: number) {
  const T = 60 / bpm;
  const hits: Parameters<typeof drums>[1] = [];
  const beats: number[] = [];
  for (let k = 0; offset + k * T < seconds - 0.5; k++) {
    const t = offset + k * T;
    beats.push(t);
    if (k % 2 === 0) hits.push({ t, hz: 55, amp: 0.8, decay: 900 });
    else hits.push({ t, hz: 1800, amp: 0.35, decay: 300 });
    hits.push({ t: t + T / 2, hz: 0, amp: 0.6, decay: 120, hat: true });
    if (drop !== undefined && t >= drop - 1e-6) hits.push({ t, hz: 110, amp: 0.6, decay: 2500 });
  }
  return { y: drums(seconds, hits), beats, T };
}

const nearest = (xs: number[], t: number) => xs.reduce((best, x) => (Math.abs(x - t) < Math.abs(best - t) ? x : best), xs[0]);

function scans(): Scan[] {
  return Array.from({ length: 8 }, (_, j) => {
    const rand = mulberry32(90 + j);
    const n = 60;
    const f = (k: number) => new Float32Array(k);
    const stats = { t: f(n), luma: f(n), contrast: f(n), sharp: f(n), color: f(n), skin: f(n), motion: f(n), hist: f(n * 64), cols: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rows: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rgb: f(n * 3) };
    const interest = f(n);
    for (let i = 0; i < n; i++) {
      stats.t[i] = (i + 0.5) / 6;
      interest[i] = 0.4 + 0.5 * rand();
      stats.motion[i] = 0.05 + 0.2 * rand();
      stats.rgb[i * 3] = rand();
    }
    return { id: `c${j}`, kind: "video", start: 0, duration: 10, width: 1920, height: 1080, rate: 6, stats, cuts: [], interest } as Scan;
  });
}

describe("a steady grid", () => {
  const g = garage(60);
  const song = analyzeSong(g.y, SR);

  it("hears the exact tempo, and puts the beat on the kick and clap, not the hats", () => {
    expect(song.steady).toBe(true);
    expect(song.bpm).toBeCloseTo(134, 1);
    // Every beat of the grid the same small way from a real one, all the way through (no
    // drift). Onsets read a frame late (about 23 ms); CUT_LEAD allows for that.
    const inside = song.beats.filter((b) => b > 0.5 && b < 59);
    const offs = inside.map((b) => b - nearest(g.beats, b));
    for (const o of offs) expect(o).toBeGreaterThan(-0.005);
    for (const o of offs) expect(o).toBeLessThan(0.035);
    expect(Math.max(...offs) - Math.min(...offs)).toBeLessThan(0.004);
  });

  it("does better than the frame-bound tracker, which drifts or follows the hats", () => {
    const tracker = analyzeSong(g.y, SR, { steady: false });
    const worst = Math.max(...tracker.beats.filter((b) => b > 0.5 && b < 59).map((b) => Math.abs(nearest(g.beats, b) - b)));
    expect(worst).toBeGreaterThan(0.03);
  });

  it("cuts on the beat and never on the hats", () => {
    for (const variant of [0, 1, 2]) {
      const plan = planMontage({ song, songSource: "s", songName: "garage", fromStart: false, songStart: g.beats[8], scans: scans(), aspect: "9x16", length: 12, card: null, caption: null, variant });
      // Each cut within a frame of a kick or clap (a frame early at most), never near a hat.
      for (const s of plan.shots.slice(1)) {
        const t = plan.music!.songStart + s.start;
        expect(t - nearest(g.beats, t)).toBeGreaterThan(-1 / FPS - 0.005);
        expect(t - nearest(g.beats, t)).toBeLessThan(1 / FPS);
      }
    }
  });

  it("finds the beat when the tracker starts from the wrong level of it", () => {
    // The onset envelopes analyzeSong uses: everything, the kick band, the middle.
    const hop = 512;
    const spec = powerSpectrogram(g.y, 2048, hop);
    const bank = melFilterbank(SR, 2048, 128);
    const db = powerToDb(melSpectrogram(spec, bank));
    const band = (lo: number, hi: number) => {
      let a = 0;
      while (bank.centres[a] < lo) a++;
      let b = a;
      while (bank.centres[b] < hi) b++;
      return onsetStrength(db, spec.frames, 128, 2048, hop, [a, b]);
    };
    const env = onsetStrength(db, spec.frames, 128, 2048, hop);
    const fps = SR / hop;
    const T = (60 / 134) * fps;
    // Two thirds of the tempo (a beat on a kick, then a hat, then a clap: what the
    // tracker itself hears in this groove) and every "and" counted as a beat (268 bpm)
    // both come back to 134.
    for (const rough of [T, 1.5 * T, 0.5 * T]) {
      const grid = steadyGrid(env, band(0, 150), band(200, 2000), rough, fps);
      expect(grid).not.toBeNull();
      expect((60 * fps) / grid!.period).toBeCloseTo(134, 1);
    }
    // Half the tempo is a beat level too (67 bpm, every other beat): kept, and still on the beat.
    const half = steadyGrid(env, band(0, 150), band(200, 2000), 2 * T, fps)!;
    expect(half.period / T).toBeCloseTo(2, 2);
    const first = half.phase / fps;
    expect(first - nearest(g.beats, first)).toBeGreaterThan(-0.005);
    expect(first - nearest(g.beats, first)).toBeLessThan(0.035);
  });

  it("keeps the tracker for music that changes tempo", () => {
    const a = garage(30, 120);
    const b = garage(30, 128, 0.05);
    const y = new Float32Array(a.y.length + b.y.length);
    y.set(a.y);
    y.set(b.y, a.y.length);
    expect(analyzeSong(y, SR).steady).toBe(false);
  });

  it("puts a drop on the beat it hits, even when it comes in on beat 3", () => {
    const T = 60 / 134;
    const at = 0.1 + 34 * T; // beat 35: the third beat of bar 9
    const d = garage(40, 134, 0.1, at);
    const s: SongAnalysis = analyzeSong(d.y, SR);
    const drop = [...s.drops].sort((x, y) => y.strength - x.strength)[0];
    expect(drop).toBeDefined();
    expect(Math.abs(drop.t - at)).toBeLessThan(0.035);
  });
});

/** A drum machine with real-sounding parts: a pitched-down kick, a noisy snare, hats that sit above 5 kHz. */
type Part = { t: number; kind: "kick" | "snare" | "hat" | "ohat" | "bass" | "pad"; amp?: number };
function machine(seconds: number, parts: Part[]): Float32Array {
  const y = new Float32Array(Math.round(seconds * SR));
  const rand = mulberry32(1);
  for (const h of parts) {
    const s0 = Math.round(h.t * SR);
    const len = h.kind === "pad" ? 20000 : h.kind === "bass" ? 8000 : 5000;
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    for (let i = 0; i < len && s0 + i < y.length; i++) {
      const t = i / SR;
      let v = 0;
      if (h.kind === "kick") v = 0.9 * Math.exp(-i / 2500) * Math.sin(2 * Math.PI * (50 + 100 * Math.exp(-i / 400)) * t);
      else if (h.kind === "snare") v = 0.45 * Math.exp(-i / 1500) * ((rand() * 2 - 1) * 0.6 + 0.4 * Math.sin(2 * Math.PI * 190 * t));
      else if (h.kind === "hat" || h.kind === "ohat") {
        [n2, n1, n0] = [n1, n0, rand() * 2 - 1];
        v = (h.kind === "hat" ? 0.25 * Math.exp(-i / 250) : 0.22 * Math.exp(-i / 2500)) * 0.5 * (n0 - 2 * n1 + n2);
      } else if (h.kind === "bass") v = 0.4 * Math.exp(-i / 6000) * Math.sin(2 * Math.PI * 55 * t);
      else v = 0.15 * Math.sin(2 * Math.PI * 330 * t) * Math.min(1, i / 2000) * Math.exp(-i / 15000);
      y[s0 + i] += (h.amp ?? 1) * v;
    }
  }
  return y;
}

interface Groove {
  name: string;
  seconds: number;
  bpm: number;
  /** the tempo of the grid it should find: the beat, or the half-time beat the kick and snare keep */
  grid: number;
  bar: (k: number, t: number, T: number) => Part[];
}
const on = (cond: boolean, p: Part) => (cond ? [p] : []);
const GROOVES: Groove[] = [
  { name: "house, 124", seconds: 50, bpm: 124, grid: 124, bar: (k, t, T) => [{ t, kind: "kick" }, { t: t + T / 2, kind: "ohat" }, ...on(k % 2 === 1, { t, kind: "snare" }), { t: t + T / 4, kind: "hat", amp: 0.5 }, { t: t + (3 * T) / 4, kind: "hat", amp: 0.5 }] },
  // Sixteenth hats, a kick on 1 and a snare on 3 of every two beats: the tracker hears five sixteenths as the beat (112 bpm).
  { name: "trap, 140 (half-time)", seconds: 45, bpm: 140, grid: 70, bar: (k, t, T) => [...on(k % 4 === 0 || k % 8 === 5, { t, kind: "kick" }), ...on(k % 4 === 2, { t, kind: "snare" }), ...[0, 1, 2, 3].map((q): Part => ({ t: t + (q * T) / 4, kind: "hat", amp: q % 2 ? 0.6 : 1 })), ...on(k % 4 === 0, { t, kind: "bass" })] },
  { name: "hip-hop, 90 swung", seconds: 50, bpm: 90, grid: 90, bar: (k, t, T) => [...on(k % 2 === 0, { t, kind: "kick" }), ...on(k % 2 === 1, { t, kind: "snare" }), { t, kind: "hat" }, { t: t + T * 0.62, kind: "hat", amp: 0.7 }, ...on(k % 4 === 2, { t: t + T * 0.62, kind: "kick", amp: 0.7 })] },
  // Two-step kicks, loud hats on every "and", and eight bars of pads with no drums in the middle.
  { name: "garage, 134, a breakdown", seconds: 70, bpm: 134, grid: 134, bar: (k, t, T) => (k >= 48 && k < 80 ? on(k % 4 === 0, { t, kind: "pad" }) : [...on(k % 4 === 0 || k % 8 === 3, { t, kind: "kick" }), ...on(k % 2 === 1, { t, kind: "snare" }), { t: t + T / 2, kind: "hat", amp: 1.2 }, ...on(k % 8 === 6, { t: t + T / 2, kind: "kick", amp: 0.8 })]) },
  { name: "a 12 s Reel sound, 150", seconds: 12, bpm: 150, grid: 150, bar: (k, t, T) => [{ t, kind: "kick" }, ...on(k % 2 === 1, { t, kind: "snare" }), { t: t + T / 2, kind: "hat" }] },
  { name: "drum & bass, 174", seconds: 40, bpm: 174, grid: 87, bar: (k, t, T) => [...on(k % 4 === 0 || k % 8 === 6, { t, kind: "kick" }), ...on(k % 4 === 2, { t, kind: "snare" }), { t, kind: "hat" }, { t: t + T / 2, kind: "hat", amp: 0.7 }, ...on(k % 8 === 2, { t: t + T / 2, kind: "kick" })] },
];

describe("grooves", () => {
  for (const g of GROOVES) {
    it(`${g.name}: an exact grid on the kick and snare, and cuts on it`, () => {
      const T = 60 / g.bpm;
      const truth: number[] = [];
      const parts: Part[] = [];
      for (let k = 0; 0.12 + k * T < g.seconds - 0.4; k++) {
        truth.push(0.12 + k * T);
        parts.push(...g.bar(k, 0.12 + k * T, T));
      }
      const song = analyzeSong(machine(g.seconds, parts), SR);
      expect(song.steady).toBe(true);
      expect(song.bpm).toBeCloseTo(g.grid, 0);
      const inside = song.beats.filter((b) => b > 0.5 && b < g.seconds - 1);
      const offs = inside.map((b) => b - nearest(truth, b));
      expect(Math.min(...offs)).toBeGreaterThan(-0.005);
      expect(Math.max(...offs)).toBeLessThan(0.04);
      expect(Math.max(...offs) - Math.min(...offs)).toBeLessThan(0.008);
      let hit = 0;
      let cuts = 0;
      for (const variant of [0, 1, 2]) {
        const plan = planMontage({ song, songSource: "s", songName: g.name, fromStart: false, songStart: truth[4], scans: scans(), aspect: "9x16", length: Math.min(12, g.seconds - 8), card: null, caption: null, variant });
        for (const s of plan.shots.slice(1)) {
          const t = plan.music!.songStart + s.start + CUT_LEAD;
          cuts++;
          if (Math.abs(t - nearest(truth, t)) <= 1.5 / FPS + 0.03) hit++;
        }
      }
      // A cut or two a batch can go on a syncopated kick between beats; the rest on the beat.
      expect(hit / cuts).toBeGreaterThanOrEqual(0.9);
    });
  }

  it("a live band drifting from 118 to 124 keeps the tracker's beats", () => {
    const truth: number[] = [];
    const parts: Part[] = [];
    let t = 0.1;
    for (let k = 0; t < 59.5; k++) {
      truth.push(t);
      parts.push({ t, kind: "kick" }, ...on(k % 2 === 1, { t, kind: "snare" }), { t: t + 0.24, kind: "hat" });
      t += 60 / (118 + (6 * k) / 118);
    }
    expect(analyzeSong(machine(60, parts), SR).steady).toBe(false);
  });
});

const FIX = resolve(import.meta.dirname, "fixtures");
describe.skipIf(!existsSync(resolve(FIX, "comes.f32")))("Comes and Goes (KETTAMA), a garage track at 134 bpm", () => {
  it("gets a steady 134 grid, the drops where they hit, and cuts on the beat", () => {
    const buf = readFileSync(resolve(FIX, "comes.f32"));
    const song = analyzeSong(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
    expect(song.steady).toBe(true);
    expect(song.bpm).toBeCloseTo(134, 1);
    expect(song.beats[0]).toBeCloseTo(0.062, 2);
    const drops = song.drops.map((d) => d.t);
    expect(drops.some((t) => Math.abs(t - 71.7) < 0.05)).toBe(true);
    expect(drops.some((t) => Math.abs(t - 192.6) < 0.05)).toBe(true);
    const T = 60 / 134;
    for (const start of [4.5, 64.5, 185.5]) {
      for (const variant of [0, 1, 2]) {
        const plan = planMontage({ song, songSource: "s", songName: "comes", fromStart: false, songStart: start, scans: scans(), aspect: "9x16", length: 14, card: null, caption: null, variant });
        let offBeat = 0;
        for (const s of plan.shots.slice(1)) {
          const k = (plan.music!.songStart + s.start + CUT_LEAD - song.beats[0]) / T;
          const onBeat = Math.abs(k - Math.round(k)) * T;
          if (Math.abs(k - Math.floor(k) - 0.5) * T < onBeat) offBeat++;
          else expect(onBeat).toBeLessThanOrEqual(1.5 / FPS);
        }
        expect(offBeat).toBeLessThanOrEqual(1);
      }
    }
  });

  it("puts the grid on the beat from a Reel-length clip of it too, not on the hats", () => {
    // A Reel's sound is 15 or 30 seconds from somewhere in the song. Its grid has to
    // land where the whole song's does (the verses, the hooks, the drops; the
    // breakdown at 2:35 has too little drum to tell a beat from an "and").
    const buf = readFileSync(resolve(FIX, "comes.f32"));
    const y = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    const T = 60 / 134;
    for (const len of [15, 30]) {
      for (const start of [8, 40, 64, 90, 120, 190, 215]) {
        const clip = analyzeSong(y.slice(Math.round(start * SR), Math.round((start + len) * SR)), SR);
        expect(clip.steady).toBe(true);
        expect(clip.bpm).toBeCloseTo(134, 0);
        for (const b of clip.beats.filter((t) => t > 0.5 && t < len - 0.5)) {
          const k = (b + start - 0.062) / T;
          expect(Math.abs(k - Math.round(k)) * T).toBeLessThan(0.03);
        }
      }
    }
  });
});

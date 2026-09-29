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
    // Every beat of the grid on where a real one starts, all the way through (no drift).
    const inside = song.beats.filter((b) => b > 0.5 && b < 59);
    const offs = inside.map((b) => b - nearest(g.beats, b));
    for (const o of offs) expect(o).toBeGreaterThan(-0.01);
    for (const o of offs) expect(o).toBeLessThan(0.01);
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
      expect(Math.min(...offs)).toBeGreaterThan(-0.01);
      expect(Math.max(...offs)).toBeLessThan(0.01);
      expect(Math.max(...offs) - Math.min(...offs)).toBeLessThan(0.008);
      // Every cut on a beat, or on a kick or snare that really plays between beats (a
      // syncopated kick); never on a hat, never on nothing. (A clip re-cut on the half
      // beat inside a shot aside: that's on the grid, not a new shot.)
      const drums = parts.filter((p) => p.kind === "kick" || p.kind === "snare").map((p) => p.t);
      for (const variant of [0, 1, 2]) {
        const plan = planMontage({ song, songSource: "s", songName: g.name, fromStart: false, songStart: truth[4], scans: scans(), aspect: "9x16", length: Math.min(12, g.seconds - 8), card: null, caption: null, variant });
        for (const s of plan.shots.slice(1).filter((x) => !x.again)) {
          const t = plan.music!.songStart + s.start + CUT_LEAD;
          const off = Math.min(Math.abs(t - nearest(truth, t)), Math.abs(t - nearest(drums, t)));
          expect(off).toBeLessThanOrEqual(1.5 / FPS + 0.03);
        }
      }
    });
  }

  it("finds the bar lines from the kick and the bass, not the chords or a swell", () => {
    // 124 bpm: a kick on 1 and 3, a clap on 2 and 4, hats on the "and"s, the bass
    // moving on every 1; but the chords move on beat 2 and a riser swells through
    // beat 4 every bar (garage and house do both). The bar starts on the kick and the bass.
    const T = 60 / 124;
    const t0 = 0.3;
    const parts: Part[] = [];
    for (let k = 0; t0 + k * T < 44.5; k++) {
      const t = t0 + k * T;
      parts.push(...on(k % 2 === 0, { t, kind: "kick" }), ...on(k % 2 === 1, { t, kind: "snare" }), { t: t + T / 2, kind: "hat" });
    }
    const y = machine(45, parts);
    const roots = [55, 43.65, 65.41, 49];
    const rand = mulberry32(7);
    for (let bar = 0; t0 + bar * 4 * T < 44.5; bar++) {
      const one = t0 + bar * 4 * T;
      const add = (from: number, to: number, f: (t: number) => number) => {
        for (let i = Math.max(0, Math.round(from * SR)); i < Math.min(y.length, Math.round(to * SR)); i++) y[i] += f(i / SR - from);
      };
      add(one, one + 4 * T, (t) => 0.35 * Math.sin(2 * Math.PI * roots[bar % 4] * t) * Math.min(1, t * 200));
      const chord = roots[(bar + 1) % 4] * 8;
      add(one + T, one + 5 * T, (t) => 0.12 * Math.min(1, t * 50) * [1, 1.26, 1.5].reduce((a, r) => a + Math.sin(2 * Math.PI * chord * r * t), 0));
      add(one + 3 * T, one + 4 * T, (t) => 0.3 * (t / T) ** 2 * (rand() * 2 - 1));
    }
    const song = analyzeSong(y, SR);
    expect(song.steady).toBe(true);
    const bars = song.downbeats.filter((t) => t > 1 && t < 43).map((d) => ((Math.round((d - t0) / T) % 4) + 4) % 4);
    expect(bars.length).toBeGreaterThan(10);
    for (const b of bars) expect(b).toBe(0);
  });

  it("finger snaps on 2 and 4 in a sparse song played by hand: a tempo that keeps them, and cuts on them", () => {
    // 86 bpm drifting up to 89, a snap on 2 and 4 (up to 25 ms either side of the
    // beat), a soft kick on 1, a pad, and a plucked line every three sixteenths (115
    // bpm, near where the tracker looks first: it used to settle there, and the snaps
    // fell all over its beats).
    const seconds = 30;
    const rand = mulberry32(11);
    const beats: number[] = [];
    for (let t = 0.2, k = 0; t < seconds; k++, t += 60 / (86 + (3 * k) / 40)) beats.push(t);
    const at = (x: number) => beats[Math.floor(x)] + (x - Math.floor(x)) * (beats[Math.floor(x) + 1] - beats[Math.floor(x)]);
    const y = new Float32Array(seconds * SR);
    const add = (t: number, len: number, v: (i: number) => number) => {
      const s0 = Math.round(t * SR);
      for (let i = 0; i < len && s0 + i < y.length; i++) y[s0 + i] += v(i);
    };
    const snaps: number[] = [];
    for (let k = 0; k + 1 < beats.length && beats[k] < seconds - 0.5; k++) {
      if (k % 2 === 1) {
        const s = beats[k] + 0.025 * (rand() * 2 - 1);
        snaps.push(s);
        let prev = 0;
        add(s, 6000, (i) => {
          const n = rand() * 2 - 1;
          const v = 0.7 * Math.min(1, i / 20) * Math.exp(-i / 350) * (n - 0.6 * prev);
          prev = n;
          return v;
        });
      }
      if (k % 4 === 0) add(beats[k], 6000, (i) => 0.27 * Math.exp(-i / 2500) * Math.sin(2 * Math.PI * (50 + 100 * Math.exp(-i / 400)) * (i / SR)));
      if (k % 8 === 0) add(beats[k], 40000, (i) => 0.1 * Math.min(1, i / 4000) * Math.exp(-i / 30000) * Math.sin(2 * Math.PI * (k % 16 ? 196 : 220) * (i / SR)));
    }
    for (let q = 0; 0.75 * q + 1 < beats.length && at(0.75 * q) < seconds - 0.5; q++) {
      const hz = [660, 587, 494, 523][q % 4];
      add(at(0.75 * q) + 0.015 * (rand() * 2 - 1), 6000, (i) => 0.25 * Math.min(1, i / 30) * Math.exp(-i / 1800) * (Math.sin(2 * Math.PI * hz * (i / SR)) + 0.4 * Math.sin(4 * Math.PI * hz * (i / SR))));
    }
    const song = analyzeSong(y, SR);
    expect(song.bpm).toBeGreaterThan(82);
    expect(song.bpm).toBeLessThan(92);
    // Every snap on a beat, where it starts.
    for (const s of snaps.filter((x) => x > 1 && x < seconds - 1)) expect(Math.abs(nearest(song.beats, s) - s)).toBeLessThan(0.012);
    // And cut on: nearly every snap in the edit gets a cut, and every cut is on a beat.
    for (const start of [4, 9]) {
      for (const variant of [0, 1, 2]) {
        const plan = planMontage({ song, songSource: "s", songName: "snaps", fromStart: false, songStart: start, scans: scans(), aspect: "9x16", length: 12, card: null, caption: null, variant });
        const cuts = plan.shots
          .slice(1)
          .filter((s) => !s.again)
          .map((s) => plan.music!.songStart + s.start + CUT_LEAD);
        for (const c of cuts) expect(Math.abs(nearest(song.beats, c) - c)).toBeLessThanOrEqual(1.5 / FPS + 0.01);
        // (A snap can get its cut from a clip re-cut on the beat.)
        const all = plan.shots.slice(1).map((s) => plan.music!.songStart + s.start + CUT_LEAD);
        const inside = snaps.filter((s) => s > start + 0.6 && s < start + plan.duration - 0.3);
        const cut = inside.filter((s) => all.some((c) => Math.abs(c - s) <= 1.5 / FPS + 0.03));
        expect(cut.length).toBeGreaterThanOrEqual(Math.ceil(0.75 * inside.length));
      }
    }
  });

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
    expect(song.beats[0]).toBeCloseTo(0.012, 2);
    const drops = song.drops.map((d) => d.t);
    expect(drops.some((t) => Math.abs(t - 71.7) < 0.05)).toBe(true);
    expect(drops.some((t) => Math.abs(t - 192.6) < 0.05)).toBe(true);
    const T = 60 / 134;
    for (const start of [4.5, 64.5, 185.5]) {
      for (const variant of [0, 1, 2]) {
        const plan = planMontage({ song, songSource: "s", songName: "comes", fromStart: false, songStart: start, scans: scans(), aspect: "9x16", length: 14, card: null, caption: null, variant });
        // Every cut on a beat, or on a hit that starts between the beats: a kick (the
        // track's two-step and broken-beat bars have theirs anywhere) or an "and" half as
        // hard as the song's hardest hits or more. (A clip re-cut on the half beat inside
        // a shot aside.)
        let between = 0;
        for (const s of plan.shots.slice(1).filter((x) => !x.again)) {
          const t = plan.music!.songStart + s.start + CUT_LEAD;
          const k = (t - song.beats[0]) / T;
          if (Math.abs(k - Math.round(k)) * T <= 1.5 / FPS) continue;
          between++;
          expect(song.accents.some((a) => (a.kick >= 0.45 || a.s >= 0.45) && Math.abs(a.t - t) <= 1.5 / FPS)).toBe(true);
        }
        expect(between).toBeLessThanOrEqual(Math.ceil(plan.shots.length / 3));
      }
    }
  });

  it("puts the grid on the beat from a Reel-length clip of it too, not on the hats", () => {
    // A Reel's sound is 15 or 30 seconds from somewhere in the song. Its grid has to
    // land where the whole song's does (the verses, the hooks, the drops; the
    // breakdown at 2:35 has too little drum to tell a beat from an "and"), and its
    // bar lines nearly always (a stretch around 1:30 leans on beat 4).
    const buf = readFileSync(resolve(FIX, "comes.f32"));
    const y = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    const T = 60 / 134;
    let bars = 0;
    let clips = 0;
    for (const len of [15, 30]) {
      for (const start of [8, 40, 64, 90, 120, 190, 215]) {
        const clip = analyzeSong(y.slice(Math.round(start * SR), Math.round((start + len) * SR)), SR);
        expect(clip.steady).toBe(true);
        expect(clip.bpm).toBeCloseTo(134, 0);
        for (const b of clip.beats.filter((t) => t > 0.5 && t < len - 0.5)) {
          const k = (b + start - 0.012) / T;
          expect(Math.abs(k - Math.round(k)) * T).toBeLessThan(0.02);
        }
        clips++;
        if (Math.round((clip.downbeats[0] + start - 0.012) / T) % 4 === 0) bars++;
      }
    }
    expect(bars).toBeGreaterThanOrEqual(clips - 2);
  });
});

describe.skipIf(!existsSync(resolve(FIX, "nio4.f32")))("nio.trade's Reel sound (nio4): a voice and finger snaps on 2 and 4", () => {
  it("hears it at 87 bpm with its hardest hits on the beats (it heard 117 before, a snap on one beat in three)", () => {
    const buf = readFileSync(resolve(FIX, "nio4.f32"));
    const song = analyzeSong(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4), SR);
    expect(song.bpm).toBeGreaterThan(84);
    expect(song.bpm).toBeLessThan(90);
    const hardest = song.accents.filter((a) => a.s >= 0.85).map((a) => a.t);
    expect(hardest.length).toBeGreaterThan(6);
    const on = hardest.filter((t) => Math.abs(nearest(song.beats, t) - t) < 0.01);
    expect(on.length).toBeGreaterThanOrEqual(0.8 * hardest.length);
  });
});

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeSong, type SongAnalysis } from "../src/engine/audio/song";
import { PROFILE_BINS, type Scan } from "../src/engine/media/scan";
import { CUT_LEAD, mulberry32, planMontage } from "../src/engine/plan/montage";
import { beatIndex, hitProfile, rhythmCuts, template } from "../src/engine/plan/rhythm";

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

/** Clips with wandering interest, for planning without real footage. */
function scans(): Scan[] {
  return Array.from({ length: 10 }, (_, j) => {
    const rand = mulberry32(300 + j);
    const n = 60;
    const f = (k: number) => new Float32Array(k);
    const stats = { t: f(n), luma: f(n), contrast: f(n), sharp: f(n), color: f(n), skin: f(n), motion: f(n), hist: f(n * 64), cols: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rows: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rgb: f(n * 3) };
    const interest = f(n);
    for (let i = 0; i < n; i++) {
      stats.t[i] = (i + 0.5) / 6;
      interest[i] = 0.4 + 0.5 * rand();
      stats.motion[i] = 0.05 + 0.2 * rand();
      stats.rgb[i * 3] = rand();
      stats.rgb[i * 3 + 1] = rand();
    }
    return { id: `c${j}`, kind: "video", start: 0, duration: 10, width: 1920, height: 1080, rate: 6, stats, cuts: [], interest } as Scan;
  });
}

describe("the cut rhythm", () => {
  // 124 bpm house: eight quiet bars (a soft kick on every beat, hats on the "and"),
  // then the drop: a hard kick on every beat, a clap on 2 and 4, a bass on every 1.
  const T = 60 / 124;
  const t0 = 0.2;
  const drop = t0 + 32 * T;
  const hits: Parameters<typeof drums>[1] = [];
  for (let k = 0; t0 + k * T < 44; k++) {
    const t = t0 + k * T;
    const after = t >= drop - 1e-6;
    hits.push({ t, hz: 55, amp: after ? 0.9 : 0.35, decay: 900 }, { t: t + T / 2, hz: 0, amp: after ? 0.35 : 0.2, decay: 120, hat: true });
    if (after && k % 2 === 1) hits.push({ t, hz: 1800, amp: 0.6, decay: 700 });
    if (after && k % 4 === 0) hits.push({ t: t + 0.004, hz: 110, amp: 0.5, decay: 3000 });
  }
  const song = analyzeSong(drums(44, hits), SR);
  const start = song.beats.find((b) => b > drop - 12 * T - 0.05)!;

  it("after the drop, cuts every two bars the same way, on the beat, never holding long; before it, every two beats", () => {
    expect(song.bpm).toBeCloseTo(124, 0);
    const cuts = rhythmCuts(song, start, 16, { dropAt: drop - start }).map((c) => ({ ...c, t: c.t + start }));
    const k = (t: number) => beatIndex(song, t);
    const D = Math.round(k(drop));
    // The drop is a cut; every plain cut is on a beat.
    expect(cuts.some((c) => Math.abs(c.t - drop) < 0.02)).toBe(true);
    for (const c of cuts.filter((x) => !x.again)) expect(Math.abs(k(c.t) - Math.round(k(c.t)))).toBeLessThan(0.03);
    // Before the drop: every two beats, counted from it.
    const before = cuts.filter((c) => c.t < drop - 0.05).map((c) => Math.round(k(c.t)));
    expect(before.length).toBeGreaterThanOrEqual(4);
    for (const b of before) expect((D - b) % 2).toBe(0);
    // After it: the same beats of every two bars, and no shot longer than a second and a half.
    const cycle = (c: number) => cuts.filter((x) => !x.again && k(x.t) >= D + 8 * c - 0.1 && k(x.t) < D + 8 * c + 8 - 0.1).map((x) => Math.round(k(x.t)) - D - 8 * c);
    expect(cycle(1)).toEqual(cycle(0));
    const after = [drop, ...cuts.filter((c) => c.t > drop + 0.05).map((c) => c.t), start + 16];
    for (let i = 1; i < after.length; i++) expect(after[i] - after[i - 1]).toBeLessThanOrEqual(1.5);
  });

  it("follows the song's own hits: a beat with nothing on it is passed over", () => {
    // Two bars at 148 bpm hitting beats 1, 2, 3, 5 and 6 of every eight, and nothing
    // else: mico's song, whose editor cut it 1, 1, 2, 1, 3 beats.
    const profile = new Float64Array(32);
    for (const b of [0, 1, 2, 4, 5]) profile[4 * b] = b === 0 || b === 4 ? 1 : 0.6;
    const P = 60 / 148;
    expect(template(profile, P / 4, 0.45, 0.3, Math.max(1.5, 2 * P))).toEqual([0, 4, 8, 16, 20]);
    // A four-on-the-floor gets every beat.
    const four = new Float64Array(32);
    for (let b = 0; b < 8; b++) four[4 * b] = b % 2 ? 0.7 : 1;
    expect(template(four, P / 4, 0.45, 0.3, 1.5)).toEqual([0, 4, 8, 12, 16, 20, 24, 28]);
  });

  it("re-cuts one clip on the half beat at the end of four bars: the same clip, a jump further on, punched in", () => {
    const plan = planMontage({ song, songSource: "s", songName: "house", fromStart: false, songStart: start, scans: scans(), aspect: "9x16", length: 24, card: null, caption: null, variant: 0 });
    const again = plan.shots.map((s, i) => [s, i] as const).filter(([s]) => s.again);
    expect(again.length).toBeGreaterThan(0);
    for (const [s, i] of again) {
      const prev = plan.shots[i - 1];
      expect(s.source).toBe(prev.source);
      expect(s.srcStart).toBeGreaterThan(prev.srcStart + (prev.end - prev.start) - 1e-6);
      expect(s.crop.zoom0).toBeGreaterThan(prev.crop.zoom0);
    }
    // None on a half beat that has only a hat on it: a re-cut is on a hit.
    for (const [sh] of again) {
      const k = beatIndex(song, plan.music!.songStart + sh.start + CUT_LEAD);
      expect(Math.abs(k - Math.round(k))).toBeLessThan(0.05);
    }
  });

  it("where the song hits the half beat (a clap into the next bar), re-cuts the last beat of four bars on it", () => {
    // The same groove with a clap on the "and" of every bar's fourth beat.
    const pickup = analyzeSong(drums(44, [...hits, ...hits.filter((h) => h.hz === 55 && h.t >= drop - 1e-6 && Math.round((h.t - t0) / T) % 4 === 3).map((h) => ({ t: h.t + T / 2, hz: 1800, amp: 0.6, decay: 700 }))]), SR);
    const recut = (sg: typeof song) => {
      const from = sg.beats.find((b) => b > drop - 12 * T - 0.05)!;
      const phrase = drop + 16 * T - from;
      return rhythmCuts(sg, from, 24, { dropAt: drop - from, hits: "beat", stutter: true, carry: 0 }).some((c) => c.again && Math.abs(c.t - (phrase - T / 2)) < 0.05);
    };
    expect(recut(pickup)).toBe(true);
    // Only a hat there: no re-cut.
    expect(recut(song)).toBe(false);
  });
});

describe("an intro of stabs out of silence, then the groove", () => {
  // 124 bpm: six stabs in the first two bars (a chord over a low hit, on beats 0, 1.5,
  // 2.5, 4, 5 and 6.5) and nothing else, then the drop on beat 8: a kick on every beat,
  // a clap on 2 and 4, a hat on every "and", a bass note ringing on every beat. The user's edit held two beats a shot over
  // stabs like these, and cut on none of them.
  const T = 60 / 124;
  const t0 = 0.3;
  const stabs = [0, 1.5, 2.5, 4, 5, 6.5].map((b) => t0 + b * T);
  const drop = t0 + 8 * T;
  const y = new Float32Array(Math.round(24 * SR));
  const partials = [6300, 7100, 8200, 9400, 10300];
  // (Each hit dies away to nothing: a tone cut off mid-ring clicks, and a click is a hit.)
  const hit = (t: number, amp: number, decay: number, hz: number | "hat") => {
    const s0 = Math.round(t * SR);
    const len = Math.round(7 * decay);
    for (let i = 0; i < len && s0 + i < y.length; i++) {
      const v = hz === "hat" ? partials.reduce((a, f, k) => a + Math.sin((2 * Math.PI * f * i) / SR + k), 0) / partials.length : Math.sin((2 * Math.PI * hz * i) / SR);
      y[s0 + i] += amp * Math.min(1, i / 20) * Math.exp(-i / decay) * v;
    }
  };
  stabs.forEach((t, i) => {
    hit(t, 0.8, 1000, 60);
    for (const hz of i % 2 ? [220, 262, 330] : [262, 330, 392]) hit(t, 0.35, 1500, hz);
  });
  for (let k = 8; t0 + k * T < 23.5; k++) {
    const t = t0 + k * T;
    hit(t, 0.8, 900, 55);
    hit(t + T / 2, 0.3, 120, "hat");
    if (k % 2) hit(t, 0.55, 700, 1800);
    hit(t + 0.004, 0.45, 6000, 110);
  }
  const song = analyzeSong(y, SR);
  const near = (xs: number[], t: number) => Math.min(...xs.map((x) => Math.abs(x - t)));

  it("cuts on every stab and nothing between them, whatever the pace, and on the drop", () => {
    expect(song.bpm).toBeCloseTo(124, 0);
    for (const hits of ["hard", "beat", "relaxed"] as const) {
      const cuts = rhythmCuts(song, 0, 12, { dropAt: drop, hits, push: hits === "hard" }).map((c) => c.t);
      for (const s of stabs.slice(1)) expect(near(cuts, s)).toBeLessThan(0.03);
      expect(near(cuts, drop)).toBeLessThan(0.03);
      for (const c of cuts.filter((c) => c < drop - 0.05)) expect(near(stabs, c)).toBeLessThan(0.03);
    }
  });

  it("in every style, at every pace, no cut where the song plays nothing: re-cuts (the fast re-cuts' too) only on a hit", () => {
    // (Heard: a hit within a frame and a half, as loud as half the hits around it.)
    const heard = (t: number) => song.accents.some((a) => Math.abs(a.t - t) <= 0.045 + 0.5 / 30 && a.s >= 0.05 && (a.ls ?? a.s) >= 0.5);
    for (const style of ["beat", "recut", "mono", "burst", "slow", "talk"] as const) {
      for (const pace of ["hard", "beat", "relaxed"] as const) {
        for (const variant of [0, 1]) {
          const plan = planMontage({ song, songSource: "s", songName: "stabs", fromStart: true, songStart: 0, scans: scans(), aspect: "9x16", length: 12, card: null, caption: null, variant, pace, style });
          // (A photo burst's pictures fly in on the sixteenths from a hit: a flurry, not cuts.)
          const cuts = plan.shots.slice(1).filter((s, i) => !s.crop.tilt || !plan.shots[i].crop.tilt);
          for (const s of cuts) expect(heard(s.start + CUT_LEAD), `${style} ${pace} v${variant}: a cut at ${s.start.toFixed(3)}`).toBe(true);
          // And before the drop, on the stabs alone.
          for (const s of cuts.filter((s) => s.start + CUT_LEAD < drop - 0.05)) expect(near(stabs, s.start + CUT_LEAD)).toBeLessThan(0.03);
        }
      }
    }
  });

  it("after the drop: on the beat, never on a hat, relaxed holding longer", () => {
    const shots = { hard: 0, beat: 0, relaxed: 0 };
    for (const pace of ["hard", "beat", "relaxed"] as const) {
      const plan = planMontage({ song, songSource: "s", songName: "stabs", fromStart: true, songStart: 0, scans: scans(), aspect: "9x16", length: 12, card: null, caption: null, variant: 0, pace });
      const cuts = plan.shots.slice(1).map((s) => ({ t: s.start + CUT_LEAD, again: s.again }));
      expect(plan.checks?.drop).toBeCloseTo(drop - CUT_LEAD, 1);
      for (const c of cuts.filter((c) => c.t > drop + 0.05)) {
        const k = beatIndex(song, c.t);
        expect(Math.abs(k - Math.round(k))).toBeLessThan(0.05);
      }
      shots[pace] = plan.shots.filter((s) => s.start + CUT_LEAD > drop - 0.05).length;
    }
    // (A hat on every "and" and nothing else between the beats: hard cuts the beats as
    // steady does, no faster.)
    expect(shots.hard).toBeGreaterThanOrEqual(shots.beat);
    expect(shots.beat).toBeGreaterThan(shots.relaxed);
  });
});

describe("cuts only where the song plays something", () => {
  // The song of a user's edit at 111 bpm, as the analysis hears it: two bars of pads with
  // a note on the second bar line, the song gone for a beat, a faint lead-in and then a
  // switch sound half a beat after the bar it comes back on, the drop a bar and a half
  // later, then a kick or snare on every beat and a hat on every "and".
  const T = 60 / 111;
  const at = (k: number) => 0.33 + k * T;
  const beats = Array.from({ length: 30 }, (_, k) => at(k));
  const acc = (k: number, s: number, kick: number, mid: number, ls = 1, pop = 8) => ({ t: at(k), beat: k, s, ls, pop, low: kick >= 0.5 ? 2 : 0.3, kick, mid });
  const accents = [acc(-0.1, 0.49, 0.6, 0.76, 1, 3.5), acc(1.58, 0.37, 0.36, 0.54, 1, 2.5), acc(1.84, 0.41, 0.27, 0.41, 1, 2.9), acc(2.87, 0.27, 0.13, 0.48, 0.66, 2.1), acc(5.23, 0.34, 0.11, 0.16, 0.83, 2.7), acc(5.46, 0.49, 0.61, 0.82, 1, 4), acc(5.8, 0.41, 0.57, 0.36, 1, 3.3)];
  for (let k = 7; k < 30; k++) accents.push(acc(k, k % 4 === 0 ? 0.9 : 0.6, k % 2 ? 0.2 : 0.7, 0.75, 1, 6), acc(k + 0.5, 0.35, 0.08, 0.35, 0.8, 4));
  const song = { period: T, beats, downbeats: beats.filter((_, k) => k % 4 === 3), accents, duration: at(29), structure: { bars: [], sections: [], phrases: [], breaks: [[at(4), at(5)]] } } as unknown as SongAnalysis;
  const drop = at(7);
  const near = (xs: number[], t: number) => Math.min(...xs.map((x) => Math.abs(x - t)));

  it("before the drop, a cut only on a hit or a bar line, and on the switch sound after the song drops out", () => {
    for (const hits of ["beat", "hard", "relaxed"] as const) {
      const cuts = rhythmCuts(song, 0, 12, { dropAt: drop, hits, push: hits === "hard" }).map((c) => c.t);
      for (const c of cuts.filter((c) => c < drop - 0.05)) expect(Math.min(near(accents.map((a) => a.t), c), near(song.downbeats, c) + 0.04)).toBeLessThan(0.071);
      expect(cuts.some((c) => c > at(4) + 0.05 && c < at(5) - 0.05)).toBe(false);
      expect(near(cuts, at(5.46))).toBeLessThan(0.02);
      expect(near(cuts, drop)).toBeLessThan(0.02);
    }
  });

  it("after it, on the beats' hits and never on the hats between them, however hard it cuts", () => {
    for (const hits of ["beat", "hard", "relaxed"] as const) {
      const cuts = rhythmCuts(song, 0, 12, { dropAt: drop, hits, push: hits === "hard", stutter: "often", carry: 0 });
      for (const c of cuts.filter((c) => c.t > drop + 0.05)) {
        const k = beatIndex(song, c.t);
        expect(Math.abs(k - Math.round(k)), `${hits} ${c.t.toFixed(3)}${c.again ? "*" : ""}`).toBeLessThan(0.05);
      }
    }
  });
});

const FIX = resolve(import.meta.dirname, "fixtures");

describe.skipIf(!existsSync(resolve(FIX, "mico.f32")))("mico's Reel", () => {
  it("gets the editor's own pattern from the song: 1, 1, 2, 1, 3 beats after the drop", () => {
    const buf = readFileSync(resolve(FIX, "mico.f32"));
    const song = analyzeSong(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4), SR);
    const drop = song.drops[0].t;
    const shape = template(hitProfile(song, Math.round(beatIndex(song, drop))), song.period / 4, 0.45, 0.3, Math.max(1.5, 2 * song.period));
    expect(shape).toEqual([0, 4, 8, 16, 20]);
  });
});

describe.skipIf(!existsSync(resolve(FIX, "n0002.f32")))("nio.trade's …0002 sound: stabs out of silence, then the groove at 156 bpm", () => {
  it("every style cuts the intro on its stabs alone, and nothing anywhere where the song plays nothing (a user's fast cut re-cut between the stabs)", () => {
    const buf = readFileSync(resolve(FIX, "n0002.f32"));
    const song = analyzeSong(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4), SR);
    const stabs = song.accents.filter((a) => a.s >= 0.9 && a.t < 3).map((a) => a.t);
    expect(stabs.length).toBeGreaterThanOrEqual(5);
    const heard = (t: number) => song.accents.some((a) => Math.abs(a.t - t) <= 0.045 + 0.5 / 30 && a.s >= 0.05 && (a.ls ?? a.s) >= 0.5);
    for (const style of ["beat", "recut", "mono", "burst", "slow"] as const) {
      for (const pace of ["hard", "beat"] as const) {
        const plan = planMontage({ song, songSource: "s", songName: "n0002", fromStart: true, songStart: 0, scans: scans(), aspect: "9x16", length: 10.7, card: null, caption: null, variant: 0, pace, style });
        const cuts = plan.shots.slice(1).filter((s, i) => !s.crop.tilt || !plan.shots[i].crop.tilt);
        for (const s of cuts) expect(heard(s.start + CUT_LEAD), `${style} ${pace}: a cut at ${s.start.toFixed(3)}`).toBe(true);
        for (const s of cuts.filter((s) => s.start + CUT_LEAD < 2.9)) expect(Math.min(...stabs.map((t) => Math.abs(t - s.start - CUT_LEAD)))).toBeLessThan(0.03);
      }
    }
  });
});

describe.skipIf(!existsSync(resolve(FIX, "nio3.f32")))("nio.trade's lyric montage", () => {
  it("is heard at 155 bpm, where its editor cut, not at 103 (its kick keeps a 3-3-2)", () => {
    const buf = readFileSync(resolve(FIX, "nio3.f32"));
    const song = analyzeSong(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4), SR);
    expect(song.steady).toBe(true);
    expect(song.bpm).toBeGreaterThan(154);
    expect(song.bpm).toBeLessThan(157);
  });
});

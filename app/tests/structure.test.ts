import { describe, expect, it } from "vitest";
import { analyzeSong, withVocals } from "../src/engine/audio/song";
import { songStructure } from "../src/engine/audio/structure";
import { planCuts } from "../src/engine/plan/montage";
import { rate } from "../src/engine/vision/sense";

describe("the shape of a song", () => {
  // Per beat, 4/4 at 120 bpm: eight bars of verse (kick and hats), the song dropping out
  // for the last two beats of bar 8, then eight bars of chorus (the full kit, louder).
  const beats = Array.from({ length: 64 }, (_, i) => i * 0.5);
  const beatInBar = beats.map((_, i) => i % 4);
  const gap = (i: number) => i === 30 || i === 31;
  const chorus = (i: number) => i >= 32;
  const inp = {
    beats,
    beatInBar,
    beatLoudness: beats.map((_, i) => (gap(i) ? 0.04 : chorus(i) ? 0.9 : 0.5)),
    beatKick: beats.map((_, i) => (gap(i) ? 0 : chorus(i) ? 1 : 0.6)),
    beatSnare: beats.map((_, i) => (gap(i) ? 0 : chorus(i) && i % 2 ? 0.9 : 0.05)),
    beatHats: beats.map((_, i) => (gap(i) ? 0 : chorus(i) ? 0.9 : 0.4)),
    beatVocal: beats.map((_, i) => (i >= 4 && i < 28 ? 1 : 0)),
  };

  it("finds the break, the section it opens and the phrases", () => {
    const st = songStructure(inp);
    expect(st.bars).toHaveLength(16);
    expect(st.breaks).toEqual([[15, 16]]);
    // The chorus opens on the bar line after the break, strongly.
    const chorusStart = st.sections.find((s) => s.t === 16);
    expect(chorusStart).toBeDefined();
    expect(chorusStart!.strength).toBeGreaterThanOrEqual(0.8);
    // Nothing else inside the verse or the chorus counts as a new section.
    expect(st.sections.filter((s) => s.t > 2 && s.t < 30 && s.t !== 16)).toEqual([]);
    // Phrases of four bars from the top and from the chorus.
    expect(st.phrases).toEqual(expect.arrayContaining([0, 8, 16, 24]));
    // The chorus bars hit harder than the verse; the verse carries the singing.
    expect(st.bars[10].energy).toBeGreaterThan(st.bars[2].energy + 0.2);
    expect(st.bars[3].vocal).toBe(1);
    expect(st.bars[12].vocal).toBe(0);
  });

  it("a fade or a quiet intro isn't a break", () => {
    const loud = beats.map((_, i) => (i < 8 ? 0.05 + 0.02 * (i % 2) : i > 56 ? Math.max(0.02, 0.9 - 0.12 * (i - 56)) : 0.8));
    const st = songStructure({ ...inp, beatLoudness: loud });
    expect(st.breaks).toEqual([]);
  });
});

describe("cutting to the song's shape", () => {
  // 40 s of garage at 128 bpm: a kick on 1 and 3 (harder on 1), a clap on 2 and 4, hats
  // on every "and", a bass note that changes every bar; the whole song stops for the
  // last two beats of bar 8, and comes back on bar 9 with a bass stab on every beat.
  const SR = 22050;
  const T = 60 / 128;
  const y = new Float32Array(SR * 40);
  const partials = [6300, 7100, 8200, 9400, 10300];
  const hit = (t: number, hz: number, amp: number, decay: number, hat = false) => {
    const s0 = Math.round(t * SR);
    for (let i = 0; i < 4000 && s0 + i < y.length; i++) {
      const tone = hat ? partials.reduce((a, f, k) => a + Math.sin((2 * Math.PI * f * i) / SR + k), 0) / partials.length : Math.sin((2 * Math.PI * hz * i) / SR);
      y[s0 + i] += amp * Math.exp(-i / decay) * tone;
    }
  };
  for (let k = 0; 0.1 + k * T < 39.5; k++) {
    if (k === 30 || k === 31) continue;
    const t = 0.1 + k * T;
    if (k % 2 === 0) hit(t, 55, k % 4 === 0 ? 0.9 : 0.6, 900);
    else hit(t, 1800, 0.5, 800);
    if (k % 4 === 0) hit(t + 0.01, [98, 110, 131, 147][(k / 4) % 4], 0.3, 6000);
    hit(t + T / 2, 0, 0.4, 120, true);
    if (k >= 32) hit(t, 110, 0.6, 2500);
  }
  const song = analyzeSong(y, SR);
  const gapStart = 0.1 + 30 * T;
  const back = 0.1 + 32 * T;

  it("hears the break", () => {
    expect(song.bpm).toBeCloseTo(128, 0);
    expect(song.structure!.breaks.some(([a, b]) => Math.abs(a - gapStart) < 0.1 && Math.abs(b - back) < 0.1)).toBe(true);
  });

  it("holds through the silence and cuts on the return", () => {
    const start = song.beats.find((b) => b > 8)!;
    const cuts = planCuts(song, start, 22 - start);
    const [s0, s1] = song.structure!.breaks.find(([a]) => Math.abs(a - gapStart) < 0.1)!;
    // No cut in the silence (song time = start + edit time).
    for (const c of cuts) expect(c + start > s0 + 0.05 && c + start < s1 - 0.05).toBe(false);
    // The shot after it starts on the beat the song comes back on, the bar line of the
    // new section.
    expect(cuts.some((c) => Math.abs(c + start - s1) < 0.06)).toBe(true);
    expect(song.structure!.sections.some((sec) => Math.abs(sec.t - s1) < 0.06)).toBe(true);
  });

  it("builds into a break before the drop: shorter and shorter, then one shot held through the silence", () => {
    const [s0, s1] = song.structure!.breaks.find(([a]) => Math.abs(a - gapStart) < 0.1)!;
    const start = song.downbeats.find((d) => d > s0 - 12)!;
    const drop = s1 - start;
    const cuts = planCuts(song, start, drop + 6, { dropAt: drop });
    const T = song.period;
    // The last bar before the song drops out: a cut on every beat of it.
    const lastBar = cuts.filter((c) => c + start > s0 - 4 * T - 0.1 && c + start < s0 - 0.05);
    expect(lastBar.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < lastBar.length; i++) expect(lastBar[i] - lastBar[i - 1]).toBeLessThan(1.1 * T);
    // The bar before that: slower (two beats a shot).
    const barBefore = cuts.filter((c) => c + start > s0 - 8 * T - 0.1 && c + start < s0 - 4 * T - 0.1);
    for (let i = 1; i < barBefore.length; i++) expect(barBefore[i] - barBefore[i - 1]).toBeGreaterThan(1.5 * T);
    // Nothing cuts in the silence, and the drop lands on the return.
    expect(cuts.some((c) => c + start > s0 + 0.05 && c + start < s1 - 0.05)).toBe(false);
    expect(cuts.some((c) => Math.abs(c - drop) < 0.06)).toBe(true);
  });

  it("gives a sung verse room: two beats or more a shot while the voice carries sparse drums", () => {
    // Singing over the verse, as the vocal model would report it.
    const fps = song.sr / song.hop;
    const frames = Math.ceil(song.duration * fps);
    const active = new Uint8Array(frames);
    for (let f = 0; f < frames; f++) active[f] = f / fps > 1 && f / fps < 14 ? 1 : 0;
    const sung = withVocals(song, { ratio: new Float32Array(frames), active, lines: [1.1, 4.9, 8.6], syllables: [] });
    const start = song.beats.find((b) => b > 1)!;
    const end = song.beats.find((b) => b > 13)! - start;
    const cuts = [0, ...planCuts(sung, start, end), end];
    const lens = cuts.slice(1).map((c, i) => c - cuts[i]);
    // (A soft rule: a line landing mid-bar can still take a one-beat shot before it.)
    expect(lens.filter((l) => l < 2 * song.period - 0.06).length).toBeLessThanOrEqual(1);
  });
});

describe("a broken beat after the drop", () => {
  // 134 bpm: eight quiet bars of garage (a kick on 1 and 3, a clap on 2 and 4, hats on
  // the "and"), then a loud drop whose kicks, with a bass under them, land between the
  // beats as much as on them (1, the "a" of 1, 3, the "and" of 3, the "e" of 4), a clap
  // on the "and" of 2, and nothing at all on beats 2 and 4.
  const SR = 22050;
  const T = 60 / 134;
  const y = new Float32Array(SR * 40);
  const partials = [6300, 7100, 8200, 9400, 10300];
  const hit = (t: number, hz: number, amp: number, decay: number, hat = false) => {
    const s0 = Math.round(t * SR);
    for (let i = 0; i < 4000 && s0 + i < y.length; i++) {
      const tone = hat ? partials.reduce((a, f, k) => a + Math.sin((2 * Math.PI * f * i) / SR + k), 0) / partials.length : Math.sin((2 * Math.PI * hz * i) / SR);
      y[s0 + i] += amp * Math.exp(-i / decay) * tone;
    }
  };
  const t0 = 0.1;
  const drop = t0 + 32 * T;
  const kicks: number[] = [];
  for (let k = 0; t0 + k * T < 39.5; k++) {
    const t = t0 + k * T;
    if (t < drop - 1e-6) {
      if (k % 2 === 0) hit(t, 55, 0.35, 900);
      else hit(t, 1800, 0.25, 800);
      hit(t + T / 2, 0, 0.2, 120, true);
    } else if (k % 4 === 0) {
      for (const step of [0, 3, 8, 10, 13]) {
        const at = t + (step * T) / 4;
        hit(at, 55, 0.9, 900);
        hit(at + 0.005, 110, 0.5, 2500);
        kicks.push(at);
      }
      hit(t + (6 * T) / 4, 1800, 0.6, 800);
      for (let q = 0; q < 8; q++) hit(t + (q * T) / 2 + T / 4, 0, 0.25, 120, true);
    }
  }
  const song = analyzeSong(y, SR);

  it("cuts on the kicks wherever they land, at the drop's pace, with the drop's own shot held", () => {
    expect(song.bpm).toBeCloseTo(134, 0);
    const start = song.beats.find((b) => b > 2.5)!;
    const cuts = planCuts(song, start, 16, { dropAt: drop - start }).map((c) => c + start);
    expect(cuts.some((c) => Math.abs(c - drop) < 0.03)).toBe(true);
    const after = cuts.filter((c) => c > drop + 0.03);
    expect(after.length).toBeGreaterThanOrEqual(5);
    // Every cut after the drop on a kick (never on an empty beat), some of them between the beats.
    for (const c of after) expect(Math.min(...kicks.map((k) => Math.abs(k - c)))).toBeLessThan(0.02);
    const between = after.filter((c) => {
      const k = (c - t0) / T;
      return Math.abs(k - Math.round(k)) > 0.15;
    });
    expect(between.length).toBeGreaterThanOrEqual(2);
    // The drop's shot holds for a beat at least; the rest go at about a beat and a bit.
    expect(after[0] - drop).toBeGreaterThan(0.95 * T);
    const lens = after.slice(1).map((c, i) => c - after[i]).sort((a, b) => a - b);
    expect(lens[lens.length >> 1]).toBeLessThanOrEqual(1.55 * T);
  });
});

describe("the picture model's judgement", () => {
  // A toy text space: three descriptions along three axes, and wow poles on a fourth.
  const axis = (k: number) => Array.from({ length: 8 }, (_, d) => (d === k ? 1 : 0));
  const text = {
    classes: [
      { kind: "car" as const, flex: 9, emb: axis(0) },
      { kind: "talking" as const, flex: 1, emb: axis(1) },
      { kind: "jet" as const, flex: 10, emb: axis(2) },
    ],
    wow: [axis(3), axis(4)] as [number[], number[]],
  };
  const unit = (v: number[]) => {
    const full = Array.from({ length: 8 }, (_, d) => v[d] ?? 0);
    const n = Math.hypot(...full);
    return full.map((x) => x / n);
  };

  it("names what a frame shows and how much it flexes", () => {
    const car = rate(unit([0.3, 0.1, 0, 0.1, 0]), text);
    expect(car.kind).toBe("car");
    expect(car.flex).toBeGreaterThan(8);
    const talk = rate(unit([0.1, 0.3, 0, 0, 0.1]), text);
    expect(talk.kind).toBe("talking");
    expect(talk.flex).toBeLessThan(2);
    // Striking pictures sit nearer the "stunning" pole than the "dull" one.
    expect(car.wow).toBeGreaterThan(5);
    expect(talk.wow).toBeLessThan(5);
  });

  it("blends the flex of near-equal readings", () => {
    const both = rate(unit([0.2, 0.2, 0, 0, 0]), text);
    expect(both.flex).toBeGreaterThan(3);
    expect(both.flex).toBeLessThan(7);
  });
});

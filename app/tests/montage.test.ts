import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeSong, type SongAnalysis } from "../src/engine/audio/song";
import { PROFILE_BINS, type Scan } from "../src/engine/media/scan";
import { CUT_LEAD, mulberry32, planMontage, spread, usedRanges, type Ranges } from "../src/engine/plan/montage";
import { planMeme, planTwist } from "../src/engine/plan/formats";
import { FPS, outputAt, sourceAt, sourceSpan, type CardSpec } from "../src/engine/plan/types";

/** A stand-in for a scanned clip: interest and motion that wander, one colour cast. */
function fakeScan(id: string, duration: number, seed: number, kind: "video" | "image" = "video"): Scan {
  const rand = mulberry32(seed);
  const rate = kind === "video" ? 6 : 0;
  const n = kind === "video" ? Math.floor(duration * rate) : 1;
  const base = [rand(), rand(), rand()];
  const f = (k: number) => new Float32Array(k);
  const stats = {
    t: f(n), luma: f(n), contrast: f(n), sharp: f(n), color: f(n), skin: f(n), motion: f(n),
    hist: f(n * 64), cols: f(n * PROFILE_BINS), rows: f(n * PROFILE_BINS), rgb: f(n * 3),
  };
  const interest = f(n);
  let phase = rand() * 6;
  for (let i = 0; i < n; i++) {
    stats.t[i] = kind === "video" ? (i + 0.5) / rate : 0;
    phase += 0.2;
    interest[i] = 0.4 + 0.3 * Math.sin(phase) * rand() + 0.2 * rand();
    stats.motion[i] = 0.05 + 0.2 * rand();
    for (let c = 0; c < 3; c++) stats.rgb[i * 3 + c] = base[c];
    for (let k = 0; k < PROFILE_BINS; k++) {
      stats.cols[i * PROFILE_BINS + k] = 1 / PROFILE_BINS;
      stats.rows[i * PROFILE_BINS + k] = 1 / PROFILE_BINS;
    }
  }
  return { id, kind, start: 0, duration, width: 1920, height: 1080, rate, stats, cuts: [], interest };
}

const FIX = resolve(import.meta.dirname, "fixtures");
const songs = ["mico", "nio4", "nio1"].filter((s) => existsSync(resolve(FIX, `${s}.f32`)));
const card: CardSpec = { kind: "laptop", top: "start free", bottom: "namzilabs.co", accent: "#568CFF", hold: 4, draw: false };

function load(name: string): SongAnalysis {
  const buf = readFileSync(resolve(FIX, `${name}.f32`));
  return analyzeSong(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
}

describe.skipIf(!songs.length).each(songs)("montage on %s", (name) => {
  const song = load(name);
  const scans = Array.from({ length: 8 }, (_, i) => fakeScan(`clip${i}`, 4 + i * 1.5, 100 + i));
  scans.push(fakeScan("photo", 0, 7, "image"));

  it("cuts on the music, keeps shots in range, ends on the card", () => {
    const len = Math.min(14, song.duration - 4.5);
    const plan = planMontage({ song, songSource: "song", songName: name, fromStart: true, scans, aspect: "9x16", length: len, card, caption: { style: "mood", text: "Peak life." }, variant: 0 });
    const shots = plan.shots;
    expect(shots.length).toBeGreaterThan(5);
    expect(shots[0].start).toBe(0);
    for (let i = 0; i < shots.length; i++) {
      const d = shots[i].end - shots[i].start;
      expect(d).toBeGreaterThanOrEqual(0.3 - 1e-6);
      expect(d).toBeLessThanOrEqual(2.1 + 1 / FPS);
      if (i) expect(shots[i].start).toBeCloseTo(shots[i - 1].end, 6);
    }
    // Every cut sits within a frame of a beat or an accent, less the lead.
    const marks = [...song.beats, ...song.accents.map((a) => a.t)];
    for (const s of shots.slice(1)) {
      const off = Math.min(...marks.map((m) => Math.abs(m - CUT_LEAD - s.start)));
      expect(off).toBeLessThanOrEqual(1 / FPS);
    }
    expect(plan.card!.start).toBeCloseTo(shots[shots.length - 1].end, 6);
    expect(plan.duration).toBeCloseTo(plan.card!.start + 4, 1);
    // Enough footage: no stretch of a clip is used twice.
    const ranges = usedRanges(plan);
    for (const [, rs] of ranges) {
      const sorted = [...rs].sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i][0]).toBeGreaterThanOrEqual(sorted[i - 1][1] - 1e-6);
    }
    // Neighbours come from different clips.
    for (let i = 1; i < shots.length; i++) expect(shots[i].source).not.toBe(shots[i - 1].source);
  });

  it("variants differ", () => {
    const len = Math.min(14, song.duration - 4.5);
    const a = planMontage({ song, songSource: "song", songName: name, fromStart: true, scans, aspect: "9x16", length: len, card, caption: null, variant: 0 });
    const b = planMontage({ song, songSource: "song", songName: name, fromStart: true, scans, aspect: "4x3", length: len, card, caption: null, variant: 1, avoid: usedRanges(a) });
    const sig = (p: typeof a) => p.shots.map((s) => `${s.source}@${s.srcStart.toFixed(1)}`).join();
    expect(sig(a)).not.toBe(sig(b));
  });
});

describe.skipIf(!songs.length)("twist and meme", () => {
  let song: SongAnalysis;
  // Loaded when the suite runs, not when it's collected: CI has no fixtures.
  beforeAll(() => {
    song = load(songs.find((s) => s !== "mico") ?? songs[0]);
  });
  const scans = Array.from({ length: 6 }, (_, i) => fakeScan(`clip${i}`, 5 + i, 300 + i));
  scans.push(fakeScan("desk", 12, 999));

  it("twist: flex montage, a flip on a downbeat, one long shot of the other side", () => {
    const len = Math.min(18, song.duration - 4.5);
    const plan = planTwist({ song, songSource: "song", songName: "x", fromStart: true, scans, aspect: "9x16", length: len, card, variant: 0, actB: new Set(["desk"]), captionA: "what they see vs...", captionB: "what they don't..." });
    const sw = plan.checks!.switchAt as number;
    const after = plan.shots.filter((s) => s.start >= sw - 1e-6);
    expect(after.length).toBeGreaterThanOrEqual(1);
    expect(after.every((s) => s.source === "desk")).toBe(true);
    expect(plan.shots.filter((s) => s.start < sw - 1e-6).every((s) => s.source !== "desk")).toBe(true);
    expect(plan.captions.map((c) => c.text)).toEqual(["what they see vs...", "what they don't..."]);
    expect(plan.captions[1].start).toBeCloseTo(sw, 6);
    const marks = [...song.beats];
    expect(Math.min(...marks.map((m) => Math.abs(m - CUT_LEAD - sw)))).toBeLessThanOrEqual(1 / FPS);
  });

  it("meme: one held clip, faded up, text over it", () => {
    const plan = planMeme({ song, songSource: "song", songName: "x", fromStart: true, scans, aspect: "1x1", length: 9, card, variant: 0, text: "It's rare, but some people truly want to see you win", position: "centre" });
    expect(plan.shots.length).toBe(1);
    expect(plan.fx.some((f) => f.kind === "fadein")).toBe(true);
    expect(plan.captions[0].y).toBe(0.5);
    expect(plan.width).toBe(1080);
    expect(plan.height).toBe(1080);
  });

  it("meme without a song", () => {
    const plan = planMeme({ fromStart: true, scans, aspect: "9x16", length: 9, card, variant: 1, text: "hi", position: "upper" });
    expect(plan.music).toBeUndefined();
    expect(plan.duration).toBeCloseTo(13, 1);
  });
});

describe("planners on a synthetic song (runs everywhere)", () => {
  // 24 s at 128 bpm: quiet hats for 8 s, then kicks and claps come in (the drop).
  const SR = 22050;
  const y = new Float32Array(SR * 24);
  const period = 60 / 128;
  const hit = (t: number, amp: number, hz: number, decay: number) => {
    const s0 = Math.round(t * SR);
    for (let i = 0; i < 3000 && s0 + i < y.length; i++) y[s0 + i] += amp * Math.exp(-i / decay) * Math.sin((2 * Math.PI * hz * i) / SR);
  };
  for (let b = 0; b * period < 23.5; b++) {
    const t = 0.1 + b * period;
    hit(t, 0.08, 6000, 60);
    if (t > 8) {
      hit(t, b % 4 === 0 ? 0.9 : 0.6, 60, 900);
      if (b % 2 === 1) hit(t, 0.4, 1800, 250);
    }
  }
  const song = analyzeSong(y, SR);
  const scans = Array.from({ length: 7 }, (_, i) => fakeScan(`clip${i}`, 5 + i, 700 + i));

  it("hears the tempo and the drop", () => {
    expect(song.bpm).toBeGreaterThan(120);
    expect(song.bpm).toBeLessThan(136);
    expect(song.drops.some((d) => Math.abs(d.t - 8.1) < 1)).toBe(true);
  });

  it("montage: cuts on beats, a flourish on the drop, the card on a beat", () => {
    const plan = planMontage({ song, songSource: "song", songName: "click", fromStart: false, scans, aspect: "9x16", length: 12, card, caption: { style: "mood", text: "Peak life." }, variant: 0 });
    for (const s of plan.shots.slice(1)) {
      const off = Math.min(...song.beats.map((b) => Math.abs(b - plan.music!.songStart - CUT_LEAD - s.start)));
      expect(off).toBeLessThanOrEqual(1.5 / FPS);
    }
    expect(plan.shots.some((s) => s.role === "drop")).toBe(true);
    expect(plan.fx.some((f) => f.kind === "flash")).toBe(true);
    expect(plan.card!.end - plan.card!.start).toBeCloseTo(4, 1);
  });

  it("starts where the user picked, and says so in the post note", () => {
    const at = song.downbeats.find((d) => d > 6)!;
    const fromReel = planMontage({ song, songSource: "song", songName: "click", fromStart: true, songStart: at, scans, aspect: "9x16", length: 8, card, caption: null, variant: 0 });
    expect(fromReel.music!.songStart).toBeCloseTo(at, 6);
    expect(fromReel.note.sound).toContain(`start at 0:${String(Math.floor(at)).padStart(2, "0")}`);
    // Cuts still land on the beats from there.
    for (const s of fromReel.shots.slice(1)) {
      const off = Math.min(...song.beats.map((b) => Math.abs(b - at - CUT_LEAD - s.start)));
      expect(off).toBeLessThanOrEqual(1.5 / FPS);
    }
    const auto = planMontage({ song, songSource: "song", songName: "click", fromStart: true, scans, aspect: "9x16", length: 8, card, caption: null, variant: 0 });
    expect(auto.music!.songStart).toBe(0);
    expect(auto.note.sound).toContain("Reel's 0:00");
  });

  it("turns the drop's flourish over through a batch", () => {
    const kinds = [0, 1, 2].map((v) => planMontage({ song, songSource: "song", songName: "click", fromStart: false, scans, aspect: "9x16", length: 12, card, caption: null, variant: v }).fx.map((f) => f.kind));
    expect(kinds[0]).toEqual(expect.arrayContaining(["flash", "punch"]));
    expect(kinds[1]).toContain("burn");
    expect(kinds[1]).not.toContain("punch");
    expect(kinds[2]).toEqual(expect.arrayContaining(["punch", "shake"]));
  });

  it("velocity: shots long enough ramp from slow motion into a rush, on the same cuts", () => {
    const plain = planMontage({ song, songSource: "song", songName: "click", fromStart: false, scans, aspect: "9x16", length: 12, card, caption: null, variant: 0 });
    const fast = planMontage({ song, songSource: "song", songName: "click", fromStart: false, scans, aspect: "9x16", length: 12, card, caption: null, variant: 0, velocity: true });
    expect(fast.shots.map((s) => s.start)).toEqual(plain.shots.map((s) => s.start));
    const ramped = fast.shots.filter((s) => s.ramp);
    expect(ramped.length).toBeGreaterThan(fast.shots.length / 2);
    for (const s of ramped) {
      const d = s.end - s.start;
      expect(sourceSpan(s)).toBeCloseTo(d * 1.1, 4);
      expect(s.ramp!.slow).toBeLessThan(1);
      expect(s.ramp!.fast).toBeGreaterThan(1);
      // The time map runs forwards and inverts.
      for (const tau of [0, d * 0.2, d * 0.5, d * 0.9, d]) {
        expect(outputAt(s, sourceAt(s, tau))).toBeCloseTo(tau, 3);
        if (tau > 0) expect(sourceAt(s, tau)).toBeGreaterThan(sourceAt(s, tau * 0.9));
      }
    }
    // The drop gets the slowest, longest hold.
    const drop = fast.shots.find((s) => s.role === "drop");
    if (drop?.ramp) for (const s of ramped) expect(drop.ramp.slow).toBeLessThanOrEqual(s.ramp!.slow);
    // Velocity also zoom-blurs across cuts that open a four-bar phrase (never on the drop's cut).
    const blurs = fast.fx.filter((f) => f.kind === "zoomblur");
    expect(blurs.length).toBeGreaterThan(0);
    for (const b of blurs) {
      expect(fast.shots.some((s) => Math.abs(s.start - b.at!) < 1e-6)).toBe(true);
      if (drop) expect(Math.abs(b.at! - drop.start)).toBeGreaterThan(1);
    }
    expect(plain.fx.some((f) => f.kind === "zoomblur")).toBe(false);
    // No stretch of footage is used twice, counting what the ramps play.
    const ranges = usedRanges(fast);
    for (const [, rs] of ranges) {
      const sorted = [...rs].sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i][0]).toBeGreaterThanOrEqual(sorted[i - 1][1] - 1e-6);
    }
  });

  it("twist and meme plan without fixtures", () => {
    const tw = planTwist({ song, songSource: "song", songName: "click", fromStart: true, scans, aspect: "4x3", length: 16, card, variant: 1, actB: new Set(["clip6"]), captionA: "what they see vs...", captionB: "what they don't..." });
    expect(tw.shots[tw.shots.length - 1].source).toBe("clip6");
    const mm = planMeme({ song, songSource: "song", songName: "click", fromStart: true, scans, aspect: "1x1", length: 9, card: null, variant: 0, text: "hi", position: "centre" });
    expect(mm.shots.length).toBe(1);
    expect(mm.card).toBeUndefined();
  });
});

describe("a long video skimmed by its key frames", () => {
  it("gives shots from all over the video, not its first frame", () => {
    // Samples only every 2 s, the way scanVideo skims a long file.
    const n = 300;
    const f = (k: number) => new Float32Array(k);
    const stats = { t: f(n), luma: f(n), contrast: f(n), sharp: f(n), color: f(n), skin: f(n), motion: f(n), hist: f(n * 64), cols: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rows: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rgb: f(n * 3) };
    const rand = mulberry32(5);
    const interest = f(n);
    for (let i = 0; i < n; i++) {
      stats.t[i] = i * 2;
      interest[i] = 0.3 + 0.6 * rand();
      stats.motion[i] = 0.1 * rand();
      stats.rgb[i * 3] = rand();
    }
    const long: Scan = { id: "long", kind: "video", start: 0, duration: 600, width: 1920, height: 1080, rate: 0.5, stats, cuts: [], interest };
    const SR = 22050;
    const y = new Float32Array(SR * 30);
    for (let b = 0; b * 0.5 < 29.5; b++) {
      const s0 = Math.round((0.1 + b * 0.5) * SR);
      for (let i = 0; i < 2500; i++) y[s0 + i] += 0.7 * Math.exp(-i / 700) * Math.sin((2 * Math.PI * 70 * i) / SR);
    }
    const song = analyzeSong(y, SR);
    const plan = planMontage({ song, songSource: "song", songName: "x", fromStart: true, scans: [long], aspect: "9x16", length: 14, card: null, caption: null, variant: 0 });
    const starts = new Set(plan.shots.map((s) => Math.round(s.srcStart)));
    expect(starts.size).toBeGreaterThan(plan.shots.length * 0.8);
  });
});

/** A 40 minute vlog skimmed by its key frames: mostly talking, a dozen flex stretches. */
function longVlog(seed: number, duration = 2400): Scan {
  const rand = mulberry32(seed);
  const t: number[] = [];
  for (let x = 1; x < duration - 1; x += 2 + 2 * rand()) t.push(x);
  const n = t.length;
  const f = (k: number) => new Float32Array(k);
  const stats = { t: Float32Array.from(t), luma: f(n), contrast: f(n), sharp: f(n), color: f(n), skin: f(n), motion: f(n), hist: f(n * 64), cols: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rows: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rgb: f(n * 3) };
  // Mostly talking (dull), with a dozen flex stretches of 10 to 40 s.
  const flex: [number, number][] = [];
  for (let k = 0; k < 12; k++) {
    const a = rand() * (duration - 60);
    flex.push([a, a + 10 + 30 * rand()]);
  }
  const interest = f(n);
  const cuts: number[] = [];
  let next = 0;
  for (let i = 0; i < n; i++) {
    const inFlex = flex.some(([a, b]) => t[i] >= a && t[i] <= b);
    interest[i] = inFlex ? 0.7 + 0.25 * rand() : 0.25 + 0.2 * rand();
    stats.motion[i] = inFlex ? 0.1 + 0.2 * rand() : 0.02 + 0.03 * rand();
    stats.rgb[i * 3] = rand();
    stats.rgb[i * 3 + 1] = rand();
    if (t[i] > next) {
      if (i) cuts.push((t[i - 1] + t[i]) / 2);
      next = t[i] + 5 + 25 * rand();
    }
  }
  return { id: "vlog", kind: "video", start: 0, duration, width: 1920, height: 1080, rate: n / duration, stats, cuts, interest };
}

describe("five edits from one 40 minute video", () => {
  const SR = 22050;
  const y = new Float32Array(SR * 30);
  for (let b = 0; b * 0.5 < 29.5; b++) {
    const s0 = Math.round((0.1 + b * 0.5) * SR);
    for (let i = 0; i < 2500; i++) y[s0 + i] += (b > 16 ? 0.9 : 0.4) * Math.exp(-i / 700) * Math.sin((2 * Math.PI * 70 * i) / SR);
  }
  const song = analyzeSong(y, SR);
  const vlog = longVlog(11);

  it("each edit uses its own moments", () => {
    const avoid: Ranges = new Map();
    const plans = [];
    for (let v = 0; v < 5; v++) {
      const plan = planMontage({ song, songSource: "song", songName: "x", fromStart: true, scans: [vlog], aspect: "9x16", length: 14, card: null, caption: null, variant: v, avoid });
      plans.push(plan);
      usedRanges(plan, avoid);
    }
    const far = spread(vlog);
    const hooks = plans.map((p) => p.shots[0].srcStart);
    for (let i = 0; i < hooks.length; i++) for (let j = 0; j < i; j++) expect(Math.abs(hooks[i] - hooks[j])).toBeGreaterThan(far);
    const interestAt = (t: number) => {
      let best = 0;
      for (let i = 0; i < vlog.stats.t.length; i++) if (Math.abs(vlog.stats.t[i] - t) < Math.abs(vlog.stats.t[best] - t)) best = i;
      return vlog.interest![best];
    };
    for (const [k, p] of plans.entries()) {
      const mean = p.shots.reduce((a, s) => a + interestAt(s.srcStart + 0.3), 0) / p.shots.length;
      expect(mean).toBeGreaterThan(k < 3 ? 0.75 : 0.55);
      // Never the same moment twice.
      const before = plans.slice(0, k).flatMap((q) => q.shots.map((s) => [s.srcStart, s.srcStart + (s.end - s.start) * s.speed]));
      const same = p.shots.filter((s) => before.some(([x, y]) => s.srcStart < y && s.srcStart + (s.end - s.start) * s.speed > x)).length;
      expect(same).toBeLessThanOrEqual(k < 4 ? 0 : 2);
    }
  });
});

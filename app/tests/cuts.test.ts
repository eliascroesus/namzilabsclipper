import { describe, expect, it } from "vitest";
import { analyzeSong } from "../src/engine/audio/song";
import { cutFrames, noteChecked } from "../src/engine/media/cuts";
import { checkShots, settlePlan } from "../src/engine/plan/settle";
import { keysFollowCuts, PROFILE_BINS, type Scan } from "../src/engine/media/scan";
import { boundsOf } from "../src/engine/plan/bounds";
import { longestStretch, mulberry32, planMontage } from "../src/engine/plan/montage";
import { sourceSpan } from "../src/engine/plan/types";

/**
 * A long vlog as the skim sees it: a sample every 2.5 seconds (its key frames), a
 * handful of the cuts found, and a real cut every second or so that it missed.
 */
function vlog(seed: number, duration = 600) {
  const rand = mulberry32(seed);
  const truth: number[] = [];
  for (let t = 0.6 + rand(); t < duration - 1; t += 0.6 + 1.4 * rand()) truth.push(Math.round(t * 30) / 30);
  const times: number[] = [];
  for (let t = 1; t < duration - 1; t += 2.5) times.push(t);
  const n = times.length;
  const f = (k: number) => new Float32Array(k);
  const stats = { t: Float32Array.from(times), luma: f(n).fill(0.5), contrast: f(n).fill(0.2), sharp: f(n).fill(5), color: f(n).fill(0.3), skin: f(n), motion: f(n), hist: f(n * 64), cols: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rows: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rgb: f(n * 3) };
  const interest = f(n);
  for (let i = 0; i < n; i++) {
    interest[i] = 0.4 + 0.5 * rand();
    stats.motion[i] = 0.05 + 0.2 * rand();
    stats.rgb[i * 3] = rand();
  }
  // The skim finds one cut in ten, and only to within its samples.
  const cuts = truth.filter((_, k) => k % 10 === 0).map((c) => c + 0.8 * (rand() - 0.5));
  const scan: Scan = { id: "vlog", kind: "video", start: 0, duration, width: 1920, height: 1080, rate: n / duration, fps: 30, stats, cuts, interest };
  return { scan, truth };
}

describe("a long video's own cuts", () => {
  const SR = 22050;
  const y = new Float32Array(SR * 24);
  for (let b = 0; b * 0.5 < 23.5; b++) {
    const s0 = Math.round((0.1 + b * 0.5) * SR);
    for (let i = 0; i < 2500; i++) y[s0 + i] += (b > 16 ? 0.9 : 0.5) * Math.exp(-i / 700) * Math.sin((2 * Math.PI * 70 * i) / SR);
  }
  const song = analyzeSong(y, SR);
  const crossing = (plan: ReturnType<typeof planMontage>, truth: number[]) =>
    plan.shots.filter((s) => truth.some((c) => c > s.srcStart + 1 / 60 && c < s.srcStart + sourceSpan(s) - 1 / 60)).length;

  it("the frame-by-frame look finds them, and the plan settles around them", async () => {
    const { scan, truth } = vlog(3);
    const make = () => planMontage({ song, songSource: "song", songName: "x", fromStart: true, scans: [scan], aspect: "9x16", length: 12, card: null, caption: null, variant: 0 });
    // Planned from the skim alone, shots run over cuts it never saw.
    expect(crossing(make(), truth)).toBeGreaterThan(2);
    let looked = 0;
    const plan = await settlePlan(make, new Map([[scan.id, scan]]), async (_s, a, b) => {
      looked += b - a;
      return truth.filter((c) => c >= a && c < b);
    });
    expect(crossing(plan, truth)).toBe(0);
    // Only the stretches the edits use get looked at, not the whole video.
    expect(looked).toBeLessThan(scan.duration / 4);
    // Every shot of the final plan lies in a stretch that has been looked at.
    for (const s of plan.shots) expect(scan.checked!.some(([a, b]) => s.srcStart >= a && s.srcStart + sourceSpan(s) <= b)).toBe(true);
    // A second look at the same plan finds nothing new.
    expect(await checkShots(plan, new Map([[scan.id, scan]]), async () => [])).toBe(0);
  });

  it("a clip laid over the shots (a window) is looked at too, and left out if it can't be kept off a cut", async () => {
    const { scan, truth } = vlog(4);
    const scans = new Map([[scan.id, scan]]);
    const find = async (_s: Scan, a: number, b: number) => truth.filter((c) => c >= a && c < b);
    const c = truth[40];
    const over = { start: 1, end: 1.5, source: scan.id, kind: "video" as const, srcStart: c - 0.25, speed: 1, cx: 0.5, cy: 0.5, zoom: 1, x: 0.5, y: 0.55, size: 0.5, aspect: 9 / 16, tilt: 0 };
    const still = { ...over, speed: 0 };
    const base = planMontage({ song, songSource: "song", songName: "x", fromStart: true, scans: [scan], aspect: "9x16", length: 12, card: null, caption: null, variant: 0 });
    expect(await checkShots({ ...base, shots: [], overlays: [over, still] }, scans, find)).toBe(1);
    const plan = await settlePlan(() => ({ ...base, overlays: [over, still] }), scans, find);
    expect(plan.overlays).toEqual([still]);
  });

  it("a stretch looked at replaces the skim's guesses in it", () => {
    const { scan } = vlog(5, 200);
    scan.cuts = [50.2, 80.4];
    expect(boundsOf(scan).map((b) => b.t)).toEqual([0, 50.2, 80.4, 200]);
    noteChecked(scan, 49, 52, [49.5]);
    noteChecked(scan, 51.5, 53, [52.7]);
    expect(scan.checked).toEqual([[49, 53]]);
    const bounds = boundsOf(scan);
    expect(bounds.map((b) => b.t)).toEqual([0, 49.5, 52.7, 80.4, 200]);
    // Exact cuts get a berth of two frames; the skim's guesses a wide one.
    expect(bounds[1].margin).toBeLessThan(0.1);
    expect(bounds[3].margin).toBeGreaterThan(0.3);
  });

  it("trusts key frames that follow the cuts: a narrow berth, not the whole gap between two samples", () => {
    // A YouTube upload's key frames: one at every scene change, at uneven gaps. A phone's: every 2.5 s.
    expect(keysFollowCuts([0, 5.46, 6.5, 7.96, 9.38, 10.5, 11.54, 12.83, 16.17, 17.29, 18.58, 20.46, 22.25])).toBe(true);
    expect(keysFollowCuts(Array.from({ length: 20 }, (_, k) => k * 2.5))).toBe(false);
    // Scenes of 2.4 s between skimmed cuts: guessed between samples, a shot fits nowhere;
    // on key frames that mark them, nearly all of each scene is usable.
    const { scan } = vlog(6, 60);
    const cuts = Array.from({ length: 24 }, (_, k) => 2.4 * (k + 1));
    const guessed = { ...scan, rate: 1 / 2.4, cuts };
    expect(longestStretch(guessed)).toBeLessThan(1.2);
    const keyed = { ...guessed, keyCuts: true };
    expect(longestStretch(keyed)).toBeGreaterThan(2);
    expect(boundsOf(keyed)[1]).toEqual({ t: 2.4, margin: 0.25, after: 0.05 });
  });

  it("tells a cut from motion: a jump that stands out from the frames around it", () => {
    const steady = Array.from({ length: 40 }, (_, i) => 0.02 + 0.01 * Math.sin(i));
    const withCut = [...steady];
    withCut[12] = 0.26; // two golden-hour shots: a small jump, but a clear one
    withCut[30] = 0.7;
    expect(cutFrames(withCut)).toEqual([12, 30]);
    // A cut from a still shot into a shaky one (someone walking with the camera):
    // calm on one side, busy on the other.
    const shaky = [0, 0.03, 0.04, 0.03, 0.05, 0.03, 0.35, 0.18, 0.12, 0.2, 0.17, 0.23, 0.11, 0.12];
    expect(cutFrames(shaky)).toEqual([6]);
    // A cut from black to a dim room: a small jump, but nothing around it moves.
    const dark = Array.from({ length: 20 }, () => 0.01);
    dark[8] = 0.13;
    expect(cutFrames(dark)).toEqual([8]);
    // A whip pan: every frame changes a lot, none stands out.
    const whip = steady.map((v, i) => (i > 10 && i < 25 ? 0.3 + 0.05 * Math.sin(3 * i) : v));
    expect(cutFrames(whip)).toEqual([]);
  });
});

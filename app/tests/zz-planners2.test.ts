import { describe, expect, it } from "vitest";
import { analyzeSong } from "../src/engine/audio/song";
import { PROFILE_BINS, type Scan } from "../src/engine/media/scan";
import { mulberry32, planMontage } from "../src/engine/plan/montage";
import { planMeme, planTwist } from "../src/engine/plan/formats";
import { planStory } from "../src/engine/plan/story";
import { type CardSpec, type EditPlan } from "../src/engine/plan/types";

function fakeScan(id: string, duration: number, seed: number, start = 0, kind: "video" | "image" = "video"): Scan {
  const rand = mulberry32(seed);
  const rate = kind === "video" ? 6 : 0;
  const n = kind === "video" ? Math.max(2, Math.floor((duration - start) * rate)) : 1;
  const f = (k: number) => new Float32Array(k);
  const stats = {
    t: f(n), luma: f(n), contrast: f(n), sharp: f(n), color: f(n), skin: f(n), motion: f(n),
    hist: f(n * 64), cols: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rows: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rgb: f(n * 3).fill(rand()),
  };
  const interest = f(n);
  for (let i = 0; i < n; i++) {
    stats.t[i] = kind === "video" ? start + (i + 0.5) / rate : 0;
    interest[i] = 0.3 + 0.5 * rand();
    stats.motion[i] = 0.05 + 0.2 * rand();
  }
  return { id, kind, start, duration, width: 1080, height: 1920, rate, stats, cuts: [], interest };
}

const card: CardSpec = { kind: "laptop", top: "a", bottom: "b", accent: "#fff", hold: 4, draw: false };

function summarize(p: EditPlan) {
  return { dur: p.duration, cardAt: p.card?.start, shots: p.shots.map((s) => `${s.start.toFixed(3)}-${s.end.toFixed(3)} ${s.source}@${s.srcStart.toFixed(2)}x${s.speed.toFixed(2)}`), music: p.music };
}

describe("zz more planner edges", () => {
  it("silent song and empty song", () => {
    for (const len of [0, 100, 22050 * 3]) {
      let song;
      try {
        song = analyzeSong(new Float32Array(len), 22050);
      } catch (e) {
        console.log(`analyzeSong(${len} zeros) throws: ${(e as Error).message}`);
        continue;
      }
      console.log(`analyzeSong(${len}) bpm=${song.bpm} beats=${song.beats.length} dur=${song.duration}`);
      const scans = [fakeScan("a", 10, 1), fakeScan("b", 12, 2)];
      for (const fromStart of [true, false]) {
        try {
          const p = planMontage({ song, songSource: "song", songName: "x", fromStart, scans, aspect: "9x16", length: 14, card, caption: null, variant: 0 });
          console.log(JSON.stringify({ fromStart, ...summarize(p), shots: p.shots.length }));
        } catch (e) {
          console.log(`montage throws for ${len}: ${(e as Error).message}`);
        }
      }
    }
    expect(true).toBe(true);
  });

  it("clip whose first frame is late (start > 0)", () => {
    const scans = [fakeScan("late", 6, 3, 2.5)];
    const song = analyzeSong(new Float32Array(22050 * 20).map((_, i) => (i % 11025 < 400 ? Math.sin(i * 0.3) : 0)), 22050);
    const p = planMontage({ song, songSource: "song", songName: "x", fromStart: true, scans, aspect: "9x16", length: 8, card: null, caption: null, variant: 0 });
    for (const s of p.shots) expect(s.srcStart).toBeGreaterThanOrEqual(2.5);
    const m = planMeme({ song, songSource: "song", songName: "x", fromStart: true, scans, aspect: "9x16", length: 9, card: null, variant: 0, text: "x", position: "upper" });
    console.log(summarize(m).shots);
  });

  it("portrait into 4x3 fit", () => {
    const scans = [fakeScan("p", 10, 3)];
    const p = planTwist({ fromStart: true, scans, aspect: "4x3", length: 10, card: null, variant: 0, actB: new Set(), captionA: "", captionB: "" });
    console.log(p.shots.map((s) => s.crop));
  });

  it("story edge: all runs tiny, no song, no card", () => {
    const src = fakeScan("long", 60, 5);
    const speech = [{ start: 10, end: 10.02 }, { start: 10.1, end: 10.12 }];
    try {
      const p = planStory({ moment: { id: "m", first: 0, last: 0, start: 10, end: 10.2, hook: "x", why: "", caption: "", score: 1 }, transcript: { model: "t", phrases: [{ start: 10, end: 10.2, speaker: "A", text: "hi", tone: "normal" }] }, speech, source: src, broll: [src], aspect: "9x16", card: null, variant: 0 });
      console.log(JSON.stringify(summarize(p)), p.captions);
    } catch (e) {
      console.log("story throws", (e as Error).message);
    }
  });
});

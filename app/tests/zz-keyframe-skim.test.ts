import { describe, expect, it } from "vitest";
import { analyzeSong } from "../src/engine/audio/song";
import { PROFILE_BINS, type Scan } from "../src/engine/media/scan";
import { mulberry32, planMontage } from "../src/engine/plan/montage";
import { planStory } from "../src/engine/plan/story";
import type { Transcript } from "../src/engine/story/story";

/** A long video skimmed by its key frames the way scanVideo does it: samples at key frames every `gop` s, rate = keys / duration. */
function keyframeScan(id: string, duration: number, gop: number, cuts: number[] = []): Scan {
  const rand = mulberry32(42);
  const times: number[] = [];
  for (let t = 0; t < duration - 1e-9; t += gop) times.push(t);
  const n = times.length;
  const f = (k: number) => new Float32Array(k);
  const stats = {
    t: Float32Array.from(times), luma: f(n), contrast: f(n), sharp: f(n), color: f(n), skin: f(n), motion: f(n),
    hist: f(n * 64), cols: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rows: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rgb: f(n * 3),
  };
  const interest = f(n);
  for (let i = 0; i < n; i++) {
    interest[i] = 0.3 + 0.6 * rand();
    stats.motion[i] = 0.05 + 0.2 * rand();
    for (let c = 0; c < 3; c++) stats.rgb[i * 3 + c] = rand();
  }
  return { id, kind: "video", start: 0, duration, width: 1920, height: 1080, rate: n / duration, stats, cuts, interest };
}

function song() {
  const SR = 22050;
  const y = new Float32Array(SR * 60);
  const period = 60 / 128;
  for (let b = 0; b * period < 59; b++) {
    const s0 = Math.round((0.1 + b * period) * SR);
    for (let i = 0; i < 3000 && s0 + i < y.length; i++) y[s0 + i] += (b % 4 === 0 ? 0.9 : 0.6) * Math.exp(-i / 900) * Math.sin((2 * Math.PI * 60 * i) / SR);
  }
  return analyzeSong(y, SR);
}

describe("zz key-frame skimmed long video", () => {
  const s = song();
  it("montage from one long video with a fixed 2 s GOP", () => {
    const long = keyframeScan("long", 600, 2);
    const plan = planMontage({ song: s, songSource: "song", songName: "x", fromStart: true, scans: [long], aspect: "9x16", length: 14, card: null, caption: null, variant: 0 });
    const starts = plan.shots.map((x) => x.srcStart.toFixed(2));
    console.log("montage srcStarts:", starts.join(" "), "lengths:", plan.shots.map((x) => (x.end - x.start).toFixed(2)).join(" "));
    expect(new Set(starts).size).toBeGreaterThan(plan.shots.length / 2);
  });

  it("story burst from the long video alone", () => {
    const long = keyframeScan("long", 600, 2, [101, 203, 305]);
    const speech = [{ start: 200.2, end: 203.8 }, { start: 204.4, end: 208.1 }, { start: 208.6, end: 214 }];
    const tr: Transcript = { model: "t", phrases: speech.map((r, i) => ({ start: r.start, end: r.end, speaker: "A", text: `line ${i} about money and more`, tone: "normal" as const })) };
    const plan = planStory({ moment: { id: "m", first: 0, last: 2, start: 200.2, end: 214, hook: "hook", why: "", caption: "", score: 1 }, transcript: tr, speech, source: long, broll: [long], song: s, songSource: "song", songName: "x", aspect: "9x16", card: null, variant: 0 });
    const burst = plan.shots.filter((x) => !x.audio);
    console.log("burst:", burst.map((x) => `${(x.end - x.start).toFixed(2)}s @${x.srcStart.toFixed(2)} x${x.speed.toFixed(2)}`).join(" | "));
    expect(new Set(burst.map((x) => x.srcStart)).size).toBeGreaterThan(1);
  });
});

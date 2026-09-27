import { describe, expect, it } from "vitest";
import { PROFILE_BINS, type Scan } from "../src/engine/media/scan";
import { planStory } from "../src/engine/plan/story";
import type { Run } from "../src/engine/audio/speech";
import type { Transcript } from "../src/engine/story/story";

function fakeScan(id: string, duration: number): Scan {
  const rate = 4;
  const n = Math.floor(duration * rate);
  const f = (k: number) => new Float32Array(k);
  const stats = { t: f(n), luma: f(n), contrast: f(n), sharp: f(n), color: f(n), skin: f(n), motion: f(n), hist: f(n * 64), cols: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rows: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rgb: f(n * 3).fill(0.5) };
  const interest = f(n).fill(0.5);
  for (let i = 0; i < n; i++) stats.t[i] = (i + 0.5) / rate;
  return { id, kind: "video", start: 0, duration, width: 1920, height: 1080, rate, stats, cuts: [], interest };
}

describe("zz story words", () => {
  it("keeps the last word of a phrase that runs to the end of a kept run", () => {
    // Two stretches of talk with a pause; the kept first run is 3.64 s, which frames down to 3.633 s.
    const speech: Run[] = [
      { start: 2, end: 5.5 },
      { start: 6.3, end: 9.0 },
    ];
    const tr: Transcript = {
      model: "t",
      phrases: [
        { start: 0.5, end: 5.8, speaker: "A", text: "alpha bravo charlie delta echo foxtrot golf hotel", tone: "normal" },
        { start: 6.3, end: 9.2, speaker: "A", text: "india juliet kilo lima mike november", tone: "normal" },
      ],
    };
    const plan = planStory({ moment: { id: "m", first: 0, last: 1, start: 2, end: 9, hook: "", why: "", caption: "", score: 1 }, transcript: tr, speech, source: fakeScan("src", 20), broll: [], aspect: "9x16", card: null, variant: 0 });
    const said = plan.captions.map((c) => c.text).join(" ");
    console.log(plan.shots.map((s) => [s.start, s.end, s.srcStart]));
    console.log(plan.captions.map((c) => `${c.start.toFixed(2)}-${c.end.toFixed(2)} ${c.text}`));
    // "hotel" (end of kept run 1 at 5.64) and "november" (end of run 2 at b = 9.0)
    expect(said).toContain("hotel");
    expect(said).toContain("november");
  });
});

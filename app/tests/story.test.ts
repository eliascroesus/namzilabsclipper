import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeSong } from "../src/engine/audio/song";
import { detectSpeech, keepSpeech, snapToSpeech, type Run } from "../src/engine/audio/speech";
import { PROFILE_BINS, type Scan } from "../src/engine/media/scan";
import { mulberry32 } from "../src/engine/plan/montage";
import { planStory } from "../src/engine/plan/story";
import { FPS } from "../src/engine/plan/types";
import { chunkBounds, syllables, type Transcript } from "../src/engine/story/story";

function fakeScan(id: string, duration: number, seed: number): Scan {
  const rand = mulberry32(seed);
  const rate = 4;
  const n = Math.floor(duration * rate);
  const f = (k: number) => new Float32Array(k);
  const stats = { t: f(n), luma: f(n), contrast: f(n), sharp: f(n), color: f(n), skin: f(n), motion: f(n), hist: f(n * 64), cols: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rows: f(n * PROFILE_BINS).fill(1 / PROFILE_BINS), rgb: f(n * 3).fill(rand()) };
  const interest = f(n);
  for (let i = 0; i < n; i++) {
    stats.t[i] = (i + 0.5) / rate;
    interest[i] = 0.3 + 0.6 * rand();
    stats.motion[i] = 0.05 + 0.2 * rand();
  }
  return { id, kind: "video", start: 0, duration, width: 1920, height: 1080, rate, stats, cuts: [duration / 2], interest };
}

describe("speech detection", () => {
  it("finds talking between pauses, and trims to it", () => {
    const rate = 16000;
    const y = new Float32Array(rate * 10);
    // "Speech" (a buzzy 180 Hz voice-like tone with a 3 Hz syllable envelope) at 1-3 s and 3.6-6 s and 8-9 s.
    for (const [s, e] of [[1, 3], [3.6, 6], [8, 9]]) {
      for (let i = Math.floor(s * rate); i < e * rate; i++) {
        const t = i / rate;
        y[i] = 0.3 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * t)) * Math.sign(Math.sin(2 * Math.PI * 180 * t)) * 0.5;
      }
    }
    for (let i = 0; i < y.length; i++) y[i] += 0.001 * Math.sin(i);
    const runs = detectSpeech(y, rate);
    expect(runs.length).toBe(3);
    expect(runs[0].start).toBeCloseTo(1, 1);
    expect(runs[1].end).toBeCloseTo(6, 1);
    // A 0.6 s pause is cut; the 2 s one too.
    const kept = keepSpeech(runs, 0.5, 9.5);
    expect(kept.length).toBe(3);
    expect(snapToSpeech(runs, 3.3, "start")).toBeCloseTo(3.6, 1);
  });

  it("splits long audio into chunks at pauses", () => {
    const runs: Run[] = [];
    for (let t = 0; t < 1500; t += 5) runs.push({ start: t, end: t + 4 + (t % 37 === 0 ? -2 : 0) });
    const b = chunkBounds(1500, runs);
    expect(b[0]).toBe(0);
    expect(b[b.length - 1]).toBe(1500);
    expect(b.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < b.length - 1; i++) expect(runs.some((r) => b[i] > r.end - 0.01 && b[i] < r.end + 1.01)).toBe(true);
  });

  it("counts syllables roughly", () => {
    expect(syllables("money")).toBe(2);
    expect(syllables("retiring")).toBe(3);
    expect(syllables("$2M")).toBe(1);
  });
});

const FIX = resolve(import.meta.dirname, "fixtures");

describe("story plan", () => {
  // 30 s of talk in 4-second phrases with short pauses.
  const runs: Run[] = [];
  const phrases: Transcript["phrases"] = [];
  for (let t = 2, i = 0; t < 32; t += 4.4, i++) {
    runs.push({ start: t, end: t + 3.8 });
    phrases.push({ start: t, end: t + 3.8, speaker: "A", text: i === 3 ? "BUY EVERYONE BUY RIGHT NOW" : `this is line ${i} of the story, about money`, tone: "normal" });
  }
  const tr: Transcript = { phrases, model: "test" };
  const moment = { id: "m1", first: 1, last: 5, start: phrases[1].start, end: phrases[5].end, hook: "im down 600k", why: "", caption: "the day it went wrong", score: 9 };
  const source = fakeScan("long", 40, 3);
  const broll = [source, fakeScan("b1", 8, 4), fakeScan("b2", 9, 5)];
  const card = { kind: "laptop" as const, top: "start free", bottom: "namzilabs.co", accent: "#568CFF", hold: 4, draw: false };

  it("jump-cuts the dialogue, subtitles it, hooks on frame one", () => {
    const plan = planStory({ moment, transcript: tr, speech: runs, source, broll, aspect: "4x3", card, variant: 0 });
    const talk = plan.shots.filter((s) => s.audio);
    expect(talk.length).toBe(5); // five phrases, the pauses between them cut
    for (let i = 1; i < talk.length; i++) expect(talk[i].start).toBeCloseTo(talk[i - 1].end, 6);
    const total = talk.reduce((x, s) => x + s.end - s.start, 0);
    expect(total).toBeLessThan(moment.end - moment.start - 1.2);
    expect(plan.captions[0]).toMatchObject({ style: "doc", text: "im down 600k", start: 0 });
    expect(plan.captions.some((c) => c.style === "shout")).toBe(true);
    expect(plan.fx.some((f) => f.kind === "fadein" && f.start === 0)).toBe(true);
    expect(plan.card!.start).toBeCloseTo(talk[talk.length - 1].end, 6);
    // Subtitles never run past the dialogue.
    for (const c of plan.captions) expect(c.end).toBeLessThanOrEqual(plan.card!.start + 1e-6);
  });

  it.skipIf(!existsSync(resolve(FIX, "nio1.f32")))("adds a burst cut to the song, with the song ducked under the voice", () => {
    const buf = readFileSync(resolve(FIX, "nio1.f32"));
    const song = analyzeSong(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
    const plan = planStory({ moment, transcript: tr, speech: runs, source, broll, song, songSource: "song", songName: "nio1", aspect: "9x16", card, variant: 0 });
    const talkEnd = Math.max(...plan.shots.filter((s) => s.audio).map((s) => s.end));
    const burst = plan.shots.filter((s) => !s.audio);
    expect(burst.length).toBeGreaterThanOrEqual(4);
    expect(burst[0].start).toBeCloseTo(talkEnd, 6);
    for (const s of burst) expect(s.end - s.start).toBeLessThanOrEqual(0.75 + 1 / FPS);
    expect(plan.music?.gainPoints?.[0][1]).toBeLessThan(0.5);
    // The burst doesn't reuse the dialogue's own footage.
    for (const s of burst.filter((x) => x.source === "long")) expect(s.srcStart > moment.end + 1 || s.srcStart + (s.end - s.start) < moment.start - 1).toBe(true);
  });
});

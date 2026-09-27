import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { melFilterbank, melSpectrogram, onsetStrength, powerSpectrogram, powerToDb, rms } from "../src/engine/audio/dsp";
import { beatTrack, detectOnsets, estimateTempo } from "../src/engine/audio/rhythm";

const SR = 22050;
const HOP = 512;

function envelope(y: Float32Array): Float32Array {
  const spec = powerSpectrogram(y, 2048, HOP);
  const bank = melFilterbank(SR, 2048, 128);
  const mel = powerToDb(melSpectrogram(spec, bank));
  return onsetStrength(mel, spec.frames, 128, 2048, HOP);
}

/** Share of `a` that has a match in `b` within `tol` frames. */
function matched(a: number[], b: number[], tol: number): number {
  if (!a.length) return b.length ? 0 : 1;
  let hits = 0;
  for (const x of a) if (b.some((y) => Math.abs(x - y) <= tol)) hits++;
  return hits / a.length;
}

// The reference songs, decoded and analysed by librosa 0.11 (see tests/README.md).
// They hold other creators' audio, so they stay out of git and these tests skip without them.
const FIX = resolve(import.meta.dirname, "fixtures");
const songs = ["mico", "nio4", "nio1", "gill1"].filter((s) => existsSync(resolve(FIX, `${s}.librosa.json`)));

interface Fixture {
  sr: number;
  hop: number;
  n: number;
  env: number[];
  tempo: number;
  beats: number[];
  onsets: number[];
  rms: number[];
}

describe.skipIf(!songs.length).each(songs)("librosa parity: %s", (name) => {
  const ref = JSON.parse(readFileSync(resolve(FIX, `${name}.librosa.json`), "utf8")) as Fixture;
  const buf = readFileSync(resolve(FIX, `${name}.f32`));
  const y = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const refEnv = Float32Array.from(ref.env);

  it("onset envelope", () => {
    const env = envelope(y);
    expect(env.length).toBe(ref.env.length);
    let maxDiff = 0;
    let peak = 0;
    for (let i = 0; i < env.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(env[i] - ref.env[i]));
      peak = Math.max(peak, ref.env[i]);
    }
    expect(maxDiff / peak).toBeLessThan(2e-3);
  });

  it("rms", () => {
    const r = rms(y);
    expect(r.length).toBe(ref.rms.length);
    let maxDiff = 0;
    for (let i = 0; i < r.length; i++) maxDiff = Math.max(maxDiff, Math.abs(r[i] - ref.rms[i]));
    expect(maxDiff).toBeLessThan(1e-5);
  });

  it("tempo from librosa's envelope", () => {
    expect(estimateTempo(refEnv, SR, HOP)).toBeCloseTo(ref.tempo, 6);
  });

  it("beats from librosa's envelope and tempo", () => {
    const { beats } = beatTrack(refEnv, SR, HOP, ref.tempo);
    expect(beats).toEqual(ref.beats);
  });

  it("onsets from librosa's envelope", () => {
    const onsets = detectOnsets(refEnv, SR, HOP);
    // The fixture's envelope is rounded to 6 decimals, which can flip a tie.
    expect(matched(ref.onsets, onsets, 0)).toBeGreaterThan(0.98);
    expect(matched(onsets, ref.onsets, 0)).toBeGreaterThan(0.98);
  });

  it("end to end from the audio: tempo, beats within a frame, onsets", () => {
    const env = envelope(y);
    const { bpm, beats } = beatTrack(env, SR, HOP);
    expect(bpm).toBeCloseTo(ref.tempo, 3);
    expect(matched(ref.beats, beats, 1)).toBeGreaterThan(0.97);
    expect(matched(beats, ref.beats, 1)).toBeGreaterThan(0.97);
    const onsets = detectOnsets(env, SR, HOP);
    expect(matched(ref.onsets, onsets, 1)).toBeGreaterThan(0.95);
  });
});

describe("synthetic click track", () => {
  // 120 bpm for 20 s: a kick-like burst on every beat, louder on each bar's first.
  const n = SR * 20;
  const y = new Float32Array(n);
  const beatTimes: number[] = [];
  for (let b = 0; b * 0.5 + 0.25 < 20; b++) {
    const t0 = 0.25 + b * 0.5;
    beatTimes.push(t0);
    const amp = b % 4 === 0 ? 0.9 : 0.5;
    const s0 = Math.round(t0 * SR);
    for (let i = 0; i < 2000 && s0 + i < n; i++) y[s0 + i] += amp * Math.exp(-i / 300) * Math.sin((2 * Math.PI * 80 * i) / SR + Math.sin(i / 7));
  }
  for (let i = 0; i < n; i++) y[i] += 0.001 * Math.sin(i * 0.37);

  it("finds 120 bpm and every beat within a frame", () => {
    const env = envelope(y);
    const { bpm, beats } = beatTrack(env, SR, HOP);
    expect(bpm).toBeGreaterThan(115);
    expect(bpm).toBeLessThan(125);
    const beatFrames = beatTimes.map((t) => (t * SR) / HOP);
    expect(matched(beatFrames.slice(1, -1), beats, 1.5)).toBeGreaterThan(0.95);
  });
});

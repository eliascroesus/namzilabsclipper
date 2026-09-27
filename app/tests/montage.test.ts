import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeSong, type SongAnalysis } from "../src/engine/audio/song";
import { PROFILE_BINS, type Scan } from "../src/engine/media/scan";
import { CUT_LEAD, mulberry32, planMontage, usedRanges } from "../src/engine/plan/montage";
import { FPS, type CardSpec } from "../src/engine/plan/types";

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

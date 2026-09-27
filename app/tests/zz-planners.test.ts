import { describe, expect, it } from "vitest";
import { analyzeSong, type SongAnalysis } from "../src/engine/audio/song";
import { PROFILE_BINS, type Scan } from "../src/engine/media/scan";
import { mulberry32, planMontage } from "../src/engine/plan/montage";
import { planMeme, planTwist } from "../src/engine/plan/formats";
import { FPS, type CardSpec, type EditPlan } from "../src/engine/plan/types";

function fakeScan(id: string, duration: number, seed: number, kind: "video" | "image" = "video", cuts: number[] = []): Scan {
  const rand = mulberry32(seed);
  const rate = kind === "video" ? 6 : 0;
  const n = kind === "video" ? Math.max(2, Math.floor(duration * rate)) : 1;
  const base = [rand(), rand(), rand()];
  const f = (k: number) => new Float32Array(k);
  const stats = {
    t: f(n), luma: f(n), contrast: f(n), sharp: f(n), color: f(n), skin: f(n), motion: f(n),
    hist: f(n * 64), cols: f(n * PROFILE_BINS), rows: f(n * PROFILE_BINS), rgb: f(n * 3),
  };
  const interest = f(n);
  for (let i = 0; i < n; i++) {
    stats.t[i] = kind === "video" ? (i + 0.5) / rate : 0;
    interest[i] = 0.3 + 0.5 * rand();
    stats.motion[i] = 0.05 + 0.2 * rand();
    for (let c = 0; c < 3; c++) stats.rgb[i * 3 + c] = base[c];
    for (let k = 0; k < PROFILE_BINS; k++) {
      stats.cols[i * PROFILE_BINS + k] = 1 / PROFILE_BINS;
      stats.rows[i * PROFILE_BINS + k] = 1 / PROFILE_BINS;
    }
  }
  return { id, kind, start: 0, duration, width: 1920, height: 1080, rate, stats, cuts, interest };
}

function synthSong(seconds: number, bpm = 128, silentUntil = 0): SongAnalysis {
  const SR = 22050;
  const y = new Float32Array(Math.round(SR * seconds));
  const period = 60 / bpm;
  const hit = (t: number, amp: number, hz: number, decay: number) => {
    const s0 = Math.round(t * SR);
    for (let i = 0; i < 3000 && s0 + i < y.length; i++) y[s0 + i] += amp * Math.exp(-i / decay) * Math.sin((2 * Math.PI * hz * i) / SR);
  };
  for (let b = 0; b * period < seconds - 0.2; b++) {
    const t = 0.1 + b * period;
    if (t < silentUntil) continue;
    hit(t, 0.08, 6000, 60);
    hit(t, b % 4 === 0 ? 0.9 : 0.6, 60, 900);
  }
  return analyzeSong(y, SR);
}

const card: CardSpec = { kind: "laptop", top: "start free", bottom: "x.co", accent: "#568CFF", hold: 4, draw: false };

function check(plan: EditPlan, scans: Scan[]) {
  const s = plan.shots;
  const issues: string[] = [];
  if (!s.length) issues.push("no shots");
  if (s.length && Math.abs(s[0].start) > 1e-9) issues.push(`first shot starts at ${s[0].start}`);
  for (let i = 0; i < s.length; i++) {
    const d = s[i].end - s[i].start;
    if (!(d > 1e-6)) issues.push(`shot ${i} has length ${d}`);
    if (i && Math.abs(s[i].start - s[i - 1].end) > 1e-6) issues.push(`gap/overlap before shot ${i}`);
    for (const k of ["start", "end", "srcStart", "speed"] as const) if (!Number.isFinite(s[i][k])) issues.push(`shot ${i} ${k}=${s[i][k]}`);
    const sc = scans.find((x) => x.id === s[i].source)!;
    if (sc.kind === "video") {
      const srcEnd = s[i].srcStart + d * s[i].speed;
      if (srcEnd > sc.duration + 1e-6) issues.push(`shot ${i} reads past the end of ${sc.id}: ${srcEnd.toFixed(3)} > ${sc.duration}`);
    }
    // frame quantised
    for (const k of ["start", "end"] as const) if (Math.abs(s[i][k] * FPS - Math.round(s[i][k] * FPS)) > 1e-6) issues.push(`shot ${i} ${k} not on a frame: ${s[i][k]}`);
  }
  const last = s[s.length - 1];
  const until = plan.card ? plan.card.start : plan.duration;
  if (last && Math.abs(last.end - until) > 1e-6) issues.push(`shots end at ${last.end}, card/end at ${until}`);
  if (plan.duration * FPS - Math.round(plan.duration * FPS) > 1e-6) issues.push("duration not on a frame");
  return issues;
}

describe("zz planners edge cases", () => {
  const songs = { s2: synthSong(2), s5: synthSong(5), s10: synthSong(10), s30: synthSong(30), quiet: synthSong(30, 128, 12) };
  const footage: Record<string, Scan[]> = {
    oneTiny: [fakeScan("tiny", 0.25, 1)],
    oneShort: [fakeScan("short", 1.2, 2)],
    oneLong: [fakeScan("long", 40, 3)],
    photos: [fakeScan("p1", 0, 4, "image"), fakeScan("p2", 0, 5, "image")],
    onePhoto: [fakeScan("p1", 0, 4, "image")],
    mixed: [fakeScan("p1", 0, 4, "image"), fakeScan("c1", 1.5, 6), fakeScan("c2", 1.8, 7)],
    cutUp: [fakeScan("cu", 6, 8, "video", [1, 2, 3, 4, 5])],
  };
  for (const [sn, song] of Object.entries(songs)) {
    for (const [fn, scans] of Object.entries(footage)) {
      for (const withCard of [true, false]) {
        it(`${sn} ${fn} card=${withCard}`, () => {
          const out: string[] = [];
          for (const fromStart of [true, false]) {
            for (const fmt of ["montage", "twist", "meme"]) {
              let plan: EditPlan;
              try {
                if (fmt === "montage") plan = planMontage({ song, songSource: "song", songName: "x", fromStart, scans, aspect: "9x16", length: 14, card: withCard ? card : null, caption: null, variant: 0 });
                else if (fmt === "twist") plan = planTwist({ song, songSource: "song", songName: "x", fromStart, scans, aspect: "4x3", length: 18, card: withCard ? card : null, variant: 1, actB: new Set(), captionA: "a", captionB: "b" });
                else plan = planMeme({ song, songSource: "song", songName: "x", fromStart, scans, aspect: "1x1", length: 9, card: withCard ? card : null, variant: 0, text: "hi", position: "upper" });
              } catch (e) {
                out.push(`${fmt} fromStart=${fromStart}: THROWS ${(e as Error).message}`);
                continue;
              }
              const issues = check(plan, scans);
              if (issues.length) out.push(`${fmt} fromStart=${fromStart} dur=${plan.duration} cardAt=${plan.card?.start}: ${issues.join("; ")}`);
            }
          }
          if (out.length) console.log(`${sn} ${fn} card=${withCard}\n  ` + out.join("\n  "));
          expect(true).toBe(true);
        });
      }
    }
  }
});

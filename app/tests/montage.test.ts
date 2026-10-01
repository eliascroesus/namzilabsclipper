import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeSong, type SongAnalysis } from "../src/engine/audio/song";
import { PROFILE_BINS, scoreInterest, type Kind, type Scan } from "../src/engine/media/scan";
import { fakeScan, lookedAt } from "./scans";
import { apart, CUT_LEAD, mulberry32, planMontage, usedRanges, type Ranges } from "../src/engine/plan/montage";
import { planMeme, planTwist } from "../src/engine/plan/formats";
import { FPS, outputAt, sourceAt, sourceSpan, type CardSpec } from "../src/engine/plan/types";

/** The shots that start a clip: a re-cut of one clip on the beat (`again`) is part of the shot before it. */
const clips = <S extends { again?: boolean }>(shots: S[]) => shots.filter((s) => !s.again);

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
      // (A clip re-cut on the half beat, or the sixteenth in a slow song, runs shorter.)
      expect(d).toBeGreaterThanOrEqual((shots[i].again || shots[i + 1]?.again ? 0.15 : 0.3) - 1e-6);
      expect(d).toBeLessThanOrEqual(2.1 + 1 / FPS);
      if (i) expect(shots[i].start).toBeCloseTo(shots[i - 1].end, 6);
    }
    // Every cut sits within a frame of a beat or an accent, less the lead (a re-cut, of a
    // half or a quarter beat).
    const marks = [...song.beats, ...song.accents.map((a) => a.t)];
    for (const s of clips(shots.slice(1))) {
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
    // Neighbours come from different clips (a clip re-cut on the beat aside).
    for (let i = 1; i < shots.length; i++) if (!shots[i].again) expect(shots[i].source).not.toBe(shots[i - 1].source);
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
    // (The second sits a little lower, as brezscales' does.)
    expect(plan.captions[1].y! - plan.captions[0].y!).toBeCloseTo(0.028, 6);
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
    // (A clip re-cut inside a shot lands on the half beat.)
    const halves = song.beats.flatMap((b, i) => (i + 1 < song.beats.length ? [b, (b + song.beats[i + 1]) / 2] : [b]));
    for (const s of plan.shots.slice(1)) {
      const off = Math.min(...(s.again ? halves : song.beats).map((b) => Math.abs(b - plan.music!.songStart - CUT_LEAD - s.start)));
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

  it("runs as long as asked, up to a minute, the card coming in on a bar line", () => {
    // A 70 s song at 120 bpm, a kick on every beat and a clap on 2 and 4.
    const SR2 = 22050;
    const long = new Float32Array(SR2 * 70);
    for (let b = 0; 0.1 + b * 0.5 < 69.5; b++) {
      const s0 = Math.round((0.1 + b * 0.5) * SR2);
      for (let i = 0; i < 3000; i++) long[s0 + i] += 0.8 * Math.exp(-i / 900) * Math.sin((2 * Math.PI * 60 * i) / SR2) + (b % 2 ? 0.4 * Math.exp(-i / 250) * Math.sin((2 * Math.PI * 1800 * i) / SR2) : 0);
    }
    const tune = analyzeSong(long, SR2);
    for (const length of [20, 45, 60]) {
      const plan = planMontage({ song: tune, songSource: "song", songName: "long", fromStart: true, scans, aspect: "9x16", length, card, caption: null, variant: 0 });
      // The card on the bar line nearest where it was asked for (half a bar at most), and the shots up to it.
      expect(Math.abs(plan.card!.start - length)).toBeLessThanOrEqual(2 * tune.period + 1 / FPS);
      expect(Math.min(...tune.downbeats.map((d) => Math.abs(d - plan.music!.songStart - plan.card!.start)))).toBeLessThanOrEqual(1.5 / FPS);
      expect(plan.shots[plan.shots.length - 1].end).toBeCloseTo(plan.card!.start, 5);
      expect(plan.duration).toBeCloseTo(plan.card!.start + 4, 1);
      expect(plan.music!.fadeOut).toBeGreaterThan(0.5);
      // The song plays on under the card, muffled from its first frame (nio.trade's cards).
      expect(plan.music!.muffle).toBeCloseTo(plan.card!.start, 9);
    }
    // No card, nothing muffled.
    expect(planMontage({ song: tune, songSource: "song", songName: "long", fromStart: true, scans, aspect: "9x16", length: 20, card: null, caption: null, variant: 0 }).music!.muffle).toBeUndefined();
  });

  it("ends on the user's own card video when there is one: played whole, as it was made", () => {
    const own: CardSpec = { kind: "video", video: "cardvideo", videoAspect: 1080 / 1920, top: "", bottom: "", accent: "#568CFF", hold: 3.2, draw: false };
    const plan = planMontage({ song, songSource: "song", songName: "click", fromStart: false, scans, aspect: "9x16", length: 12, card: own, caption: null, variant: 0 });
    const last = plan.shots[plan.shots.length - 1];
    expect(last.source).toBe("cardvideo");
    expect(last.start).toBeCloseTo(plan.card!.start, 6);
    expect(last.end).toBeCloseTo(plan.duration, 6);
    expect(last.end - last.start).toBeCloseTo(3.2, 1);
    expect([last.srcStart, last.speed, last.crop.fit]).toEqual([0, 1, "cover"]);
    // The song runs under it and fades out with it; nothing else is played from it.
    expect(plan.music!.end).toBeCloseTo(plan.duration, 6);
    expect(plan.sourceAudio).toBe(false);
    // A card of another shape sits inside the frame instead of being cropped.
    const square = planMontage({ song, songSource: "song", songName: "click", fromStart: false, scans, aspect: "9x16", length: 12, card: { ...own, videoAspect: 1 }, caption: null, variant: 0 });
    expect(square.shots[square.shots.length - 1].crop.fit).toBe("fit");
    // The shots before it are the same as with the drawn card of the same length.
    const drawn = planMontage({ song, songSource: "song", songName: "click", fromStart: false, scans, aspect: "9x16", length: 12, card: { ...card, hold: 3.2 }, caption: null, variant: 0 });
    expect(plan.shots.slice(0, -1).map((s) => [s.start, s.srcStart])).toEqual(drawn.shots.map((s) => [s.start, s.srcStart]));
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
    // (A clip re-cut on the beat plays at its own speed.)
    const whole = fast.shots.filter((s, i) => !s.again && !fast.shots[i + 1]?.again);
    expect(ramped.length).toBeGreaterThan(whole.length / 2);
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
    // Velocity also zoom-blurs across cuts that open a four-bar phrase (never near the
    // drop's cut, which has a zoom blur of its own in every edit).
    const atDrop = (f: { at?: number }) => !!drop && Math.abs(f.at! - drop.start) < 1e-6;
    const blurs = fast.fx.filter((f) => f.kind === "zoomblur" && !atDrop(f));
    expect(blurs.length).toBeGreaterThan(0);
    for (const b of blurs) {
      expect(fast.shots.some((s) => Math.abs(s.start - b.at!) < 1e-6)).toBe(true);
      if (drop) expect(Math.abs(b.at! - drop.start)).toBeGreaterThan(1);
    }
    expect(plain.fx.filter((f) => f.kind === "zoomblur").every(atDrop)).toBe(true);
    // No stretch of footage is used twice, counting what the ramps play.
    const ranges = usedRanges(fast);
    for (const [, rs] of ranges) {
      const sorted = [...rs].sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i][0]).toBeGreaterThanOrEqual(sorted[i - 1][1] - 1e-6);
    }
  });

  it("picks like an editor: the flex over the filler, variety from what the shots show", () => {
    // A Reel of eight different flex scenes, four phone clips of one car from one side,
    // a friend laughing in a van (sharp and lively, but nothing to show off) and talking.
    // (All of them picked by hand: the van gets its one turn; the talking never does.)
    const flexy: Kind[] = ["car", "jet", "yacht", "home", "view", "watch", "city", "travel"];
    const footage = [
      lookedAt("reel", flexy.map((kind, k) => ({ len: 1.6, kind, flex: 0.8 + 0.02 * k, wow: 0.7, look: k })), 1),
      ...[1, 2, 3, 4].map((k) => lookedAt(`car${k}`, [{ len: 6, kind: "car", flex: 0.85, wow: 0.35, look: 8 }], 10 + k)),
      lookedAt("van", [{ len: 8, kind: "other", flex: 0.3, wow: 0.3, look: 9 }], 20),
      lookedAt("talk", [{ len: 10, kind: "talking", flex: 0.1, wow: 0.2, look: 10 }], 21),
    ];
    for (const sc of footage) sc.stats.sharp.fill(sc.id === "van" ? 6 : 4.5);
    scoreInterest(footage);
    const avoid: Ranges = new Map();
    const heroes = new Set<string>();
    for (let v = 0; v < 3; v++) {
      const plan = planMontage({ song, songSource: "song", songName: "click", fromStart: false, scans: footage, aspect: "9x16", length: 12, card: null, caption: null, variant: v, avoid });
      usedRanges(plan, avoid);
      const from = (id: string) => clips(plan.shots).filter((s) => s.source === id);
      // No talking, and the van only once, in the body: never what the edit opens on, drops into or ends on.
      expect(from("talk").length).toBe(0);
      expect(from("van").length).toBeLessThanOrEqual(1);
      expect(from("van").every((s) => s.role === "body" || s.role === "build")).toBe(true);
      // The Reel's scenes are the best and all different: the edit leans on them rather
      // than sharing itself out evenly between the clips.
      const reel = from("reel");
      expect(reel.length).toBeGreaterThanOrEqual(Math.min(8, Math.floor(clips(plan.shots).length / 2)));
      const scene = (t: number) => Math.floor(t / 1.6);
      // No scene twice in one edit before every one of them is in.
      expect(new Set(reel.map((s) => scene(s.srcStart + 0.1))).size).toBe(Math.min(8, reel.length));
      // The car shots are one picture: some, not the whole rest of the edit.
      expect(clips(plan.shots).length - reel.length).toBeLessThanOrEqual(Math.ceil(clips(plan.shots).length / 2));
      // Each edit opens on and drops into moments no earlier edit used for either.
      for (const s of plan.shots.filter((x) => x.role === "hook" || x.role === "drop")) {
        const key = s.source === "reel" ? `reel${scene(s.srcStart + 0.1)}` : "car";
        if (s.source === "reel") expect(heroes.has(key)).toBe(false);
        heroes.add(key);
      }
    }
  });

  it("uses every clip the user picked, not the same few again and again", () => {
    // Fifteen phone clips of a trip, all of them the life (a user's upload): the picture
    // model rates a few as flex (the views, the yacht, the clubs) and the rest as people,
    // food, a laptop at dinner, a hotel room; one talking head among them.
    type C = [string, number, Kind, number, number, number?];
    const trip: C[] = [
      ["bar", 5, "party", 0.55, 0.5], ["dinner", 7.5, "work", 0.35, 0.4], ["beach", 20, "people", 0.45, 0.55], ["lights", 3.8, "party", 0.6, 0.6, 0.2],
      ["selfie", 14, "people", 0.35, 0.4, 0.2], ["curtains", 5.7, "party", 0.5, 0.5, 0.2], ["yacht", 11, "yacht", 0.85, 0.7], ["food", 5.2, "food", 0.4, 0.45],
      ["terrace", 14, "view", 0.8, 0.65], ["guys", 4.1, "people", 0.4, 0.4], ["pool", 3.2, "view", 0.7, 0.5], ["sofa", 7, "view", 0.8, 0.6],
      ["purple", 2.9, "party", 0.5, 0.6, 0.2], ["couple", 10, "people", 0.35, 0.45, 0.25], ["hotel", 16, "other", 0.5, 0.5],
    ];
    const footage = trip.map(([id, len, kind, flex, wow, luma], k) => {
      const sc = lookedAt(id, [{ len, kind, flex, wow, look: k }], 60 + k);
      if (luma) sc.stats.luma.fill(luma);
      return sc;
    });
    footage.push(lookedAt("talk", [{ len: 6, kind: "talking", flex: 0.1, wow: 0.2, look: 15 }], 90));
    scoreInterest(footage);
    const avoid: Ranges = new Map();
    for (let v = 0; v < 3; v++) {
      const plan = planMontage({ song, songSource: "song", songName: "click", fromStart: false, scans: footage, aspect: "9x16", length: 12.6, card: null, caption: null, variant: v, avoid });
      usedRanges(plan, avoid);
      const shots = clips(plan.shots);
      const count = new Map<string, number>();
      for (const s of shots) count.set(s.source, (count.get(s.source) ?? 0) + 1);
      // Every clip gets a turn before any comes back (as many as the edit has shots for),
      // none shows the same footage twice, and a long clip gives a few different moments at most.
      expect(count.size, JSON.stringify([...count])).toBeGreaterThanOrEqual(Math.min(15, shots.length));
      expect(Math.max(...count.values()), JSON.stringify([...count])).toBeLessThanOrEqual(3);
      for (const [id] of count) {
        const spans = shots.filter((s) => s.source === id).map((s) => [s.srcStart, s.srcStart + (s.end - s.start) * s.speed]).sort((x, y) => x[0] - y[0]);
        for (let k = 1; k < spans.length; k++) expect(spans[k][0], `${id} twice`).toBeGreaterThanOrEqual(spans[k - 1][1] - 0.05);
      }
      // The talking head stays out.
      expect(count.has("talk")).toBe(false);
      // The flex or the people at the beach open the edit (footage of the life: people
      // doing something count as much as a view), each edit on its own; never the dull
      // ones (a dark selfie, a dinner, the guys standing about).
      if (v < 2) expect(["yacht", "terrace", "sofa", "pool", "beach"]).toContain(plan.shots[0].source);
      expect(["dinner", "selfie", "guys", "couple", "food", "talk"]).not.toContain(plan.shots[0].source);
    }
  });

  it("never hops back and forth: a clip carries on, a jump further into it, or comes back well after", () => {
    // The user's trip again, its first six clips, and seven phone clips of anything:
    // more shots than clips, so each comes back.
    type C = [string, number, Kind, number, number, number?];
    const trip: C[] = [
      ["bar", 5, "party", 0.55, 0.5], ["dinner", 7.5, "work", 0.35, 0.4], ["beach", 20, "people", 0.45, 0.55], ["lights", 3.8, "party", 0.6, 0.6, 0.2],
      ["selfie", 14, "people", 0.35, 0.4, 0.2], ["curtains", 5.7, "party", 0.5, 0.5, 0.2],
    ];
    const six = trip.map(([id, len, kind, flex, wow, luma], k) => {
      const sc = lookedAt(id, [{ len, kind, flex, wow, look: k }], 60 + k);
      if (luma) sc.stats.luma.fill(luma);
      return sc;
    });
    const seven = Array.from({ length: 7 }, (_, i) => fakeScan(`clip${i}`, 5 + i, 700 + i));
    for (const footage of [six, seven]) {
      scoreInterest(footage);
      const avoid: Ranges = new Map();
      for (let v = 0; v < 3; v++) {
        const plan = planMontage({ song, songSource: "song", songName: "click", fromStart: false, scans: footage, aspect: "9x16", length: 12.6, card: null, caption: null, variant: v, avoid });
        usedRanges(plan, avoid);
        const shots = clips(plan.shots);
        // A clip it left under 2.5 s before, with one shot in between (A, B, A): never; with two, rarely.
        let twoBetween = 0;
        for (let j = 2; j < shots.length; j++) {
          for (let i = j - 2; i >= 0 && shots[j].start - shots[i].end < 2.5; i--) {
            if (shots[i].source !== shots[j].source) continue;
            expect(j - i - 1, `${shots[j].source} at ${shots[j].start.toFixed(2)}`).toBeGreaterThan(1);
            if (j - i - 1 === 2) twoBetween++;
            break;
          }
        }
        expect(twoBetween).toBeLessThanOrEqual(1);
        // Where a clip runs on into the next shot, it jumps further into it, never back.
        for (let k = 1; k < plan.shots.length; k++) {
          const [p, q] = [plan.shots[k - 1], plan.shots[k]];
          if (q.again) expect(q.srcStart).toBeGreaterThanOrEqual(p.srcStart + sourceSpan(p) - 1e-6);
        }
      }
    }
  });

  it("a long stretch of one car doesn't take over the edit", () => {
    // A vlog's ten scenes of one parked car (the best flex in the footage, in scene
    // after scene), six other flex scenes in a Reel, and a friend talking.
    const car = lookedAt("vlog", Array.from({ length: 10 }, (_, k) => ({ len: 3, kind: "car" as Kind, flex: 0.86, wow: 0.35, look: 0, frame: 20 + k })), 40);
    const reel = lookedAt("reel", (["jet", "yacht", "home", "view", "watch", "city"] as Kind[]).map((kind, k) => ({ len: 2.5, kind, flex: 0.72, wow: 0.45, look: k + 1 })), 41);
    const talk = lookedAt("talk", [{ len: 10, kind: "talking", flex: 0.1, wow: 0.2, look: 9 }], 42);
    const footage = [car, reel, talk];
    scoreInterest(footage);
    const avoid: Ranges = new Map();
    for (let v = 0; v < 3; v++) {
      const plan = planMontage({ song, songSource: "song", songName: "click", fromStart: false, scans: footage, aspect: "9x16", length: 14, card: null, caption: null, variant: v, avoid });
      usedRanges(plan, avoid);
      let run = 0;
      let longest = 0;
      for (const s of clips(plan.shots)) {
        run = s.source === "vlog" ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
      // A run of the car from different angles now and then, never the car and nothing else.
      expect(longest).toBeLessThanOrEqual(3);
      expect(clips(plan.shots).filter((s) => s.source === "vlog").length).toBeLessThanOrEqual(Math.ceil((2 * clips(plan.shots).length) / 3));
      expect(plan.shots.filter((s) => s.source === "talk")).toEqual([]);
    }
  });

  it("opens on a picture that reads at a glance, not a dark club", () => {
    // A night out: the club rated the most striking thing in the footage, but dim; a
    // yacht in daylight, a view and a villa a little behind it.
    const night = lookedAt("night", [{ len: 4, kind: "party", flex: 0.95, wow: 0.95, look: 0 }], 50);
    night.stats.luma.fill(0.24);
    const day = lookedAt("day", (["yacht", "view", "home"] as Kind[]).map((kind, k) => ({ len: 3, kind, flex: 0.8, wow: 0.7, look: k + 1 })), 51);
    const footage = [night, day];
    scoreInterest(footage);
    const plan = planMontage({ song, songSource: "song", songName: "click", fromStart: false, scans: footage, aspect: "9x16", length: 12, card: null, caption: null, variant: 0 });
    expect(plan.shots[0].source).toBe("day");
    // The club still has its place in the edit.
    expect(plan.shots.some((s) => s.source === "night")).toBe(true);
  });

  it("no jump cuts: two shots of one thing back to back change the framing", () => {
    // One car filmed in six clips: three framed the same way (the front, wide), three
    // others each framed their own way; and a Reel of four other flex scenes.
    const car = (k: number, frame: number) => lookedAt(`car${k}`, [{ len: 5, kind: "car", flex: 0.85, wow: 0.5, look: 0, frame }], 30 + k);
    const footage = [car(0, 20), car(1, 20), car(2, 20), car(3, 21), car(4, 22), car(5, 23), lookedAt("reel", (["jet", "yacht", "home", "view"] as Kind[]).map((kind, k) => ({ len: 1.6, kind, flex: 0.8, wow: 0.6, look: k + 1 })), 2)];
    scoreInterest(footage);
    const avoid: Ranges = new Map();
    for (let v = 0; v < 3; v++) {
      const plan = planMontage({ song, songSource: "song", songName: "click", fromStart: false, scans: footage, aspect: "9x16", length: 12, card: null, caption: null, variant: v, avoid });
      usedRanges(plan, avoid);
      const framing = (s: { source: string; srcStart: number }) => (["car0", "car1", "car2"].includes(s.source) ? "front" : s.source === "reel" ? `reel${Math.floor((s.srcStart + 0.1) / 1.6)}` : s.source);
      // (A clip re-cut on the beat, jumping on and punching in, is the one exception.)
      for (let k = 1; k < plan.shots.length; k++) if (!plan.shots[k].again) expect(framing(plan.shots[k])).not.toBe(framing(plan.shots[k - 1]));
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
    // Each opens on its own stretch of the video (two batch spacings apart at least).
    const far = 2 * apart(vlog);
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
      // Never the same moment twice in the first three; the fourth and fifth, cut on
      // every two beats (14 shots each, where an edit that cut wherever it liked made
      // about 10), start running out of the video's dozen flex stretches: the fifth
      // repeats half its shots at most.
      const before = plans.slice(0, k).flatMap((q) => q.shots.map((s) => [s.srcStart, s.srcStart + (s.end - s.start) * s.speed]));
      const same = p.shots.filter((s) => before.some(([x, y]) => s.srcStart < y && s.srcStart + (s.end - s.start) * s.speed > x)).length;
      expect(same).toBeLessThanOrEqual(k < 3 ? 0 : k < 4 ? 1 : Math.floor(p.shots.length / 2));
    }
  });

  it("from a minute and a half of video, where three edits have to share: never opens, drops or closes on another's opening, drop or last shot, and rarely shows one", () => {
    const short = longVlog(19, 90);
    const avoid: Ranges = new Map();
    const heroes: [number, number][] = [];
    const isHero = (role?: string) => role === "hook" || role === "drop" || role === "closer";
    let shown = 0;
    for (let v = 0; v < 3; v++) {
      const plan = planMontage({ song, songSource: "song", songName: "x", fromStart: true, scans: [short], aspect: "9x16", length: 14, card: null, caption: null, variant: v, avoid, toCome: 2 - v });
      const ranges = plan.shots.map((s) => [s.srcStart, s.srcStart + (s.end - s.start) * s.speed] as [number, number]);
      for (const [k, s] of plan.shots.entries()) {
        const [a, b] = ranges[k];
        if (!heroes.some(([x, y]) => a < y && b > x)) continue;
        expect(isHero(s.role)).toBe(false);
        shown++;
      }
      for (const [k, s] of plan.shots.entries()) if (isHero(s.role)) heroes.push(ranges[k]);
      usedRanges(plan, avoid);
    }
    // (Never as a later edit's opening, drop or last shot. In the body now and then: each
    // edit here cuts every two beats, 14 shots from a minute and a half of video.)
    expect(shown).toBeLessThanOrEqual(5);
  });
});

import { describe, expect, it } from "vitest";
import { analyzeSong } from "../src/engine/audio/song";
import { scoreInterest, type Kind, type Scan } from "../src/engine/media/scan";
import { CUT_LEAD, planMontage, usedRanges, type Ranges } from "../src/engine/plan/montage";
import { mixOrder, styleFor, windows, type Talker } from "../src/engine/plan/styles";
import { FPS, sourceSpan, type CardSpec, type EditPlan } from "../src/engine/plan/types";
import { fakeScan, lookedAt } from "./scans";

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
const card: CardSpec = { kind: "laptop", top: "start free", bottom: "namzilabs.co", accent: "#568CFF", hold: 4, draw: false };

/** Ten clips of the life and two photos. */
function footage(): Scan[] {
  const kinds: Kind[] = ["car", "jet", "yacht", "home", "view", "watch", "city", "travel", "party", "money"];
  const out = kinds.map((kind, k) => lookedAt(kind, [{ len: 5 + (k % 4), kind, flex: 0.7 + 0.02 * k, wow: 0.6, look: k }], 300 + k));
  out.push(fakeScan("photo1", 0, 31, "image"), fakeScan("photo2", 0, 32, "image"));
  return out;
}

/** Someone talking to the camera for 20 s: phrases of 1 to 3 s with breaths between them. */
function talkingClip(): { scan: Scan; talker: Talker } {
  const scan = lookedAt("talk", [{ len: 20, kind: "talking", flex: 0.1, wow: 0.2, look: 12 }], 400);
  const runs = [];
  for (let t = 0.6; t < 19; ) {
    const len = 1 + ((t * 7) % 2);
    runs.push({ start: t, end: t + len });
    t += len + (runs.length % 3 === 0 ? 0.7 : 0.2);
  }
  return { scan, talker: { id: "talk", runs } };
}

const base = { song, songSource: "song", songName: "click", fromStart: false, aspect: "9x16" as const, length: 14, caption: null, variant: 0 };
const monoOver = (plan: EditPlan, t: number) => plan.fx.some((f) => f.kind === "mono" && t >= f.start - 1e-6 && t < f.end - 1e-6);
const onBeat = (t: number, songStart: number) => song.beats.some((b) => Math.abs(b - songStart - CUT_LEAD - t) <= 1.5 / FPS);

describe("edit styles", () => {
  const scans = footage();
  scoreInterest(scans);

  it("talk, then the drop: someone talking in black and white with their own voice, a hard cut into colour on the drop", () => {
    const { scan, talker } = talkingClip();
    const all = [...scans, scan];
    scoreInterest(all);
    const plan = planMontage({ ...base, scans: all, card, style: "talk", talkers: [talker] });
    const drop = plan.shots.find((s) => s.role === "drop")!;
    expect(drop).toBeTruthy();
    expect(drop.start).toBeGreaterThanOrEqual(3 - 1e-6);
    const talk = plan.shots.filter((s) => s.source === "talk");
    // The talking opens the edit, runs up to the drop (or near it), voice on, and never
    // comes back: the rest is the other footage.
    expect(plan.shots[0].source).toBe("talk");
    expect(talk.every((s) => s.audio && s.end <= drop.start + 1e-6)).toBe(true);
    expect(plan.shots.filter((s) => s.start >= drop.start - 1e-6 && s.source === "talk")).toEqual([]);
    expect(talk.reduce((a, s) => a + s.end - s.start, 0)).toBeGreaterThan(0.8 * drop.start);
    // Each piece of it is talking (pauses cut out): it starts on a phrase.
    for (const s of talk) expect(talker.runs.some((r) => s.srcStart >= r.start - 0.1 && s.srcStart <= r.end)).toBe(true);
    expect(talker.runs.some((r) => Math.abs(r.start - 0.08 - talk[0].srcStart) < 0.01)).toBe(true);
    // Black and white up to the drop, colour from it.
    expect(monoOver(plan, 0.1)).toBe(true);
    expect(monoOver(plan, drop.start - 0.05)).toBe(true);
    expect(monoOver(plan, drop.start + 0.02)).toBe(false);
    // The song under the voice, all the way up on the drop.
    const pts = plan.music!.gainPoints!;
    expect(pts[0][1]).toBeLessThan(0.3);
    expect(pts[pts.length - 1]).toEqual([drop.start, 1]);
    // After the drop it's an edit: short shots on the beat.
    const after = plan.shots.filter((s) => s.start >= drop.start && !s.again);
    for (const s of after.slice(1)) expect(onBeat(s.start, plan.music!.songStart)).toBe(true);
    expect(plan.checks?.style).toBe("talk");
  });

  it("a talking head the picture model half reads as something else stays out of a flex edit", () => {
    // Someone talking to the camera in a room: the picture model calls three fifths of it
    // "money" (the room, the hoodie), the rest talking, and it's the brightest clip.
    const head = lookedAt("head", [3, 2, 3, 2, 3, 2].map((len, k) => ({ len, kind: (k % 2 ? "talking" : "money") as Kind, flex: 0.55, wow: 0.5, look: 13 })), 500);
    head.stats.luma.fill(0.6);
    const all = [...scans, head];
    scoreInterest(all);
    const avoid: Ranges = new Map();
    for (let v = 0; v < 3; v++) {
      const plan = planMontage({ ...base, scans: all, card, style: "beat", variant: v, avoid });
      usedRanges(plan, avoid);
      expect(plan.shots.filter((s) => s.source === "head")).toEqual([]);
    }
  });

  it("talk, then the drop, with no one talking: a few calm shots, a bar each, in black and white", () => {
    const plan = planMontage({ ...base, scans, card, style: "talk", talkers: [] });
    const drop = plan.shots.find((s) => s.role === "drop")!;
    const build = plan.shots.filter((s) => s.end <= drop.start + 1e-6);
    expect(build.length).toBeGreaterThanOrEqual(2);
    // (The first shot waits for the bar line; the rest hold a bar, 1.9 s at 128 bpm.)
    for (const s of build.slice(1, -1)) expect(s.end - s.start).toBeGreaterThan(1.5);
    expect(build.every((s) => !s.audio)).toBe(true);
    expect(monoOver(plan, drop.start - 0.05)).toBe(true);
    expect(monoOver(plan, drop.start + 0.05)).toBe(false);
  });

  it("black and white to colour: the build in black and white, colour on the drop, then a shot or two turning to colour on a beat", () => {
    const plan = planMontage({ ...base, scans, card, style: "mono" });
    const drop = plan.shots.find((s) => s.role === "drop")!;
    const monos = plan.fx.filter((f) => f.kind === "mono");
    expect(monos[0].start).toBe(0);
    expect(monos[0].end).toBeCloseTo(drop.start, 6);
    const flips = monos.slice(1);
    expect(flips.length).toBeGreaterThanOrEqual(1);
    const halves = song.beats.flatMap((b, i) => (i + 1 < song.beats.length ? [b, (b + song.beats[i + 1]) / 2] : [b]));
    for (const f of flips) {
      // A shot's start to a beat inside it, or to the clip's first re-cut.
      const k = plan.shots.findIndex((s) => Math.abs(s.start - f.start) < 1e-6);
      expect(k).toBeGreaterThan(0);
      const [shot, next] = [plan.shots[k], plan.shots[k + 1]];
      if (next?.again && Math.abs(f.end - next.start) < 1e-6) expect(next.source).toBe(shot.source);
      else expect(f.end).toBeLessThan(shot.end);
      expect(halves.some((b) => Math.abs(b - plan.music!.songStart - CUT_LEAD - f.end) <= 1.5 / FPS)).toBe(true);
    }
  });

  it("photo burst: after the first shot, pictures flying in tilted, a sixteenth each, the user's photos first", () => {
    const plan = planMontage({ ...base, scans, card, style: "burst" });
    const burst = plan.shots.filter((s) => s.crop.tilt);
    expect(burst.length).toBeGreaterThanOrEqual(4);
    expect(burst.length).toBeLessThanOrEqual(5);
    // Right after the first shot, back to back, three or four frames each, each tilted
    // the other way from the one before, each from another source; the last held to the
    // next cut, a clip (nio.trade's …0002: a clip on black until the next stab).
    expect(burst[0].start).toBeCloseTo(plan.shots[1].start, 6);
    for (const [j, s] of burst.entries()) {
      const frames = Math.round((s.end - s.start) * FPS);
      expect(frames).toBeGreaterThanOrEqual(3);
      if (j < burst.length - 1) expect(frames).toBeLessThanOrEqual(4);
      if (j) expect(Math.sign(s.crop.tilt!)).not.toBe(Math.sign(burst[j - 1].crop.tilt!));
      expect(s.crop.inset![1]).toBeLessThan(1);
    }
    expect(burst[burst.length - 1].kind).toBe("video");
    expect(new Set(burst.map((s) => s.source)).size).toBe(burst.length);
    expect(burst.slice(0, 2).map((s) => s.source).sort()).toEqual(["photo1", "photo2"]);
    // In place of a whole shot: the next cut is the rhythm's own, on the music (the shot
    // they replace doesn't come back after them), and the edit runs on unbroken.
    const k = plan.shots.indexOf(burst[burst.length - 1]);
    const plain = planMontage({ ...base, scans, card, style: "beat" });
    expect(plain.shots.some((s) => Math.abs(s.start - plan.shots[k + 1].start) < 1e-6)).toBe(true);
    for (let i = 1; i < plan.shots.length; i++) expect(plan.shots[i].start).toBeCloseTo(plan.shots[i - 1].end, 6);
  });

  it("photo burst: before it, the shot plays on and the user's photos land on the head of whoever is in it, on its last beats (nio.trade)", () => {
    const plan = planMontage({ ...base, scans, card, style: "burst" });
    const burst = plan.shots.filter((s) => s.crop.tilt);
    const host = plan.shots[plan.shots.indexOf(burst[0]) - 1];
    const pops = (plan.overlays ?? []).filter((o) => o.place);
    expect(host.kind).toBe("video");
    expect(pops.length).toBeGreaterThanOrEqual(1);
    expect(pops.length).toBeLessThanOrEqual(3);
    expect(pops[0].source).toMatch(/^photo/);
    const halves = song.beats.flatMap((b, i) => (i + 1 < song.beats.length ? [b, (b + song.beats[i + 1]) / 2] : [b]));
    for (const [j, p] of pops.entries()) {
      // On the head (found in the page), cropped to its own face, square, still.
      expect(p.place).toEqual({ on: "head", crop: "face" });
      expect([p.aspect, p.speed]).toEqual([1, 0]);
      // Each on a beat or a half beat in the shot's last two thirds, until the next, the last until the burst.
      expect(p.start).toBeGreaterThanOrEqual(host.start + 0.4 - 1e-6);
      expect(halves.some((b) => Math.abs(b - plan.music!.songStart - CUT_LEAD - p.start) <= 1.5 / FPS)).toBe(true);
      expect(p.end).toBeCloseTo(j + 1 < pops.length ? pops[j + 1].start : burst[0].start, 6);
      if (j) expect(Math.sign(p.tilt)).not.toBe(Math.sign(pops[j - 1].tilt));
    }
    // Up from black.
    expect(plan.fx.some((f) => f.kind === "fadein" && f.start === 0)).toBe(true);
  });

  it("windows: cards land in the middle on the beats, each clip in its own shape, and the last one, the next shot, goes full frame carrying straight on (TJR)", () => {
    const plan = planMontage({ ...base, scans, card, style: "beat", variant: 1 });
    const ws = (plan.overlays ?? []).filter((o) => !o.place);
    expect(ws.length).toBeGreaterThanOrEqual(1);
    expect(ws.length).toBeLessThanOrEqual(2);
    const w = ws[ws.length - 1];
    const next = plan.shots.find((s) => Math.abs(s.start - w.end) < 1e-6)!;
    const under = plan.shots.find((s) => w.start >= s.start - 1e-6 && w.start < s.end - 1e-6)!;
    expect(w.source).toBe(next.source);
    expect(under.source).not.toBe(next.source);
    expect(w.srcStart + (w.end - w.start) * w.speed).toBeCloseTo(next.srcStart, 6);
    const frame = plan.width / plan.height;
    const halves = song.beats.flatMap((b, i) => (i + 1 < song.beats.length ? [b, (b + song.beats[i + 1]) / 2] : [b]));
    for (const c of ws) {
      // In the middle, the clip's own shape, a fifth of the frame at most.
      const src = scans.find((sc) => sc.id === c.source)!;
      expect([c.x, c.y, c.tilt]).toEqual([0.5, 0.5, 0]);
      expect(c.aspect).toBeCloseTo(src.width / src.height, 6);
      expect(c.size * c.size * c.aspect).toBeLessThanOrEqual(0.2 * frame + 1e-9);
      expect(c.end).toBeCloseTo(w.end, 6);
      expect(halves.some((b) => Math.abs(b - plan.music!.songStart - CUT_LEAD - c.start) <= 1.5 / FPS)).toBe(true);
      expect(c.start).toBeGreaterThan(plan.shots.find((s) => s.role === "drop")!.start);
    }
    expect(w.end - w.start).toBeGreaterThanOrEqual(0.2 - 1e-6);
    if (ws.length === 2) {
      // Under it, landing first, another clip: not the one under the cards nor the next.
      expect(ws[0].start).toBeLessThan(w.start - 0.15);
      expect([under.source, next.source]).not.toContain(ws[0].source);
    }
  });

  it("windows stack: another clip's card on the beat before, then the next shot's on top, until the cut", () => {
    const crop = { cx: 0.5, cy: 0.5, zoom0: 1, zoom1: 1, fit: "cover" as const };
    const a = fakeScan("a", 20, 41);
    const b = { ...fakeScan("b", 20, 42), exactCuts: [6], checked: [[0, 20]] as [number, number][] };
    const c = { ...fakeScan("c", 12, 43), width: 1080, height: 1350 };
    const shots = [
      { start: 0, end: 2, source: "a", kind: "video" as const, srcStart: 1, speed: 1, crop, role: "drop" as const },
      { start: 2, end: 3.2, source: "a", kind: "video" as const, srcStart: 4, speed: 1, crop },
      { start: 3.2, end: 3.8, source: "b", kind: "video" as const, srcStart: 6.07, speed: 1, crop },
      { start: 3.8, end: 5, source: "a", kind: "video" as const, srcStart: 9, speed: 1, crop, role: "closer" as const },
    ];
    const beats = Array.from({ length: 13 }, (_, k) => 0.4 * k);
    const { shots: out, overlays } = windows(shots, beats, [a, b, c], 0, 9 / 16);
    expect(overlays.map((o) => [o.source, +o.start.toFixed(6), +o.end.toFixed(6)])).toEqual([
      ["c", 2.8, 3.2],
      ["b", 3, 3.2],
    ]);
    // c in its own 4:5, b in its 16:9; b playing on into the shot, which starts later for it.
    expect(overlays[0].aspect).toBeCloseTo(0.8, 6);
    expect(overlays[1].aspect).toBeCloseTo(16 / 9, 6);
    expect(overlays[0].speed).toBe(1);
    expect(overlays[1].srcStart).toBeGreaterThanOrEqual(6.07 - 1e-9);
    expect(out[2].srcStart).toBeCloseTo(overlays[1].srcStart + 0.2, 9);
  });

  it("fast re-cuts: a third of the cuts or more re-cut the clip before, a jump further into it", () => {
    const plain = planMontage({ ...base, scans, card, style: "beat" });
    const fast = planMontage({ ...base, scans, card, style: "recut" });
    const share = (p: EditPlan) => p.shots.filter((s) => s.again).length / p.shots.length;
    expect(share(fast)).toBeGreaterThanOrEqual(0.33);
    expect(share(fast)).toBeGreaterThan(share(plain) + 0.08);
    // From the start: the build is re-cut on the beat as well.
    const drop = fast.shots.find((s) => s.role === "drop")!;
    expect(fast.shots.some((s) => s.again && s.end <= drop.start)).toBe(true);
    for (let k = 1; k < fast.shots.length; k++) {
      const [p, q] = [fast.shots[k - 1], fast.shots[k]];
      if (q.again) {
        expect(q.source).toBe(p.source);
        expect(q.srcStart).toBeGreaterThanOrEqual(p.srcStart + sourceSpan(p) - 1e-6);
      }
    }
  });

  it("slow and cinematic: long holds, every shot moving slowly, no flourish", () => {
    const plan = planMontage({ ...base, scans, card, style: "slow" });
    const lengths = plan.shots.map((s) => s.end - s.start).sort((a, b) => a - b);
    expect(lengths[Math.floor(lengths.length / 2)]).toBeGreaterThanOrEqual(0.9);
    expect(plan.shots.some((s) => s.again)).toBe(false);
    expect(plan.fx.filter((f) => ["flash", "burn", "shake", "punch", "zoomblur"].includes(f.kind))).toEqual([]);
    for (const s of plan.shots.slice(0, -1)) if (s.kind === "video") expect(Math.abs(s.crop.zoom1 - s.crop.zoom0)).toBeGreaterThan(0.03);
  });

  it("loops without an end card: the last shot runs into the first", () => {
    for (const style of ["beat", "mono", "recut", "slow", "burst"] as const) {
      const plan = planMontage({ ...base, scans, card: null, style, loop: true });
      const [first, last] = [plan.shots[0], plan.shots[plan.shots.length - 1]];
      expect(last.source, style).toBe(first.source);
      if (first.kind === "video") {
        const d = last.end - last.start;
        // The footage just before the first frame (or the first shot again, when there's none).
        expect([first.srcStart, first.srcStart - d].some((t) => Math.abs(t - last.srcStart) < 1e-6)).toBe(true);
        if (first.srcStart - d >= 0.05) expect(last.srcStart + d).toBeCloseTo(first.srcStart, 6);
      }
      expect(plan.music!.fadeOut).toBeLessThan(0.1);
      // Known before the shots around it were picked: none of the last ones shows it.
      const tail = plan.shots.filter((s) => !s.again && s.end > last.start - 2.5 && s !== last);
      expect(tail.slice(-2).map((s) => s.source), style).not.toContain(last.source);
    }
    // Not with a card (the card is the end), and not after talking.
    const carded = planMontage({ ...base, scans, card, style: "beat", loop: true });
    expect(carded.checks?.loop).toBeUndefined();
    const { scan, talker } = talkingClip();
    const all = [...scans, scan];
    scoreInterest(all);
    const talk = planMontage({ ...base, scans: all, card: null, style: "talk", talkers: [talker], loop: true });
    expect(talk.shots[talk.shots.length - 1].source).not.toBe("talk");
  });

  it("mixes styles through a batch, each edit its own, and each talking edit its own stretch of talking", () => {
    const { scan, talker } = talkingClip();
    const order = mixOrder([...scans, scan], true);
    expect(order).toEqual(["beat", "talk", "mono", "burst", "recut", "slow"]);
    expect(mixOrder(scans, false)).toEqual(["beat", "mono", "burst", "recut", "slow"]);
    expect(mixOrder(scans.slice(0, 3), false)).toEqual(["beat", "mono", "recut", "slow"]);
    // Cutting hard, no slow edit in the mix; relaxed, no fast re-cuts.
    expect(mixOrder(scans, false, "hard")).toEqual(["beat", "mono", "burst", "recut"]);
    expect(mixOrder(scans, false, "relaxed")).toEqual(["beat", "mono", "burst", "slow"]);
    expect([0, 1, 2, 6, 7].map((n) => styleFor(n, "mix", order))).toEqual(["beat", "talk", "mono", "beat", "talk"]);
    expect(styleFor(4, "slow", order)).toBe("slow");
    // Two talking edits in a batch talk from different places.
    const all = [...scans, scan];
    scoreInterest(all);
    const avoid: Ranges = new Map();
    const starts: number[] = [];
    for (let v = 0; v < 2; v++) {
      const plan = planMontage({ ...base, scans: all, card, style: "talk", talkers: [talker], variant: v, avoid });
      usedRanges(plan, avoid);
      starts.push(plan.shots[0].srcStart);
    }
    expect(Math.abs(starts[0] - starts[1])).toBeGreaterThan(2);
  });
});

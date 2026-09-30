import { describe, expect, it } from "vitest";
import { analyzeSong } from "../src/engine/audio/song";
import { scoreInterest, type Kind, type Scan } from "../src/engine/media/scan";
import { CUT_LEAD, planMontage, usedRanges, type Ranges } from "../src/engine/plan/montage";
import { mixOrder, styleFor, type Talker } from "../src/engine/plan/styles";
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
    // the other way from the one before, each from another source.
    expect(burst[0].start).toBeCloseTo(plan.shots[1].start, 6);
    for (const [j, s] of burst.entries()) {
      const frames = Math.round((s.end - s.start) * FPS);
      expect(frames).toBeGreaterThanOrEqual(3);
      expect(frames).toBeLessThanOrEqual(4);
      if (j) expect(Math.sign(s.crop.tilt!)).not.toBe(Math.sign(burst[j - 1].crop.tilt!));
      expect(s.crop.inset![1]).toBeLessThan(1);
    }
    expect(new Set(burst.map((s) => s.source)).size).toBe(burst.length);
    expect(burst.slice(0, 2).map((s) => s.source).sort()).toEqual(["photo1", "photo2"]);
    // The shot after it keeps a third of a second at least, and the edit runs on unbroken.
    const k = plan.shots.indexOf(burst[burst.length - 1]);
    expect(plan.shots[k + 1].end - plan.shots[k + 1].start).toBeGreaterThanOrEqual(0.3 - 1e-6);
    for (let i = 1; i < plan.shots.length; i++) expect(plan.shots[i].start).toBeCloseTo(plan.shots[i - 1].end, 6);
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

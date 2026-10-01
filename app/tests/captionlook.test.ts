import { describe, expect, it } from "vitest";
import { analyzeSong, type SongAnalysis } from "../src/engine/audio/song";
import { scoreInterest, type Kind, type Scan } from "../src/engine/media/scan";
import { applyDesign, heardBeats, ownCaptions, type Design } from "../src/engine/plan/designs";
import { planMontage } from "../src/engine/plan/montage";
import type { CaptionEvent, EditPlan, TextLook } from "../src/engine/plan/types";
import { BLEND_INDEX, CANVAS_BLEND, DEFAULT_LOOK, FACES, TEXT_LOOKS } from "../src/engine/render/captions";
import { lookedAt } from "./scans";

const SR = 22050;

/** `secs` of music at `bpm`: soft hats, then from `drop` on kicks on every beat. */
function track(bpm: number, secs: number, drop: number): SongAnalysis {
  const y = new Float32Array(SR * secs);
  const period = 60 / bpm;
  const hit = (t: number, amp: number, hz: number, decay: number) => {
    const s0 = Math.round(t * SR);
    for (let i = 0; i < 3000 && s0 + i < y.length; i++) y[s0 + i] += amp * Math.exp(-i / decay) * Math.sin((2 * Math.PI * hz * i) / SR);
  };
  for (let b = 0; b * period < secs - 0.5; b++) {
    const t = 0.1 + b * period;
    hit(t, 0.3, 6000, 60);
    if (t > drop) hit(t, b % 4 === 0 ? 0.9 : 0.6, 60, 900);
  }
  return analyzeSong(y, SR);
}

const song = track(128, 24, 8);

function footage(): Scan[] {
  const kinds: Kind[] = ["car", "jet", "yacht", "home", "view", "watch", "city", "travel"];
  const out = kinds.map((kind, k) => lookedAt(kind, [{ len: 5 + (k % 4), kind, flex: 0.7 + 0.02 * k, wow: 0.6, look: k }], 400 + k));
  scoreInterest(out);
  return out;
}

const own: TextLook = { ...DEFAULT_LOOK, font: "anton", y: 0.3, x: 0.4, blend: "multiply" };

function planWith(look: TextLook, design?: Design, text = "we never stop moving"): EditPlan {
  const scans = footage();
  const plan = planMontage({ song, songSource: "song", songName: "click", fromStart: false, scans, aspect: "9x16", length: 14, variant: 0, card: null, caption: { style: "mood", text } });
  plan.captions = plan.captions.map((c) => ({ ...c, look }));
  return design ? applyDesign(plan, design, song, { scans }) : plan;
}

const cap = (look: TextLook, text = "we never stop moving"): CaptionEvent => ({ style: "mood", text, start: 0, end: 6, look });

describe("captions of the user's own design", () => {
  it("come on word by word on the beats, each word keeping the look and where it was put", () => {
    const beats = [0.5, 1, 1.5, 2, 2.5, 3];
    const out = ownCaptions([cap({ ...own, animate: "words" })], undefined, beats);
    expect(out.map((c) => c.text)).toEqual(["we", "never", "stop", "moving", "we never stop moving"]);
    expect(out.map((c) => c.start)).toEqual([0, 0.5, 1, 1.5, 2]);
    for (const c of out) {
      expect(c.look).toEqual({ ...own, animate: "words" });
      expect(c.pop).toBe(true);
    }
  });

  it("word by word on an even step of their own when the song gives too few beats", () => {
    const out = ownCaptions([cap({ ...own, animate: "words" })], undefined, []);
    expect(out.length).toBe(5);
    const gaps = out.slice(1).map((c, i) => c.start - out[i].start);
    for (const g of gaps) expect(g).toBeCloseTo(0.4, 6);
    // A line too long to go word by word shows whole, popping in.
    const long = ownCaptions([cap({ ...own, animate: "words" }, "one two three four five six seven eight nine")], undefined, []);
    expect(long).toHaveLength(1);
    expect(long[0].pop).toBe(true);
  });

  it("pop, fade, type and none each as asked", () => {
    expect(ownCaptions([cap({ ...own, animate: "pop" })], undefined, [])[0].pop).toBe(true);
    expect(ownCaptions([cap({ ...own, animate: "fade" })], undefined, [])[0].anim).toBe("fade");
    expect(ownCaptions([cap({ ...own, animate: "type" })], undefined, [])[0].anim).toBe("type");
    const none = ownCaptions([cap({ ...own, animate: "none" })], undefined, [])[0];
    expect(none.pop).toBe(false);
    expect(none.anim).toBeUndefined();
  });

  it("left to the design: words for the hard ones, a fade for cinematic, typed for the tape, held for clean", () => {
    const design = (d: Design | undefined) => ownCaptions([cap({ ...own, animate: "design" })], d, [0.5, 1, 1.5, 2, 2.5]);
    expect(design("flash").length).toBe(5);
    expect(design("cinematic")[0].anim).toBe("fade");
    expect(design("vhs")[0].anim).toBe("type");
    expect(design("clean")).toHaveLength(1);
    expect(design("clean")[0].pop).toBe(false);
    expect(design(undefined)[0].pop).toBe(true);
  });

  it("a design leaves their look and place alone (no film title moved to the middle, no restyle)", () => {
    for (const d of ["cinematic", "vhs", "glitch", "flash", "clean"] as Design[]) {
      const plan = planWith(own, d);
      const mine = plan.captions.filter((c) => c.look);
      expect(mine.length, d).toBeGreaterThan(0);
      for (const c of mine) {
        expect(c.style, d).toBe("mood");
        expect(c.y, d).toBeUndefined();
        expect(c.look!.y).toBe(0.3);
      }
    }
    // The tape's own date and PLAY still come on in its own look.
    expect(planWith(own, "vhs").captions.filter((c) => !c.look).map((c) => c.style)).toEqual(["osd", "osd"]);
  });

  it("words on the heard beats, all before the drop", () => {
    const plan = planWith({ ...own, animate: "words" }, "zoom");
    const drop = plan.shots.find((s) => s.role === "drop")?.start ?? Infinity;
    const beats = heardBeats(plan, song);
    const words = plan.captions.filter((c) => c.look);
    expect(words.length).toBe(5);
    for (const w of words.slice(1)) {
      expect(w.start).toBeLessThan(drop);
      expect(beats.some((b) => Math.abs(b - w.start) < 1e-6)).toBe(true);
    }
  });

  it("every face, blend and ready-made look is one the renderer knows", () => {
    for (const l of TEXT_LOOKS) {
      expect(FACES[l.look.font], l.id).toBeDefined();
      expect(BLEND_INDEX[l.look.blend], l.id).toBeGreaterThanOrEqual(0);
      expect(CANVAS_BLEND[l.look.blend], l.id).toBeTruthy();
      expect(Object.keys(l.look).sort()).toEqual(Object.keys(DEFAULT_LOOK).sort());
    }
    expect(new Set(Object.values(BLEND_INDEX)).size).toBe(Object.keys(BLEND_INDEX).length);
  });
});

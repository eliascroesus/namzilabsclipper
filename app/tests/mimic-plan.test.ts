import { describe, expect, it } from "vitest";
import { retime } from "../src/mimic/asr/align";
import { DEFAULT_LOOK, paginate } from "../src/mimic/captions";
import { planMimic, progress, zoomAt } from "../src/mimic/plan";
import { cardOffset } from "../src/mimic/render";
import type { MimicTemplate } from "../src/mimic/types";
import type { Word } from "../src/mimic/asr/parakeet";

/** Words said one after another, 0.3 s each, with a pause after every sentence. */
function say(text: string, from = 0): Word[] {
  let t = from;
  return text.split(" ").map((w) => {
    const word = { text: w, start: t, end: t + 0.28, conf: 1 };
    t += /[.!?]$/.test(w) ? 0.8 : 0.3;
    return word;
  });
}

describe("captions from words", () => {
  it("break at a sentence's end or a pause, fill lines to the reference's letters, and hold its lines per caption", () => {
    const look = { ...DEFAULT_LOOK, chars: 16, lines: 2 as const };
    const pages = paginate(say("Du har sikkert set en masse idioter der siger til dig at du bliver rig. Så hvis du vil det"), look);
    // Page one: the first sentence's first two lines.
    expect(pages[0].lines.map((l) => l.map((w) => w.text).join(" "))).toEqual(["Du har sikkert", "set en masse"]);
    for (const p of pages) {
      expect(p.lines.length).toBeLessThanOrEqual(2);
      for (const l of p.lines) expect(l.map((w) => w.text).join(" ").length).toBeLessThanOrEqual(16);
    }
    // The sentence ends a caption: "Så" starts one.
    expect(pages.some((p) => p.lines[0][0].text === "Så")).toBe(true);
    // A caption stays until the next begins (or a little past its last word).
    for (let i = 1; i < pages.length; i++) expect(pages[i - 1].end).toBeLessThanOrEqual(pages[i].start + 1e-9);
  });
});

describe("fixing the words", () => {
  it("keeps each word's time, and times new words from their neighbours", () => {
    const heard = say("Du har sikret set mig på Tigser og tænker");
    const fixed = retime(heard, "Du har sikkert set mig på TikTok, og tænker");
    expect(fixed.map((w) => w.text)).toEqual(["Du", "har", "sikkert", "set", "mig", "på", "TikTok,", "og", "tænker"]);
    fixed.forEach((w, i) => expect(w.start).toBeCloseTo(heard[i].start, 6));
    // A word added between two heard ones sits between them.
    const added = retime(heard, "Du har sikkert set mig på TikTok og så tænker");
    const saa = added.find((w) => w.text === "så")!;
    expect(saa.start).toBeGreaterThanOrEqual(heard[7].end - 1e-9);
    expect(saa.end).toBeLessThanOrEqual(heard[8].start + 1e-9);
  });
});

describe("the zoom's keyframes", () => {
  it("ramp between keys and jump where two keys share a time", () => {
    const keys: [number, number][] = [[0, 1], [2, 1], [2.2, 1.15], [5, 1.15], [5, 1], [9, 1]];
    expect(zoomAt(keys, 1)).toBe(1);
    expect(zoomAt(keys, 2.1)).toBeCloseTo(1.075, 6);
    expect(zoomAt(keys, 4.99)).toBeCloseTo(1.15, 6);
    expect(zoomAt(keys, 5)).toBe(1);
  });
});

describe("a card's motion", () => {
  it("slides in from the right, easing out, rests, then slides out to the left", () => {
    const c = { start: 1, end: 3, rect: [0.1, 0.2, 0.8, 0.56] as [number, number, number, number], enter: { kind: "slide" as const, from: "right" as const, dur: 0.2, ease: "out" as const }, exit: { kind: "slide" as const, from: "left" as const, dur: 0.4, ease: "in" as const } };
    expect(cardOffset(c, 0.99)).toBeNull();
    expect(cardOffset(c, 1)!.dx).toBeCloseTo(0.9, 6);
    // easing out: most of the way in by halfway
    expect(cardOffset(c, 1.1)!.dx).toBeLessThan(0.9 * 0.3);
    expect(cardOffset(c, 2)!.dx).toBe(0);
    // easing in: barely moved halfway out
    const half = cardOffset(c, 2.8)!.dx;
    expect(half).toBeLessThan(0);
    expect(half).toBeGreaterThan(-0.9 * 0.3);
    expect(cardOffset(c, 3)).toBeNull();
  });
});

describe("how far through the talk", () => {
  it("counts only the voiced time", () => {
    const p = progress([{ start: 0, end: 2 }, { start: 5, end: 7 }]);
    expect(p.at(1)).toBeCloseTo(0.25, 6);
    expect(p.at(4)).toBeCloseTo(0.5, 6);
    expect(p.time(0.75)).toBeCloseTo(6, 6);
  });
});

const template: MimicTemplate = {
  version: 1,
  name: "ref",
  duration: 20,
  width: 1080,
  height: 1920,
  speech: [{ start: 0, end: 18 }],
  captions: DEFAULT_LOOK,
  cards: [
    { id: "card1", start: 1, end: 1.5, rect: [0.1, 0.2, 0.8, 0.56], enter: { kind: "slide", from: "right", dur: 0.2, ease: "out" }, exit: { kind: "cut", dur: 0, ease: "linear" }, run: 0, content: "photo", radius: 0 },
    { id: "card2", start: 1.5, end: 2.2, rect: [0.1, 0.2, 0.8, 0.56], enter: { kind: "cut", dur: 0, ease: "linear" }, exit: { kind: "slide", from: "left", dur: 0.4, ease: "in" }, run: 0, content: "photo", radius: 0 },
    { id: "card3", start: 9, end: 10.5, rect: [0.12, 0.28, 0.76, 0.38], enter: { kind: "slide", from: "right", dur: 0.3, ease: "out" }, exit: { kind: "slide", from: "left", dur: 0.4, ease: "in" }, run: 1, content: "screenshot", radius: 0 },
  ],
  broll: [{ id: "broll1", start: 5, end: 7, zoom: [1, 1.3], cuts: 0 }],
  zoom: { close: 1.16, dur: 0.2, every: 2, changes: [{ t: 3, level: 1.16, dur: 0.2 }, { t: 12, level: 1, dur: 0.2 }] },
  sound: { bed: { start: 8, level: -16 }, sfx: [] },
  tail: 3,
  speaker: null,
  maxPause: 0.3,
  notes: [],
};

describe("the mimic plan", () => {
  const words = say("En to tre fire fem seks syv otte ni ti elleve tolv tretten fjorten femten seksten sytten atten nitten tyve. En to tre fire fem seks syv otte ni ti elleve tolv tretten fjorten femten seksten sytten atten nitten tyve. En to tre fire fem seks syv otte ni ti elleve tolv tretten fjorten femten seksten sytten atten nitten tyve.");
  const dur = words[words.length - 1].end + 0.5;
  const base = {
    template,
    raw: { id: "raw", duration: dur, width: 608, height: 1080, cuts: [4.2, 11.1] },
    words,
    speech: [{ start: 0, end: dur - 0.5 }],
    extras: [
      { id: "a", name: "a.jpg", kind: "image" as const, width: 800, height: 1000, duration: 0 },
      { id: "b", name: "b.jpg", kind: "image" as const, width: 1200, height: 800, duration: 0, focus: { x: 0.7, y: 0.3 } },
      { id: "v", name: "v.mp4", kind: "video" as const, width: 1920, height: 1080, duration: 4 },
      { id: "c", name: "c.jpg", kind: "image" as const, width: 1000, height: 1000, duration: 0 },
    ],
    clip: false,
  };

  it("keeps the hook's cards to the second, fills cards with pictures and the cutaway with the clip, and ends on black", () => {
    const plan = planMimic(base);
    const [c1, c2] = plan.cards;
    expect(c1.start).toBeCloseTo(1, 6);
    expect(c1.extra).toBe("a");
    expect(c2.start).toBeCloseTo(1.5, 6);
    expect(c2.extra).toBe("b");
    expect(plan.broll).toHaveLength(1);
    expect(plan.broll[0].extra).toBe("v");
    // The later card lands at the same share of the talk, on a word.
    const c3 = plan.cards.find((c) => c.slot === "card3")!;
    expect(c3.extra).toBe("c");
    expect(words.some((w) => Math.abs(w.start - c3.start) < 1e-6)).toBe(true);
    expect(plan.tail).toBe(3);
    expect(plan.duration).toBeCloseTo(dur + 3, 6);
    // The picture fills the card about its subject.
    expect(c2.crop.cx).toBeGreaterThan(0.5);
  });

  it("jumps the zoom at every cut in the footage, and steps it where the reference does", () => {
    const plan = planMimic(base);
    for (const cut of base.raw.cuts) {
      expect(zoomAt(plan.zoom, cut - 0.01)).not.toBeCloseTo(zoomAt(plan.zoom, cut + 0.001), 3);
    }
    const levels = new Set(plan.zoom.map(([, z]) => z));
    expect([...levels].every((z) => z === 1 || Math.abs(z - 1.16) < 1e-9)).toBe(true);
  });

  it("cuts the pauses when asked, keeping every word", () => {
    const gappy = say("Et. To. Tre. Fire.").map((w, i) => ({ ...w, start: w.start + i * 1.5, end: w.end + i * 1.5 }));
    const speech = gappy.map((w) => ({ start: w.start, end: w.end }));
    const plan = planMimic({ ...base, words: gappy, speech, raw: { ...base.raw, duration: 10, cuts: [] }, clip: true, extras: [] });
    expect(plan.segments.length).toBe(4);
    expect(plan.duration - plan.tail).toBeLessThan(4);
    expect(plan.captions!.pages.flatMap((p) => p.lines.flat()).map((w) => w.text)).toEqual(["Et.", "To.", "Tre.", "Fire."]);
  });

  it("leaves a slot empty when told to, and puts music in where the reference's bed came in", () => {
    const plan = planMimic({ ...base, assign: { card1: null }, music: { id: "m", duration: 60 } });
    expect(plan.cards.some((c) => c.slot === "card1")).toBe(false);
    expect(plan.cards.find((c) => c.slot === "card2")?.extra).toBe("a");
    expect(plan.music?.gain).toBe(-16);
    expect(plan.music!.start).toBeGreaterThan(8);
  });
});

import { describe, expect, it } from "vitest";
import { retime } from "../src/mimic/asr/align";
import { DEFAULT_LOOK, paginate } from "../src/mimic/captions";
import { lineAt, planMimic, progress, zoomAt } from "../src/mimic/plan";
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

  it("gives the clips to the cutaways before a card left without a picture takes one", () => {
    const tpl = { ...template, broll: [...template.broll, { id: "broll2", start: 14, end: 16, zoom: [1, 1.2] as [number, number], cuts: 0 }] };
    const clip = (id: string) => ({ id, name: `${id}.mp4`, kind: "video" as const, width: 1920, height: 1080, duration: 4 });
    const extras = [base.extras[0], { ...base.extras[0], id: "b" }, clip("v"), clip("w")];
    const plan = planMimic({ ...base, template: tpl, extras });
    expect(plan.broll.map((b) => b.extra)).toEqual(["v", "w"]);
    expect(plan.cards.map((c) => c.extra)).toEqual(["a", "b"]);
    // A clip over, with every cutaway filled, goes to the card.
    const more = planMimic({ ...base, template: tpl, extras: [...extras, clip("x")] });
    expect(more.cards.find((c) => c.slot === "card3")?.extra).toBe("x");
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

describe("sound effects", () => {
  const words = say("En to tre fire fem seks syv otte ni ti elleve tolv tretten fjorten femten seksten sytten atten nitten tyve. En to tre fire fem seks syv otte ni ti elleve tolv tretten fjorten femten seksten sytten atten nitten tyve. Det koster fem tusind kroner.");
  const dur = words[words.length - 1].end + 0.5;
  const base = {
    template,
    raw: { id: "raw", duration: dur, width: 608, height: 1080, cuts: [] },
    words,
    speech: [{ start: 0, end: dur - 0.5 }],
    extras: [
      { id: "a", name: "a.jpg", kind: "image" as const, width: 800, height: 1000, duration: 0 },
      { id: "b", name: "b.jpg", kind: "image" as const, width: 800, height: 1000, duration: 0 },
      { id: "v", name: "v.mp4", kind: "video" as const, width: 1920, height: 1080, duration: 4 },
      { id: "c", name: "c.jpg", kind: "image" as const, width: 800, height: 1000, duration: 0 },
    ],
    clip: false,
  };
  const at = (p: ReturnType<typeof planMimic>, key: string) => p.sfx.find((c) => c.key === key);

  it("whoosh as a card slides in (from its side) and out, swipe as a run's picture changes, whoosh into a cutaway", () => {
    const plan = planMimic(base);
    const inn = at(plan, "in:card1")!;
    expect(inn.sound).toBe("whoosh");
    expect(inn.t).toBeCloseTo(1 + 0.2 * 0.7, 6);
    expect(inn.pan).toEqual([0.7, 0]);
    expect(at(plan, "swap:card2")).toMatchObject({ sound: "swipe", t: 1.5 });
    const out = at(plan, "out:card2")!;
    expect(out.t).toBeCloseTo(2.2 - 0.4 * 0.6, 6);
    expect(out.pan).toEqual([0, -0.7]);
    expect(at(plan, "cut:broll1")!.t).toBeCloseTo(plan.broll[0].start, 6);
    // In order, and none on a card that's a straight cut out.
    expect(plan.sfx.map((c) => c.t)).toEqual([...plan.sfx.map((c) => c.t)].sort((x, y) => x - y));
    expect(at(plan, "out:card1")).toBeUndefined();
  });

  it("keeps the user's changes by what they're on, and their own sounds", () => {
    const plan = planMimic({ ...base, sfx: { mode: "moves", move: "swipe", db: -3, edits: { "in:card1": { dt: 0.1, db: -6, sound: "pop" }, "swap:card2": { off: true } }, mine: [{ key: "mine:1", t: 5, sound: "ding", db: 2, why: "yours" }] } });
    expect(at(plan, "in:card1")).toMatchObject({ sound: "pop", db: -6 });
    expect(at(plan, "in:card1")!.t).toBeCloseTo(1 + 0.14 + 0.1, 6);
    expect(at(plan, "swap:card2")).toBeUndefined();
    expect(at(plan, "out:card2")!.sound).toBe("swipe");
    expect(at(plan, "mine:1")).toMatchObject({ t: 5, sound: "ding", db: 2 });
    expect(plan.sfxGain).toBe(-3);
    const none = planMimic({ ...base, sfx: { mode: "none", move: "whoosh", db: 0, mine: [{ key: "mine:1", t: 5, sound: "ding", db: 0, why: "yours" }] } });
    expect(none.sfx.map((c) => c.key)).toEqual(["mine:1"]);
  });

  it("puts the script's sounds on their words, through the edit's clock", () => {
    const kroner = words.findIndex((w) => w.text.startsWith("kroner"));
    const plan = planMimic({ ...base, sfx: { mode: "script", move: "whoosh", db: 0, script: [{ key: `word:${kroner}`, t: words[kroner].start, sound: "cash", why: "money" }] } });
    expect(at(plan, `word:${kroner}`)).toMatchObject({ sound: "cash" });
    expect(at(plan, `word:${kroner}`)!.t).toBeCloseTo(words[kroner].start, 6);
    expect(planMimic({ ...base, sfx: { mode: "moves", move: "whoosh", db: 0, script: [{ key: "word:1", t: 1, sound: "cash", why: "" }] } }).sfx.some((c) => c.key === "word:1")).toBe(false);
  });
});

describe("cards where the script says it", () => {
  const words = say("En to tre fire fem seks syv otte ni ti elleve tolv tretten fjorten femten seksten sytten atten nitten tyve. En to tre fire fem seks syv otte ni ti elleve tolv tretten fjorten femten seksten sytten atten nitten tyve.");
  const dur = words[words.length - 1].end + 0.5;
  const base = {
    template,
    raw: { id: "raw", duration: dur, width: 608, height: 1080, cuts: [] },
    words,
    speech: [{ start: 0, end: dur - 0.5 }],
    extras: [
      { id: "a", name: "a.jpg", kind: "image" as const, width: 800, height: 1000, duration: 0 },
      { id: "b", name: "b.jpg", kind: "image" as const, width: 800, height: 1000, duration: 0 },
      { id: "c", name: "c.jpg", kind: "image" as const, width: 800, height: 1000, duration: 0 },
    ],
    clip: false,
  };

  it("moves a run to its moment, keeping its own rhythm, and lets nothing land on top of it", () => {
    const w = words[30];
    const plan = planMimic({ ...base, anchor: { card1: w.start + 0.05, card3: w.start } });
    const [c1, c2] = ["card1", "card2"].map((id) => plan.cards.find((c) => c.slot === id)!);
    expect(c1.start).toBeCloseTo(w.start, 6);
    expect(c2.start - c1.start).toBeCloseTo(0.5, 6);
    // card3 was sent to the same moment: it waits for the run to go.
    const c3 = plan.cards.find((c) => c.slot === "card3")!;
    expect(c3.start).toBeGreaterThanOrEqual(c2.end + 0.15 - 1e-9);
    // And its sounds came along.
    expect(plan.sfx.find((c) => c.key === "in:card1")!.t).toBeGreaterThan(c1.start);
  });

  it("finds the moment when the footage's pause there was cut", () => {
    const gap = say("Et to tre. Fire fem seks.").map((x, i) => (i >= 3 ? { ...x, start: x.start + 3, end: x.end + 3 } : x));
    const plan = planMimic({ ...base, words: gap, speech: gap.map((x) => ({ start: x.start, end: x.end })), raw: { ...base.raw, duration: 8 }, clip: true, extras: [base.extras[2]], assign: { card1: null, card2: null }, anchor: { card3: gap[2].end + 1.5 } });
    const c3 = plan.cards.find((c) => c.slot === "card3");
    // In the pause that was cut: it goes on the next word kept.
    expect(c3?.start).toBeCloseTo(plan.captions!.pages.flatMap((p) => p.lines.flat()).find((x) => x.text === "Fire")!.start, 6);
  });
});

describe("pictures where the footage talks about them", () => {
  const words = say("En to tre fire fem seks syv otte ni ti elleve tolv tretten fjorten femten seksten sytten atten nitten tyve. En to tre fire fem seks syv otte ni ti elleve tolv tretten fjorten femten seksten sytten atten nitten tyve.");
  const dur = words[words.length - 1].end + 0.5;
  const pic = (id: string, look?: "screenshot" | "photo") => ({ id, name: `${id}.jpg`, kind: "image" as const, width: 800, height: 1000, duration: 0, look });
  const clip = (id: string, duration: number) => ({ id, name: `${id}.mp4`, kind: "video" as const, width: 1920, height: 1080, duration, look: "clip" as const });
  const base = {
    template,
    raw: { id: "raw", duration: dur, width: 608, height: 1080, cuts: [] },
    words,
    speech: [{ start: 0, end: dur - 0.5 }],
    extras: [pic("a"), pic("b"), pic("c")],
    clip: false,
  };
  const noOverlap = (p: ReturnType<typeof planMimic>) => {
    const runs = new Map<string, { start: number; end: number }>();
    for (const c of p.cards) {
      // A run's cards follow each other: one block.
      const k = c.slot.startsWith("x:") ? `x${Math.round(c.start * 1000)}` : c.slot;
      runs.set(k, { start: c.start, end: c.end });
    }
    const blocks = [...p.cards.map((c) => ({ start: c.start, end: c.end })), ...p.broll.map((b) => ({ start: b.start, end: b.end }))].sort((x, y) => x.start - y.start);
    for (let i = 1; i < blocks.length; i++) expect(blocks[i].start).toBeGreaterThanOrEqual(blocks[i - 1].end - 1e-6);
  };

  it("each lands on its word, in the reference's card for its kind, for as long as its kind needs", () => {
    const w = words[8];
    const plan = planMimic({ ...base, extras: [pic("shot", "screenshot")], placed: { shot: w.start } });
    const card = plan.cards.find((c) => c.extra === "shot")!;
    expect(card.slot).toBe("x:shot");
    // Its slide ends just as the word starts.
    expect(card.start + card.enter.dur).toBeCloseTo(w.start - 0.03, 6);
    // The reference's screenshot card (card 3): its shape, its way in and out.
    expect(card.rect).toEqual(template.cards[2].rect);
    expect(card.enter).toEqual(template.cards[2].enter);
    expect(card.exit).toEqual(template.cards[2].exit);
    // Text to read: 2 to 3.5 s from its word.
    expect(card.end - w.start).toBeGreaterThanOrEqual(2 - 1e-9);
    expect(card.end - w.start).toBeLessThanOrEqual(3.5 + 1e-9);
    // A photo gets the photo card's shape (card 1's run: in as card 1, out as card 2), 1.2 to 2.5 s.
    const photo = planMimic({ ...base, extras: [pic("face")], placed: { face: w.start } }).cards[0];
    expect(photo.rect).toEqual(template.cards[0].rect);
    expect(photo.exit).toEqual(template.cards[1].exit);
    expect(photo.end - w.start).toBeLessThanOrEqual(2.5 + 1e-9);
  });

  it("said close together, they follow each other as a run: the first slides in, the next cut in two frames early, the last slides out", () => {
    const plan = planMimic({ ...base, placed: { a: words[3].start, b: words[5].start } });
    const [x, y] = ["a", "b"].map((id) => plan.cards.find((c) => c.extra === id)!);
    expect(x.start + x.enter.dur).toBeCloseTo(words[3].start - 0.03, 6);
    expect(x.enter.kind).toBe("slide");
    expect(x.exit.kind).toBe("cut");
    expect(y.start).toBeCloseTo(words[5].start - 2 / 30, 6);
    expect(x.end).toBeCloseTo(y.start, 6);
    expect(y.enter.kind).toBe("cut");
    expect(y.exit.kind).toBe("slide");
    // A whoosh in, a swipe as the picture changes, a whoosh out.
    expect(plan.sfx.find((c) => c.key === "in:x:a")?.sound).toBe("whoosh");
    expect(plan.sfx.find((c) => c.key === "swap:x:b")?.sound).toBe("swipe");
    expect(plan.sfx.find((c) => c.key === "out:x:b")?.sound).toBe("whoosh");
    // The one left over goes in the reference's own card, clear of the run.
    expect(plan.cards.find((c) => c.extra === "c")?.slot).toMatch(/^card/);
    noOverlap(plan);
    // One said just after the other would go joins it, rather than the face flashing between them.
    const soon = planMimic({ ...base, extras: [pic("a"), pic("b")], placed: { a: words[3].start, b: words[13].start } });
    expect(soon.cards.find((c) => c.extra === "b")?.enter.kind).toBe("cut");
  });

  it("a clip goes full frame as the reference's cutaway (as a card in the first 1.5 s); the reference's cards make way, or stay out if they'd wait over 2 s", () => {
    const w = words[6];
    const short = planMimic({ ...base, extras: [...base.extras, clip("v", 1)], placed: { v: w.start } });
    const cut = short.broll.find((b) => b.extra === "v")!;
    expect(cut.slot).toBe("x:v");
    expect(cut.start).toBeCloseTo(w.start - 2 / 30, 6);
    expect(cut.end).toBeCloseTo(cut.start + 1, 6);
    expect(cut.zoom).toEqual(template.broll[0].zoom);
    // The hook's cards wait for it to go.
    const c1 = short.cards.find((c) => c.slot === "card1")!;
    expect(c1.extra).toBe("a");
    expect(c1.start).toBeCloseTo(cut.end + 0.15, 6);
    noOverlap(short);
    const long = planMimic({ ...base, extras: [...base.extras, clip("v", 4)], placed: { v: w.start } });
    expect(long.cards.some((c) => c.slot === "card1" || c.slot === "card2")).toBe(false);
    noOverlap(long);
    // In the opening the face stays: the clip comes as a card.
    const early = planMimic({ ...base, extras: [clip("v", 1)], placed: { v: words[1].start } });
    expect(early.broll.some((b) => b.extra === "v")).toBe(false);
    expect(early.cards.find((c) => c.extra === "v")?.slot).toBe("x:v");
  });

  it("keeps the opening and the call to action for pictures whose name is said there, and covers at most half the talk", () => {
    // Only a topic in the first 1.5 s: it goes in the reference's cards instead.
    const topic = planMimic({ ...base, extras: [pic("a")], placed: { a: words[1].start }, strength: { a: 1 } });
    expect(topic.cards.find((c) => c.extra === "a")?.slot).toMatch(/^card/);
    // Its name said there: it stays on its word.
    const named = planMimic({ ...base, extras: [pic("a")], placed: { a: words[1].start }, strength: { a: 2 } });
    expect(named.cards.find((c) => c.extra === "a")?.slot).toBe("x:a");
    // Room for one picture: the weakest match goes first, then the latest.
    const many = planMimic({ ...base, cover: 0.2, placed: { a: words[3].start, b: words[25].start, c: words[35].start }, strength: { a: 2, b: 1, c: 2 } });
    expect(many.left).toEqual({ b: "cover", c: "cover" });
    expect(many.cards.map((c) => c.extra)).toEqual(["a"]);
  });
});

describe("the music", () => {
  const words = say("En to tre fire fem seks syv otte ni ti elleve tolv tretten fjorten femten seksten sytten atten nitten tyve.");
  const dur = words[words.length - 1].end + 0.5;
  const base = { template, raw: { id: "raw", duration: dur, width: 608, height: 1080, cuts: [] }, words, speech: [{ start: 0, end: dur - 0.5 }], extras: [], clip: false };

  it("comes in with the reference's music or from the top, from a point in the song, at the user's level and volume line", () => {
    const line: [number, number][] = [[0, 0], [3, -12], [6, 0]];
    const plan = planMimic({ ...base, music: { id: "m", duration: 60, db: 4, from: 12, at: "start", line } });
    expect(plan.music).toMatchObject({ start: 0, from: 12, gain: -16 + 4, line });
    expect(planMimic({ ...base, music: { id: "m", duration: 60 } }).music!.start).toBeGreaterThan(0);
  });

  it("follows its volume line: straight between points, flat past the ends", () => {
    const line: [number, number][] = [[2, 0], [4, -12], [8, 0]];
    expect(lineAt(line, 0)).toBe(0);
    expect(lineAt(line, 3)).toBeCloseTo(-6, 6);
    expect(lineAt(line, 6)).toBeCloseTo(-6, 6);
    expect(lineAt(line, 20)).toBe(0);
    expect(lineAt([], 5)).toBe(0);
  });
});

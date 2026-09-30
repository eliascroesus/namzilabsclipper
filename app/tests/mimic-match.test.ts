import { describe, expect, it } from "vitest";
import { fold, nameWords, placeByWords, sentences, soundsByWords, topicsIn } from "../src/mimic/match";
import { DEFAULT_LOOK } from "../src/mimic/captions";
import { addSfx, SFX_UNDER, talkRms } from "../src/mimic/render";
import { makeSfx, SOUNDS } from "../src/mimic/sfx";
import type { MimicTemplate } from "../src/mimic/types";
import type { Word } from "../src/mimic/asr/parakeet";

/** Sentences said one after another, 0.3 s a word, 1 s between sentences. */
function say(...lines: string[]): Word[] {
  const out: Word[] = [];
  let t = 0;
  for (const line of lines) {
    for (const w of line.split(" ")) {
      out.push({ text: w, start: t, end: t + 0.28, conf: 1 });
      t += 0.3;
    }
    t += 1;
  }
  return out;
}

const tpl = (script: MimicTemplate["script"]): MimicTemplate => ({
  version: 1,
  name: "ref",
  duration: 60,
  width: 1080,
  height: 1920,
  speech: [{ start: 0, end: 58 }],
  captions: DEFAULT_LOOK,
  cards: [],
  broll: [],
  zoom: null,
  sound: { bed: null, sfx: [] },
  tail: 0,
  speaker: null,
  maxPause: 0.3,
  script,
  notes: [],
});

describe("the footage's sentences", () => {
  it("end at a full stop, a long pause, or 24 words", () => {
    const s = sentences(say("Hej med dig.", "Jeg hedder Jonas og jeg sælger ting"));
    expect(s.map((x) => x.text)).toEqual(["Hej med dig.", "Jeg hedder Jonas og jeg sælger ting"]);
    expect(s[1].w0).toBe(3);
  });

  it("read captions and speech alike: Danish letters spelt out, words run together", () => {
    expect(fold("Præcis på gøre")).toBe(fold("praecispagore"));
    expect([...topicsIn("200tusindkroner pa deres forste maned")]).toEqual(expect.arrayContaining(["money", "results"]));
    expect(nameWords("Andrew Tate - Wikipedia.png")).toEqual(["andrew", "tate"]);
  });
});

describe("placing the reference's cards by the footage's script", () => {
  // The reference: sales at 20 s, a picture of a guru at 40 s. The footage says them the other way round.
  const reference = tpl([
    { start: 19, end: 21, text: "og nu har jeg solgt for over 200tusind kroner pa enenkelt webshop." },
    { start: 39, end: 41, text: "Jeg viser hvad jeg laver til daglig." },
  ]);
  const words = say(
    "Du har sikkert set mig på TikTok.",
    "Jeg har lært alt af Andrew Tate og hans venner.",
    "Det tog lang tid at komme i gang.",
    "Nu har jeg solgt for over to millioner kroner på min webshop.",
    "Tak fordi du så med.",
  );

  it("puts each where the footage says what it shows: by its words and topics, or its picture's name said", () => {
    const places = placeByWords(
      reference,
      [
        { id: "sales", start: 19.5, end: 20.5, names: ["stripe.png"] },
        { id: "guru", start: 39.5, end: 40.5, names: ["Andrew Tate.png"] },
      ],
      words,
    );
    const at = (id: string) => words.find((w) => Math.abs(w.start - places[id].t) < 1e-9)!;
    expect(places.sales.said).toMatch(/solgt for over to millioner/);
    expect(places.guru.said).toMatch(/Andrew Tate/);
    // On the word that says it.
    expect(at("guru").text).toBe("Andrew");
  });

  it("leaves one that nothing fits where the reference has it", () => {
    const places = placeByWords(tpl([{ start: 9, end: 11, text: "zebra xylofon kvantefysik" }]), [{ id: "odd", start: 9.5, end: 10.5, names: [] }], words);
    expect(places.odd).toBeUndefined();
  });

  it("marks money said for a cash register, not more than one in 6 s", () => {
    const cues = soundsByWords(say("Jeg tjente 5000 kroner på en dag og 3000 kroner dagen efter.", "Og så gik der lang tid hvor jeg tænkte og tænkte over det hele.", "Det var mange penge."));
    expect(cues.length).toBe(2);
    expect(cues.every((c) => c.sound === "cash")).toBe(true);
    expect(cues[1].t - cues[0].t).toBeGreaterThanOrEqual(6);
  });
});

describe("sound effects in the mix", () => {
  it("each made sound is heard and peaks inside itself", () => {
    for (const s of SOUNDS) {
      const fx = makeSfx(s.id, 48000);
      expect(fx.rms, s.id).toBeGreaterThan(0.01);
      expect(fx.peak, s.id).toBeGreaterThanOrEqual(0);
      expect(fx.peak, s.id).toBeLessThan(fx.data.length / 48000);
    }
    expect(makeSfx("whoosh").peak).toBeCloseTo(0.34, 2);
  });

  it("lines a sound's loudest moment up on its cue, at its level under the voice, moving across as its card does", () => {
    const rate = 8000;
    const len = rate * 4;
    const och: [Float32Array, Float32Array] = [new Float32Array(len), new Float32Array(len)];
    // A click-like sound peaking 0.1 s in, and a voice of RMS 0.1.
    const data = new Float32Array(rate * 0.3);
    for (let i = 0; i < data.length; i++) data[i] = Math.exp(-Math.abs(i - rate * 0.1) / 40) * (i % 2 ? 1 : -1);
    const fx = { data, peak: 0.1, rms: 0.2 };
    addSfx(och, rate, [{ key: "k", t: 2, sound: "x", db: 0, why: "", pan: [1, -1] }], 0, 0.1, () => fx);
    const loudest = och[0].reduce((m, v, i) => (Math.abs(v) + Math.abs(och[1][i]) > Math.abs(och[0][m]) + Math.abs(och[1][m]) ? i : m), 0);
    expect(loudest / rate).toBeCloseTo(2, 2);
    // Its level: the sound's RMS brought to the voice's, SFX_UNDER dB down (both channels at the middle of the move).
    const g = (0.1 * 10 ** (SFX_UNDER / 20)) / 0.2;
    expect(Math.hypot(och[0][loudest], och[1][loudest])).toBeCloseTo(g * Math.SQRT2 * Math.abs(data[rate * 0.1]), 3);
    // It starts on the right and ends on the left.
    const early = Math.round((2 - 0.09) * rate);
    const late = Math.round((2 + 0.19) * rate);
    expect(Math.abs(och[1][early])).toBeGreaterThan(Math.abs(och[0][early]));
    expect(Math.abs(och[0][late])).toBeGreaterThan(Math.abs(och[1][late]));
  });

  it("measures the voice on its talking, not its silences", () => {
    const y = new Float32Array(48000 * 2);
    for (let i = 0; i < 48000; i++) y[i] = 0.2 * Math.sin(i / 10);
    expect(talkRms(y, 48000)).toBeCloseTo(0.2 / Math.SQRT2, 2);
  });
});

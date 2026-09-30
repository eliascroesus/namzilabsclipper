import { describe, expect, it } from "vitest";
import { aboutOf, amountsAt, assign, fold, nameWords, placeByContent, sentences, soundsByWords } from "../src/mimic/match";
import { amounts, conceptsOf, conceptsOfWord, entitiesIn, sameAmount, soundsLike, topicWeights } from "../src/mimic/know";
import { labelFromName } from "../src/mimic/extras";
import { addSfx, SFX_UNDER, talkRms } from "../src/mimic/render";
import { makeSfx, SOUNDS } from "../src/mimic/sfx";
import type { Extra } from "../src/mimic/types";
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

const pic = (id: string, o: Partial<Extra> = {}): Extra => ({ id, name: `${id}.jpg`, kind: "image", width: 1000, height: 1000, duration: 0, ...o });

describe("the footage's sentences", () => {
  it("end at a full stop, a long pause, or 24 words", () => {
    const s = sentences(say("Hej med dig.", "Jeg hedder Jonas og jeg sælger ting"));
    expect(s.map((x) => x.text)).toEqual(["Hej med dig.", "Jeg hedder Jonas og jeg sælger ting"]);
    expect(s[1].w0).toBe(3);
  });

  it("read captions and speech alike: Danish letters spelt out, words run together", () => {
    expect(fold("Præcis på gøre")).toBe(fold("praecispagore"));
    expect([...conceptsOf("200tusindkroner pa deres forste maned")]).toContain("money");
    expect([...conceptsOf("200kr")]).toContain("money");
  });
});

describe("names, topics and amounts", () => {
  it("hears a name however the speech model spelt it", () => {
    expect(soundsLike("Imangachi", "Iman Gadzhi")).toBeGreaterThanOrEqual(0.75);
    expect(entitiesIn("jeg lærte det af Imangachi").map((e) => e.name)).toContain("Iman Gadzhi");
    expect(entitiesIn("Andrew Tates venner").map((e) => e.name)).toContain("Andrew Tate");
    expect(entitiesIn("en helt almindelig dag")).toEqual([]);
  });

  it("knows what the people and brands stand for, and topics in the Nordic languages and English", () => {
    expect([...conceptsOf("Imangachi")]).toEqual(expect.arrayContaining(["agency", "course", "business"]));
    expect([...conceptsOf("Jeg startede et marketing bureau")]).toContain("agency");
    expect([...conceptsOf("Stripe")]).toEqual(expect.arrayContaining(["money", "sales"]));
    expect(aboutOf({ label: "imangadzhi" })).toEqual({ who: ["Iman Gadzhi"], topics: expect.arrayContaining(["agencies", "courses"]) });
  });

  it("hears a topic in a word the speech model misspelt, but not in a word that only looks alike", () => {
    expect(conceptsOfWord("arbetrage")).toContain("agency");
    expect(conceptsOfWord("Arbetra")).toContain("agency");
    expect(conceptsOfWord("jegpart")).toContain("events");
    expect(conceptsOfWord("tradition")).not.toContain("trading");
  });

  it("weighs what a person stands for first above the rest", () => {
    const w = topicWeights("Iman Gadzhi");
    expect(w.get("agency")).toBe(1);
    expect(w.get("course")).toBe(0.5);
    expect(w.get("gurus")).toBeLessThan(0.5);
  });

  it("reads amounts said and printed as the same figure", () => {
    expect(amounts("200 tusind kroner")).toEqual([200000]);
    expect(amounts("kr. 203.412,00 DKK 5,234,000 $40K")).toEqual([203412, 5234000, 40000]);
    expect(sameAmount(200000, 203412)).toBe(true);
    expect(sameAmount(200000, 5234000)).toBe(false);
    expect(amountsAt(say("Jeg har tjent fem millioner kroner"))).toEqual([{ i: 3, v: 5e6 }]);
    // Danish tens are counted in scores; Swedish and Norwegian ones aren't.
    expect(amounts("halvfjerds tusind kroner")).toEqual([70000]);
    expect(amounts("åttio tusen")).toEqual([80000]);
    expect(amountsAt(say("over halvtreds tusind"))).toEqual([{ i: 1, v: 50000 }]);
  });

  it("names a picture by its file, not by a camera's or a clipboard's name", () => {
    expect(labelFromName("andrew-tate_2023.jpg")).toBe("andrew tate");
    expect(labelFromName("Iman Gadzhi - Wikipedia.png")).toBe("Iman Gadzhi");
    expect(labelFromName("IMG_2041.JPG")).toBe("");
    expect(labelFromName("Pasted picture 3.png")).toBe("");
    expect(nameWords("Andrew Tate - Wikipedia.png")).toEqual(["andrew", "tate"]);
  });
});

describe("putting pictures where the footage talks about them", () => {
  const words = say(
    "Du har sikkert set mig på TikTok.",
    "Jeg lærte det hele af Imangachi da jeg startede.",
    "Det tog lang tid at komme i gang.",
    "Nu har jeg solgt for over 200 tusind kroner på min webshop.",
    "Tak fordi du så med.",
  );
  const at = (text: string) => words.findIndex((x) => x.text.replace(/[.,]$/, "") === text);

  it("on its name, said however the speech model spelt it", () => {
    const p = placeByContent(words, [pic("iman", { label: "Iman Gadzhi" })]);
    expect(p.iman.w).toBe(at("Imangachi"));
    expect(p.iman.t).toBe(words[at("Imangachi")].start);
    expect(p.iman.why).toContain('you say "Imangachi"');
    expect(p.iman.said).toBe("Jeg lærte det hele af Imangachi da jeg startede.");
  });

  it("on an amount printed on it, said the way people say amounts", () => {
    const p = placeByContent(words, [pic("stripe", { text: "Stripe | Gross volume | kr. 203.412,00", look: "screenshot" })]);
    expect(p.stripe.w).toBe(at("200"));
    expect(p.stripe.why).toContain("203.412");
  });

  it("on a word Gemini gave for what it shows", () => {
    const p = placeByContent(words, [pic("shop", { keywords: ["webshop", "online store"] })]);
    expect(p.shop.w).toBe(at("webshop"));
  });

  it("on what it stands for when its name isn't said, where the sentence is full of it", () => {
    const talk = say("Du har sikkert set mig på TikTok.", "Det tog lang tid at komme i gang.", "Jeg startede et marketing bureau med kunder i hele Norden.", "Tak fordi du så med.");
    const p = placeByContent(talk, [pic("iman", { label: "Iman Gadzhi" })]);
    expect(talk[p.iman.w].text).toBe("marketing");
    expect(p.iman.why).toBe("you talk about agencies");
  });

  it("on what it mainly stands for: an agency guru where agencies come up, not where coaching does", () => {
    const talk = say("Jeg er den eneste coach i Danmark med en garanti.", "Mine elever har bygget et arbetrage agency på to uger.", "Tak fordi du så med.");
    const p = placeByContent(talk, [pic("iman", { label: "Iman Gadzhi" })]);
    expect(talk[p.iman.w].text).toBe("arbetrage");
    expect(p.iman.why).toBe("you talk about agencies");
  });

  it("on a word of its name said, however it was heard", () => {
    const talk = say("Vi holdt en kæmpe fest i Mami sidste sommer.", "Tak fordi du så med.");
    const p = placeByContent(talk, [pic("yacht", { label: "yacht party miami", kind: "video" })]);
    expect(talk[p.yacht.w].text).toBe("Mami");
    expect(p.yacht.why).toBe('"Mami" is in its name');
  });

  it("follows a list said with its pictures in one sentence, and leaves out one nothing is said of", () => {
    const list = say("Det er altid trading, dropshipping eller Amazon FBA.", "Og så går der et år.");
    const p = placeByContent(list, [pic("amazon", { label: "Amazon FBA seller central", look: "screenshot" }), pic("chart", { label: "bitcoin chart" }), pic("cat", { label: "min kat" })]);
    expect(list[p.amazon.w].text).toBe("Amazon");
    expect(list[p.chart.w].text).toBe("trading,");
    expect(p.cat).toBeUndefined();
  });

  it("places the pictures together: one taking its best word doesn't cost another its only one", () => {
    const pic = (id: string) => ({ id });
    // Sentences of ten words, 0.3 s a word.
    const sentOf = Array.from({ length: 60 }, (_, i) => Math.floor(i / 10));
    const time = (i: number) => i * 0.3;
    const r = assign([{ e: pic("a"), i: 10, score: 1 }, { e: pic("a"), i: 50, score: 0.9 }, { e: pic("b"), i: 10, score: 0.95 }], time, sentOf);
    expect(Object.fromEntries(r.map((c) => [c.e.id, c.i]))).toEqual({ a: 50, b: 10 });
    // A second apart across sentences (19 and 20 are 0.3 s apart), 0.3 s within one (a list).
    const near = assign([{ e: pic("a"), i: 19, score: 1 }, { e: pic("b"), i: 20, score: 1 }], time, sentOf);
    expect(near).toHaveLength(1);
    const list = assign([{ e: pic("a"), i: 12, score: 1 }, { e: pic("b"), i: 13, score: 1 }], time, sentOf);
    expect(list).toHaveLength(2);
  });

  it("takes each picture once, never two on one word", () => {
    const p = placeByContent(words, [pic("a", { label: "Iman Gadzhi" }), pic("b", { label: "Iman Gadzhi course" })]);
    expect(p.a.w).toBe(at("Imangachi"));
    expect(p.b?.w).not.toBe(p.a.w);
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

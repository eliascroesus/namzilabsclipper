import { afterEach, describe, expect, it, vi } from "vitest";
import { geminiPlaces, geminiSounds } from "../src/mimic/ai";
import { sentences } from "../src/mimic/match";
import { SOUNDS } from "../src/mimic/sfx";
import type { Word } from "../src/mimic/asr/parakeet";

const words: Word[] = "Du har sikkert set mig. Det er altid trading og dropshipping. Jeg har tjent fem millioner kroner."
  .split(" ")
  .map((text, i) => ({ text, start: i * 0.4, end: i * 0.4 + 0.3, conf: 1 }));
const sents = sentences(words);

/** Gemini answering with `answer`, and what it was asked. */
function gemini(answer: object) {
  const asked: { parts: { text?: string; inlineData?: { mimeType: string } }[] }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url.startsWith("blob:") || url.startsWith("data:")) return new Response(new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" }));
    const body = JSON.parse(String(init?.body));
    asked.push({ parts: body.contents[0].parts });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
  });
  return asked;
}

afterEach(() => vi.unstubAllGlobals());

describe("Gemini placing the pictures", () => {
  it("is asked with the script sentence by sentence and each group's pictures, and its sentences come back per group", async () => {
    const asked = gemini({ places: [{ group: "card1", sentence: 1, why: "gurus" }, { group: "broll1", sentence: -1 }, { group: "nope", sentence: 2 }] });
    const r = await geminiPlaces({
      key: "k",
      model: "m",
      sentences: sents,
      slots: [
        { id: "card1", kind: "pictures", said: "idioter der siger at du bliver rig", names: ["Andrew Tate.png"], pictures: ["blob:a", "blob:b"] },
        { id: "broll1", kind: "clip", said: "", names: ["cars.mp4"], pictures: [] },
      ],
    });
    expect(r).toEqual({ card1: { sentence: 1, why: "gurus" }, broll1: { sentence: -1, why: "" } });
    const parts = asked[0].parts;
    expect(parts[0].text).toContain("[1] (");
    expect(parts[0].text).toContain("trading og dropshipping");
    expect(parts.filter((p) => p.inlineData).length).toBe(2);
    expect(parts.some((p) => p.text?.includes('Group "card1" (2 pictures)'))).toBe(true);
  });
});

describe("Gemini picking moments for sounds", () => {
  it("keeps only sounds the page has", async () => {
    gemini({ sounds: [{ sentence: 2, word: "millioner", sound: "cash", why: "money" }, { sentence: 0, word: "set", sound: "laser" }] });
    const r = await geminiSounds({ key: "k", model: "m", sentences: sents, sounds: SOUNDS, max: 3 });
    expect(r).toEqual([{ sentence: 2, word: "millioner", sound: "cash", why: "money" }]);
  });
});

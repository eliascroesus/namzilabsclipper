import { afterEach, describe, expect, it, vi } from "vitest";
import { findQuote, geminiExtras, geminiSounds } from "../src/mimic/ai";
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

describe("Gemini reading the pictures", () => {
  it("is asked with the script word by word and each picture (its name, its text, a small copy), and says what each shows and the word it goes on", async () => {
    const asked = gemini({
      extras: [
        { id: "x1", label: "Iman Gadzhi on stage", keywords: ["agency", "Iman"], basis: "topic", word: 7, quote: "altid trading", why: "the agency guru, where get-rich schemes come up" },
        { id: "x2", label: "Stripe dashboard", basis: "none", word: -1, quote: "" },
        { id: "nope", label: "?", basis: "name", word: 2, quote: "sikkert set" },
        { id: "x3", label: "a car", basis: "topic", word: 999, quote: "" },
        // Its number is off; the words it quotes are right.
        { id: "x4", label: "a pile of cash", basis: "amount", word: 3, quote: "fem millioner kroner" },
      ],
    });
    const r = await geminiExtras({
      key: "k",
      model: "m",
      words,
      sentences: sents,
      extras: [
        { id: "x1", label: "", text: "", kind: "picture", picture: "blob:a" },
        { id: "x2", label: "stripe", text: "Gross volume | kr. 203.412,00", kind: "screenshot", picture: "blob:b" },
        { id: "x3", label: "", text: "", kind: "clip" },
        { id: "x4", label: "", text: "", kind: "picture" },
      ],
    });
    expect(r).toEqual({
      x1: { label: "Iman Gadzhi on stage", keywords: ["agency", "Iman"], word: 7, basis: "topic", why: "the agency guru, where get-rich schemes come up" },
      x2: { label: "Stripe dashboard", keywords: [], word: -1, basis: "none", why: "" },
      // A word past the script's end is no word.
      x3: { label: "a car", keywords: [], word: -1, basis: "none", why: "" },
      x4: { label: "a pile of cash", keywords: [], word: 14, basis: "amount", why: "" },
    });
    const parts = asked[0].parts;
    // The script first, then the pictures, then what to do.
    expect(parts[0].text).toContain("7:altid 8:trading");
    expect(parts[parts.length - 1].text).toContain("don't guess who a face is");
    expect(parts.filter((p) => p.inlineData).length).toBe(2);
    expect(parts.some((p) => p.text?.includes('Picture "x2" (screenshot), named "stripe", with this text on it: "Gross volume | kr. 203.412,00"'))).toBe(true);
  });
});

describe("a quote of the script", () => {
  it("is found however it's written, nearest the word it was said to be on", () => {
    const w = "Det er altid trading. Og det er altid trading igen.".split(" ").map((text) => ({ text }));
    expect(findQuote(w, "altid Trading")).toBe(2);
    expect(findQuote(w, "altid trading", 8)).toBe(7);
    expect(findQuote(w, "aldrig")).toBe(-1);
  });
});

describe("Gemini picking moments for sounds", () => {
  it("keeps only sounds the page has", async () => {
    gemini({ sounds: [{ sentence: 2, word: "millioner", sound: "cash", why: "money" }, { sentence: 0, word: "set", sound: "laser" }] });
    const r = await geminiSounds({ key: "k", model: "m", sentences: sents, sounds: SOUNDS, max: 3 });
    expect(r).toEqual([{ sentence: 2, word: "millioner", sound: "cash", why: "money" }]);
  });
});

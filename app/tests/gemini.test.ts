import { describe, expect, it } from "vitest";
import { parseJSON } from "../src/engine/ai/gemini";

describe("reading Gemini's JSON", () => {
  it("reads it whole, or inside a code fence", () => {
    expect(parseJSON<{ a: number }>('{"a":1}').a).toBe(1);
    expect(parseJSON<{ a: number }>('```json\n{"a":2}\n```').a).toBe(2);
  });

  it("keeps what came through when an answer is cut off", () => {
    const cut = '{"phrases":[{"start":1,"end":2,"text":"one"},{"start":3,"end":4,"text":"tw';
    expect(parseJSON<{ phrases: unknown[] }>(cut).phrases.length).toBe(1);
  });

  it("isn't fooled by brackets and quotes said inside a phrase", () => {
    const cut = '{"phrases":[{"text":"[laughs so good"},{"text":"a {b} c \\" ]"},{"text":"he said ] and';
    const r = parseJSON<{ phrases: { text: string }[] }>(cut);
    expect(r.phrases.map((p) => p.text)).toEqual(["[laughs so good", 'a {b} c " ]']);
  });
});

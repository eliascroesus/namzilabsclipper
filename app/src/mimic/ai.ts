/**
 * Gemini, for users with a key who chose it: it reads the meaning where the page can only
 * compare words. Where each group of the user's pictures belongs in the footage's script
 * (it sees the pictures, and what the reference was saying while they showed), and which
 * moments of the script a sound effect would lift. Only the words and small copies of the
 * pictures go out.
 */
import { generateJSON, toBase64, type Part } from "../engine/ai/gemini";
import type { Sentence } from "./match";

export interface AiSlot {
  id: string;
  /** "pictures" (a card or run of cards) or "clip" (a cutaway) */
  kind: "pictures" | "clip";
  /** what the reference was saying while it showed */
  said: string;
  names: string[];
  /** small JPEGs of the pictures (blob or data URLs) */
  pictures: string[];
}

async function jpeg(url: string): Promise<Part | null> {
  try {
    const b = await (await fetch(url)).blob();
    return { inlineData: { mimeType: b.type || "image/jpeg", data: toBase64(new Uint8Array(await b.arrayBuffer())) } };
  } catch {
    return null;
  }
}

const numbered = (sents: Sentence[]) => sents.map((s) => `[${s.i}] (${s.start.toFixed(1)} s) ${s.text}`).join("\n");

const PLACES = {
  type: "OBJECT",
  properties: { places: { type: "ARRAY", items: { type: "OBJECT", properties: { group: { type: "STRING" }, sentence: { type: "INTEGER" }, why: { type: "STRING" } }, required: ["group", "sentence"] } } },
  required: ["places"],
};

/** The sentence each group belongs on (-1 where none fits). */
export async function geminiPlaces(o: { key: string; model: string; sentences: Sentence[]; slots: AiSlot[]; signal?: AbortSignal }): Promise<Record<string, { sentence: number; why: string }>> {
  const parts: Part[] = [
    {
      text: `A short talking-head ad is being edited like a reference ad. The reference showed groups of pictures and clips over its talk; the new video says its things in its own order. For each group below, choose the one sentence of the NEW video where it belongs: where the speaker talks about what the pictures show (who the people are and what they stand for, a result or sales figure, a product, a screenshot, a place or a lifestyle). What the reference was saying while the group showed tells you its purpose. Give every group a different sentence, and -1 when no sentence fits.\n\nThe new video, sentence by sentence:\n${numbered(o.sentences)}\n\nThe groups:`,
    },
  ];
  for (const s of o.slots) {
    parts.push({ text: `\nGroup "${s.id}" (${s.kind === "clip" ? "a full-screen clip" : `${s.pictures.length || s.names.length} picture${(s.pictures.length || s.names.length) === 1 ? "" : "s"}`}). The reference was saying: "${s.said || "(not known)"}". Names: ${s.names.join(", ") || "none"}.` });
    for (const p of s.pictures.slice(0, 4)) {
      const part = await jpeg(p);
      if (part) parts.push(part);
    }
  }
  const r = await generateJSON<{ places: { group: string; sentence: number; why?: string }[] }>({ key: o.key, model: o.model, parts, schema: PLACES, temperature: 0.1, signal: o.signal });
  const out: Record<string, { sentence: number; why: string }> = {};
  for (const p of r.places ?? []) if (o.slots.some((s) => s.id === p.group)) out[p.group] = { sentence: Math.round(p.sentence), why: p.why ?? "" };
  return out;
}

const SOUNDS_SCHEMA = {
  type: "OBJECT",
  properties: { sounds: { type: "ARRAY", items: { type: "OBJECT", properties: { sentence: { type: "INTEGER" }, word: { type: "STRING" }, sound: { type: "STRING" }, why: { type: "STRING" } }, required: ["sentence", "word", "sound"] } } },
  required: ["sounds"],
};

/** Moments of the script where a sound effect lifts what's said: the sentence, the word it lands on, the sound. */
export async function geminiSounds(o: { key: string; model: string; sentences: Sentence[]; sounds: { id: string; name: string }[]; max: number; signal?: AbortSignal }): Promise<{ sentence: number; word: string; sound: string; why: string }[]> {
  const r = await generateJSON<{ sounds: { sentence: number; word: string; sound: string; why?: string }[] }>({
    key: o.key,
    model: o.model,
    signal: o.signal,
    temperature: 0.2,
    schema: SOUNDS_SCHEMA,
    parts: [
      {
        text: `Pick at most ${o.max} moments in this short ad's script for a sound effect, the way editors of short ads do: a cash register when money or sales are said, a ding on a key number or point, a boom on a bold claim, a riser just before a reveal, a pop on items of a list. Only where it lifts the line, never two within a few seconds. For each, give the sentence number, the exact word the sound lands on (as written), the sound (one of: ${o.sounds.map((s) => `${s.id} (${s.name})`).join(", ")}) and why.\n\nThe script:\n${numbered(o.sentences)}`,
      },
    ],
  });
  return (r.sounds ?? []).filter((s) => o.sounds.some((x) => x.id === s.sound)).map((s) => ({ sentence: Math.round(s.sentence), word: String(s.word ?? ""), sound: s.sound, why: s.why ?? "" }));
}

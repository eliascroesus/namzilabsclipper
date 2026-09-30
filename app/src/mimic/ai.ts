/**
 * Gemini, for users with a key who chose it: it reads the meaning where the page can only
 * compare words. What each of the user's pictures shows and the word of the script it
 * belongs on (it sees the pictures), and which moments of the script a sound effect would
 * lift. Only the words and small copies of the pictures go out.
 */
import { generateJSON, toBase64, type Part } from "../engine/ai/gemini";
import { fold } from "./know";
import type { Sentence } from "./match";

export interface AiExtra {
  id: string;
  /** its name as the page knows it, and the words read off it */
  label: string;
  text: string;
  kind: "picture" | "screenshot" | "clip";
  /** a small JPEG of it (a blob or data URL) */
  picture?: string;
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

/** The script word by word, numbered, a sentence a line. */
const wordByWord = (words: { text: string; start: number }[], sents: Sentence[]) => sents.map((s) => `(${s.start.toFixed(1)} s) ${words.slice(s.w0, s.w1).map((w, k) => `${s.w0 + k}:${w.text}`).join(" ")}`).join("\n");

const EXTRAS = {
  type: "OBJECT",
  properties: {
    extras: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { id: { type: "STRING" }, label: { type: "STRING" }, keywords: { type: "ARRAY", items: { type: "STRING" } }, word: { type: "INTEGER" }, quote: { type: "STRING" }, why: { type: "STRING" } },
        required: ["id", "label", "word", "quote"],
      },
    },
  },
  required: ["extras"],
};

/**
 * Where a quote of the script is: the word it starts on, nearest `near` (a model counts words
 * badly, and quotes them well). -1 where it isn't in the script.
 */
export function findQuote(words: { text: string }[], quote: string, near = -1): number {
  const want = quote.split(/\s+/).map(fold).filter(Boolean).slice(0, 4);
  if (!want.length) return -1;
  const folded = words.map((w) => fold(w.text));
  let best = -1;
  for (let i = 0; i + want.length <= folded.length; i++) {
    if (!want.every((w, k) => folded[i + k] === w || (w.length >= 4 && folded[i + k].startsWith(w.slice(0, -1))))) continue;
    if (best < 0 || (near >= 0 && Math.abs(i - near) < Math.abs(best - near))) best = i;
  }
  return best;
}

/**
 * What each picture shows (a short label, keywords in the script's language and English) and
 * the word of the script it belongs on: where the speaker talks about what it shows, its
 * name, or what it stands for (-1 where nothing is said of it). The word is checked against
 * the words Gemini quotes from there.
 */
export async function geminiExtras(o: { key: string; model: string; words: { text: string; start: number }[]; sentences: Sentence[]; extras: AiExtra[]; signal?: AbortSignal }): Promise<Record<string, { label: string; keywords: string[]; word: number; why: string }>> {
  const parts: Part[] = [
    {
      text: `A short talking-head ad is being edited: pictures and clips (below) are laid over the talk, each on the word where the speaker talks about what it shows. For each picture: say in a few words what it shows (who, what brand or product, what screen, what figure; its name and the text on it tell you who or what it is), give up to 8 keywords (in the script's language and in English) someone would say when talking about it, and choose the one word of the script (by its number) where it belongs: where its name is said, what it shows is talked about, or what it stands for comes up (a picture of an agency guru where agencies come up, a sales dashboard where the money made is said). Also quote that word and the next one or two exactly as written in the script. Several pictures can go on one sentence when it lists them. Use -1 and an empty quote when nothing in the script is about it.\n\nThe script, word by word (number:word), a sentence a line:\n${wordByWord(o.words, o.sentences)}\n\nThe pictures:`,
    },
  ];
  for (const e of o.extras) {
    parts.push({ text: `\nPicture "${e.id}" (${e.kind})${e.label ? `, named "${e.label}"` : ""}${e.text ? `, with this text on it: "${e.text.slice(0, 300)}"` : ""}.` });
    const pic = e.picture ? await jpeg(e.picture) : null;
    if (pic) parts.push(pic);
  }
  const r = await generateJSON<{ extras: { id: string; label: string; keywords?: string[]; word: number; quote?: string; why?: string }[] }>({ key: o.key, model: o.model, parts, schema: EXTRAS, temperature: 0.1, signal: o.signal });
  const out: Record<string, { label: string; keywords: string[]; word: number; why: string }> = {};
  for (const x of r.extras ?? []) {
    if (!o.extras.some((e) => e.id === x.id)) continue;
    const given = Math.round(x.word);
    let word = given >= 0 && given < o.words.length ? given : -1;
    // A place given is checked against the words quoted from it: where they are (the nearest
    // to the number given) wins over a number that's off.
    if (given >= 0 && x.quote?.trim()) {
      const quoted = findQuote(o.words, x.quote, word);
      if (quoted >= 0 && (word < 0 || Math.abs(quoted - word) > 2)) word = quoted;
    }
    out[x.id] = { label: String(x.label ?? "").slice(0, 80), keywords: (x.keywords ?? []).map(String).slice(0, 8), word, why: x.why ?? "" };
  }
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

/**
 * Gemini's ear, for users with a key: it writes down what's said more surely
 * than the local model in some languages. With the local model's timed words
 * to go on, Gemini only fixes the words (the times stay the local model's);
 * without them, its phrases' times are shared out over their words by syllables.
 */
import { exact, generateJSON, toBase64 } from "../../engine/ai/gemini";
import { encodeMp3, type Run } from "../../engine/audio/speech";
import { syllables, transcribe } from "../../engine/story/story";
import { retime } from "./align";
import type { Word } from "./parakeet";

const FIX_SCHEMA = { type: "OBJECT", properties: { text: { type: "STRING" } }, required: ["text"] };

export async function geminiWords(y: Float32Array, rate: number, speech: Run[], key: string, model: string, heard: Word[] | null, signal?: AbortSignal): Promise<Word[]> {
  if (heard?.length) {
    const mp3 = await encodeMp3(y, rate);
    const data = toBase64(new Uint8Array(await mp3.arrayBuffer()));
    const draft = heard.map((w) => w.text).join(" ");
    const r = await generateJSON<{ text: string }>({
      key,
      model,
      signal,
      ...exact(model, 0),
      schema: FIX_SCHEMA,
      maxOutputTokens: 32768,
      parts: [
        { inlineData: { mimeType: "audio/mp3", data } },
        {
          text: `Here is an automatic transcript of this audio. It has mistakes (misheard words, wrong names and brands). Write out exactly what is said, word for word, in the language it's spoken in, with normal punctuation and capital letters. Keep every word in order, including repeats; don't summarise, translate or tidy the speech.\n\nAutomatic transcript:\n${draft}`,
        },
      ],
    });
    const text = String(r.text ?? "").trim();
    return text ? retime(heard, text) : heard;
  }
  const tr = await transcribe(y, rate, speech, { key, model, signal });
  const words: Word[] = [];
  for (const p of tr.phrases) {
    const ws = p.text.split(/\s+/).filter(Boolean);
    const syl = ws.map((w) => syllables(w));
    const total = syl.reduce((a, b) => a + b, 0) || 1;
    let at = p.start;
    ws.forEach((w, i) => {
      const d = ((p.end - p.start) * syl[i]) / total;
      words.push({ text: w, start: at, end: at + d, conf: 1 });
      at += d;
    });
  }
  return words;
}

/**
 * The story clipper's listening half: a long video's speech transcribed in
 * chunks (Gemini hears the audio, never sees the picture), then the moments
 * worth clipping picked from the transcript, each with a hook in the voice of
 * the reference edits ("kimchi, you made $2M at 18", "im down 600k").
 */
import { generateJSON, toBase64 } from "../ai/gemini";
import { encodeMp3, type Run } from "../audio/speech";

export type Tone = "normal" | "shout" | "laugh" | "sing";

export interface Phrase {
  start: number;
  end: number;
  speaker: string;
  text: string;
  tone: Tone;
}

export interface Transcript {
  phrases: Phrase[];
  model: string;
}

export interface Moment {
  id: string;
  /** index of the first and last phrase */
  first: number;
  last: number;
  /** source times */
  start: number;
  end: number;
  hook: string;
  why: string;
  caption: string;
  score: number;
}

export interface AiOptions {
  key: string;
  model: string;
  signal?: AbortSignal;
  onProgress?: (done: number, label: string) => void;
}

const TRANSCRIBE_SCHEMA = {
  type: "OBJECT",
  properties: {
    phrases: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          start: { type: "NUMBER", description: "seconds from the start of this audio" },
          end: { type: "NUMBER", description: "seconds from the start of this audio" },
          speaker: { type: "STRING", description: "A, B, C... in order of first appearance" },
          text: { type: "STRING" },
          tone: { type: "STRING", enum: ["normal", "shout", "laugh", "sing"] },
        },
        required: ["start", "end", "speaker", "text", "tone"],
      },
    },
  },
  required: ["phrases"],
};

const TRANSCRIBE_PROMPT = `Transcribe everything said in this audio, in the language it's spoken in.
Split it into short phrases of at most about 10 words, breaking where the speaker pauses.
For each phrase give its start and end in seconds from the start of this audio (one decimal), the speaker (A, B, C... by order of first appearance), the exact words, and the tone: "shout" if yelled, "laugh" if laughed through, "sing" if sung, otherwise "normal".
Keep filler words out ("um", "uh") but keep everything else word for word. Don't summarise, don't skip, don't invent. Music without words is not speech: leave it out.`;

/** Split points every ~8 minutes, placed in the longest pause near each mark. */
export function chunkBounds(duration: number, runs: Run[], every = 480): number[] {
  const bounds = [0];
  for (let mark = every; mark < duration - 60; mark += every) {
    let best = mark;
    let bestGap = -1;
    for (let i = 0; i + 1 < runs.length; i++) {
      const gapStart = runs[i].end;
      const gapEnd = runs[i + 1].start;
      const mid = (gapStart + gapEnd) / 2;
      if (Math.abs(mid - mark) > 30) continue;
      if (gapEnd - gapStart > bestGap) {
        bestGap = gapEnd - gapStart;
        best = mid;
      }
    }
    if (best > bounds[bounds.length - 1] + 60) bounds.push(best);
  }
  bounds.push(duration);
  return bounds;
}

function cleanPhrases(raw: Phrase[], offset: number, limit: number): Phrase[] {
  const out: Phrase[] = [];
  for (const p of raw) {
    const text = String(p.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    let start = Number(p.start);
    let end = Number(p.end);
    if (!Number.isFinite(start)) continue;
    if (!Number.isFinite(end) || end <= start) end = start + Math.max(0.6, text.split(" ").length * 0.3);
    start = Math.max(0, Math.min(limit, start)) + offset;
    end = Math.max(0, Math.min(limit, end)) + offset;
    const tone: Tone = (["normal", "shout", "laugh", "sing"] as const).includes(p.tone) ? p.tone : "normal";
    out.push({ start, end, speaker: String(p.speaker || "A").slice(0, 3), text, tone });
  }
  return out;
}

/** Transcribe 16 kHz mono speech, a chunk at a time, two chunks in flight. */
export async function transcribe(y: Float32Array, rate: number, runs: Run[], o: AiOptions): Promise<Transcript> {
  const duration = y.length / rate;
  const bounds = chunkBounds(duration, runs);
  const chunks = bounds.slice(0, -1).map((a, i) => ({ a, b: bounds[i + 1], i }));
  const results: Phrase[][] = new Array(chunks.length);
  let done = 0;
  const work = async (c: { a: number; b: number; i: number }) => {
    const mp3 = await encodeMp3(y.subarray(Math.floor(c.a * rate), Math.floor(c.b * rate)), rate);
    const data = toBase64(new Uint8Array(await mp3.arrayBuffer()));
    const r = await generateJSON<{ phrases: Phrase[] }>({
      key: o.key,
      model: o.model,
      parts: [{ inlineData: { mimeType: "audio/mp3", data } }, { text: TRANSCRIBE_PROMPT }],
      schema: TRANSCRIBE_SCHEMA,
      temperature: 0,
      signal: o.signal,
    });
    results[c.i] = cleanPhrases(r.phrases ?? [], c.a, c.b - c.a);
    done++;
    o.onProgress?.(done / chunks.length, `Transcribing ${done} of ${chunks.length}`);
  };
  o.onProgress?.(0, chunks.length > 1 ? `Transcribing 0 of ${chunks.length}` : "Transcribing");
  const queue = [...chunks];
  await Promise.all(
    Array.from({ length: Math.min(2, queue.length) }, async () => {
      while (queue.length) await work(queue.shift()!);
    }),
  );
  const phrases = results.flat().sort((p, q) => p.start - q.start);
  return { phrases, model: o.model };
}

const MOMENTS_SCHEMA = {
  type: "OBJECT",
  properties: {
    moments: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          first: { type: "INTEGER", description: "number of the first line" },
          last: { type: "INTEGER", description: "number of the last line" },
          hook: { type: "STRING" },
          why: { type: "STRING" },
          caption: { type: "STRING" },
          score: { type: "NUMBER", description: "0 to 10, how well it holds attention" },
        },
        required: ["first", "last", "hook", "why", "caption", "score"],
      },
    },
  },
  required: ["moments"],
};

const mmss = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

/** Pick the moments worth clipping, with their hooks. */
export async function findMoments(tr: Transcript, count: number, o: AiOptions & { minLen?: number; maxLen?: number; context?: string }): Promise<Moment[]> {
  const minLen = o.minLen ?? 12;
  const maxLen = o.maxLen ?? 40;
  const lines = tr.phrases.map((p, i) => `[${i}] ${mmss(p.start)} ${p.speaker}: ${p.text}${p.tone !== "normal" ? ` (${p.tone})` : ""}`).join("\n");
  const prompt = `You pick moments from a long video to post as short clips on Instagram Reels and TikTok.

Pick up to ${count} moments. Each is a run of consecutive lines, ${minLen} to ${maxLen} seconds long, that works on its own without the rest of the video:
- the first line hooks: a question, a surprising claim, a number or money, a conflict, a confession, "you"
- something turns or pays off inside it
- it ends on a strong line, not mid-thought
Moments must not overlap.

For each moment also write:
- hook: the text on screen for the first second, 3 to 8 words, lowercase, no emoji, no hashtags, no quotation marks, in the voice of these: "kimchi, you made $2M at 18" / "im down 600k" / "he quit his job for this" / "nobody tells you this about dubai". Say who or what it's about when that makes it land.
- why: one short sentence on why it holds attention
- caption: a one-line post caption, plain and a little dry, no hashtags
- score: 0 to 10

Only use names, facts and numbers that are said in the transcript. Never invent any.${o.context ? `\n\nAbout the video: ${o.context}` : ""}

Transcript (line number, time, speaker, words):
${lines}`;
  const r = await generateJSON<{ moments: { first: number; last: number; hook: string; why: string; caption: string; score: number }[] }>({
    key: o.key,
    model: o.model,
    parts: [{ text: prompt }],
    schema: MOMENTS_SCHEMA,
    temperature: 0.5,
    signal: o.signal,
  });
  const n = tr.phrases.length;
  const out: Moment[] = [];
  for (const m of r.moments ?? []) {
    const first = Math.max(0, Math.min(n - 1, Math.round(m.first)));
    let last = Math.max(first, Math.min(n - 1, Math.round(m.last)));
    // Hold the length to the brief: trim a long one from the end, extend a short one.
    while (last > first && tr.phrases[last].end - tr.phrases[first].start > maxLen + 2) last--;
    while (last + 1 < n && tr.phrases[last].end - tr.phrases[first].start < minLen - 1) last++;
    if (out.some((x) => first <= x.last && last >= x.first)) continue;
    const hook = String(m.hook ?? "").replace(/["“”]/g, "").trim().toLowerCase();
    out.push({
      id: `m${out.length + 1}`,
      first,
      last,
      start: tr.phrases[first].start,
      end: tr.phrases[last].end,
      hook,
      why: String(m.why ?? "").trim(),
      caption: String(m.caption ?? "").trim(),
      score: Number(m.score) || 0,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Syllables in a word, roughly: vowel groups, at least one. */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-zà-ÿ0-9]/g, "");
  if (!w) return 1;
  if (/^\d+$/.test(w)) return Math.max(1, w.length);
  const groups = w.match(/[aeiouyà-ÿ]+/g)?.length ?? 1;
  return Math.max(1, groups - (w.endsWith("e") && groups > 1 ? 1 : 0));
}

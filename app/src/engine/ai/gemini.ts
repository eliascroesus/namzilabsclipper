/**
 * A small client for Google's Gemini API (the free tier works), called straight
 * from the browser with the user's own key. Only what the story clipper sends
 * goes out: the audio of the video (never the picture), then the transcript.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export type Part = { text: string } | { inlineData: { mimeType: string; data: string } } | { fileData: { mimeType: string; fileUri: string } };

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

async function call<T>(key: string, path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, signal, headers: { "content-type": "application/json", "x-goog-api-key": key, ...(init.headers ?? {}) } });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg = (body as { error?: { message?: string } } | null)?.error?.message ?? `${res.status} ${res.statusText}`;
    const friendly =
      res.status === 400 && /API key/i.test(msg)
        ? "That Gemini key isn't valid. Copy it again from Google AI Studio."
        : res.status === 403
          ? `Gemini refused the request: ${msg}`
          : res.status === 429
            ? "Gemini's free limit is used up for the moment. It resets within a minute (or tomorrow for the daily limit)."
            : msg;
    throw new GeminiError(friendly, res.status, res.status === 429 || res.status >= 500);
  }
  return body as T;
}

interface ModelInfo {
  name: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
  inputTokenLimit?: number;
}

/** The newest general Flash model this key can use (fast, free-tier friendly, hears audio). */
export async function pickModel(key: string, signal?: AbortSignal): Promise<string> {
  const models: ModelInfo[] = [];
  let pageToken = "";
  for (let page = 0; page < 5; page++) {
    const r = await call<{ models?: ModelInfo[]; nextPageToken?: string }>(key, `/models?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ""}`, { method: "GET" }, signal);
    models.push(...(r.models ?? []));
    if (!r.nextPageToken) break;
    pageToken = r.nextPageToken;
  }
  const usable = models.filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name.replace(/^models\//, ""));
  const version = (n: string) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(n)?.[1] ?? 0);
  const plain = usable.filter((n) => /^gemini-\d+(\.\d+)?-flash$/.test(n));
  const flash = usable.filter((n) => /^gemini-[\d.]+-flash/.test(n) && !/lite|image|tts|live|audio|embedding|native|thinking|exp/.test(n));
  const pool = plain.length ? plain : flash;
  if (pool.length) return pool.sort((a, b) => version(b) - version(a) || a.length - b.length)[0];
  if (usable.includes("gemini-2.5-flash")) return "gemini-2.5-flash";
  if (usable.length) return usable[0];
  throw new GeminiError("This key has no Gemini models that can read audio.", 404, false);
}

export interface GenerateOptions {
  key: string;
  model: string;
  parts: Part[];
  system?: string;
  /** a response schema (OpenAPI subset); the answer comes back as parsed JSON */
  schema: object;
  temperature?: number;
  signal?: AbortSignal;
  maxOutputTokens?: number;
}

/** Ask for JSON matching `schema`. Retries rate limits and server errors a few times. */
export async function generateJSON<T>(o: GenerateOptions): Promise<T> {
  const body = {
    contents: [{ role: "user", parts: o.parts }],
    ...(o.system ? { systemInstruction: { parts: [{ text: o.system }] } } : {}),
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: o.schema,
      temperature: o.temperature ?? 0.3,
      ...(o.maxOutputTokens ? { maxOutputTokens: o.maxOutputTokens } : {}),
    },
  };
  let wait = 4000;
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await call<{ candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } }>(
        o.key,
        `/models/${o.model}:generateContent`,
        { method: "POST", body: JSON.stringify(body) },
        o.signal,
      );
      if (r.promptFeedback?.blockReason) throw new GeminiError(`Gemini wouldn't answer (${r.promptFeedback.blockReason}).`, 400, false);
      const cand = r.candidates?.[0];
      const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text.trim()) throw new GeminiError(`Gemini sent back nothing${cand?.finishReason ? ` (${cand.finishReason})` : ""}.`, 500, true);
      return parseJSON<T>(text);
    } catch (e) {
      const retryable = e instanceof GeminiError ? e.retryable : e instanceof TypeError; // TypeError: the network
      if (!retryable || attempt >= 3 || o.signal?.aborted) throw e;
      await new Promise((r) => setTimeout(r, wait));
      wait *= 2.5;
    }
  }
}

/** JSON from a model, tolerating a code fence or a cut-off tail. */
export function parseJSON<T>(text: string): T {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t) as T;
  } catch {
    // A long answer can stop mid-array: close what was open and keep what came through.
    const cut = t.slice(0, t.lastIndexOf("}") + 1);
    const opens = (cut.match(/\[/g) ?? []).length - (cut.match(/\]/g) ?? []).length;
    const braces = (cut.match(/\{/g) ?? []).length - (cut.match(/\}/g) ?? []).length;
    try {
      return JSON.parse(cut + "]".repeat(Math.max(0, opens)) + "}".repeat(Math.max(0, braces))) as T;
    } catch {
      throw new GeminiError("Gemini's answer wasn't readable. Try again.", 500, true);
    }
  }
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

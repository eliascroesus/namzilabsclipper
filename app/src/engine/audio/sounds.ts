/**
 * What a clip's sound is, window by window: someone talking, or music (a song playing,
 * singing, rapping over a beat, an instrument). The speech finder (speech.ts) hears a
 * voice in anything loud in the voice's band, a song included, so a talking edit could
 * open on the song in someone's clip. YAMNet (Google's sound classifier, trained on
 * AudioSet's 521 kinds of sound; 4 MB in public/models, Apache 2.0) tells them apart:
 * on the test clips, talking reads as speech 0.9 to 1 and music 0, a song (an 808
 * beat, a rap over one) as music 0.6 to 1 and speech 0, and a vlog's talking and the
 * song in it apart, second by second. It runs in the page on MediaPipe's audio runtime.
 */
import wasmLoaderPath from "@mediapipe/tasks-audio/audio_wasm_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-audio/audio_wasm_internal.wasm?url";
import type { AudioClassifier } from "@mediapipe/tasks-audio";

const MODEL = `${import.meta.env.BASE_URL}models/yamnet.tflite`;
/** YAMNet's window: 15,600 samples at 16 kHz. */
export const WINDOW = 0.975;

const SPEECH = ["Speech", "Child speech, kid speaking", "Conversation", "Narration, monologue"];
const MUSIC = ["Music", "Musical instrument", "Singing", "Rapping", "Song"];

/** One window of a clip's sound: how sure the model is of someone talking, and of music, 0 to 1. */
export interface Heard {
  /** seconds from the start of the audio */
  t: number;
  speech: number;
  music: number;
}

let classifier: Promise<AudioClassifier> | null = null;

function load(): Promise<AudioClassifier> {
  if (!classifier) {
    classifier = (async () => {
      const { AudioClassifier } = await import("@mediapipe/tasks-audio");
      return AudioClassifier.createFromOptions({ wasmLoaderPath, wasmBinaryPath }, { baseOptions: { modelAssetPath: MODEL }, maxResults: -1, scoreThreshold: 0, categoryAllowlist: [...SPEECH, ...MUSIC] });
    })();
    classifier.catch(() => (classifier = null));
  }
  return classifier;
}

/** What's heard in mono audio at `sr` (16 kHz, YAMNet's own rate, needs no resampling), window by window. */
export async function hearSounds(y: Float32Array, sr: number, signal?: AbortSignal): Promise<Heard[]> {
  const c = await load();
  const out: Heard[] = [];
  // A minute at a time: a chance to stop between, and the page stays responsive.
  const step = Math.round(Math.round(60 / WINDOW) * WINDOW * sr);
  for (let o = 0; o < y.length; o += step) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    for (const r of c.classify(y.subarray(o, Math.min(y.length, o + step)), sr)) {
      const cats = r.classifications[0]?.categories ?? [];
      const score = (names: string[]) => cats.reduce((m, k) => (names.includes(k.categoryName) ? Math.max(m, k.score) : m), 0);
      out.push({ t: o / sr + (r.timestampMs ?? 0) / 1000, speech: score(SPEECH), music: score(MUSIC) });
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

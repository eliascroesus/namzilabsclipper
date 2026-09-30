/**
 * Speech to timed words with NVIDIA's Parakeet TDT 0.6B v3 (25 European
 * languages, punctuated and capitalised; CC BY 4.0), the int8 export from
 * sherpa-onnx, run by ONNX Runtime's WebAssembly build on this computer. The
 * encoder hears up to half a minute at a time; a token-and-duration transducer
 * then reads it off frame by frame (the same greedy search as sherpa-onnx), each
 * token stamped with the 80 ms frame it was heard on.
 */
import { BINS, features, RATE } from "./fbank";

/** Seconds per encoder frame: 10 ms features, subsampled 8 times. */
export const FRAME = 0.08;
/** Durations the TDT head can predict, in frames. */
const DURATIONS = [0, 1, 2, 3, 4];
const MAX_PER_FRAME = 5;

export interface Token {
  id: number;
  /** encoder frame (FRAME seconds each) */
  frame: number;
  /** predicted duration, in frames */
  dur: number;
  /** log probability */
  logp: number;
}

export interface Word {
  text: string;
  start: number;
  end: number;
  /** how sure the model was of its least sure piece, 0 to 1 */
  conf: number;
  /** a break typed after it in the words: a new line of the caption, or (an empty line) a new caption */
  br?: "line" | "page";
}

export interface DecoderState {
  h: Float32Array;
  c: Float32Array;
}

/** What the search needs from the model: the prediction network and the joiner. */
export interface Transducer {
  readonly blank: number;
  /** the prediction network's output (640) after `token`, and its new state */
  predict(token: number, state: DecoderState | null): Promise<{ out: Float32Array; state: DecoderState }>;
  /** token logits (blank last) then duration logits */
  join(enc: Float32Array, dec: Float32Array): Promise<Float32Array>;
}

function argmax(a: Float32Array, from: number, to: number): number {
  let k = from;
  for (let i = from + 1; i < to; i++) if (a[i] > a[k]) k = i;
  return k;
}

function logSoftmaxAt(a: Float32Array, n: number, k: number): number {
  let m = -Infinity;
  for (let i = 0; i < n; i++) if (a[i] > m) m = a[i];
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.exp(a[i] - m);
  return a[k] - m - Math.log(s);
}

/**
 * Greedy TDT search over encoder frames laid out frame by frame ([frames, dim]):
 * at each frame the joiner picks a token and how many frames to move on; a
 * token other than blank feeds the prediction network. At most five tokens on
 * one frame, and a blank that doesn't move moves one.
 */
export async function greedyTdt(enc: Float32Array, frames: number, dim: number, m: Transducer): Promise<Token[]> {
  const vocab = m.blank + 1;
  const out: Token[] = [];
  let { out: dec, state } = await m.predict(m.blank, null);
  let onFrame = 0;
  for (let t = 0; t < frames; ) {
    const logits = await m.join(enc.subarray(t * dim, (t + 1) * dim), dec);
    const y = argmax(logits, 0, vocab);
    let skip = DURATIONS[argmax(logits, vocab, vocab + DURATIONS.length) - vocab];
    if (y !== m.blank) {
      out.push({ id: y, frame: t, dur: skip, logp: logSoftmaxAt(logits, vocab, y) });
      const next = await m.predict(y, state);
      dec = next.out;
      state = next.state;
      onFrame++;
    }
    if (skip > 0) onFrame = 0;
    if (onFrame >= MAX_PER_FRAME) {
      onFrame = 0;
      skip = 1;
    }
    if (y === m.blank && skip === 0) {
      onFrame = 0;
      skip = 1;
    }
    t += skip;
  }
  return out;
}

/** The vocabulary: a piece per id ("▁" starts a word); special tokens come back as "". */
export function parseTokens(txt: string): string[] {
  const pieces: string[] = [];
  for (const line of txt.split("\n")) {
    const i = line.lastIndexOf(" ");
    if (i <= 0) continue;
    const id = Number(line.slice(i + 1));
    const piece = line.slice(0, i);
    pieces[id] = /^<.*>$/.test(piece) ? "" : piece;
  }
  return pieces;
}

/**
 * Tokens (with times in seconds from the start of the audio) to words: a piece
 * starting with "▁" begins one. A word ends where its last piece's duration
 * runs out, and never after the next word starts.
 */
export function toWords(tokens: (Token & { t: number })[], pieces: string[]): Word[] {
  const words: Word[] = [];
  let cur: Word | null = null;
  let lastEnd = 0;
  for (const tok of tokens) {
    const piece = pieces[tok.id] ?? "";
    if (!piece) continue;
    const end = tok.t + Math.max(1, tok.dur) * FRAME;
    const p = Math.exp(tok.logp);
    const starts = piece.startsWith("▁");
    const text = piece.replace(/▁/g, "");
    if (starts || !cur) {
      if (cur) {
        cur.end = Math.min(lastEnd, tok.t);
        words.push(cur);
      }
      cur = { text, start: tok.t, end, conf: p };
    } else {
      cur.text += text;
      cur.conf = Math.min(cur.conf, p);
    }
    lastEnd = end;
    cur.end = end;
  }
  if (cur) words.push(cur);
  // A piece of punctuation alone ("-", "...") belongs to the word before it.
  const merged: Word[] = [];
  for (const w of words) {
    if (!w.text) continue;
    const prev = merged[merged.length - 1];
    if (prev && /^[^\p{L}\p{N}]+$/u.test(w.text) && w.start - prev.end < 0.3) {
      prev.text += w.text;
      prev.end = Math.max(prev.end, w.end);
    } else merged.push({ ...w, end: Math.max(w.end, w.start + 0.04) });
  }
  return merged;
}

/**
 * Where to split long audio for the encoder: pieces of at most `max` seconds,
 * each cut at the quietest 100 ms in its last third (a pause, when there is one).
 */
export function chunkAudio(y: Float32Array, max = 28): [number, number][] {
  const n = y.length;
  const hop = RATE / 10;
  const energy = new Float64Array(Math.ceil(n / hop));
  for (let i = 0; i < n; i++) energy[(i / hop) | 0] += y[i] * y[i];
  const out: [number, number][] = [];
  let a = 0;
  while (a < n) {
    let b = Math.min(n, a + max * RATE);
    if (b < n) {
      const lo = Math.floor((a + (max * RATE * 2) / 3) / hop);
      const hi = Math.floor(b / hop);
      let best = hi - 1;
      for (let k = lo; k < hi; k++) if (energy[k] < energy[best]) best = k;
      b = Math.min(n, (best + 1) * hop - hop / 2);
    }
    out.push([a, b]);
    a = b;
  }
  return out;
}

export interface EncoderOutput {
  /** [frames, dim] */
  data: Float32Array;
  frames: number;
  dim: number;
}

export type Encoder = (feats: Float32Array, frames: number) => Promise<EncoderOutput>;

/** Transcribe 16 kHz mono audio, a chunk at a time. */
export async function transcribe(y: Float32Array, encode: Encoder, m: Transducer, pieces: string[], onProgress?: (p: number) => void, signal?: AbortSignal): Promise<Word[]> {
  const tokens: (Token & { t: number })[] = [];
  const chunks = chunkAudio(y);
  let done = 0;
  for (const [a, b] of chunks) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const piece = y.subarray(a, b);
    if (b - a >= RATE * 0.2) {
      const { data, frames } = features(piece);
      const enc = await encode(data, frames);
      for (const tok of await greedyTdt(enc.data, enc.frames, enc.dim, m)) tokens.push({ ...tok, t: a / RATE + tok.frame * FRAME });
    }
    done += b - a;
    onProgress?.(done / y.length);
  }
  return toWords(tokens, pieces);
}

export { BINS, RATE };

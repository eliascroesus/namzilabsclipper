/// <reference lib="webworker" />
/**
 * The speech model in a worker of its own, so the page keeps moving while it
 * listens. The model files (about 670 MB) are fetched once and kept in the
 * browser's cache; the worker is ended when the page is done with it, which
 * gives the memory back.
 */
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import type { InferenceSession, Tensor } from "onnxruntime-web/wasm";
import { parseTokens, transcribe, type DecoderState, type Encoder, type Transducer } from "./parakeet";

type Ort = typeof import("onnxruntime-web/wasm");

export type AsrRequest = { type: "transcribe"; id: number; audio: Float32Array; sources: string[] } | { type: "cancel"; id: number };

export type AsrReply =
  | { type: "progress"; id: number; stage: "download" | "load" | "listen"; p: number; bytes?: number; total?: number }
  | { type: "done"; id: number; words: import("./parakeet").Word[]; ms: number }
  | { type: "error"; id: number; message: string };

const FILES = ["encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"] as const;
const CACHE = "namzilabs-speech-v1";
/** Rough sizes, for the download bar before a server says. */
const SIZES: Record<(typeof FILES)[number], number> = { "encoder.int8.onnx": 652_184_281, "decoder.int8.onnx": 11_845_275, "joiner.int8.onnx": 6_355_277, "tokens.txt": 93_939 };

const post = (m: AsrReply) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

/** A file's bytes, from the browser cache or downloaded (and then cached), reporting progress. */
async function getFile(base: string, name: (typeof FILES)[number], onBytes: (n: number) => void): Promise<Uint8Array> {
  const url = base + name;
  const cache = "caches" in self ? await caches.open(CACHE).catch(() => null) : null;
  const hit = await cache?.match(url).catch(() => undefined);
  if (hit) {
    const buf = new Uint8Array(await hit.arrayBuffer());
    onBytes(buf.length);
    return buf;
  }
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok || !res.body) throw new Error(`${name}: ${res.status}`);
  const total = Number(res.headers.get("content-length")) || SIZES[name];
  const reader = res.body.getReader();
  let buf = new Uint8Array(total);
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (got + value.length > buf.length) {
      const bigger = new Uint8Array(Math.max(buf.length * 1.25, got + value.length));
      bigger.set(buf.subarray(0, got));
      buf = bigger;
    }
    buf.set(value, got);
    got += value.length;
    onBytes(value.length);
  }
  const bytes = got === buf.length ? buf : buf.slice(0, got);
  await cache?.put(url, new Response(bytes, { headers: { "content-type": "application/octet-stream" } })).catch(() => undefined);
  return bytes;
}

interface Loaded {
  ort: Ort;
  encoder: InferenceSession;
  decoder: InferenceSession;
  joiner: InferenceSession;
  pieces: string[];
}

let loaded: Promise<Loaded> | null = null;

async function load(sources: string[], id: number): Promise<Loaded> {
  const ort = await import("onnxruntime-web/wasm");
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 2) / 2))) : 1;
  ort.env.wasm.wasmPaths = { wasm: wasmUrl };
  const total = Object.values(SIZES).reduce((a, b) => a + b, 0);
  let lastErr: unknown = null;
  for (const base of sources) {
    try {
      let got = 0;
      const onBytes = (n: number) => {
        got += n;
        post({ type: "progress", id, stage: "download", p: Math.min(1, got / total), bytes: got, total });
      };
      const [enc, dec, join, tok] = await Promise.all(FILES.map((f) => getFile(base, f, onBytes)));
      post({ type: "progress", id, stage: "load", p: 0 });
      const opts: InferenceSession.SessionOptions = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
      const encoder = await ort.InferenceSession.create(enc, opts);
      const decoder = await ort.InferenceSession.create(dec, opts);
      const joiner = await ort.InferenceSession.create(join, opts);
      post({ type: "progress", id, stage: "load", p: 1 });
      return { ort, encoder, decoder, joiner, pieces: parseTokens(new TextDecoder().decode(tok)) };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`The speech model didn't download (${lastErr instanceof Error ? lastErr.message : String(lastErr)}). Check the connection and try again.`);
}

function sessionModel(m: Loaded): { encode: Encoder; model: Transducer } {
  const { ort, encoder, decoder, joiner, pieces } = m;
  const blank = pieces.length - 1;
  const encode: Encoder = async (feats, frames) => {
    const out = (await encoder.run({
      audio_signal: new ort.Tensor("float32", feats, [1, 128, frames]),
      length: new ort.Tensor("int64", BigInt64Array.from([BigInt(frames)]), [1]),
    })) as Record<string, Tensor>;
    const o = out[encoder.outputNames[0]];
    const len = Number((out[encoder.outputNames[1]].data as BigInt64Array)[0]);
    const [, dim, total] = o.dims as number[];
    const src = o.data as Float32Array;
    // [1, dim, frames] to [frames, dim]
    const data = new Float32Array(len * dim);
    for (let d = 0; d < dim; d++) for (let t = 0; t < len; t++) data[t * dim + d] = src[d * total + t];
    for (const t of Object.values(out)) t.dispose();
    return { data, frames: len, dim };
  };
  const zeros = () => new Float32Array(2 * 640);
  const [inTok, inLen, inH, inC] = decoder.inputNames;
  const [outDec, , outH, outC] = decoder.outputNames;
  const model: Transducer = {
    blank,
    async predict(token, state: DecoderState | null) {
      const out = (await decoder.run({
        [inTok]: new ort.Tensor("int32", Int32Array.from([token]), [1, 1]),
        [inLen]: new ort.Tensor("int32", Int32Array.from([1]), [1]),
        [inH]: new ort.Tensor("float32", state?.h ?? zeros(), [2, 1, 640]),
        [inC]: new ort.Tensor("float32", state?.c ?? zeros(), [2, 1, 640]),
      })) as Record<string, Tensor>;
      const res = { out: (out[outDec].data as Float32Array).slice(), state: { h: (out[outH].data as Float32Array).slice(), c: (out[outC].data as Float32Array).slice() } };
      for (const t of Object.values(out)) t.dispose();
      return res;
    },
    async join(enc, dec) {
      const out = (await joiner.run({
        [joiner.inputNames[0]]: new ort.Tensor("float32", enc, [1, enc.length, 1]),
        [joiner.inputNames[1]]: new ort.Tensor("float32", dec, [1, dec.length, 1]),
      })) as Record<string, Tensor>;
      const logits = (out[joiner.outputNames[0]].data as Float32Array).slice();
      for (const t of Object.values(out)) t.dispose();
      return logits;
    },
  };
  return { encode, model };
}

const cancelled = new Set<number>();

self.onmessage = async (ev: MessageEvent<AsrRequest>) => {
  const msg = ev.data;
  if (msg.type === "cancel") {
    cancelled.add(msg.id);
    return;
  }
  const { id } = msg;
  const t0 = performance.now();
  try {
    if (!loaded) {
      loaded = load(msg.sources, id);
      loaded.catch(() => (loaded = null));
    }
    const m = await loaded;
    const { encode, model } = sessionModel(m);
    const ctl = new AbortController();
    const watch = setInterval(() => cancelled.has(id) && ctl.abort(), 100);
    try {
      const words = await transcribe(msg.audio, encode, model, m.pieces, (p) => post({ type: "progress", id, stage: "listen", p }), ctl.signal);
      post({ type: "done", id, words, ms: Math.round(performance.now() - t0) });
    } finally {
      clearInterval(watch);
    }
  } catch (e) {
    post({ type: "error", id, message: e instanceof Error ? e.message : String(e) });
  }
};

/**
 * The page's side of the speech model: sends 16 kHz audio to the worker and
 * gets timed words back. The model comes from this site when it's deployed
 * with it (models/parakeet-v3/), otherwise from Hugging Face, and stays in the
 * browser's cache after the first time.
 */
import type { AsrReply, AsrRequest } from "./asr.worker";
import type { Word } from "./parakeet";

export type { Word };

const HF = "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main/";

/** Where the model files are looked for, in order. `?asr=<url>` puts one first (tests). */
export function modelSources(): string[] {
  const own = new URL(`${import.meta.env.BASE_URL}models/parakeet-v3/`, location.href).href;
  const asked = new URLSearchParams(location.search).get("asr");
  return [...(asked ? [new URL(asked, location.href).href] : []), own, HF];
}

export interface ListenProgress {
  stage: "download" | "load" | "listen";
  p: number;
  bytes?: number;
  total?: number;
}

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
  if (!worker) worker = new Worker(new URL("./asr.worker.ts", import.meta.url), { type: "module" });
  return worker;
}

/** Lets the model go (about 1.3 GB of memory while it's loaded). */
export function releaseSpeechModel() {
  worker?.terminate();
  worker = null;
}

/** Timed words of 16 kHz mono speech, heard on this computer. */
export function listen(audio: Float32Array, onProgress?: (p: ListenProgress) => void, signal?: AbortSignal): Promise<{ words: Word[]; ms: number }> {
  const w = getWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (ev: MessageEvent<AsrReply>) => {
      const m = ev.data;
      if (m.id !== id) return;
      if (m.type === "progress") onProgress?.({ stage: m.stage, p: m.p, bytes: m.bytes, total: m.total });
      else {
        cleanup();
        if (m.type === "done") resolve({ words: m.words, ms: m.ms });
        else reject(new Error(m.message));
      }
    };
    const onError = (ev: ErrorEvent) => {
      cleanup();
      releaseSpeechModel();
      reject(new Error(ev.message || "The speech model stopped (out of memory?)."));
    };
    const onAbort = () => {
      w.postMessage({ type: "cancel", id } satisfies AsrRequest);
      cleanup();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const cleanup = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    const copy = audio.slice();
    w.postMessage({ type: "transcribe", id, audio: copy, sources: modelSources() } satisfies AsrRequest, [copy.buffer]);
  });
}

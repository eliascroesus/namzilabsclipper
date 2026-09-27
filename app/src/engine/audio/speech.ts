/**
 * Speech in a video's soundtrack: where the voice is (so clips start on the
 * first syllable, end on the last, and lose their pauses), and the audio
 * packed small enough to send for transcription.
 */
import { AudioSample, AudioSampleSource, BufferTarget, canEncodeAudio, Mp3OutputFormat, Output } from "mediabunny";

export interface Run {
  start: number;
  end: number;
}

const FRAME = 0.02;

/** Speech-band loudness per 20 ms frame, in dB. */
export function speechLevels(y: Float32Array, rate: number): Float32Array {
  // A gentle band-pass, 150 Hz to 3.6 kHz: one-pole high-pass then one-pole low-pass.
  const hp = Math.exp((-2 * Math.PI * 150) / rate);
  const lp = Math.exp((-2 * Math.PI * 3600) / rate);
  const n = Math.floor(y.length / (FRAME * rate));
  const hop = Math.round(FRAME * rate);
  const out = new Float32Array(n);
  let xPrev = 0;
  let hpY = 0;
  let lpY = 0;
  for (let f = 0; f < n; f++) {
    let e = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      hpY = hp * (hpY + y[i] - xPrev);
      xPrev = y[i];
      lpY = (1 - lp) * hpY + lp * lpY;
      e += lpY * lpY;
    }
    out[f] = 10 * Math.log10(e / hop + 1e-12);
  }
  return out;
}

/**
 * Where someone is talking. A frame is voiced when it's well above the quiet
 * between phrases; gaps under 0.18 s are bridged and blips under 0.1 s dropped.
 */
export function detectSpeech(y: Float32Array, rate: number): Run[] {
  const lv = speechLevels(y, rate);
  if (!lv.length) return [];
  const sorted = Float32Array.from(lv).sort();
  const floor = sorted[Math.floor(sorted.length * 0.1)];
  const peak = sorted[Math.floor(sorted.length * 0.98)];
  const thr = Math.max(floor + 9, peak - 38, -62);
  const voiced = Array.from(lv, (v) => v > thr);
  const runs: Run[] = [];
  let s = -1;
  for (let f = 0; f <= voiced.length; f++) {
    const v = f < voiced.length && voiced[f];
    if (v && s < 0) s = f;
    if (!v && s >= 0) {
      runs.push({ start: s * FRAME, end: f * FRAME });
      s = -1;
    }
  }
  const merged: Run[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r.start - last.end < 0.18) last.end = r.end;
    else merged.push({ ...r });
  }
  return merged.filter((r) => r.end - r.start >= 0.1);
}

/**
 * The spoken parts of [a, b], with pauses over `maxPause` cut out: what a jump-cut
 * edit keeps. Each run keeps a little air before and after the voice.
 */
export function keepSpeech(runs: Run[], a: number, b: number, maxPause = 0.28, before = 0.08, after = 0.14): Run[] {
  const inside = runs.filter((r) => r.end > a && r.start < b).map((r) => ({ start: Math.max(a, r.start - before), end: Math.min(b, r.end + after) }));
  const out: Run[] = [];
  for (const r of inside) {
    const last = out[out.length - 1];
    if (last && r.start - last.end < maxPause) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** Snap a time to the nearest start (or end) of speech within `reach` seconds. */
export function snapToSpeech(runs: Run[], t: number, edge: "start" | "end", reach = 0.8): number {
  let best = t;
  let bestD = reach;
  for (const r of runs) {
    const v = edge === "start" ? r.start : r.end;
    const d = Math.abs(v - t);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

let mp3Ready: Promise<void> | null = null;

/** Mono audio as a compact MP3 (32 kbps), the format Gemini is sure to read. */
export async function encodeMp3(y: Float32Array, rate: number): Promise<Blob> {
  if (!mp3Ready) {
    mp3Ready = (async () => {
      if (!(await canEncodeAudio("mp3", { numberOfChannels: 1, sampleRate: rate, bitrate: 32000 }))) {
        const { registerMp3Encoder } = await import("@mediabunny/mp3-encoder");
        registerMp3Encoder();
      }
    })();
  }
  await mp3Ready;
  const target = new BufferTarget();
  const output = new Output({ format: new Mp3OutputFormat(), target });
  const source = new AudioSampleSource({ codec: "mp3", bitrate: 32000 });
  output.addAudioTrack(source);
  await output.start();
  const chunk = rate * 10;
  for (let o = 0; o < y.length; o += chunk) {
    const data = y.slice(o, o + chunk);
    const sample = new AudioSample({ data, format: "f32-planar", numberOfChannels: 1, sampleRate: rate, timestamp: o / rate });
    await source.add(sample);
    sample.close();
  }
  source.close();
  await output.finalize();
  return new Blob([target.buffer!], { type: "audio/mp3" });
}

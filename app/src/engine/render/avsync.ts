/**
 * Keeping the song on the cuts through the audio encoder. AAC encoders put a
 * run of "priming" samples in front of the sound (1024 for FFmpeg's, 2112 for
 * Apple's); unless the file says to skip them, every player hears the music
 * that much late: 21 to 44 ms, enough to push a cut off its beat. Rather than
 * trust any one encoder, this measures it: a short tone goes through the same
 * encoder and container and back through the decoder, and the edit's
 * soundtrack is shifted by however late it comes out.
 */
import { ALL_FORMATS, AudioBufferSink, AudioBufferSource, BufferSource, BufferTarget, canDecodeAudio, Input, Mp4OutputFormat, Output, WebMOutputFormat, type AudioCodec } from "mediabunny";

const RATE = 48000;
const cache = new Map<string, Promise<number>>();

function burst(): AudioBuffer {
  const buf = new AudioBuffer({ numberOfChannels: 2, length: Math.round(RATE * 0.6), sampleRate: RATE });
  const at = Math.round(RATE * 0.2);
  const len = Math.round(RATE * 0.02);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[at + i] = 0.7 * Math.sin((Math.PI * i) / len) ** 2 * Math.sin((2 * Math.PI * 1000 * i) / RATE);
  }
  return buf;
}

async function measure(container: "mp4" | "webm", codec: AudioCodec, fallback: number): Promise<number> {
  // Measuring needs a decoder for the codec; without one, trust what's known of the encoder.
  if (!(await canDecodeAudio(codec, { numberOfChannels: 2, sampleRate: RATE }))) return fallback;
  const src = burst();
  const target = new BufferTarget();
  const out = new Output({ format: container === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(), target });
  const audio = new AudioBufferSource({ codec, bitrate: 192e3 });
  out.addAudioTrack(audio);
  await out.start();
  await audio.add(src);
  audio.close();
  await out.finalize();

  const input = new Input({ source: new BufferSource(target.buffer!), formats: ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack();
  if (!track) return 0;
  // The decoded sound laid out on the file's own clock.
  const got = new Float32Array(Math.round(RATE * 0.8));
  for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers()) {
    const d = buffer.getChannelData(0);
    const step = buffer.sampleRate / RATE;
    const o = Math.round(timestamp * RATE);
    for (let i = 0; i * step < d.length; i++) {
      const k = o + i;
      if (k >= 0 && k < got.length) got[k] = d[Math.floor(i * step)];
    }
  }
  input.dispose();
  // Where the tone lands, by cross-correlation with what went in (up to 100 ms either way).
  const ref = src.getChannelData(0);
  const at = Math.round(RATE * 0.2);
  const len = Math.round(RATE * 0.02);
  let best = 0;
  let bestLag = 0;
  for (let lag = -4800; lag <= 4800; lag++) {
    let s = 0;
    for (let i = 0; i < len; i++) {
      const k = at + i + lag;
      if (k >= 0 && k < got.length) s += ref[at + i] * got[k];
    }
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  return best > 0 ? bestLag / RATE : 0;
}

/**
 * How late (seconds) this container and codec deliver the sound; negative is early.
 * `fallback` is the known delay of the encoder in use, for when it can't be measured
 * (FFmpeg's AAC encoder, the WASM one used where the browser has none: 1024 samples).
 */
export function audioDelay(container: "mp4" | "webm", codec: AudioCodec, fallback = 0): Promise<number> {
  const key = `${container}/${codec}`;
  if (!cache.has(key)) cache.set(key, measure(container, codec, fallback).catch(() => fallback));
  return cache.get(key)!;
}

/** The soundtrack moved `delay` seconds earlier (or later, for a negative delay). */
export function shiftAudio(buf: AudioBuffer, delay: number): AudioBuffer {
  const n = Math.round(delay * buf.sampleRate);
  if (!n) return buf;
  const out = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: buf.length, sampleRate: buf.sampleRate });
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    if (n > 0) dst.set(src.subarray(n));
    else dst.set(src.subarray(0, src.length + n), -n);
  }
  return out;
}

/**
 * A stretch of a file's sound in stereo at the mix rate, decoded and resampled as it
 * streams (as decodeMono does for the voice): scheduling each decoded packet as an audio
 * node and rendering them offline takes most of a minute for two minutes of music.
 */
import { AudioSampleSink } from "mediabunny";
import { Resampler } from "../engine/audio/resample";
import type { Source } from "../engine/media/sources";

export async function decodeStereo(src: Source, rate: number, start: number, end: number): Promise<[Float32Array, Float32Array] | null> {
  const track = await src.input?.getPrimaryAudioTrack();
  if (!track) return null;
  const until = Math.min(end, src.info.duration);
  let inRate = 0;
  let rs: [Resampler, Resampler] | null = null;
  const parts: [Float32Array, Float32Array][] = [];
  let next = start;
  const push = (l: Float32Array, r: Float32Array) => {
    if (l.length) parts.push([l, r]);
  };
  const sink = new AudioSampleSink(track);
  for await (const sample of sink.samples(start, until)) {
    try {
      if (!rs) {
        inRate = sample.sampleRate;
        rs = [new Resampler(inRate, rate), new Resampler(inRate, rate)];
      }
      const n = sample.numberOfFrames;
      let offset = 0;
      // Silence for a gap; drop what overlaps what's already there.
      const gap = Math.round((sample.timestamp - next) * inRate);
      if (gap > 0) push(rs[0].write(new Float32Array(gap)), rs[1].write(new Float32Array(gap)));
      else if (gap < 0) offset = Math.min(n, -gap);
      if (sample.timestamp + sample.duration <= start) continue;
      if (sample.timestamp < start) offset = Math.max(offset, Math.round((start - sample.timestamp) * inRate));
      const count = n - offset;
      if (count <= 0) continue;
      const planes = [0, 1].map((c) => {
        const p = new Float32Array(count);
        sample.copyTo(p, { planeIndex: Math.min(c, sample.numberOfChannels - 1), format: "f32-planar", frameOffset: offset, frameCount: count });
        return p;
      });
      push(rs[0].write(planes[0]), rs[1].write(planes[1]));
      next = sample.timestamp + (offset + count) / inRate;
    } finally {
      sample.close();
    }
  }
  if (!rs) return null;
  push(rs[0].end(), rs[1].end());
  const want = Math.max(1, Math.round((until - start) * rate));
  const out: [Float32Array, Float32Array] = [new Float32Array(want), new Float32Array(want)];
  let o = 0;
  for (const [l, r] of parts) {
    if (o >= want) break;
    out[0].set(l.subarray(0, want - o), o);
    out[1].set(r.subarray(0, want - o), o);
    o += l.length;
  }
  return out;
}

/**
 * The soundtrack: the song (and, for story clips, the footage's own voice with
 * the song ducked under it), faded with the picture, brought to −14 LUFS, the
 * loudness Instagram and TikTok play at, and kept a decibel under full scale.
 */
import { sourceSpan, type EditPlan } from "../plan/types";
import { decodeAudioBuffer, type Source } from "../media/sources";

export const MIX_RATE = 48000;

/** Integrated loudness (ITU-R BS.1770 with gating) of a stereo or mono buffer at 48 kHz. */
export function integratedLoudness(channels: Float32Array[], rate = MIX_RATE): number {
  // K-weighting: a high shelf, then the RLB high-pass (coefficients for 48 kHz).
  const kw = (x: Float32Array) => {
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = 1.53512485958697 * x[i] - 2.69169618940638 * x1 + 1.19839281085285 * x2 + 1.69065929318241 * y1 - 0.73248077421585 * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
      y[i] = v;
    }
    x1 = 0; x2 = 0; y1 = 0; y2 = 0;
    for (let i = 0; i < y.length; i++) {
      const v = y[i] - 2 * x1 + x2 + 1.99004745483398 * y1 - 0.99007225036621 * y2;
      x2 = x1; x1 = y[i]; y2 = y1; y1 = v;
      y[i] = v;
    }
    return y;
  };
  const weighted = channels.map(kw);
  const block = Math.round(0.4 * rate);
  const step = Math.round(0.1 * rate);
  const powers: number[] = [];
  for (let s = 0; s + block <= weighted[0].length; s += step) {
    let p = 0;
    for (const ch of weighted) {
      let e = 0;
      for (let i = s; i < s + block; i++) e += ch[i] * ch[i];
      p += e / block;
    }
    powers.push(p);
  }
  const lufs = (p: number) => -0.691 + 10 * Math.log10(p + 1e-12);
  const abs = powers.filter((p) => lufs(p) > -70);
  if (!abs.length) return -70;
  const rel = lufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((p) => lufs(p) > rel);
  return lufs(gated.reduce((a, b) => a + b, 0) / Math.max(1, gated.length));
}

/**
 * A look-ahead peak limiter: nothing above `ceiling`. The gain is the minimum
 * needed over the next 5 ms, smoothed over the same 5 ms (so it is always
 * low enough by the time a peak arrives, without a click), recovering over
 * `release` seconds.
 */
export function limit(channels: Float32Array[], ceiling = 0.89, rate = MIX_RATE, release = 0.08) {
  const n = channels[0].length;
  const look = Math.max(1, Math.round(0.005 * rate));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let peak = 0;
    for (const ch of channels) peak = Math.max(peak, Math.abs(ch[i]));
    need[i] = peak > ceiling ? ceiling / peak : 1;
  }
  // Minimum over [i, i + look], with a monotonic queue.
  const minAhead = new Float32Array(n);
  const q = new Int32Array(n);
  let h = 0;
  let t = 0;
  let j = 0;
  for (let i = 0; i < n; i++) {
    for (; j < n && j <= i + look; j++) {
      while (t > h && need[q[t - 1]] >= need[j]) t--;
      q[t++] = j;
    }
    while (q[h] < i) h++;
    minAhead[i] = need[q[h]];
  }
  // Average over [i - look, i]: every term is at most need[i], so no overshoot.
  const coef = Math.exp(-1 / (release * rate));
  let sum = 0;
  let g = 1;
  for (let i = 0; i < n; i++) {
    sum += minAhead[i];
    if (i > look) sum -= minAhead[i - look - 1];
    const smooth = sum / Math.min(i + 1, look + 1);
    g = smooth < g ? smooth : smooth + (g - smooth) * coef;
    for (const ch of channels) ch[i] *= g;
  }
}

/** Render the plan's soundtrack. `withMusic: false` leaves the song out (you add it in the app). */
/** Where a muffled song is cut off (a 12 dB an octave low-pass): about 15 dB down at 2.5 kHz, 20 at 4 kHz, as nio.trade's cards have it. */
export const MUFFLE_HZ = 1300;

export async function mixPlan(plan: EditPlan, sources: Map<string, Source>, withMusic: boolean): Promise<AudioBuffer> {
  const length = Math.ceil(plan.duration * MIX_RATE);
  const ctx = new OfflineAudioContext(2, length, MIX_RATE);
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const m = plan.music;
  // The song's level where it plays in full, for bringing a voice to it (levelVoice).
  let songDb: number | null = null;
  if (withMusic && m) {
    const src = sources.get(m.source);
    const buf = src ? await decodeAudioBuffer(src, m.songStart, m.songStart + (m.end - m.start), MIX_RATE) : null;
    if (buf) {
      const node = ctx.createBufferSource();
      node.buffer = buf;
      const g = ctx.createGain();
      const level = (t: number) => {
        const pts = m.gainPoints;
        if (!pts?.length) return m.gain;
        if (t <= pts[0][0]) return pts[0][1] * m.gain;
        for (let i = 1; i < pts.length; i++) {
          if (t <= pts[i][0]) {
            const [t0, g0] = pts[i - 1];
            const [t1, g1] = pts[i];
            return (g0 + ((g1 - g0) * (t - t0)) / Math.max(1e-6, t1 - t0)) * m.gain;
          }
        }
        return pts[pts.length - 1][1] * m.gain;
      };
      if (plan.levelVoice !== undefined) {
        let e = 0;
        let k = 0;
        const data = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
        for (let i = 0; i < buf.length; i += 4) {
          if (level(m.start + i / MIX_RATE) < 0.9 * m.gain) continue;
          for (const ch of data) e += ch[i] * ch[i];
          k += data.length;
        }
        if (k) songDb = 10 * Math.log10(e / k + 1e-12) + 20 * Math.log10(m.gain);
      }
      const fadeEnd = Math.max(m.start + m.fadeIn, m.end - m.fadeOut);
      g.gain.setValueAtTime(0, m.start);
      g.gain.linearRampToValueAtTime(level(m.start + Math.max(0.005, m.fadeIn)), m.start + Math.max(0.005, m.fadeIn));
      // The song ducks under dialogue and comes up for the burst and the card.
      for (const [t, v] of m.gainPoints ?? []) if (t > m.start + m.fadeIn && t < fadeEnd) g.gain.linearRampToValueAtTime(v * m.gain, t);
      g.gain.linearRampToValueAtTime(level(fadeEnd), fadeEnd);
      g.gain.linearRampToValueAtTime(0, m.end);
      // Muffled from the card on (nio.trade's end cards): its top cut off as if through a wall,
      // within a few hundredths of a second.
      let into: AudioNode = master;
      if (m.muffle !== undefined && m.muffle < m.end) {
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.Q.value = 0.7;
        lp.frequency.setValueAtTime(20000, 0);
        lp.frequency.setValueAtTime(20000, Math.max(0, m.muffle - 0.01));
        lp.frequency.exponentialRampToValueAtTime(MUFFLE_HZ, m.muffle + 0.03);
        lp.connect(master);
        into = lp;
      }
      const st = m.stutter;
      if (st && st.to > st.from) {
        // The stutter: the song gated off over its stretch (4 ms ramps, no clicks) and its
        // slice played again on each time, at the level the song has there.
        const gate = ctx.createGain();
        gate.gain.setValueAtTime(1, 0);
        gate.gain.setValueAtTime(1, Math.max(0, st.from - 0.004));
        gate.gain.linearRampToValueAtTime(0, st.from);
        gate.gain.setValueAtTime(0, Math.max(st.from, st.to - 0.004));
        gate.gain.linearRampToValueAtTime(1, st.to);
        node.connect(g).connect(gate).connect(into);
        const offset = st.src - m.songStart;
        for (const t of st.at) {
          if (offset < 0 || offset + st.len > buf.duration || t < m.start) continue;
          const slice = ctx.createBufferSource();
          slice.buffer = buf;
          const e = ctx.createGain();
          const v = level(t);
          e.gain.setValueAtTime(0, t);
          e.gain.linearRampToValueAtTime(v, t + 0.003);
          e.gain.setValueAtTime(v, t + Math.max(0.004, st.len - 0.008));
          e.gain.linearRampToValueAtTime(0, t + st.len);
          slice.connect(e).connect(master);
          slice.start(t, offset, st.len);
        }
      } else node.connect(g).connect(into);
      node.start(m.start);
    }
  }
  if (plan.sourceAudio || plan.shots.some((s) => s.audio)) {
    const voices: { s: (typeof plan.shots)[number]; buf: AudioBuffer }[] = [];
    for (const s of plan.shots) {
      const src = sources.get(s.source);
      if (!(s.audio ?? plan.sourceAudio) || !src || s.kind !== "video" || !src.info.hasAudio) continue;
      const dur = s.end - s.start;
      const buf = await decodeAudioBuffer(src, s.srcStart, s.srcStart + (s.ramp ? sourceSpan(s) : dur * s.speed), MIX_RATE);
      if (buf) voices.push({ s, buf });
    }
    // The voice brought to the song: its level over all its shots, against the song's in full.
    let gain = 1;
    if (songDb !== null && plan.levelVoice !== undefined && voices.length) {
      let e = 0;
      let k = 0;
      for (const { buf } of voices) for (let c = 0; c < buf.numberOfChannels; c++) for (const v of buf.getChannelData(c)) (e += v * v), k++;
      const voiceDb = 10 * Math.log10(e / Math.max(1, k) + 1e-12);
      if (voiceDb > -70) gain = Math.min(16, Math.max(0.25, Math.pow(10, (songDb + plan.levelVoice - voiceDb) / 20)));
    }
    for (const { s, buf } of voices) {
      const node = ctx.createBufferSource();
      node.buffer = buf;
      const g = ctx.createGain();
      // 6 ms fades so a jump cut doesn't click.
      g.gain.setValueAtTime(0, s.start);
      g.gain.linearRampToValueAtTime(gain, s.start + 0.006);
      g.gain.setValueAtTime(gain, s.end - 0.006);
      g.gain.linearRampToValueAtTime(0, s.end);
      node.connect(g).connect(master);
      node.start(s.start);
    }
  }
  const out = await ctx.startRendering();
  const channels = [out.getChannelData(0), out.getChannelData(1)];
  const loud = integratedLoudness(channels);
  if (loud > -69) {
    const gain = Math.pow(10, (-14 - loud) / 20);
    for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] *= gain;
    // -1.5 dBFS: headroom for the peaks AAC puts between samples (true peak stays under -1 dB).
    limit(channels, Math.pow(10, -1.5 / 20));
  }
  return out;
}

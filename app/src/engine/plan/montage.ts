/**
 * The music-montage planner: the edit the mico and nio.trade montages are made
 * of (docs/edit-analysis.md, format 3). It picks where to cut from the song's
 * accents, then which moment of which clip goes in each slot, then the one
 * flourish, the caption and the demo card.
 */
import { pickSection, type SongAnalysis } from "../audio/song";
import { PROFILE_BINS, type Scan } from "../media/scan";
import { FPS, FRAME_SIZE, WARM_GRADE, type Aspect, type CaptionEvent, type CardSpec, type Crop, type EditPlan, type FxEvent, type ShotEvent } from "./types";

/**
 * Cuts sit this far ahead of the beat. Measured on the reference montage: mico's
 * cuts land on average 45 ms before the beat times our analysis reports, which is
 * also where a cut reads as "on the beat" (the eye expects the picture first).
 */
export const CUT_LEAD = 0.04;
const MIN_SHOT = 0.3;
const MAX_SHOT = 2.1;

export interface MontageOptions {
  song: SongAnalysis;
  songSource: string;
  songName: string;
  /** the sound came from a Reel: start at its 0:00 so "Use audio" lines up */
  fromStart: boolean;
  scans: Scan[];
  aspect: Aspect;
  /** seconds of footage before the card */
  length: number;
  card: CardSpec | null;
  caption: { style: "mood" | "pov"; text: string } | null;
  variant: number;
  /** source ranges earlier variants used, to spread the footage around */
  avoid?: Map<string, [number, number][]>;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const frame = (t: number) => Math.round(t * FPS) / FPS;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

interface Cand {
  t: number;
  w: number;
  down: boolean;
  drop: boolean;
}

/** The song's loudness (0 to 1) averaged over a stretch of the edit. */
function loudnessOver(song: SongAnalysis, songStart: number, a: number, b: number): number {
  const fps = song.sr / song.hop;
  const f0 = Math.max(0, Math.floor((songStart + a) * fps));
  const f1 = Math.min(song.loudness.length, Math.max(f0 + 1, Math.ceil((songStart + b) * fps)));
  let s = 0;
  for (let f = f0; f < f1; f++) s += song.loudness[f];
  return f1 > f0 ? s / (f1 - f0) : 0;
}

/** Cut candidates in edit time: every beat, plus strong accents between beats. */
function candidates(song: SongAnalysis, songStart: number, until: number, dropAt?: number): Cand[] {
  const out: Cand[] = [];
  const inWindow: number[] = [];
  song.beats.forEach((b, i) => {
    const t = b - songStart;
    if (t > 0.2 && t < until) inWindow.push(i);
  });
  // Rank each beat's strength within the window, blended with its absolute strength.
  const ranked = [...inWindow].sort((a, b) => song.beatStrength[a] - song.beatStrength[b]);
  const rank = new Map(ranked.map((i, k) => [i, ranked.length > 1 ? k / (ranked.length - 1) : 1]));
  for (const i of inWindow) {
    const t = song.beats[i] - songStart;
    const down = song.beatInBar[i] === 0;
    const w = 0.25 + 0.35 * (rank.get(i) ?? 0.5) + 0.35 * song.beatStrength[i] + (down ? 0.25 : 0);
    out.push({ t, w, down, drop: false });
  }
  // Off-beat hits count only on the "and" between two beats (syncopation), and only strong ones.
  for (const a of song.accents) {
    const t = a.t - songStart;
    if (t <= 0.2 || t >= until) continue;
    if (song.beats.some((b) => Math.abs(b - a.t) < 0.07)) continue;
    const frac = a.beat - Math.floor(a.beat);
    if (a.s < 0.5 || Math.abs(frac - 0.5) > 0.12) continue;
    out.push({ t, w: 0.15 + 0.55 * a.s, down: false, drop: false });
  }
  out.sort((a, b) => a.t - b.t);
  if (dropAt !== undefined) {
    let best: Cand | undefined;
    for (const c of out) if (!best || Math.abs(c.t - dropAt) < Math.abs(best.t - dropAt)) best = c;
    if (best && Math.abs(best.t - dropAt) < 0.12) {
      best.drop = true;
      best.w += 3;
    }
  }
  return out;
}

/**
 * Choose the cuts: a path through the candidates from 0 to the card that lands
 * on the strongest accents, keeps shots near a length that suits how loud the
 * music is there (long in the build, short after the drop), and doesn't settle
 * into one length for long (mico runs 1, 1, 2, 1, 3 beats).
 */
export function planCuts(song: SongAnalysis, songStart: number, end: number, dropAt?: number): number[] {
  const cands = [{ t: 0, w: 0, down: true, drop: false }, ...candidates(song, songStart, end - MIN_SHOT, dropAt), { t: end, w: 0, down: true, drop: false }];
  const n = cands.length;
  const pref = (a: number, b: number) => {
    const L = b - a;
    const e = loudnessOver(song, songStart, a, b);
    let target = 1.12 - 0.68 * e;
    if (dropAt !== undefined) target *= b <= dropAt + 0.05 ? 1.25 : 0.85;
    return -0.5 * Math.log(L / clamp(target, 0.38, 1.6)) ** 2 / (2 * 0.5 ** 2);
  };
  // Each cut has to earn its place: only accents stronger than a typical beat pay for themselves.
  const ws = cands.slice(1, -1).map((c) => c.w).sort((a, b) => a - b);
  const cost = ws.length ? ws[Math.floor(ws.length * 0.3)] : 0;
  // best[j] maps a predecessor i to the best score of a path ending ..., i, j.
  const best: Map<number, { score: number; prev: number }>[] = Array.from({ length: n }, () => new Map());
  for (let j = 1; j < n; j++) {
    const L = cands[j].t;
    if (L >= MIN_SHOT && L <= MAX_SHOT) best[j].set(0, { score: cands[j].w - cost + pref(0, cands[j].t), prev: -1 });
  }
  for (let j = 1; j < n; j++) {
    for (const [i, st] of best[j]) {
      const Lp = cands[j].t - cands[i].t;
      for (let k = j + 1; k < n; k++) {
        const L = cands[k].t - cands[j].t;
        if (L < MIN_SHOT) continue;
        if (L > MAX_SHOT) break;
        // Skipping a drop is not allowed.
        let skipsDrop = false;
        for (let m = j + 1; m < k; m++) if (cands[m].drop) skipsDrop = true;
        if (skipsDrop) continue;
        const same = Math.abs(L - Lp) < 0.06 ? 0.2 : 0;
        const score = st.score + cands[k].w - (k === n - 1 ? 0 : cost) + pref(cands[j].t, cands[k].t) - same;
        const cur = best[k].get(j);
        if (!cur || score > cur.score) best[k].set(j, { score, prev: i });
      }
    }
  }
  let bestEnd = -1;
  let bestScore = -Infinity;
  for (const [i, st] of best[n - 1]) {
    if (st.score > bestScore) {
      bestScore = st.score;
      bestEnd = i;
    }
  }
  if (bestEnd < 0) {
    // No musical path (no pulse): an even grid.
    const k = Math.max(1, Math.round(end / 0.8));
    return Array.from({ length: k - 1 }, (_, i) => ((i + 1) * end) / k);
  }
  const cuts: number[] = [];
  let j = n - 1;
  let i = bestEnd;
  while (i > 0) {
    cuts.push(cands[i].t);
    const prev = best[j].get(i)!.prev;
    j = i;
    i = prev;
  }
  return cuts.reverse();
}

/** Where to put the card: on a downbeat near the target length. */
function cardTime(song: SongAnalysis, songStart: number, target: number, available: number): number {
  let best = Math.min(target, available);
  let bestScore = -Infinity;
  song.beats.forEach((b, i) => {
    const t = b - songStart;
    if (t < target - 1.8 || t > Math.min(target + 1.8, available)) return;
    const score = (song.beatInBar[i] === 0 ? 1 : 0) + 0.5 * song.beatStrength[i] - 0.35 * Math.abs(t - target);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  });
  return best;
}

interface Segment {
  scan: Scan;
  start: number;
  score: number;
  peak: number;
  motion: number;
  rgb: [number, number, number];
}

/** The best crop centre for a stretch of a source, from its saliency profiles. */
export function cropFor(scan: Scan, a: number, b: number, aspect: Aspect): Crop {
  const [W, H] = FRAME_SIZE[aspect];
  const out = W / H;
  const src = scan.width / scan.height;
  const st = scan.stats;
  const n = st.t.length;
  const cols = new Float64Array(PROFILE_BINS);
  const rows = new Float64Array(PROFILE_BINS);
  let used = 0;
  for (let i = 0; i < n; i++) {
    if (scan.kind === "video" && (st.t[i] < a - 0.1 || st.t[i] > b + 0.1)) continue;
    for (let k = 0; k < PROFILE_BINS; k++) {
      cols[k] += st.cols[i * PROFILE_BINS + k];
      rows[k] += st.rows[i * PROFILE_BINS + k];
    }
    used++;
  }
  const bestCentre = (profile: Float64Array, frac: number, bias: number) => {
    if (frac >= 0.999 || !used) return 0.5;
    const width = frac * PROFILE_BINS;
    let best = 0.5;
    let bestScore = -Infinity;
    for (let s = 0; s <= 100; s++) {
      const c = frac / 2 + ((1 - frac) * s) / 100;
      const lo = (c - frac / 2) * PROFILE_BINS;
      let sum = 0;
      for (let k = Math.floor(lo); k < Math.ceil(lo + width); k++) {
        const overlap = Math.min(k + 1, lo + width) - Math.max(k, lo);
        if (overlap > 0 && k >= 0 && k < PROFILE_BINS) sum += profile[k] * overlap;
      }
      const score = sum / used - 0.12 * Math.abs(c - bias);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  };
  let cx = 0.5;
  let cy = 0.5;
  if (src > out * 1.01) cx = bestCentre(cols, out / src, 0.5);
  else if (src < out * 0.99) cy = bestCentre(rows, src / out, 0.42);
  return { cx, cy, zoom0: 1, zoom1: 1, fit: "cover" };
}

function colourDistance(a: [number, number, number], b: [number, number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Every usable stretch of every source for a slot `d` seconds long. */
function segmentsFor(scans: Scan[], d: number, motionScale: number): Segment[] {
  const out: Segment[] = [];
  for (const scan of scans) {
    const st = scan.stats;
    const interest = scan.interest!;
    if (scan.kind === "image") {
      out.push({ scan, start: 0, score: interest[0], peak: interest[0], motion: 0, rgb: [st.rgb[0], st.rgb[1], st.rgb[2]] });
      continue;
    }
    const bounds = [scan.start, ...scan.cuts, scan.duration];
    const step = 1 / scan.rate;
    for (let s = 0; s + 1 < bounds.length; s++) {
      const lo = bounds[s] + 0.08;
      const hi = bounds[s + 1] - 0.08;
      for (let start = lo; start + d <= hi; start += step) {
        let sum = 0;
        let peak = 0;
        let motion = 0;
        let c = 0;
        const rgb: [number, number, number] = [0, 0, 0];
        for (let i = 0; i < st.t.length; i++) {
          if (st.t[i] < start || st.t[i] > start + d) continue;
          sum += interest[i];
          peak = Math.max(peak, interest[i]);
          motion += st.motion[i];
          rgb[0] += st.rgb[i * 3];
          rgb[1] += st.rgb[i * 3 + 1];
          rgb[2] += st.rgb[i * 3 + 2];
          c++;
        }
        if (!c) continue;
        out.push({ scan, start, score: sum / c, peak, motion: clamp(motion / c / motionScale, 0, 1.5), rgb: [rgb[0] / c, rgb[1] / c, rgb[2] / c] });
      }
    }
  }
  return out;
}

const overlaps = (ranges: [number, number][] | undefined, a: number, b: number) => !!ranges?.some(([x, y]) => a < y && b > x);

export function planMontage(o: MontageOptions): EditPlan {
  const { song, scans } = o;
  const rand = mulberry32(0x9e3779b9 ^ (o.variant * 7919 + 17));
  const cardHold = o.card ? o.card.hold : 0;
  const [W, H] = FRAME_SIZE[o.aspect];

  // 1. The stretch of music.
  const want = o.length + cardHold;
  const section = pickSection(song, want, o.fromStart);
  const songStart = o.fromStart ? 0 : section.start;
  const available = song.duration - songStart;
  const length = Math.max(4, Math.min(o.length, available - cardHold - 0.2));
  const cardAt = frame(cardTime(song, songStart, length, available - cardHold));
  const duration = frame(cardAt + cardHold);
  const dropSong = section.drop ?? song.drops.find((d) => d.t - songStart > 1.2 && d.t - songStart < cardAt - 1.2)?.t;
  const dropEdit = dropSong !== undefined ? dropSong - songStart : undefined;
  const dropAt = dropEdit !== undefined && dropEdit > 1.2 && dropEdit < cardAt - 1.2 ? dropEdit : undefined;

  // 2. The cuts, a frame and a bit ahead of each accent.
  const musical = planCuts(song, songStart, cardAt, dropAt);
  const cuts = musical.map((t) => frame(Math.max(1 / FPS, t - CUT_LEAD)));
  const bounds = [0, ...cuts, cardAt];
  const slots = bounds.slice(0, -1).map((a, i) => ({ start: a, end: bounds[i + 1], i }));

  // 3. What goes in each slot.
  const motionAll: number[] = [];
  for (const s of scans) if (s.kind === "video") for (const m of s.stats.motion) motionAll.push(m);
  motionAll.sort((a, b) => a - b);
  const motionScale = motionAll.length ? motionAll[Math.floor(motionAll.length * 0.9)] || 0.1 : 0.1;
  const dropSlot = dropAt !== undefined ? slots.findIndex((s) => Math.abs(s.start - frame(dropAt - CUT_LEAD)) < 0.07) : -1;
  const role = (i: number): ShotEvent["role"] => (i === 0 ? "hook" : i === dropSlot ? "drop" : i === slots.length - 1 ? "closer" : dropSlot > 0 && i < dropSlot ? "build" : "body");
  const order = [0, ...(dropSlot > 0 ? [dropSlot] : []), ...(slots.length > 1 ? [slots.length - 1] : []), ...slots.map((s) => s.i)].filter((v, k, arr) => arr.indexOf(v) === k);

  const fairShare = Math.ceil(slots.length / Math.max(1, scans.length)) + (scans.length < 4 ? 2 : 1);
  const used = new Map<string, [number, number][]>();
  const uses = new Map<string, number>();
  const chosen: (Segment & { d: number })[] = new Array(slots.length);
  const cache = new Map<number, Segment[]>();
  for (const i of order) {
    const slot = slots[i];
    const d = slot.end - slot.start;
    const key = Math.round(d * FPS);
    if (!cache.has(key)) cache.set(key, segmentsFor(scans, d, motionScale));
    const segs = cache.get(key)!;
    const energy = loudnessOver(song, songStart, slot.start, slot.end);
    const r = role(i);
    let best: Segment | undefined;
    let bestScore = -Infinity;
    for (const relax of [false, true]) {
      for (const seg of segs) {
        const id = seg.scan.id;
        const a = seg.start;
        const b = seg.start + d;
        if (seg.scan.kind === "video" && overlaps(used.get(id), a - 0.05, b + 0.05) && !relax) continue;
        let s = seg.score;
        if (r === "hook" || r === "drop") s += 0.35 * seg.peak + 0.15 * Math.min(1, seg.motion);
        if (r === "closer") s += 0.1 * seg.peak;
        if (seg.scan.kind === "video") s -= 0.22 * Math.abs(Math.min(1, seg.motion) - energy);
        else s -= 0.12 * energy + (r === "hook" || r === "drop" ? 0.1 : 0);
        for (const nb of [i - 1, i + 1]) {
          const other = chosen[nb];
          if (!other) continue;
          if (other.scan.id === id) s -= seg.scan.kind === "image" || Math.abs(other.start - a) < 4 ? 0.4 : 0.15;
          s -= 0.12 * Math.max(0, 1 - colourDistance(other.rgb, seg.rgb) / 0.12);
        }
        // Spread the edit over the footage: each reuse costs more, and past a fair share, a lot.
        const u = uses.get(id) ?? 0;
        s -= 0.16 * u + (u >= fairShare ? 0.6 : 0);
        if (seg.scan.kind === "image" && (uses.get(id) ?? 0) > 0) s -= 0.5;
        if (overlaps(o.avoid?.get(id), a, b)) s -= 0.18;
        if (relax && overlaps(used.get(id), a - 0.05, b + 0.05)) s -= 0.6;
        s += (rand() - 0.5) * 0.1;
        if (s > bestScore) {
          bestScore = s;
          best = seg;
        }
      }
      if (best) break;
    }
    if (!best) throw new Error("No footage to fill the edit");
    chosen[i] = { ...best, d };
    const id = best.scan.id;
    if (!used.has(id)) used.set(id, []);
    used.get(id)!.push([best.start, best.start + d]);
    uses.set(id, (uses.get(id) ?? 0) + 1);
  }

  let kb = 0;
  const shots: ShotEvent[] = slots.map((slot, i) => {
    const seg = chosen[i];
    const crop = cropFor(seg.scan, seg.start, seg.start + seg.d, o.aspect);
    if (seg.scan.kind === "image") {
      // Ken Burns: a slow push, alternating in and out, drifting towards the subject.
      const inward = kb++ % 2 === 0;
      crop.zoom0 = inward ? 1.02 : 1.1;
      crop.zoom1 = inward ? 1.1 : 1.02;
      const tx = crop.cx;
      const ty = crop.cy;
      crop.cx = inward ? 0.5 + (tx - 0.5) * 0.4 : tx;
      crop.cy = inward ? 0.5 + (ty - 0.5) * 0.4 : ty;
      crop.cx1 = inward ? tx : 0.5 + (tx - 0.5) * 0.4;
      crop.cy1 = inward ? ty : 0.5 + (ty - 0.5) * 0.4;
    } else if (seg.motion < 0.18) {
      // A still shot gets a barely-there push so it doesn't look frozen.
      crop.zoom0 = 1;
      crop.zoom1 = 1.04;
    }
    return { start: slot.start, end: slot.end, source: seg.scan.id, kind: seg.scan.kind, srcStart: seg.start, speed: 1, crop, role: role(i), score: Math.round(seg.score * 100) / 100 };
  });

  // 4. One flourish on the drop, the dip to black, the card.
  const fx: FxEvent[] = [];
  const flourishAt = dropSlot > 0 ? shots[dropSlot].start : undefined;
  const flourish = (["flash", "burn", null] as const)[o.variant % 3];
  if (flourishAt !== undefined && flourish === "flash") fx.push({ kind: "flash", start: flourishAt, end: flourishAt + 5 / FPS, strength: 0.85, at: flourishAt });
  if (flourishAt !== undefined && flourish === "burn") fx.push({ kind: "burn", start: flourishAt - 2 / FPS, end: flourishAt + 4 / FPS, strength: 0.9, at: flourishAt });
  if (o.card) fx.push({ kind: "dip", start: cardAt - 4 / FPS, end: cardAt, strength: 1 });

  const captions: CaptionEvent[] = [];
  if (o.caption?.text.trim()) {
    captions.push({ style: o.caption.style, text: o.caption.text.trim(), start: 0, end: o.card ? cardAt - 4 / FPS : duration });
  }

  const fadeOut = Math.min(0.8, cardHold * 0.2 || 0.6);
  const plan: EditPlan = {
    id: `montage-${o.aspect}-v${o.variant + 1}`,
    label: `Montage ${o.variant + 1}`,
    format: "montage",
    aspect: o.aspect,
    width: W,
    height: H,
    fps: FPS,
    duration,
    shots,
    fx,
    captions,
    card: o.card ? { spec: o.card, start: cardAt, end: duration, fadeIn: 8 / FPS, fadeOut } : undefined,
    music: { source: o.songSource, songStart, start: 0, end: duration, fadeIn: 0.01, fadeOut, gain: 1 },
    sourceAudio: false,
    grade: WARM_GRADE,
    note: {
      caption: o.caption?.text.trim() || "",
      hashtags: [],
      sound: o.fromStart
        ? "Add the sound from the Reel you took it from (tap the sound, then Use audio). It starts at 0:00, so every cut lands on the beat."
        : `Song: ${o.songName}, from ${Math.floor(songStart / 60)}:${String(Math.floor(songStart % 60)).padStart(2, "0")}.`,
    },
  };
  const lengths = shots.map((s) => s.end - s.start).sort((a, b) => a - b);
  plan.checks = {
    shots: shots.length,
    medianShot: Math.round(lengths[Math.floor(lengths.length / 2)] * 100) / 100,
    shortest: Math.round(lengths[0] * 100) / 100,
    longest: Math.round(lengths[lengths.length - 1] * 100) / 100,
    bpm: Math.round(song.bpm),
    songStart: Math.round(songStart * 100) / 100,
    drop: dropAt !== undefined ? Math.round(dropAt * 100) / 100 : "none",
    cardAt,
    sources: new Set(shots.map((s) => s.source)).size,
  };
  return plan;
}

/** The source ranges a plan uses, to steer the next variant elsewhere. */
export function usedRanges(plan: EditPlan, into = new Map<string, [number, number][]>()) {
  for (const s of plan.shots) {
    if (!into.has(s.source)) into.set(s.source, []);
    into.get(s.source)!.push([s.srcStart, s.srcStart + (s.end - s.start) * s.speed]);
  }
  return into;
}

/**
 * Planning edits cut to music. The building blocks here (the stretch of song,
 * the cut grid, filling each slot with the best moment, and finishing the edit
 * with its flourish, captions and demo card) make the music montage of the mico
 * and nio.trade Reels (docs/edit-analysis.md, format 3), and the twist and meme
 * formats in formats.ts.
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
export const MIN_SHOT = 0.3;
const MAX_SHOT = 2.1;

export type Role = NonNullable<ShotEvent["role"]>;

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

export const frame = (t: number) => Math.round(t * FPS) / FPS;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** The song's loudness (0 to 1) averaged over a stretch of the edit. */
export function loudnessOver(song: SongAnalysis, songStart: number, a: number, b: number): number {
  const fps = song.sr / song.hop;
  const f0 = Math.max(0, Math.floor((songStart + a) * fps));
  const f1 = Math.min(song.loudness.length, Math.max(f0 + 1, Math.ceil((songStart + b) * fps)));
  let s = 0;
  for (let f = f0; f < f1; f++) s += song.loudness[f];
  return f1 > f0 ? s / (f1 - f0) : 0;
}

// ── the stretch of music ─────────────────────────────────────────────────────

export interface MusicWindow {
  songStart: number;
  /** when the card comes in (edit time), on a downbeat */
  cardAt: number;
  duration: number;
  dropAt?: number;
}

/** Where to put the card: on a downbeat near the target length. */
function cardTime(song: SongAnalysis, songStart: number, target: number, available: number): number {
  let best = Math.min(target, available);
  let bestScore = -Infinity;
  song.beats.forEach((b, i) => {
    const t = b - songStart;
    // Near the target, and never much short of it (a short edit can't give up seconds).
    if (t < Math.max(target - 1.8, target * 0.85) || t > Math.min(target + 1.8, available)) return;
    const score = (song.beatInBar[i] === 0 ? 1 : 0) + 0.5 * song.beatStrength[i] - 0.35 * Math.abs(t - target);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  });
  return best;
}

/**
 * The part of the song an edit uses: `length` seconds of footage, then the card
 * for `cardHold` seconds with the music still playing under it.
 */
export function musicWindow(song: SongAnalysis, length: number, cardHold: number, fromStart: boolean): MusicWindow {
  const section = pickSection(song, length + cardHold, fromStart);
  const songStart = fromStart ? 0 : section.start;
  const available = song.duration - songStart;
  // A short sound shortens the card first (to 2.5 s), then the footage (to 3 s);
  // past that the card runs on after the song ends.
  const hold = cardHold > 0 ? Math.max(Math.min(cardHold, 2.5), Math.min(cardHold, available - Math.min(length, 3) - 0.2)) : 0;
  const len = Math.max(3, Math.min(length, available - hold - 0.2));
  const cardAt = frame(cardTime(song, songStart, len, Math.max(len, available - hold)));
  const duration = frame(cardAt + hold);
  const dropSong = section.drop ?? song.drops.find((d) => d.t - songStart > 1.2 && d.t - songStart < cardAt - 1.2)?.t;
  const dropEdit = dropSong !== undefined ? dropSong - songStart : undefined;
  const dropAt = dropEdit !== undefined && dropEdit > 1.2 && dropEdit < cardAt - 1.2 ? dropEdit : undefined;
  return { songStart, cardAt, duration, dropAt };
}

// ── the cut grid ─────────────────────────────────────────────────────────────

interface Cand {
  t: number;
  w: number;
  down: boolean;
  drop: boolean;
}

/** Cut candidates in edit time: every beat, plus strong hits on the "and" between beats. */
function candidates(song: SongAnalysis, songStart: number, from: number, until: number, dropAt?: number): Cand[] {
  const out: Cand[] = [];
  const inWindow: number[] = [];
  song.beats.forEach((b, i) => {
    const t = b - songStart;
    if (t > from + 0.2 && t < until) inWindow.push(i);
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
  for (const a of song.accents) {
    const t = a.t - songStart;
    if (t <= from + 0.2 || t >= until) continue;
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

export interface CutOptions {
  /** where the stretch starts (edit time) */
  from?: number;
  /** 1 = the reference montages; above 1 holds shots longer */
  pace?: number;
  maxShot?: number;
  dropAt?: number;
}

/**
 * Choose the cuts between `from` and `end`: a path through the candidates that
 * lands on the strongest accents, keeps shots near a length that suits how loud
 * the music is there (long in the build, short after the drop), and doesn't
 * settle into one length for long (mico runs 1, 1, 2, 1, 3 beats). Returns the
 * musical times, without the lead.
 */
export function planCuts(song: SongAnalysis, songStart: number, end: number, opts: CutOptions = {}): number[] {
  const from = opts.from ?? 0;
  const pace = opts.pace ?? 1;
  const maxShot = opts.maxShot ?? MAX_SHOT * Math.max(1, pace);
  const { dropAt } = opts;
  const cands = [{ t: from, w: 0, down: true, drop: false }, ...candidates(song, songStart, from, end - MIN_SHOT, dropAt), { t: end, w: 0, down: true, drop: false }];
  const n = cands.length;
  const pref = (a: number, b: number) => {
    const L = b - a;
    const e = loudnessOver(song, songStart, a, b);
    let target = (1.12 - 0.68 * e) * pace;
    if (dropAt !== undefined) target *= b <= dropAt + 0.05 ? 1.25 : 0.85;
    return (-0.5 * Math.log(L / clamp(target, 0.38, 1.6 * pace)) ** 2) / (2 * 0.5 ** 2);
  };
  // Each cut has to earn its place: only accents stronger than a typical beat pay for themselves.
  const ws = cands.slice(1, -1).map((c) => c.w).sort((a, b) => a - b);
  const cost = ws.length ? ws[Math.floor(ws.length * 0.3)] : 0;
  // best[j] maps a predecessor i to the best score of a path ending ..., i, j.
  const best: Map<number, { score: number; prev: number }>[] = Array.from({ length: n }, () => new Map());
  for (let j = 1; j < n; j++) {
    const L = cands[j].t - from;
    if (L >= MIN_SHOT && L <= maxShot) best[j].set(0, { score: (j === n - 1 ? 0 : cands[j].w - cost) + pref(from, cands[j].t), prev: -1 });
  }
  for (let j = 1; j < n; j++) {
    for (const [i, st] of best[j]) {
      const Lp = cands[j].t - cands[i].t;
      for (let k = j + 1; k < n; k++) {
        const L = cands[k].t - cands[j].t;
        if (L < MIN_SHOT) continue;
        if (L > maxShot) break;
        // Skipping a drop is not allowed.
        let skipsDrop = false;
        for (let m = j + 1; m < k; m++) if (cands[m].drop) skipsDrop = true;
        if (skipsDrop) continue;
        const same = Math.abs(L - Lp) < 0.06 ? 0.2 : 0;
        const score = st.score + (k === n - 1 ? 0 : cands[k].w - cost) + pref(cands[j].t, cands[k].t) - same;
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
    const k = Math.max(1, Math.round((end - from) / (0.8 * pace)));
    return Array.from({ length: k - 1 }, (_, i) => from + ((i + 1) * (end - from)) / k);
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

// ── filling the slots ────────────────────────────────────────────────────────

export interface Slot {
  start: number;
  end: number;
  role: Role;
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
  // A portrait clip in a landscape frame loses too much to a crop: it sits whole
  // over a blurred copy of itself instead, the way the apps show one.
  if (scan.height > scan.width * 1.05 && W > H) return { cx: 0.5, cy: 0.5, zoom0: 1, zoom1: 1, fit: "fit" };
  let cx = 0.5;
  let cy = 0.5;
  if (src > out * 1.01) cx = bestCentre(cols, out / src, 0.5);
  else if (src < out * 0.99) cy = bestCentre(rows, src / out, 0.42);
  return { cx, cy, zoom0: 1, zoom1: 1, fit: "cover" };
}

const colourDistance = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The longest stretch of a source without a cut in it (or at all, `acrossCuts`). */
export function longestStretch(scan: Scan, acrossCuts = false): number {
  if (scan.kind === "image") return Infinity;
  const bounds = acrossCuts ? [scan.start, scan.duration] : [scan.start, ...scan.cuts, scan.duration];
  let best = 0;
  for (let i = 0; i + 1 < bounds.length; i++) best = Math.max(best, bounds[i + 1] - bounds[i] - 0.16);
  return best;
}

/** Every usable stretch of every source for a slot `d` seconds long. */
function segmentsFor(scans: Scan[], d: number, motionScale: number, acrossCuts = false): Segment[] {
  const out: Segment[] = [];
  for (const scan of scans) {
    const st = scan.stats;
    const interest = scan.interest!;
    if (scan.kind === "image") {
      out.push({ scan, start: 0, score: interest[0], peak: interest[0], motion: 0, rgb: [st.rgb[0], st.rgb[1], st.rgb[2]] });
      continue;
    }
    const bounds = acrossCuts ? [scan.start, scan.duration] : [scan.start, ...scan.cuts, scan.duration];
    const step = 1 / scan.rate;
    for (let s = 0; s + 1 < bounds.length; s++) {
      const lo = bounds[s] + 0.08;
      const hi = bounds[s + 1] - 0.08;
      for (let start = lo; start + d <= hi + 1e-6; start += step) {
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

/**
 * The stretches that can fill a slot `d` seconds long: whole ones inside a shot;
 * failing that, the longest there are (played slower); failing that, stretches
 * running across the source's own cuts.
 */
function candidatesFor(scans: Scan[], d: number, motionScale: number): { segs: Segment[]; len: number } {
  let segs = segmentsFor(scans, d, motionScale);
  if (segs.length) return { segs, len: d };
  const inShot = Math.max(...scans.map((s) => longestStretch(s)));
  if (inShot >= d * 0.5) {
    const len = Math.max(MIN_SHOT, Math.min(d, inShot));
    segs = segmentsFor(scans, len, motionScale);
    if (segs.length) return { segs, len };
  }
  segs = segmentsFor(scans, d, motionScale, true);
  if (segs.length) return { segs, len: d };
  const whole = Math.max(...scans.map((s) => longestStretch(s, true)));
  const len = Math.max(0.1, Math.min(d, whole));
  segs = segmentsFor(scans, len, motionScale, true);
  if (segs.length) return { segs, len };
  // Clips too short for even that: each one from its start, whatever its length.
  return {
    segs: scans.map((scan) => ({ scan, start: scan.start, score: scan.interest?.[0] ?? 0.5, peak: scan.interest?.[0] ?? 0.5, motion: 0, rgb: [scan.stats.rgb[0] ?? 0, scan.stats.rgb[1] ?? 0, scan.stats.rgb[2] ?? 0] as [number, number, number] })),
    len: Math.max(0.1, Math.min(d, whole)),
  };
}

export interface AssignContext {
  song?: SongAnalysis;
  songStart: number;
  aspect: Aspect;
  variant: number;
  /** source ranges earlier variants used, to spread the footage around */
  avoid?: Map<string, [number, number][]>;
  /** ranges already used in this edit (shared between acts) */
  used?: Map<string, [number, number][]>;
}

/**
 * The best moment for each slot: the hook and the drop get the most striking
 * footage, energy in the footage follows energy in the music, neighbours come
 * from different clips and look different, and the edit spreads over all the
 * footage rather than leaning on one clip.
 */
export function assignShots(slots: Slot[], scans: Scan[], ctx: AssignContext): ShotEvent[] {
  if (!scans.length) throw new Error("No footage to fill the edit");
  const rand = mulberry32(0x9e3779b9 ^ (ctx.variant * 7919 + 17));
  const motionAll: number[] = [];
  for (const s of scans) if (s.kind === "video") for (const m of s.stats.motion) motionAll.push(m);
  motionAll.sort((a, b) => a - b);
  const motionScale = motionAll.length ? motionAll[Math.floor(motionAll.length * 0.9)] || 0.1 : 0.1;
  const importance: Record<Role, number> = { hook: 0, drop: 1, closer: 2, build: 3, body: 3 };
  const order = slots.map((_, i) => i).sort((a, b) => importance[slots[a].role] - importance[slots[b].role] || a - b);
  const fairShare = Math.ceil(slots.length / scans.length) + (scans.length < 4 ? 2 : 1);
  const used = ctx.used ?? new Map<string, [number, number][]>();
  const uses = new Map<string, number>();
  const chosen: (Segment & { d: number; len: number })[] = new Array(slots.length);
  const cache = new Map<number, { segs: Segment[]; len: number }>();
  for (const i of order) {
    const slot = slots[i];
    const d = slot.end - slot.start;
    const key = Math.round(d * FPS);
    if (!cache.has(key)) cache.set(key, candidatesFor(scans, d, motionScale));
    const { segs, len } = cache.get(key)!;
    const energy = ctx.song ? loudnessOver(ctx.song, ctx.songStart, slot.start, slot.end) : 0.5;
    const r = slot.role;
    let best: Segment | undefined;
    let bestScore = -Infinity;
    for (const relax of [false, true]) {
      for (const seg of segs) {
        const id = seg.scan.id;
        const a = seg.start;
        const b = seg.start + len;
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
        const u = uses.get(id) ?? 0;
        s -= 0.16 * u + (u >= fairShare ? 0.6 : 0);
        if (seg.scan.kind === "image" && u > 0) s -= 0.5;
        if (overlaps(ctx.avoid?.get(id), a, b)) s -= 0.18;
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
    chosen[i] = { ...best, d, len };
    const id = best.scan.id;
    if (!used.has(id)) used.set(id, []);
    used.get(id)!.push([best.start, best.start + len]);
    uses.set(id, (uses.get(id) ?? 0) + 1);
  }

  let kb = ctx.variant;
  return slots.map((slot, i) => {
    const seg = chosen[i];
    const d = slot.end - slot.start;
    const crop = cropFor(seg.scan, seg.start, seg.start + d, ctx.aspect);
    // A stretch shorter than the slot plays slower to fill it (down to half speed; past
    // that its last frame holds).
    const speed = seg.scan.kind === "video" && seg.len < d - 1e-6 ? Math.max(0.5, seg.len / d) : 1;
    if (seg.scan.kind === "image") {
      // Ken Burns: a slow push, alternating in and out, drifting towards the subject.
      const inward = kb++ % 2 === 0;
      const tx = crop.cx;
      const ty = crop.cy;
      const drift = 0.4;
      crop.zoom0 = inward ? 1.02 : 1.1;
      crop.zoom1 = inward ? 1.1 : 1.02;
      crop.cx = inward ? 0.5 + (tx - 0.5) * drift : tx;
      crop.cy = inward ? 0.5 + (ty - 0.5) * drift : ty;
      crop.cx1 = inward ? tx : 0.5 + (tx - 0.5) * drift;
      crop.cy1 = inward ? ty : 0.5 + (ty - 0.5) * drift;
    } else if (seg.motion < 0.18) {
      // A still shot gets a barely-there push so it doesn't look frozen.
      crop.zoom1 = 1.04;
    }
    return { start: slot.start, end: slot.end, source: seg.scan.id, kind: seg.scan.kind, srcStart: seg.start, speed, crop, role: slot.role, score: Math.round(seg.score * 100) / 100 };
  });
}

/** Slots between cut points, with the drop, hook and closer marked. */
export function slotsBetween(bounds: number[], dropCut?: number): Slot[] {
  const slots: Slot[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const start = bounds[i];
    let role: Role = "body";
    if (i === 0) role = "hook";
    else if (dropCut !== undefined && Math.abs(start - dropCut) < 0.07) role = "drop";
    else if (i === bounds.length - 2) role = "closer";
    else if (dropCut !== undefined && start < dropCut) role = "build";
    slots.push({ start, end: bounds[i + 1], role });
  }
  return slots;
}

// ── finishing ────────────────────────────────────────────────────────────────

export interface FinishOptions {
  id: string;
  label: string;
  format: EditPlan["format"];
  aspect: Aspect;
  shots: ShotEvent[];
  window: MusicWindow;
  songSource?: string;
  songName?: string;
  fromStart: boolean;
  card: CardSpec | null;
  captions: CaptionEvent[];
  variant: number;
  /** where the flourish goes (a cut on the drop), if anywhere */
  flourishAt?: number;
  fadeIn?: number;
  bpm?: number;
}

/** The flourish, the dip into the card, the card, the music and the post note. */
export function finishPlan(o: FinishOptions): EditPlan {
  const [W, H] = FRAME_SIZE[o.aspect];
  const { cardAt, duration, songStart } = o.window;
  const cardHold = duration - cardAt;
  const fx: FxEvent[] = [];
  if (o.fadeIn) fx.push({ kind: "fadein", start: 0, end: o.fadeIn, strength: 1 });
  const flourish = (["flash", "burn", null] as const)[o.variant % 3];
  const at = o.flourishAt;
  if (at !== undefined && flourish === "flash") fx.push({ kind: "flash", start: at, end: at + 5 / FPS, strength: 0.85, at });
  if (at !== undefined && flourish === "burn") fx.push({ kind: "burn", start: at - 2 / FPS, end: at + 4 / FPS, strength: 0.9, at });
  if (o.card) fx.push({ kind: "dip", start: cardAt - 4 / FPS, end: cardAt, strength: 1 });
  const fadeOut = o.card ? Math.min(0.8, cardHold * 0.2) : 0.6;
  const lengths = o.shots.map((s) => s.end - s.start).sort((a, b) => a - b);
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  return {
    id: `${o.id}-${o.aspect}-v${o.variant + 1}`,
    label: o.label,
    format: o.format,
    aspect: o.aspect,
    width: W,
    height: H,
    fps: FPS,
    duration,
    shots: o.shots,
    fx,
    captions: o.captions,
    card: o.card ? { spec: o.card, start: cardAt, end: duration, fadeIn: 8 / FPS, fadeOut } : undefined,
    music: o.songSource ? { source: o.songSource, songStart, start: 0, end: duration, fadeIn: 0.01, fadeOut, gain: 1 } : undefined,
    sourceAudio: false,
    grade: WARM_GRADE,
    note: {
      caption: o.captions.map((c) => c.text).join(" "),
      hashtags: [],
      sound: !o.songSource
        ? "No sound in this one: add one in the app."
        : o.fromStart
          ? "Add the sound from the Reel you took it from (tap the sound, then Use audio). It starts at 0:00, so every cut lands on the beat."
          : `Song: ${o.songName ?? "the song you dropped"}, from ${mmss(songStart)}. In the app, start the sound at ${mmss(songStart)}.`,
    },
    checks: {
      shots: o.shots.length,
      medianShot: lengths.length ? Math.round(lengths[Math.floor(lengths.length / 2)] * 100) / 100 : 0,
      shortest: lengths.length ? Math.round(lengths[0] * 100) / 100 : 0,
      longest: lengths.length ? Math.round(lengths[lengths.length - 1] * 100) / 100 : 0,
      bpm: o.bpm ? Math.round(o.bpm) : "none",
      songStart: Math.round(songStart * 100) / 100,
      drop: o.window.dropAt !== undefined ? Math.round(o.window.dropAt * 100) / 100 : "none",
      cardAt,
      sources: new Set(o.shots.map((s) => s.source)).size,
    },
  };
}

/** The source ranges a plan uses, to steer the next variant elsewhere. */
export function usedRanges(plan: EditPlan, into = new Map<string, [number, number][]>()) {
  for (const s of plan.shots) {
    if (!into.has(s.source)) into.set(s.source, []);
    into.get(s.source)!.push([s.srcStart, s.srcStart + (s.end - s.start) * s.speed]);
  }
  return into;
}

// ── the music montage ────────────────────────────────────────────────────────

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
  caption: { style: "mood" | "pov" | "meme"; text: string } | null;
  variant: number;
  avoid?: Map<string, [number, number][]>;
}

export function planMontage(o: MontageOptions): EditPlan {
  const win = musicWindow(o.song, o.length, o.card ? o.card.hold : 0, o.fromStart);
  const cuts = planCuts(o.song, win.songStart, win.cardAt, { dropAt: win.dropAt }).map((t) => frame(Math.max(1 / FPS, t - CUT_LEAD)));
  const dropCut = win.dropAt !== undefined ? frame(win.dropAt - CUT_LEAD) : undefined;
  const slots = slotsBetween([0, ...cuts, win.cardAt], dropCut);
  const shots = assignShots(slots, o.scans, { song: o.song, songStart: win.songStart, aspect: o.aspect, variant: o.variant, avoid: o.avoid });
  const drop = shots.find((s) => s.role === "drop");
  const captions: CaptionEvent[] = o.caption?.text.trim() ? [{ style: o.caption.style, text: o.caption.text.trim(), start: 0, end: o.card ? win.cardAt - 4 / FPS : win.duration }] : [];
  return finishPlan({
    id: "montage",
    label: `Montage ${o.variant + 1}`,
    format: "montage",
    aspect: o.aspect,
    shots,
    window: win,
    songSource: o.songSource,
    songName: o.songName,
    fromStart: o.fromStart,
    card: o.card,
    captions,
    variant: o.variant,
    flourishAt: drop?.start,
    bpm: o.song.bpm,
  });
}

/**
 * Edit styles: the ways the reference editors shape a music edit, beyond where they
 * cut (docs/edit-analysis.md, "The styles"). Each is a choice in the app, and a batch
 * set to mix them makes each edit in a different one.
 *
 * - On the beat (mico, nio.trade): holds back for the build, then one rhythm from the
 *   drop to the end.
 * - Talk, then the drop (TJR): someone talking in black and white, their own voice over
 *   the song's intro, then a hard cut into colour on the drop. TJR's own build is six
 *   calm shots (median 1.7 s) and 0.57 s a shot after its drop.
 * - Black and white to colour (nio.trade …5448, …2531): the build in black and white,
 *   the drop in colour, and after it a shot or two that start in black and white and
 *   turn to colour on the next beat.
 * - Photo burst (nio.trade …0002): after the opening shot, four to six pictures flying
 *   in tilted on black, a sixteenth (three or four frames) each.
 * - Fast re-cuts (nio.trade …2531, …5448): a clip cut again and again a moment further
 *   on, on the half beats (a Ferrari eight times in two seconds): a third or more of
 *   the cuts.
 * - Slow and cinematic (brezscales, TJR's build): a bar a shot before the drop, two beats
 *   after it, slow pushes, no flourish.
 *
 * Without an end card, every style but the talking one can end on the moment it opens
 * on (TJR's last shot is its first), so the replay loops without a seam (montage.ts:
 * the shot picker knows the last shot before it picks the ones around it).
 */
import type { SongAnalysis } from "../audio/song";
import { keepSpeech, type Run } from "../audio/speech";
import { KINDS, type Scan } from "../media/scan";
import { frameShot } from "./framing";
import { FPS, sourceSpan, type Aspect, type Crop, type FxEvent, type ShotEvent } from "./types";

export type EditStyle = "beat" | "talk" | "mono" | "burst" | "recut" | "slow";

export const EDIT_STYLES: { value: EditStyle; name: string; label: string; desc: string }[] = [
  { value: "beat", name: "On the beat", label: "Montage", desc: "Holds back, then one rhythm from the drop." },
  { value: "talk", name: "Talk, then the drop", label: "Talk + drop", desc: "Someone talking in black and white, then the drop in colour." },
  { value: "mono", name: "Black and white to colour", label: "B&W flip", desc: "Black and white until the drop, then colour." },
  { value: "burst", name: "Photo burst", label: "Photo burst", desc: "Pictures fly in, three frames each, then the edit." },
  { value: "recut", name: "Fast re-cuts", label: "Re-cuts", desc: "One clip cut again and again, a jump further each time." },
  { value: "slow", name: "Slow and cinematic", label: "Slow", desc: "Long holds and slow pushes. A mood piece." },
];

export const styleName = (s: EditStyle) => EDIT_STYLES.find((x) => x.value === s)!.name;
export const styleLabel = (s: EditStyle) => EDIT_STYLES.find((x) => x.value === s)!.label;
/** What a talking edit is called when no one in the footage talks: it opens on calm shots in black and white. */
export const CALM_LABEL = "B&W intro";

const talkyCache = new WeakMap<Scan, boolean>();
/**
 * A clip that's someone talking: a quarter of its frames or more seen as talking. The
 * picture model reads the rest of a talking head as all sorts (a room, "money"), so the
 * whole clip counts as talking, bar a moment of real flex in it.
 */
export function talky(scan: Scan): boolean {
  if (scan.kind !== "video" || !scan.look) return false;
  let v = talkyCache.get(scan);
  if (v === undefined) {
    const k = KINDS.indexOf("talking");
    let n = 0;
    for (const x of scan.look.kind) if (x === k) n++;
    v = n >= 0.25 * scan.look.kind.length;
    talkyCache.set(scan, v);
  }
  return v;
}

/** A clip with someone talking in it: where the voice is, in source seconds. */
export interface Talker {
  id: string;
  runs: Run[];
}

/** Enough talking to open an edit on: three seconds of voice at least. */
export const talks = (runs: Run[]) => runs.reduce((a, r) => a + r.end - r.start, 0) >= 3;

/**
 * The styles a batch set to mix goes through, in order, for this footage: the talking
 * one only when someone talks in it, the burst only with four pictures or clips to
 * flash (the user's photos first).
 */
export function mixOrder(scans: Scan[], talk: boolean): EditStyle[] {
  const burst = scans.length >= 4;
  return ["beat", ...(talk ? (["talk"] as const) : []), "mono", ...(burst ? (["burst"] as const) : []), "recut", "slow"];
}

/** The style for edit number `n` of a batch (counting on from earlier batches): the one picked, or the next in the mix. */
export function styleFor(n: number, pick: EditStyle | "mix", order: EditStyle[]): EditStyle {
  if (pick !== "mix") return pick;
  return order[((n % order.length) + order.length) % order.length];
}

// ── talk, then the drop ──────────────────────────────────────────────────────

/** Where the drop lands in a talking edit's stretch of song (fractions of it): the talking needs room. */
export const TALK_DROP: [number, number] = [0.3, 0.65];

/**
 * Where the talking hands over to the edit (edit seconds on the music): the drop, when
 * it leaves the talking three seconds or more and the edit a third of its length;
 * otherwise the bar line nearest two fifths of the way to the card.
 */
export function talkEnd(song: SongAnalysis, songStart: number, cardAt: number, dropAt?: number): number {
  if (dropAt !== undefined && dropAt >= 3 && dropAt <= 0.7 * cardAt) return dropAt;
  const target = 0.42 * cardAt;
  const bars = song.downbeats.map((d) => d - songStart).filter((t) => t >= 2.5 && t <= 0.65 * cardAt);
  const beats = song.beats.map((b) => b - songStart).filter((t) => t >= 2.5 && t <= 0.65 * cardAt);
  const near = (ts: number[]) => ts.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
  return near(bars) ?? near(beats) ?? target;
}

export interface TalkIntro {
  /** the talking, jump cut where it pauses, its own sound on */
  shots: ShotEvent[];
  /** where the talking ends (edit seconds): the drop, or earlier when the clip runs out of it */
  end: number;
  /** the stretch of the source it used */
  range: [number, number];
}

/**
 * Up to `len` seconds of someone talking, from one of the clips with a voice in it:
 * starting on a phrase after a pause, the pauses over 0.28 s cut out (a jump cut punches
 * in every other time, as the story clips do), one crop per scene. Each edit in a batch
 * takes another stretch (or another clip), away from where earlier edits' talking was.
 */
export function talkingIntro(scans: Scan[], talkers: Talker[], len: number, aspect: Aspect, variant: number, avoid?: Map<string, [number, number, boolean?][]>): TalkIntro | null {
  // Each edit's own leaning (the same every time for the same edit).
  let seed = (variant + 1) * 0x9e3779b1;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let h = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h;
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
  let best: { scan: Scan; runs: Run[]; score: number } | null = null;
  for (const t of talkers) {
    const scan = scans.find((s) => s.id === t.id);
    if (!scan || scan.kind !== "video" || !talks(t.runs)) continue;
    const runs = [...t.runs].filter((r) => r.end > scan.start + 0.05 && r.start < scan.duration - 0.05).sort((a, b) => a.start - b.start);
    for (let i = 0; i < runs.length; i++) {
      // A phrase's start: the first, or after a breath (0.35 s of quiet).
      if (i > 0 && runs[i].start - runs[i - 1].end < 0.35) continue;
      const a = Math.max(scan.start + 0.02, runs[i].start - 0.08);
      const kept = keepSpeech(runs, a, scan.duration - 0.02);
      let got = 0;
      const pieces: Run[] = [];
      for (const r of kept) {
        if (got >= len - 1e-6) break;
        const take = Math.min(r.end - r.start, len - got);
        if (take < 2 / FPS) break;
        pieces.push({ start: r.start, end: r.start + take });
        got += take;
      }
      if (!pieces.length) continue;
      // Most talking, then the fewest jump cuts, away from earlier edits' talking, and each
      // edit leaning its own way.
      const used = (avoid?.get(scan.id) ?? []).some(([x, y]) => pieces[0].start < y + 2 && pieces[pieces.length - 1].end > x - 2);
      const score = got / len - 0.03 * pieces.length - (used ? 0.6 : 0) + 0.08 * rand();
      if (!best || score > best.score) best = { scan, runs: pieces, score };
    }
  }
  if (!best) return null;
  const { scan, runs } = best;
  const shots: ShotEvent[] = [];
  const crops = new Map<number, Crop>();
  const sceneOf = (t: number) => {
    let k = 0;
    while (k < scan.cuts.length && t >= scan.cuts[k]) k++;
    return k;
  };
  let t = 0;
  let jumps = 0;
  let last = -1;
  for (const r of runs) {
    const end = frameOf(t + (r.end - r.start));
    if (end - t < 2 / FPS) continue;
    const sc = sceneOf(r.start);
    if (!crops.has(sc)) crops.set(sc, frameShot({ scan, a: r.start, b: Math.min(scan.duration, r.start + len), aspect }));
    const crop = { ...crops.get(sc)! };
    jumps = sc === last ? jumps + 1 : 0;
    if (jumps % 2 === 1 && crop.fit === "cover") crop.zoom0 = crop.zoom1 = 1.1;
    last = sc;
    shots.push({ start: t, end, source: scan.id, kind: "video", srcStart: r.start, speed: 1, crop, role: shots.length ? "build" : "hook", audio: true });
    t = end;
  }
  if (!shots.length) return null;
  return { shots, end: t, range: [runs[0].start, runs[runs.length - 1].end] };
}

const frameOf = (t: number) => Math.round(t * FPS) / FPS;

// ── black and white ──────────────────────────────────────────────────────────

/** Black and white over [start, end): hard on, hard off. */
export const mono = (start: number, end: number): FxEvent => ({ kind: "mono", start, end, strength: 1 });

/**
 * After the drop, a shot or two that start in black and white and turn to colour on the
 * beat (nio.trade: a beat in black and white, then colour): a clip re-cut on the beat,
 * black and white until its first re-cut; or a shot long enough to have a beat inside
 * it, black and white until that beat. A bar or more after the drop, two seconds apart.
 */
export function monoFlips(shots: ShotEvent[], beats: number[], after: number, most = 2): FxEvent[] {
  const out: FxEvent[] = [];
  let lastAt = -Infinity;
  for (const [i, s] of shots.entries()) {
    if (out.length >= most) break;
    if (s.again || s.role === "closer" || s.role === "drop" || s.start < after - 1e-6 || s.start - lastAt < 2) continue;
    const next = shots[i + 1];
    const beat = beats.find((b) => b >= s.start + 0.25 && b <= s.end - 0.18);
    const at = next?.again && next.start - s.start >= 0.2 ? next.start : beat !== undefined ? frameOf(beat) : undefined;
    if (at === undefined) continue;
    out.push(mono(s.start, at));
    lastAt = s.start;
  }
  return out;
}

// ── photo burst ──────────────────────────────────────────────────────────────

/** The burst's tilts, in degrees: this way, then that, never the same twice running. */
const TILTS = [8, -11, 6, -9, 12, -7];

/**
 * A burst of pictures flying in, tilted on black, right after the edit's first shot:
 * `k` of them, a sixteenth each (three or four frames), at the start of the first shot
 * long enough to keep a third of a second of its own after them. The user's photos
 * first, then the best moment of clips the edit hasn't shown near there. Returns the
 * shots with the burst in, or the shots as they were when there's no room or too few
 * pictures.
 */
export function photoBurst(shots: ShotEvent[], scans: Scan[], period: number, aspect: Aspect, variant: number, most = 5): ShotEvent[] {
  // On the sixteenths (three frames at the least), as many as fit.
  const piece = Math.max(period / 4, 3 / FPS);
  const fits = (s: ShotEvent, i: number, n: number) => i > 0 && !s.again && s.role !== "drop" && s.role !== "closer" && s.start >= 0.9 && s.end - s.start >= n * piece + 0.3 && !shots[i + 1]?.again;
  let k = most;
  let at = -1;
  for (; k >= 4 && at < 0; k--) at = shots.findIndex((s, i) => fits(s, i, k));
  k++;
  if (at < 0) return shots;
  const target = shots[at];
  // (Not the pictures either side of it or its own: the burst isn't a preview of the next shot.)
  const near = [shots[0], shots[at - 1], target, shots[at + 1]].filter(Boolean).map((s) => s.source);
  const photos = scans.filter((s) => s.kind === "image" && !near.includes(s.id)).sort((a, b) => (b.interest?.[0] ?? 0) - (a.interest?.[0] ?? 0));
  const picks: { scan: Scan; t: number }[] = photos.map((scan) => ({ scan, t: 0 }));
  // Then a moment of each clip (not someone talking): its most interesting sample the
  // edit doesn't use, or failing that one it does (three frames of it, seconds away).
  const usedAt = (id: string, t: number) => shots.some((s) => s.source === id && t > s.srcStart - 0.3 && t < s.srcStart + sourceSpan(s) + 0.3);
  const clips = scans
    .filter((s) => s.kind === "video" && !near.includes(s.id) && !talky(s))
    .map((scan) => {
      let bi = -1;
      let bv = -Infinity;
      const interest = scan.interest ?? new Float32Array(scan.stats.t.length).fill(0.5);
      for (let i = 0; i < scan.stats.t.length; i++) {
        const t = scan.stats.t[i];
        if (t < scan.start + 0.2 || t > scan.duration - piece - 0.2) continue;
        const v = interest[i] - (usedAt(scan.id, t) ? 0.3 : 0);
        if (v > bv) (bv = v), (bi = i);
      }
      return bi < 0 ? null : { scan, t: scan.stats.t[bi], score: bv };
    })
    .filter((c): c is { scan: Scan; t: number; score: number } => !!c)
    .sort((a, b) => b.score - a.score);
  picks.push(...clips);
  const chosen = picks.slice(0, k);
  if (chosen.length < 4) return shots;
  const n = chosen.length;
  const out: ShotEvent[] = [];
  for (const [j, { scan, t }] of chosen.entries()) {
    const start = frameOf(target.start + j * piece);
    const crop = frameShot({ scan, a: t, b: t + piece, aspect });
    out.push({
      start,
      end: frameOf(target.start + (j + 1) * piece),
      source: scan.id,
      kind: scan.kind,
      srcStart: scan.kind === "video" ? t : 0,
      speed: 1,
      crop: { ...crop, fit: "cover", zoom0: Math.max(1, crop.zoom0), zoom1: Math.max(1, crop.zoom0), path: undefined, tilt: TILTS[(variant + j) % TILTS.length], inset: [0.98, j % 2 ? 0.84 : 0.88] },
      role: target.role,
    });
  }
  const rest: ShotEvent = { ...target, start: frameOf(target.start + n * piece) };
  return [...shots.slice(0, at), ...out, rest, ...shots.slice(at + 1)];
}

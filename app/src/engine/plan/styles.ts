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
import { boundsOf } from "./bounds";
import { activeRect, frameShot } from "./framing";
import type { Pace } from "./rhythm";
import { FPS, sourceSpan, type Aspect, type Crop, type FxEvent, type OverlayEvent, type ShotEvent } from "./types";

export type EditStyle = "beat" | "talk" | "mono" | "burst" | "recut" | "slow";

export const EDIT_STYLES: { value: EditStyle; name: string; label: string; desc: string }[] = [
  { value: "beat", name: "On the beat", label: "Montage", desc: "Straight cuts on the music, one rhythm from the drop." },
  { value: "talk", name: "Talk, then the drop", label: "Talk + drop", desc: "Someone talking in black and white, then the drop in colour." },
  { value: "mono", name: "Black and white to colour", label: "B&W flip", desc: "Black and white until the drop, then colour." },
  { value: "burst", name: "Photo burst", label: "Photo burst", desc: "Your photos land on someone's head, then fly in, three frames each." },
  { value: "recut", name: "Fast re-cuts", label: "Re-cuts", desc: "One clip cut again and again, a jump further each time." },
  { value: "slow", name: "Slow and cinematic", label: "Slow", desc: "Long holds and slow pushes. A mood piece." },
];

/** How hard a style cuts: slow and fast re-cuts have their own pace, the rest the one picked. */
export const paceOf = (s: EditStyle, pick: Pace): Pace => (s === "slow" ? "relaxed" : s === "recut" ? "hard" : pick);

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
 * flash (the user's photos first). Cutting hard, no slow one; relaxed, no fast re-cuts.
 */
export function mixOrder(scans: Scan[], talk: boolean, pace?: Pace): EditStyle[] {
  const burst = scans.length >= 4;
  return ["beat", ...(talk ? (["talk"] as const) : []), "mono", ...(burst ? (["burst"] as const) : []), ...(pace === "relaxed" ? [] : (["recut"] as const)), ...(pace === "hard" ? [] : (["slow"] as const))];
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

/** The longest the user's own opening runs, seconds. */
export const OPENER_MOST = 20;

/**
 * The user's own opening: the clips they picked to open the edit with, in their order,
 * played as they are with their own sound (someone talking, a moment they want first),
 * each of a clip's own scenes framed on its own; a photo holds two seconds. Up to
 * `most` seconds in all; the edit comes in where it ends.
 */
export function openingIntro(scans: Scan[], ids: string[], aspect: Aspect, most = OPENER_MOST): TalkIntro | null {
  const shots: ShotEvent[] = [];
  let t = 0;
  let range: [number, number] = [0, 0];
  for (const id of ids) {
    const scan = scans.find((s) => s.id === id);
    if (!scan || t >= most - 0.5) continue;
    const role = shots.length ? "build" : "hook";
    if (scan.kind === "image") {
      const end = frameOf(t + Math.min(2, most - t));
      shots.push({ start: t, end, source: id, kind: "image", srcStart: 0, speed: 1, crop: frameShot({ scan, a: 0, b: 2, aspect }), role });
      t = end;
      continue;
    }
    const a0 = scan.start + 0.02;
    const len = Math.min(scan.duration - 0.02 - a0, most - t);
    if (len < 0.3) continue;
    // (Framed scene by scene: a clip of its own edit cuts between angles.)
    const inner = scan.cuts.filter((c) => c > a0 + 0.2 && c < a0 + len - 0.2);
    const edges = [a0, ...inner, a0 + len];
    for (let k = 0; k + 1 < edges.length; k++) {
      const start = frameOf(t + edges[k] - a0);
      const end = frameOf(t + edges[k + 1] - a0);
      if (end - start < 1 / FPS) continue;
      shots.push({ start, end, source: id, kind: "video", srcStart: edges[k], speed: 1, crop: frameShot({ scan, a: edges[k], b: edges[k + 1], aspect }), role: shots.length ? "build" : role, audio: true });
    }
    if (!range[1]) range = [a0, a0 + len];
    t = frameOf(t + len);
  }
  if (!shots.length) return null;
  shots[shots.length - 1].end = t;
  return { shots, end: t, range };
}

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

/**
 * A card showing a picture in its own shape (inside any black bars over [a, b] of it),
 * a fifth of the frame in the middle of it, no wider than four fifths of it nor taller
 * than half (TJR's: a wide clip six tenths of a square frame across).
 */
function ownCard(scan: Scan, a: number, b: number, frame: number): Pick<OverlayEvent, "cx" | "cy" | "zoom" | "x" | "y" | "size" | "aspect" | "tilt" | "rect"> {
  const r = activeRect(scan, a, b);
  const own = Math.min(2.4, Math.max(0.5, ((r[2] - r[0]) * scan.width) / Math.max(1, (r[3] - r[1]) * scan.height)));
  const size = Math.min(Math.sqrt((0.2 * frame) / own), 0.5, (0.8 * frame) / own);
  const bars = r[0] > 0 || r[1] > 0 || r[2] < 1 || r[3] < 1;
  // (The centre in the picture inside the bars, as the compositor reads it with them.)
  return { cx: 0.5, cy: 0.5, zoom: 1.01, x: 0.5, y: 0.5, size, aspect: own, tilt: 0, ...(bars ? { rect: r } : { cx: (r[0] + r[2]) / 2, cy: (r[1] + r[3]) / 2 }) };
}

/**
 * TJR's windows: over a clip after the drop, cards land in the middle of the frame on
 * the beats, each clip in its own shape and the later over the earlier, and the last,
 * the shot that comes next, takes the whole frame on the cut and carries straight on
 * (the card plays what comes just before the shot, or when that's across one of the
 * footage's own cuts, as a shot often starts right after one, the shot starts that
 * much later and the card plays its start). The last card lands on the last beat or
 * half beat a fifth of a second or more before the cut; on the one before it, when
 * there's room, a card of another clip the edit doesn't show there (a picture when
 * there's no clip). Once, on the middle one of the runs of a clip three quarters of a
 * second long or more whose next shot is a clip; nothing when there's none. The shots
 * come back with the one it leads into moved along, when it was. Under the cards the shot
 * plays at twelve frames a second from the first, and stops dead when the next shot's lands
 * (TJR's …7392: the "memory" card over a stuttering shot, then the preview over a frozen one).
 */
export function windows(shots: ShotEvent[], beats: number[], scans: Scan[], after: number, frame: number): { shots: ShotEvent[]; overlays: OverlayEvent[]; fx: FxEvent[] } {
  const byId = new Map(scans.map((sc) => [sc.id, sc]));
  const grid = beats.flatMap((b, i) => (i + 1 < beats.length ? [b, (b + beats[i + 1]) / 2] : [b]));
  // (Over a clip's whole run: carried over a beat, it's two shots of one clip.)
  const runStart = (i: number) => {
    let k = i;
    while (k > 0 && shots[k].again) k--;
    return shots[k].start;
  };
  const cands = shots
    .map((sh, i) => ({ i, sh, next: shots[i + 1], from: runStart(i) }))
    .filter(({ sh, next, from }) => next && from >= after + 0.5 && !next.again && sh.role !== "closer" && next.role !== "closer" && next.start - from >= 0.75 && next.kind === "video" && next.end - next.start >= 0.4 && !next.ramp && next.source !== sh.source);
  // The middle one first, then the ones either side of it.
  const mid = (cands.length - 1) / 2;
  for (const { i, sh, next, from: run } of [...cands].sort((a, b) => Math.abs(cands.indexOf(a) - mid) - Math.abs(cands.indexOf(b) - mid))) {
    const scan = byId.get(next.source);
    if (!scan || scan.kind !== "video") continue;
    // The stretch of the footage between its own cuts that the shot is in (and short of
    // where the clip carries on after it, when it does).
    const bounds = boundsOf(scan);
    const k = bounds.findIndex((b) => b.t > next.srcStart);
    if (k < 1) continue;
    const lo = bounds[k - 1].t + (bounds[k - 1].after ?? bounds[k - 1].margin);
    const later = shots[i + 2]?.again && shots[i + 2].source === next.source ? shots[i + 2].srcStart : Infinity;
    const hi = Math.min(bounds[k].t - bounds[k].margin, later);
    // As long as the footage has room for.
    const earliest = Math.max(run + 0.3, next.start - (hi - lo - sourceSpan(next)) / next.speed);
    const last = [...grid].reverse().find((t) => t <= next.start - 0.2 + 1e-6 && t >= earliest - 1e-6);
    const first = last === undefined ? undefined : [...grid].reverse().find((t) => t <= last - 0.2 + 1e-6 && t >= run + 0.25 - 1e-6);
    const other = first === undefined ? null : otherMoment(shots, scans, [sh.source, next.source], run - 1.5, next.start + 1.5, next.start - first);
    // Alone, it's a longer look: from the last beat a third of a second or more before the cut.
    const at = other ? last! : ([...beats].reverse().find((t) => t <= next.start - 0.3 + 1e-6 && t >= earliest - 1e-6) ?? Math.max(earliest, next.start - 0.45));
    if (next.start - at < 0.2 - 1e-6) continue;
    const d = next.start - at;
    const srcStart = Math.max(next.srcStart, lo + d * next.speed);
    const out = [...shots];
    out[i + 1] = { ...next, srcStart };
    const from = srcStart - d * next.speed;
    const overlays: OverlayEvent[] = [];
    if (other) overlays.push({ start: first!, end: next.start, source: other.scan.id, kind: other.scan.kind, srcStart: other.t, speed: other.scan.kind === "video" ? 1 : 0, ...ownCard(other.scan, other.t, other.t + next.start - first!, frame) });
    overlays.push({ start: at, end: next.start, source: next.source, kind: "video", srcStart: from, speed: next.speed, ...ownCard(scan, from, srcStart + sourceSpan(next), frame) });
    // (The freeze is the cut's own move: the design leaves that cut hard.)
    const fx: FxEvent[] = [{ kind: "freeze", start: at, end: next.start, strength: 1, at: next.start }];
    if (other && at - first! >= 4 / FPS) fx.unshift({ kind: "choppy", start: first!, end: at, strength: 1 });
    return { shots: out, overlays, fx };
  }
  return { shots, overlays: [], fx: [] };
}

/**
 * The best moment of a clip for a card `len` seconds long (inside a stretch between its
 * own cuts, not someone talking), of a source the edit doesn't show between `a` and `b`
 * nor in `not`: one the edit doesn't use if there is, else a picture. Null when there's none.
 */
function otherMoment(shots: ShotEvent[], scans: Scan[], not: string[], a: number, b: number, len: number): { scan: Scan; t: number } | null {
  const near = new Set([...not, ...shots.filter((s) => s.end > a && s.start < b).map((s) => s.source)]);
  const usedAt = (id: string, t: number) => shots.some((s) => s.source === id && t + len > s.srcStart - 0.3 && t < s.srcStart + sourceSpan(s) + 0.3);
  let best: { scan: Scan; t: number; v: number } | null = null;
  for (const scan of scans) {
    if (scan.kind !== "video" || near.has(scan.id) || talky(scan)) continue;
    const interest = scan.interest ?? new Float32Array(scan.stats.t.length).fill(0.5);
    const bounds = boundsOf(scan);
    let j = 0;
    for (let q = 0; q < scan.stats.t.length; q++) {
      const t = scan.stats.t[q];
      while (j + 2 < bounds.length && bounds[j + 1].t <= t) j++;
      if (t < bounds[j].t + (bounds[j].after ?? bounds[j].margin) || t + len > bounds[j + 1].t - bounds[j + 1].margin) continue;
      const v = interest[q] - (usedAt(scan.id, t) ? 0.3 : 0);
      if (!best || v > best.v) best = { scan, t, v };
    }
  }
  if (best) return best;
  const photo = scans.filter((sc) => sc.kind === "image" && !near.has(sc.id)).sort((x, y) => (y.interest?.[0] ?? 0) - (x.interest?.[0] ?? 0))[0];
  return photo ? { scan: photo, t: 0 } : null;
}

/** The burst's tilts, in degrees: this way, then that, never the same twice running. */
const TILTS = [8, -11, 6, -9, 12, -7];

/** The tilts of pictures on someone's head (nio.trade's: a fifth of a turn or so, each the other way). */
const HEAD_TILTS = [-18, 22, -14, 19];

/** The picture model's kinds that have someone in them. */
const PEOPLE = new Set(["talking", "people", "party", "fashion"].map((k) => KINDS.indexOf(k as (typeof KINDS)[number])));

/** How much of a clip's stretch [a, b] has someone in it (the picture model's kinds, else skin), 0 to 1. */
export function someone(scan: Scan, a: number, b: number): number {
  let n = 0;
  let yes = 0;
  for (let i = 0; i < scan.stats.t.length; i++) {
    const t = scan.stats.t[i];
    if (t < a - 0.2 || t > b + 0.2) continue;
    n++;
    if (scan.look ? PEOPLE.has(scan.look.kind[i]) : scan.stats.skin[i] > 0.08) yes++;
  }
  return n ? yes / n : 0;
}

/**
 * The shot at `i` with someone in it: as it is when it has, or else the best moment of
 * a clip with someone in it that the edit doesn't show near there, as long as the shot
 * (a clip, and nobody talking over it). Null when there's none.
 */
function withSomeone(shots: ShotEvent[], i: number, scans: Scan[], aspect: Aspect): ShotEvent | null {
  const shot = shots[i];
  if (!shot || shot.again || shot.audio || shot.end - shot.start < 0.9) return null;
  const byId = new Map(scans.map((sc) => [sc.id, sc]));
  const own = byId.get(shot.source);
  if (shot.kind === "video" && own && someone(own, shot.srcStart, shot.srcStart + sourceSpan(shot)) >= 0.5) return shot;
  const len = shot.end - shot.start;
  const near = new Set(shots.filter((s) => s.end > shot.start - 2.5 && s.start < shot.end + 2.5).map((s) => s.source));
  let best: { scan: Scan; t: number; v: number } | null = null;
  for (const scan of scans) {
    if (scan.kind !== "video" || near.has(scan.id)) continue;
    const interest = scan.interest ?? new Float32Array(scan.stats.t.length).fill(0.5);
    for (let k = 0; k < scan.stats.t.length; k++) {
      const t = scan.stats.t[k];
      if (t < scan.start + 0.03 || t + len > scan.duration - 0.03) continue;
      const p = someone(scan, t, t + len);
      if (p < 0.6) continue;
      const v = interest[k] + 0.3 * p;
      if (!best || v > best.v) best = { scan, t, v };
    }
  }
  if (!best) return null;
  const crop = frameShot({ scan: best.scan, a: best.t, b: best.t + len, aspect });
  return { ...shot, source: best.scan.id, kind: "video", srcStart: best.t, speed: 1, ramp: undefined, crop: { ...crop, zoom0: Math.max(1, crop.zoom0), zoom1: Math.max(1, crop.zoom1) } };
}

/**
 * nio.trade's pictures on someone's head, before its burst: the shot before it plays
 * on, and on its last beats and half beats (the last up to three, a fifth of a second
 * apart at least, from a third of the way in) a picture lands on the head of whoever is
 * in it, each replacing the last, cropped to its own face and turned the other way from
 * the one before (the page finds the faces: vision/track.ts). The user's photos first,
 * then a still of a clip the edit doesn't show there. Their sources are returned too,
 * so the burst can show others.
 */
export function headPops(host: ShotEvent, next: number, beats: number[], scans: Scan[], shots: ShotEvent[], variant: number): OverlayEvent[] {
  if (host.kind !== "video" || host.end - host.start < 0.9) return [];
  const from = host.start + Math.max(0.4, (host.end - host.start) / 3);
  const at: number[] = [];
  for (const t of [...beats].reverse()) {
    if (t >= next - 0.18 || t < from) continue;
    if (at.length && at[at.length - 1] - t < 0.2) continue;
    at.push(t);
    if (at.length === 3) break;
  }
  at.reverse();
  if (!at.length) return [];
  const near = new Set(shots.filter((s) => s.end > host.start - 2 && s.start < next + 2).map((s) => s.source));
  const photos = scans.filter((sc) => sc.kind === "image").sort((a, b) => (b.interest?.[0] ?? 0) - (a.interest?.[0] ?? 0));
  const stills = scans
    .filter((sc) => sc.kind === "video" && !near.has(sc.id))
    .map((sc) => {
      const interest = sc.interest ?? new Float32Array(sc.stats.t.length).fill(0.5);
      let bi = -1;
      for (let i = 0; i < sc.stats.t.length; i++) if (sc.stats.t[i] > sc.start + 0.3 && sc.stats.t[i] < sc.duration - 0.3 && (bi < 0 || interest[i] > interest[bi])) bi = i;
      return bi < 0 ? null : { scan: sc, t: sc.stats.t[bi], score: interest[bi] };
    })
    .filter((c): c is { scan: Scan; t: number; score: number } => !!c)
    .sort((a, b) => b.score - a.score);
  const picks = [...photos.map((scan) => ({ scan, t: 0 })), ...stills].slice(0, at.length);
  return picks.map(({ scan, t }, j) => ({
    start: at[j],
    end: j + 1 < picks.length ? at[j + 1] : next,
    source: scan.id,
    kind: scan.kind,
    srcStart: scan.kind === "video" ? t : 0,
    speed: 0,
    cx: 0.5,
    cy: 0.4,
    zoom: 1,
    x: 0.5,
    y: 0.34,
    size: 0.3,
    aspect: 1,
    tilt: HEAD_TILTS[(variant + j) % HEAD_TILTS.length],
    place: { on: "head", crop: "face" },
  }));
}

/**
 * A burst of pictures flying in, tilted on black, early in the edit: up to `most` of
 * them, a sixteenth each (three or four frames), in place of a whole shot after the
 * first, the last held to the next cut. The user's photos first, then the best moment
 * of clips the edit hasn't shown near there (the one held, a clip when there's one).
 * Before it, pictures on the head of whoever is in the shot (headPops), on the hits in
 * `beats`. Returns the shots with the burst in, or the shots as they were when there's
 * no room or too few pictures.
 */
export function photoBurst(shots: ShotEvent[], scans: Scan[], period: number, aspect: Aspect, variant: number, most = 5, beats: number[] = []): { shots: ShotEvent[]; overlays: OverlayEvent[] } {
  shots = [...shots];
  // On the sixteenths (three frames at the least), as many as fit, from the hit the shot
  // starts on, the last one held to the next cut (nio.trade's …0002: four photos from a
  // stab, then a clip on black until the next stab; the shot they replace never comes
  // back, as coming back would be a cut on nothing). In a slot they nearly fill if
  // there's one, to within a frame and a half.
  const piece = Math.max(period / 4, 3 / FPS);
  const fits = (s: ShotEvent, i: number, n: number, most: number) => i > 0 && !s.again && s.role !== "drop" && s.role !== "closer" && s.start >= 0.9 && s.end - s.start >= n * piece - 1.5 / FPS && s.end - s.start <= n * piece + most && !shots[i + 1]?.again;
  let k = 0;
  let at = -1;
  search: for (const hold of [Math.max(0.6, 1.5 * period), Infinity]) {
    for (let n = most; n >= 4; n--) {
      at = shots.findIndex((s, i) => fits(s, i, n, hold));
      if (at >= 0) {
        k = n;
        break search;
      }
    }
  }
  if (at < 0) return { shots, overlays: [] };
  const target = shots[at];
  // Before it, the pictures on someone's head (not the ones the burst shows, while there
  // are others): the shot there has someone in it, or becomes the best moment of a clip
  // that has (the gag is the hook, as in nio.trade's …0002).
  const host = withSomeone(shots, at - 1, scans, aspect);
  if (host) shots = [...shots.slice(0, at - 1), host, ...shots.slice(at)];
  const pops = host ? headPops(host, target.start, beats, scans, shots, variant) : [];
  const popped = new Set(pops.map((p) => p.source));
  // (Not the pictures either side of it or its own: the burst isn't a preview of the next shot.)
  const near = [shots[0], shots[at - 1], target, shots[at + 1]].filter(Boolean).map((s) => s.source);
  const photos = scans
    .filter((s) => s.kind === "image" && !near.includes(s.id))
    .sort((a, b) => Number(popped.has(a.id)) - Number(popped.has(b.id)) || (b.interest?.[0] ?? 0) - (a.interest?.[0] ?? 0));
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
  if (chosen.length < 4) return { shots, overlays: pops };
  const n = chosen.length;
  // (The one held to the next cut a clip, moving, when there's one.)
  const held = chosen.map((c) => c.scan.kind).lastIndexOf("video");
  if (held >= 0 && held < n - 1) chosen.push(...chosen.splice(held, 1));
  const out: ShotEvent[] = [];
  for (const [j, { scan, t }] of chosen.entries()) {
    const start = frameOf(target.start + j * piece);
    const crop = frameShot({ scan, a: t, b: t + piece, aspect });
    out.push({
      start,
      end: j === n - 1 ? target.end : frameOf(target.start + (j + 1) * piece),
      source: scan.id,
      kind: scan.kind,
      srcStart: scan.kind === "video" ? t : 0,
      speed: 1,
      crop: { ...crop, fit: "cover", zoom0: Math.max(1, crop.zoom0), zoom1: Math.max(1, crop.zoom0), path: undefined, tilt: TILTS[(variant + j) % TILTS.length], inset: [0.98, j % 2 ? 0.84 : 0.88] },
      role: target.role,
    });
  }
  return { shots: [...shots.slice(0, at), ...out, ...shots.slice(at + 1)], overlays: pops };
}

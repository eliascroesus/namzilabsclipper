/**
 * The other two formats the references use besides the straight montage:
 *
 * - The twist (brezscales "what they see vs... / what they don't...", nio.trade's
 *   "kimchi after retiring: / 3 days before retiring:"): a montage of the flex
 *   under one caption, a hard cut on a downbeat to the other side of it (the work,
 *   the screen, the real day) held long under the second caption, then the card.
 * - The text meme (gillioniare, brezscales): one clip held for 8 to 11 seconds,
 *   faded up from black, a small block of text over it, the song carrying it.
 */
import type { SongAnalysis } from "../audio/song";
import type { Scan } from "../media/scan";
import { accentCuts, assignShots, CUT_LEAD, finishPlan, frame, longestStretch, musicWindow, planCuts, slotsBetween, variantPace, type MusicWindow, type Ranges, type Slot } from "./montage";
import { FPS, type Aspect, type CaptionEvent, type CardSpec, type EditPlan } from "./types";

interface Common {
  song?: SongAnalysis;
  songSource?: string;
  songName?: string;
  fromStart: boolean;
  /** where in the song the edit starts, when the user picked it */
  songStart?: number;
  scans: Scan[];
  aspect: Aspect;
  /** seconds of footage before the card */
  length: number;
  card: CardSpec | null;
  variant: number;
  avoid?: Ranges;
  /** speed ramps on the shots before the flip */
  velocity?: boolean;
}

function silentWindow(length: number, hold: number): MusicWindow {
  const cardAt = frame(length);
  return { songStart: 0, cardAt, duration: frame(cardAt + hold) };
}

export interface TwistOptions extends Common {
  /** the footage for the second act; picked automatically when empty */
  actB: Set<string>;
  captionA: string;
  captionB: string;
}

/** A downbeat near 60% of the way to the card, where the edit flips. */
function switchPoint(song: SongAnalysis | undefined, win: MusicWindow): number {
  const target = win.cardAt * 0.62;
  if (!song) return frame(target);
  let best = target;
  let bestScore = -Infinity;
  song.beats.forEach((b, i) => {
    const t = b - win.songStart;
    if (t < win.cardAt * 0.45 || t > win.cardAt * 0.78) return;
    const nearDrop = win.dropAt !== undefined && Math.abs(t - win.dropAt) < 0.1 ? 1 : 0;
    const score = (song.beatInBar[i] === 0 ? 1 : 0) + 0.6 * song.beatStrength[i] + nearDrop - 0.25 * Math.abs(t - target);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  });
  return frame(best - CUT_LEAD);
}

export function planTwist(o: TwistOptions): EditPlan {
  const hold = o.card ? o.card.hold : 0;
  const win = o.song ? musicWindow(o.song, o.length, hold, o.fromStart, o.songStart) : silentWindow(o.length, hold);
  // The second act's footage: what was marked; or, with smart picks, the moments
  // Gemini saw as the grind (a desk, charts, a laptop late at night) wherever they
  // are; or else the calmest, longest clip.
  let poolB = o.scans.filter((s) => o.actB.has(s.id));
  const grind = !poolB.length && o.scans.some((s) => s.real?.some((v) => v >= 0.45));
  if (grind) poolB = o.scans.filter((s) => s.real?.some((v) => v >= 0.45));
  if (!poolB.length) {
    const calm = [...o.scans].sort((a, b) => {
      const m = (s: Scan) => (s.kind === "image" ? 0 : s.stats.motion.reduce((x, y) => x + y, 0) / Math.max(1, s.stats.motion.length));
      return m(a) - m(b) || b.duration - a.duration;
    });
    poolB = calm.slice(0, 1);
  }
  const idsB = new Set(poolB.map((s) => s.id));
  const poolA = grind ? o.scans : o.scans.filter((s) => !idsB.has(s.id));
  const switchAt = switchPoint(o.song, win);

  // Act one: the flex, cut to the music but a little slower than a montage.
  const dropA = win.dropAt !== undefined && win.dropAt < switchAt - 1 ? win.dropAt : undefined;
  const cutsA = o.song ? planCuts(o.song, win.songStart, switchAt + CUT_LEAD, { pace: 1.45 * variantPace(o.variant), dropAt: dropA }).map((t) => frame(t - CUT_LEAD)).filter((t) => t > 0.2 && t < switchAt - 0.25) : [];
  const slotsA = slotsBetween([0, ...cutsA, switchAt], dropA !== undefined ? frame(dropA - CUT_LEAD) : undefined).map((s) => (s.role === "closer" ? { ...s, role: "body" as const } : s));
  const used: Ranges = new Map();
  const shotsA = assignShots(slotsA, poolA.length ? poolA : o.scans, { song: o.song, songStart: win.songStart, aspect: o.aspect, variant: o.variant, avoid: o.avoid, used, velocity: o.velocity });

  // Act two: one long shot of the other side (running across the clip's own cuts if it
  // has any), split on downbeats only when no clip is long enough even at half speed.
  const dB = win.cardAt - switchAt;
  const longest = Math.max(...poolB.map((s) => longestStretch(s, true)));
  let boundsB = [switchAt, win.cardAt];
  if (longest * 2 < dB && poolB.length > 1 && o.song) {
    const cuts = accentCuts(o.song, win.songStart, win.cardAt, { from: switchAt, pace: 4, maxShot: Math.max(1, longest) }).map((t) => frame(t - CUT_LEAD));
    boundsB = [switchAt, ...cuts.filter((t) => t > switchAt + 0.5 && t < win.cardAt - 0.5), win.cardAt];
  }
  const slotsB: Slot[] = boundsB.slice(0, -1).map((start, i) => ({ start, end: boundsB[i + 1], role: i === boundsB.length - 2 ? "closer" : "body" }));
  const shotsB = assignShots(slotsB, poolB, { song: o.song, songStart: win.songStart, aspect: o.aspect, variant: o.variant, avoid: o.avoid, used, purpose: grind ? "real" : "flex" });
  // The reveal holds still: no pushes on it unless it's a photo.
  for (const s of shotsB) if (s.kind === "video") s.crop.zoom1 = s.crop.zoom0;

  // (The second a little lower than the first, swapped in on the cut's own frame: brezscales' …1216.)
  const y = 0.36;
  const captions: CaptionEvent[] = [];
  if (o.captionA.trim()) captions.push({ style: "meme", text: o.captionA.trim(), start: 0, end: switchAt, y });
  if (o.captionB.trim()) captions.push({ style: "meme", text: o.captionB.trim(), start: switchAt, end: o.card ? win.cardAt - 4 / FPS : win.duration, y: y + 0.028 });
  const plan = finishPlan({
    id: "twist",
    label: `Twist ${o.variant + 1}`,
    format: "montage",
    aspect: o.aspect,
    shots: [...shotsA, ...shotsB],
    window: win,
    songSource: o.song ? o.songSource : undefined,
    songName: o.songName,
    fromStart: o.fromStart,
    card: o.card,
    captions,
    variant: o.variant, // no flourishAt: the flip is the twist's event, nothing goes on top of it
    bpm: o.song?.bpm,
  });
  plan.checks = { ...plan.checks, switchAt };
  return plan;
}

export interface MemeOptions extends Common {
  text: string;
  position: "upper" | "centre";
}

export function planMeme(o: MemeOptions): EditPlan {
  const hold = o.card ? o.card.hold : 0;
  const win = o.song ? musicWindow(o.song, o.length, hold, o.fromStart, o.songStart) : silentWindow(o.length, hold);
  const shots = assignShots([{ start: 0, end: win.cardAt, role: "hook" }], o.scans, { song: o.song, songStart: win.songStart, aspect: o.aspect, variant: o.variant, avoid: o.avoid });
  for (const s of shots) if (s.kind === "video") s.crop.zoom1 = s.crop.zoom0 * 1.03;
  const captions: CaptionEvent[] = o.text.trim() ? [{ style: "meme", text: o.text.trim(), start: 0, end: o.card ? win.cardAt - 4 / FPS : win.duration, y: o.position === "centre" ? 0.5 : 0.3 }] : [];
  return finishPlan({
    id: "meme",
    label: `Meme ${o.variant + 1}`,
    format: "meme",
    aspect: o.aspect,
    shots,
    window: win,
    songSource: o.song ? o.songSource : undefined,
    songName: o.songName,
    fromStart: o.fromStart,
    card: o.card,
    captions,
    variant: o.variant,
    fadeIn: 0.9,
    bpm: o.song?.bpm,
  });
}

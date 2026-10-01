/**
 * Subtitles for the parts of an edit that play with their own sound (a talking opening,
 * the user's own opener clips): the words the speech model in the page heard there
 * (mimic/asr), put where the edit plays them, a few at a time as the nio.trade clips
 * set them.
 */
import { subtitleLines, type Word } from "./story";
import { sourceAt, type CaptionEvent, type EditPlan } from "./types";

/** A stretch of a source the edit plays with its own sound (source seconds). */
export interface SpeechRange {
  source: string;
  from: number;
  to: number;
}

/** Words heard in a stretch, their times in seconds from its start (as the speech model gives them). */
export interface Heard {
  range: SpeechRange;
  words: { text: string; start: number; end: number }[];
}

/** The stretches of source the edit plays with their own sound, joined where one runs on into the next. */
export function speechRanges(plan: EditPlan): SpeechRange[] {
  const out: SpeechRange[] = [];
  for (const sh of plan.shots) {
    if (!sh.audio || sh.kind !== "video") continue;
    const from = sh.srcStart;
    const to = sh.srcStart + sourceAt(sh, sh.end - sh.start);
    const near = out.find((r) => r.source === sh.source && from <= r.to + 0.5 && to >= r.from - 0.5);
    if (near) {
      near.from = Math.min(near.from, from);
      near.to = Math.max(near.to, to);
    } else out.push({ source: sh.source, from, to });
  }
  return out;
}

/** Subtitles of the words heard, each line where the edit plays its first word (with its own sound), held until the next. */
export function subtitlesFor(plan: EditPlan, heard: Heard[]): CaptionEvent[] {
  const words: (Word & { out: number; outEnd: number })[] = [];
  for (const { range, words: ws } of heard) {
    for (const w of ws) {
      const start = range.from + w.start;
      const end = range.from + w.end;
      // (The shot that plays this word with its sound; at its own speed, as talking plays.)
      const sh = plan.shots.find((s) => s.audio && s.kind === "video" && s.source === range.source && start >= s.srcStart - 0.02 && start < s.srcStart + sourceAt(s, s.end - s.start));
      if (!sh) continue;
      const speed = sh.speed || 1;
      const out = sh.start + Math.max(0, start - sh.srcStart) / speed;
      words.push({ text: w.text, start, end, shout: false, out, outEnd: Math.min(sh.end, sh.start + (end - sh.srcStart) / speed) });
    }
  }
  words.sort((a, b) => a.out - b.out);
  // (A line never runs on past the talking into the edit.)
  const talkEnd = Math.max(0, ...plan.shots.filter((s) => s.audio).map((s) => s.end));
  return subtitleLines(words)
    .map((c) => ({ ...c, end: Math.min(c.end, talkEnd) }))
    .filter((c) => c.end - c.start >= 0.2);
}

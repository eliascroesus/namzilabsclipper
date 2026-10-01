/**
 * The story clip, nio.trade's best-performing shape (docs/edit-analysis.md,
 * format 1): the hook as a subtitle over black on frame one while the footage
 * fades up, a stretch of real dialogue with its pauses jump-cut out and
 * documentary subtitles word by word, a fast burst of the video's best-looking
 * moments cut to the song as the payoff, then the demo card.
 */
import type { SongAnalysis } from "../audio/song";
import { keepSpeech, snapToSpeech, type Run } from "../audio/speech";
import type { Scan } from "../media/scan";
import { syllables, type Moment, type Transcript } from "../story/story";
import { assignShots, cropFor, CUT_LEAD, finishPlan, frame, planCuts, slotsBetween, type Ranges } from "./montage";
import { FPS, type Aspect, type CaptionEvent, type CardSpec, type Crop, type EditPlan, type ShotEvent } from "./types";

export interface StoryOptions {
  moment: Moment;
  transcript: Transcript;
  /** where someone is talking in the source */
  speech: Run[];
  /** the long video */
  source: Scan;
  /** footage for the payoff burst (the long video itself included) */
  broll: Scan[];
  song?: SongAnalysis;
  songSource?: string;
  songName?: string;
  aspect: Aspect;
  card: CardSpec | null;
  variant: number;
  /** seconds of payoff burst; 3.2 with a song, none without */
  burst?: number;
  /** source ranges earlier clips in the batch used, so each burst shows different footage */
  avoid?: Ranges;
  /** the moment of the song (seconds) that hits as the talking ends, when the user picked it */
  payoff?: number;
}

export interface Word {
  text: string;
  start: number;
  end: number;
  shout: boolean;
}

/**
 * Map source time to edit time through the kept runs; null inside a cut pause.
 * A run's edit length is rounded to whole frames, so a word ending right at a
 * run's end can fall a frame outside it: that much slack still maps (clamped).
 */
function mapper(map: { src0: number; src1: number; out0: number }[]) {
  const slack = 1.5 / FPS;
  return (t: number): number | null => {
    for (const m of map) if (t >= m.src0 - slack && t <= m.src1 + slack) return m.out0 + (Math.min(m.src1, Math.max(m.src0, t)) - m.src0);
    return null;
  };
}

/** Words with times, spread over the voiced part of each phrase by syllable count. */
function timedWords(tr: Transcript, runs: Run[], a: number, b: number): Word[] {
  const words: Word[] = [];
  for (const p of tr.phrases) {
    if (p.end <= a || p.start >= b) continue;
    // The phrase's voiced time inside the clip.
    const parts: Run[] = [];
    for (const r of runs) {
      const s = Math.max(r.start, p.start, a);
      const e = Math.min(r.end, p.end, b);
      if (e - s > 0.05) parts.push({ start: s, end: e });
    }
    if (!parts.length) continue;
    const total = parts.reduce((x, r) => x + r.end - r.start, 0);
    const ws = p.text.split(/\s+/).filter(Boolean);
    const weights = ws.map((w) => syllables(w) + 0.35);
    const sum = weights.reduce((x, y) => x + y, 0);
    const letters = p.text.replace(/[^a-z]/gi, "");
    const shout = p.tone === "shout" || (letters.length > 3 && letters === letters.toUpperCase());
    let acc = 0;
    const at = (d: number) => {
      // position `d` seconds into the voiced time, back in source time
      for (const r of parts) {
        if (d <= r.end - r.start) return r.start + d;
        d -= r.end - r.start;
      }
      return parts[parts.length - 1].end;
    };
    ws.forEach((w, i) => {
      const d0 = (acc / sum) * total;
      acc += weights[i];
      const d1 = (acc / sum) * total;
      words.push({ text: w, start: at(d0), end: at(d1), shout });
    });
  }
  return words.sort((x, y) => x.start - y.start);
}

/** How long a line stays up through a pause until the next one (nio.trade's hold through a second or so of silence; a longer one leaves the screen clear). */
export const SUBTITLE_HOLD = 1;

/**
 * Subtitle lines as the nio.trade clips set them: up to four words, breaking after
 * punctuation; a word said again coming onto the line where it's said ("LARP!", then
 * "LARP! LARP!"), and a line said again joining the one before ("ACTUALLY RIGHT NOW
 * ACTUALLY RIGHT NOW"); shouted ones in capitals. Each holds until the next comes (through
 * a pause of up to SUBTITLE_HOLD), or a moment after its last word.
 */
export function subtitleLines(words: (Word & { out: number; outEnd: number })[]): CaptionEvent[] {
  const lines: CaptionEvent[] = [];
  let cur: typeof words = [];
  const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
  const flush = () => {
    if (!cur.length) return;
    const shout = cur.filter((w) => w.shout).length > cur.length / 2;
    const style = shout ? "shout" : "doc";
    const say = (ws: typeof cur) => {
      const text = ws.map((w) => w.text).join(" ");
      // (A full stop or a comma at the end goes; what's asked or shouted keeps its mark.)
      return shout ? text.toUpperCase() : text.replace(/[.,;:]+$/, "");
    };
    let from = 0;
    for (let i = 1; i < cur.length; i++) {
      if (!norm(cur[i].text) || norm(cur[i].text) !== norm(cur[i - 1].text)) continue;
      lines.push({ style, text: say(cur.slice(0, i)), start: cur[from].out, end: cur[i].out, spoken: true });
      from = i;
    }
    lines.push({ style, text: say(cur), start: cur[from].out, end: cur[cur.length - 1].outEnd, spoken: true });
    cur = [];
  };
  for (const w of words) {
    const len = cur.map((x) => x.text).join(" ").length;
    if (cur.length && (cur.length >= 4 || len + w.text.length > 24 || w.out - cur[cur.length - 1].outEnd > 0.4)) flush();
    cur.push(w);
    if (/[.?!,;:]$/.test(w.text) && cur.length >= 2) flush();
  }
  flush();
  // A line said again within a second joins the one before (one block, up to about forty letters).
  const same = (a: string, b: string) => a.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "") === b.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  for (let i = 1; i < lines.length; i++) {
    const [a, b] = [lines[i - 1], lines[i]];
    if (same(a.text, b.text) && b.start - a.end <= SUBTITLE_HOLD && a.text.length + b.text.length < 40) lines[i] = { ...b, text: `${a.text} ${b.text}` };
  }
  for (let i = 0; i < lines.length; i++) {
    const next = lines[i + 1];
    const end = next && next.start - lines[i].end <= SUBTITLE_HOLD ? next.start : Math.max(lines[i].end + 0.35, lines[i].start + 0.4);
    lines[i].end = next ? Math.min(next.start, end) : end;
  }
  return lines;
}

export function planStory(o: StoryOptions): EditPlan {
  const src = o.source;
  // 1. The dialogue: the moment trimmed to the voice, with the pauses cut out.
  const a = snapToSpeech(o.speech, o.moment.start, "start");
  const b = Math.max(a + 1, snapToSpeech(o.speech, o.moment.end, "end"));
  let runs = keepSpeech(o.speech, a, b);
  if (!runs.length) runs = [{ start: a, end: b }];
  // One crop per scene of the source, so the frame doesn't jump while someone talks.
  const scenes = [src.start, ...src.cuts, src.duration];
  const sceneOf = (t: number) => {
    let i = 0;
    while (i + 2 < scenes.length && t >= scenes[i + 1]) i++;
    return i;
  };
  const crops = new Map<number, Crop>();
  const shots: ShotEvent[] = [];
  const map: { src0: number; src1: number; out0: number }[] = [];
  let t = 0;
  let jumps = 0;
  let lastScene = -1;
  for (const r of runs) {
    const end = frame(t + (r.end - r.start));
    if (end - t < 2 / FPS) continue;
    const sc = sceneOf(r.start);
    if (!crops.has(sc)) crops.set(sc, cropFor(src, Math.max(a, scenes[sc]), Math.min(b, scenes[sc + 1]), o.aspect));
    map.push({ src0: r.start, src1: r.start + (end - t), out0: t });
    const crop = { ...crops.get(sc)! };
    // A jump cut inside one scene punches in (every other one) so it reads as a cut
    // made on purpose, not a skip.
    jumps = sc === lastScene ? jumps + 1 : 0;
    if (jumps % 2 === 1 && crop.fit === "cover") crop.zoom0 = crop.zoom1 = 1.1;
    lastScene = sc;
    shots.push({ start: t, end, source: src.id, kind: "video", srcStart: r.start, speed: 1, crop, role: shots.length ? "body" : "hook", audio: true });
    t = end;
  }
  const dialogueEnd = t;

  // 2. Subtitles, word by word, and the hook over black on frame one.
  const toOut = mapper(map);
  const words = timedWords(o.transcript, runs, a, b)
    .map((w) => ({ ...w, out: toOut(w.start), outEnd: toOut(w.end) }))
    .filter((w): w is Word & { out: number; outEnd: number } => w.out !== null && w.outEnd !== null);
  let subs = subtitleLines(words);
  const captions: CaptionEvent[] = [];
  if (o.moment.hook.trim()) {
    // The hook holds the screen for the opening; subtitles take over after it.
    const hookEnd = Math.min(dialogueEnd, Math.max(1.4, subs.find((s) => s.start > 0.9)?.start ?? 1.6));
    subs = subs.filter((s) => s.end > hookEnd + 0.15).map((s) => (s.start < hookEnd ? { ...s, start: hookEnd } : s));
    captions.push({ style: "doc", text: o.moment.hook.trim(), start: 0, end: hookEnd });
  }
  captions.push(...subs.map((s) => ({ ...s, end: Math.min(s.end, dialogueEnd) })));

  // 3. The payoff: the video's best-looking moments, cut fast to the song.
  const song = o.song;
  const burstLen = song ? (o.burst ?? 3.2) : 0;
  let songStart = 0;
  let cardAt = dialogueEnd;
  if (song) {
    // Line the song up so the moment picked (or its drop, or its strongest bar line)
    // lands as the burst starts.
    let anchor = o.payoff ?? [...song.drops].sort((x, y) => y.strength - x.strength)[0]?.t;
    if (anchor === undefined) {
      let best = -1;
      song.beats.forEach((bt, i) => {
        if (song.beatInBar[i] === 0 && bt > song.duration * 0.15 && song.beatStrength[i] > best) {
          best = song.beatStrength[i];
          anchor = bt;
        }
      });
    }
    anchor ??= song.beats[0] ?? 0;
    songStart = anchor - dialogueEnd - CUT_LEAD;
    if (burstLen > 0) {
      const target = dialogueEnd + burstLen;
      const beat = song.beats.map((x) => x - songStart - CUT_LEAD).filter((x) => x > dialogueEnd + burstLen - 0.6 && x < dialogueEnd + burstLen + 0.6).sort((x, y) => Math.abs(x - target) - Math.abs(y - target))[0];
      cardAt = frame(beat ?? target);
      const cuts = planCuts(song, songStart, cardAt + CUT_LEAD, { from: dialogueEnd + CUT_LEAD, pace: 0.42, maxShot: 0.75 })
        .map((x) => frame(x - CUT_LEAD))
        .filter((x) => x > dialogueEnd + 0.1 && x < cardAt - 0.1);
      const slots = slotsBetween([dialogueEnd, ...cuts, cardAt]).map((s) => ({ ...s, role: "body" as const }));
      // Don't show the dialogue's own footage again in the burst.
      const used: Ranges = new Map([[src.id, [[a - 2, b + 2]]]]);
      const burst = assignShots(slots, o.broll.length ? o.broll : [src], { song, songStart, aspect: o.aspect, variant: o.variant, used, avoid: o.avoid });
      for (const s of burst) s.audio = false;
      shots.push(...burst);
    }
  }

  const duration = frame(cardAt + (o.card ? o.card.hold : 0.6));
  const plan = finishPlan({
    id: "story",
    label: `Clip ${o.variant + 1}`,
    format: "story",
    aspect: o.aspect,
    shots,
    window: { songStart: Math.max(0, songStart), cardAt, duration },
    songSource: song ? o.songSource : undefined,
    songName: o.songName,
    fromStart: false,
    card: o.card,
    captions,
    variant: o.variant,
    fadeIn: 0.25,
    bpm: song?.bpm,
  });
  plan.sourceAudio = false;
  if (plan.music && song) {
    // The song sits under the voice, then comes up for the burst and the card.
    plan.music.start = Math.max(0, -songStart);
    plan.music.songStart = Math.max(0, songStart);
    plan.music.gainPoints = [
      [0, 0.2],
      [Math.max(0, dialogueEnd - 0.15), 0.2],
      [dialogueEnd + 0.05, 1],
    ];
  }
  plan.note.caption = o.moment.caption || o.moment.hook;
  plan.note.sound = song
    ? `The song is in the file, under the voice. To use it as the app's sound instead, post the version without the song and add ${o.songName ?? "it"} in the app.`
    : "The voice is the sound. Add music in the app if you like, kept low.";
  plan.checks = { ...plan.checks, dialogue: Math.round(dialogueEnd * 100) / 100, cutPauses: Math.max(0, runs.length - 1), subtitles: subs.length };
  return plan;
}

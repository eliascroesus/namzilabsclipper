/**
 * What the mimic page learns from a reference video (a MimicTemplate), and the
 * edit it makes from the user's footage by it (a MimicPlan). Sizes and places
 * are shares of the frame (0 to 1), times are seconds.
 */

export type FontFamily = "sans" | "condensed" | "tall" | "serif";

export interface CaptionLook {
  /** vertical centre of the first line, 0 top to 1 bottom */
  y: number;
  /** fitted lines are this wide (a share of the frame's width) */
  width: number;
  /** font size as a share of the frame's height: the most a line gets, and the least */
  maxSize: number;
  minSize: number;
  /** each line scaled to fill the width (up to maxSize), or every line one size */
  fit: boolean;
  /** baseline to baseline, in font sizes */
  pitch: number;
  lines: 1 | 2 | 3;
  /** most letters on a line */
  chars: number;
  align: "center" | "left";
  /** words come on one by one as they're said, a line at a time, or the whole caption at once */
  reveal: "word" | "line" | "page";
  /** seconds a new word takes to fade in */
  fade: number;
  case: "as-said" | "upper" | "lower";
  font: FontFamily;
  weight: number;
  /** letter spacing, in font sizes */
  tracking: number;
  /** the gap from one word's last letter to the next's first, in font sizes; unset: the face's own spaces */
  wordGap?: number;
  color: string;
  /** the word being said, in its own colour; null for none */
  active: string | null;
  stroke: { color: string; width: number } | null;
  shadow: { color: string; blur: number; y: number } | null;
  box: { color: string; pad: number; radius: number } | null;
  /** seconds a caption stays after its last word (unless the next one starts first) */
  hold: number;
}

export type Edge = "left" | "right" | "top" | "bottom";

export interface Motion {
  kind: "slide" | "cut" | "fade" | "pop";
  from?: Edge;
  /** seconds */
  dur: number;
  ease: "out" | "in" | "linear";
}

export type CardContent = "photo" | "screenshot" | "video" | "unknown";

export interface CardSlot {
  id: string;
  start: number;
  end: number;
  /** at rest: x, y, width, height */
  rect: [number, number, number, number];
  enter: Motion;
  exit: Motion;
  /** cards that share a place and follow each other without moving share a run */
  run: number;
  content: CardContent;
  /** corner radius, a share of the card's short side */
  radius: number;
  /** a small picture of it from the reference (data URL), for the page */
  thumb?: string;
  /** what was being said (the reference's own words), when known */
  said?: string;
}

export interface BrollSlot {
  id: string;
  start: number;
  end: number;
  /** the picture's zoom at its start and end (1 = fills the frame) */
  zoom: [number, number];
  /** cuts inside it */
  cuts: number;
  thumb?: string;
}

export interface ZoomChange {
  t: number;
  /** the level after it (1 = the wide) */
  level: number;
  /** seconds it takes; 0 is a jump */
  dur: number;
}

export interface ZoomLook {
  /** the close level, against the wide (e.g. 1.15) */
  close: number;
  /** seconds a change takes; 0 = jumps */
  dur: number;
  /** a change every so many seconds, typically */
  every: number;
  changes: ZoomChange[];
}

export type SfxKind = "whoosh" | "swipe" | "pop" | "click" | "hit" | "riser" | "ding" | "cash";
export type SfxOn = "card-in" | "card-out" | "cut" | "zoom" | "broll";

export interface SoundLook {
  /** music (or a drone) under the voice: where it starts, how loud against the voice (dB) */
  bed: { start: number; level: number } | null;
  /** sounds on events: on every such event in the reference */
  sfx: { on: SfxOn; kind: SfxKind; level: number }[];
}

export interface MimicTemplate {
  version: 1;
  name: string;
  duration: number;
  width: number;
  height: number;
  /** where the voice is */
  speech: { start: number; end: number }[];
  captions: CaptionLook | null;
  cards: CardSlot[];
  broll: BrollSlot[];
  zoom: ZoomLook | null;
  sound: SoundLook;
  /** black at the end, seconds */
  tail: number;
  /** the speaker's face: centre and height */
  speaker: { x: number; y: number; h: number } | null;
  /** the longest pause the reference keeps between phrases */
  maxPause: number;
  /** what the reference says, caption by caption (as read off its captions) */
  script?: { start: number; end: number; text: string }[];
  /** measurements for the page to show */
  notes: string[];
}

/** One of the user's extra pictures or clips. */
export interface Extra {
  id: string;
  name: string;
  kind: "image" | "video";
  width: number;
  height: number;
  duration: number;
  /** where the picture's subject is (a face), to crop around */
  focus?: { x: number; y: number };
  /** what it is, in a few words: its name, the user's words for it, or Gemini's */
  label?: string;
  /** the words printed on it */
  text?: string;
  /** what the picture model sees in it, most likely first */
  tags?: string[];
  /** Gemini's words for what it shows and what it's about, when asked */
  about?: string;
  keywords?: string[];
  /** a screenshot (lines of small text), a photo, or a clip */
  look?: "screenshot" | "photo" | "clip";
}

export interface PlanWord {
  text: string;
  /** output time */
  start: number;
  end: number;
}

export interface CaptionPage {
  start: number;
  end: number;
  lines: PlanWord[][];
}

export interface PlanCard {
  slot: string;
  start: number;
  end: number;
  rect: [number, number, number, number];
  enter: Motion;
  exit: Motion;
  radius: number;
  extra: string;
  /** crop of the extra: centre (0 to 1) and zoom over the cover fit */
  crop: { cx: number; cy: number; zoom: number };
  /** a clip plays from here (seconds into it) */
  from: number;
}

export interface PlanBroll {
  slot: string;
  start: number;
  end: number;
  extra: string;
  from: number;
  zoom: [number, number];
  crop: { cx: number; cy: number };
}

export interface Segment {
  /** source time */
  from: number;
  to: number;
  /** output time */
  start: number;
  end: number;
}

/** A sound effect in the edit. */
export interface SfxCue {
  /** what it's on, to keep the user's changes to it when the edit is planned again ("in:card1", "swap:card2", "word:41", or the user's own) */
  key: string;
  /** output time of its moment (its loudest part lines up here) */
  t: number;
  /** a sound made in the page, or one of the user's (its id) */
  sound: string;
  /** dB against the level sound effects sit at under the voice */
  db: number;
  /** from where to where it moves across (-1 left to 1 right), for a card sliding past */
  pan?: [number, number];
  /** why it's there, for the page */
  why: string;
}

/** The music's own level over the edit: [output time, dB] keyframes joined by straight lines. */
export type VolumeLine = [number, number][];

export interface MimicPlan {
  width: number;
  height: number;
  fps: number;
  duration: number;
  /** the footage, piece by piece */
  segments: Segment[];
  /** the footage's zoom over time: [t, level] keyframes joined by straight ramps (a jump is two keys at one time) */
  zoom: [number, number][];
  /** the footage's crop: centre (0 to 1 of the source) and the zoom it starts from */
  frame: { cx: number; cy: number; zoom: number };
  /** the same, take by take (edit times), so the speaker is as big in every take */
  frames?: { start: number; end: number; cx: number; cy: number; zoom: number }[];
  broll: PlanBroll[];
  cards: PlanCard[];
  captions: { look: CaptionLook; pages: CaptionPage[] } | null;
  sfx: SfxCue[];
  /** all the sound effects up or down (dB) */
  sfxGain?: number;
  /** music: from `from` s into the song, starting at `start` in the edit, `gain` dB under the voice, then the user's volume line on top */
  music: { source: string; start: number; from: number; gain: number; fadeOut: number; line?: VolumeLine } | null;
  tail: number;
  /** the user's pictures left out of the edit, and why ("cover": half the talk already has pictures over it) */
  left?: Record<string, "cover">;
}

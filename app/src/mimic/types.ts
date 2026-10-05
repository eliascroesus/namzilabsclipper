/**
 * What the mimic page learns from a reference video (a MimicTemplate), and the
 * edit it makes from the user's footage by it (a MimicPlan). Sizes and places
 * are shares of the frame (0 to 1), times are seconds.
 */
import type { TextMotion } from "../engine/text/motion";
import type { Fill, TextStyle } from "../engine/text/style";

export type FontFamily = "sans" | "condensed" | "tall" | "serif";

/** Where a caption block sits: its anchor point, how its lines line up on it, how wide it may run. */
export interface CaptionPlace {
  /** the anchor, 0 to 1 of the frame */
  x: number;
  y: number;
  /** the lines line up on the anchor by their left edge, middle or right edge */
  align: "left" | "center" | "right";
  /** the anchor is the block's top, middle or bottom */
  valign: "top" | "middle" | "bottom";
  /** the widest a line may run, a share of the frame's width */
  width: number;
  /** the reference sets its captions here behind the speaker */
  behind?: boolean;
}

/** A rule for which words take another style than the base. */
export interface StylePick {
  style: string;
  /**
   * which words: the caption's key word (the longest, least common one), its last word,
   * its first, a number, or the words the user marked
   */
  rule: "keyword" | "last" | "first" | "number" | "marked" | "stopword" | "line2";
  /** at most this share of captions get one (0 to 1); the small words (stopword) and the second line (line2) take every word they cover */
  share: number;
}

/** How the word being said looks (karaoke): another colour, outline, glow or weight, a pop, a box behind it. */
export interface SpokenLook {
  fill?: Fill;
  stroke?: TextStyle["stroke"];
  glow?: TextStyle["glow"];
  weight?: number;
  /** grows to this much of its size while said (1.15: to 115%) */
  scale?: number;
  /** a box behind it (a pill that moves word to word); pad and radius in font sizes */
  box?: { color: string; pad: number; radius: number };
  /** the colour sweeps across the word as it's said (karaoke's fill), rather than all at once */
  sweep?: boolean;
  /** said words keep the look (filled up to the word being said) rather than only the one being said */
  hold?: boolean;
}

/**
 * The richer captions (jiia's and Mochi's promo edits): several text styles (a base, an
 * emphasis word in another face, size or gradient, a serif accent), words picked out for
 * them, each caption a block of lines of different sizes set beside the speaker in the
 * places the reference uses, some behind the speaker, coming on and going off as the
 * reference's do.
 */
export interface TextDesign {
  /** the styles, the first the base every other word is in */
  styles: TextStyle[];
  picks: StylePick[];
  /**
   * each line one size (the base's); each word its own style's size, lines stacked as a
   * block; or a line's words spread across the place's width (round the speaker)
   */
  layout: "lines" | "stack" | "spread";
  /** baseline to baseline, in font sizes (of the bigger line) */
  leading: number;
  /** most words on a line, and lines in a caption */
  words: number;
  lines: number;
  /** the places the reference sets its captions in, used in turn */
  places: CaptionPlace[];
  /** the share of captions set behind the speaker (0: none; 1: all); with `style`, only captions with a word in it */
  behind: { share: number; style?: string };
  /** how the words come on, and go off (null: they cut off) */
  enter: TextMotion;
  exit: TextMotion | null;
  /** how a word in another style than the base comes on (as `enter` when unset) */
  accentEnter?: TextMotion;
  /** other looks a share of the captions take (a big word alone in the middle, words spread round the speaker) */
  alts?: DesignAlt[];
  /** the word being said, and words not said yet (shown when a caption comes on whole) */
  spoken?: SpokenLook;
  upcoming?: { fill?: Fill; opacity?: number };
  /** each line sized to fill its place's width (half to three times its style's size) */
  fit?: boolean;
  /** each line of a caption set in by this much (font sizes of the base), line by line in turn: a staircase */
  indents?: number[];
  /** captions ride the footage's zoom (set in the picture, not over it) */
  ride?: boolean;
}

/**
 * Another look for some of a design's captions: set in their own places and layout,
 * shorter, behind the speaker or not, every word in one style when given.
 */
export interface DesignAlt {
  /** which captions: those with the strongest key word, a marked word or a number, or every so many in turn */
  rule: "keyword" | "marked" | "number" | "turn";
  /** at most this share of captions (0 to 1) */
  share: number;
  /** every word in this style (unset: the design's picks as usual) */
  style?: string;
  /** the word that chose the look (its strongest, marked, number) in this style instead */
  keyStyle?: string;
  /** how its words come on (the design's way when unset) */
  enter?: TextMotion;
  layout?: TextDesign["layout"];
  /** most words on a line, and lines (a longer caption gives up the part round its key word) */
  words?: number;
  lines?: number;
  places?: CaptionPlace[];
  behind?: boolean;
  fit?: boolean;
}

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
  /** the richer captions: several styles, stacked, beside or behind the speaker (when set, the fields above are only a fallback) */
  design?: TextDesign;
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
  /** a break the user typed after it: a new line of the caption, or a new caption */
  br?: "line" | "page";
  /** the design's style it's in (the base when unset) */
  style?: string;
  /** the user marked it (for a style picked by marks) */
  mark?: boolean;
  /** it opens a sentence (so its capital is only there for that) */
  opens?: boolean;
}

export interface CaptionPage {
  start: number;
  end: number;
  lines: PlanWord[][];
  /** with a design: which of its places it sits in, and whether it's behind the speaker */
  place?: number;
  behind?: boolean;
  /** which of the design's other looks it takes (unset: the design's own) */
  alt?: number;
  /** the speaker's face as the caption comes on (centre and size, 0 to 1 of the frame), for it to keep clear of */
  face?: { x: number; y: number; w: number; h: number };
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
  /** music: from `from` s into the song, starting at `start` in the edit (and stopping at `end`, when it stops before the edit does), `gain` dB under the voice, then the user's volume line on top */
  music: { source: string; start: number; end?: number; from: number; gain: number; fadeOut: number; line?: VolumeLine } | null;
  tail: number;
  /** the user's pictures left out of the edit, and why ("cover": half the talk already has pictures over it) */
  left?: Record<string, "cover">;
}

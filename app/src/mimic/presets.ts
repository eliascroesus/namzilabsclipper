/**
 * Ready-made text designs, each a starting point the page can tune: the reference edits'
 * own (measured frame by frame, docs/mimic-text.md), and the well-known caption looks
 * (Hormozi's, MrBeast's, Opus Clip's, Submagic's, CapCut's, TikTok's, editorial ones),
 * their numbers from the tools' own settings and from frames where they publish none. A
 * reference's own design, when the page reads one off it, comes before them all.
 */
import type { TextMotion } from "../engine/text/motion";
import type { Fill, TextStyle } from "../engine/text/style";
import type { CaptionPlace, TextDesign } from "./types";

const S = (id: string, name: string, s: Partial<TextStyle>): TextStyle => ({
  id,
  name,
  font: "inter",
  weight: 700,
  italic: false,
  case: "as-said",
  size: 0.045,
  tracking: -0.01,
  fill: { kind: "solid", color: "#ffffff" },
  stroke: null,
  shadow: null,
  glow: null,
  box: null,
  opacity: 1,
  blend: "normal",
  ...s,
});

const solid = (color: string): Fill => ({ kind: "solid", color });

// Places: the lower third (clear of the bottom fifth and an app's buttons), the middle, the top, and beside the head.
const LOW: CaptionPlace = { x: 0.5, y: 0.68, align: "center", valign: "middle", width: 0.86 };
const MID: CaptionPlace = { x: 0.5, y: 0.5, align: "center", valign: "middle", width: 0.86 };
const TOP: CaptionPlace = { x: 0.5, y: 0.14, align: "center", valign: "top", width: 0.9 };
const LEFT: CaptionPlace = { x: 0.07, y: 0.4, align: "left", valign: "middle", width: 0.4 };
const RIGHT: CaptionPlace = { x: 0.93, y: 0.4, align: "right", valign: "middle", width: 0.4 };
const SHADOW = { color: "rgba(0,0,0,0.45)", blur: 0.15, x: 0, y: 0.03 };

export type PresetGroup = "references" | "popular" | "clean";

export const PRESET_GROUPS: { id: PresetGroup; name: string }[] = [
  { id: "references", name: "From the reference edits" },
  { id: "popular", name: "Popular caption looks" },
  { id: "clean", name: "Clean, editorial, effects" },
];

export interface DesignPreset {
  id: string;
  name: string;
  group: PresetGroup;
  /** where it comes from, in a few words */
  from: string;
  design: TextDesign;
}

const base = (d: Partial<TextDesign> & Pick<TextDesign, "styles">): TextDesign => ({
  picks: [],
  layout: "lines",
  leading: 1.2,
  words: 3,
  lines: 2,
  places: [LOW],
  behind: { share: 0 },
  enter: { kind: "pop", dur: 0.16, unit: "word", from: 0.8, overshoot: 0.06 },
  exit: null,
  ...d,
});

// ----- The reference edits' own -----

/**
 * jiia's Mochi DM promo (measured): lowercase Zalando Sans semi-expanded, bold, tight,
 * stacked beside or above the head in a staircase; small words a third smaller; key words
 * big in a red-pink-violet-blue gradient across the line with a glow in their own hue,
 * stretching up from the baseline; now and then one giant gradient word behind the speaker.
 * Words rise and fade in as they're said.
 */
const MOCHI_GRADIENT: Fill = { kind: "linear", colors: ["#f61f58", "#ff11c7", "#b436fe", "#8863ff", "#37b6ff"], stops: [0, 0.38, 0.64, 0.82, 1], angle: 0 };
const ZS = { font: "zalando-sans", stretch: 112.5, weight: 700, case: "lower" as const };
const JIIA_STACK = base({
  styles: [
    S("base", "Base", { ...ZS, size: 0.092, tracking: -0.06, fill: solid("#fdf9fb") }),
    S("small", "Small words", { ...ZS, size: 0.057, tracking: -0.04, fill: solid("#fdf9fb") }),
    S("key", "Gradient key word", { ...ZS, size: 0.164, tracking: -0.01, fill: MOCHI_GRADIENT, fillSpan: "line", stroke: { color: "#f8a0c0", width: 0.008 }, glow: { color: "#ff2a8a", blur: 0.04, strength: 0.4 }, enter: { kind: "stretch", dur: 0.5, unit: "word", overshoot: 0.21 } }),
    S("hook", "Giant word", { ...ZS, size: 0.42, tracking: -0.022, fill: { kind: "linear", colors: ["#fe0532", "#fe1b9c", "#b738fe", "#48a7fe"], stops: [0, 0.35, 0.68, 1], angle: 0 }, glow: { color: "#ff2a8a", blur: 0.03, strength: 0.35 }, enter: { kind: "stretch", dur: 0.54, unit: "word", overshoot: 0.21 } }),
  ],
  picks: [
    { style: "small", rule: "stopword", share: 1 },
    { style: "key", rule: "keyword", share: 0.25 },
  ],
  layout: "stack",
  leading: 0.77,
  words: 2,
  lines: 3,
  indents: [0, 0.55, 1.6, 0.75],
  places: [
    { x: 0.551, y: 0.48, align: "left", valign: "middle", width: 0.3 },
    { x: 0.406, y: 0.5, align: "right", valign: "middle", width: 0.33 },
    { x: 0.5, y: 0.283, align: "center", valign: "middle", width: 0.62 },
  ],
  enter: { kind: "rise", dur: 0.33, unit: "word", dist: 0.7, ease: "out" },
  exit: { kind: "fade", dur: 0.17, unit: "page", ease: "linear" },
  alts: [{ rule: "keyword", share: 0.05, style: "hook", layout: "lines", words: 1, lines: 1, places: [{ x: 0.5, y: 0.386, align: "center", valign: "middle", width: 0.86 }], behind: true }],
});

/**
 * jiia's cinematic edit (measured): heavy lowercase grotesk with its letters touching, in
 * tiers of size, a soft shadow; some captions whole in difference (white turned to the
 * picture's inverse); the last word now and then a copperplate script, title case, also in
 * difference; a few behind the person. Words fade in over three frames as they're said.
 */
const TIGHT = { font: "inter", weight: 700, case: "lower" as const, tracking: -0.11, fill: solid("#f4f2ec") };
const JIIA_DIFFERENCE = base({
  styles: [
    S("base", "Base", { ...TIGHT, size: 0.108, shadow: { color: "rgba(0,0,0,0.45)", blur: 0.116, x: 0.064, y: 0.129 } }),
    S("small", "Small words", { ...TIGHT, size: 0.088, shadow: { color: "rgba(0,0,0,0.45)", blur: 0.142, x: 0.079, y: 0.158 } }),
    S("big", "Big word", { ...TIGHT, size: 0.184, shadow: { color: "rgba(0,0,0,0.45)", blur: 0.068, x: 0.038, y: 0.075 } }),
    S("diff", "In difference", { ...TIGHT, size: 0.09, fill: solid("#ffffff"), blend: "difference" }),
    S("script", "Script accent", { font: "pinyon-script", weight: 400, case: "title", size: 0.23, tracking: 0, fill: solid("#ffffff"), blend: "difference", enter: { kind: "fade", dur: 0.2, unit: "word", ease: "linear" } }),
  ],
  picks: [
    { style: "script", rule: "last", share: 0.35 },
    { style: "small", rule: "stopword", share: 1 },
    { style: "big", rule: "keyword", share: 0.12 },
  ],
  layout: "stack",
  leading: 0.9,
  words: 3,
  lines: 3,
  indents: [0, 1, 2],
  places: [
    { x: 0.21, y: 0.4, align: "left", valign: "middle", width: 0.32 },
    { x: 0.68, y: 0.52, align: "center", valign: "middle", width: 0.45 },
    { x: 0.59, y: 0.22, align: "left", valign: "middle", width: 0.32 },
    { x: 0.51, y: 0.32, align: "center", valign: "middle", width: 0.62, behind: true },
  ],
  enter: { kind: "fade", dur: 0.125, unit: "word", ease: "linear" },
  exit: null,
  alts: [{ rule: "turn", share: 0.35, style: "diff", layout: "stack", words: 3, lines: 2, places: [{ x: 0.5, y: 0.45, align: "center", valign: "middle", width: 0.5 }] }],
});

/**
 * jiia's black and white edit (measured): white bold grotesk (SF Pro Display's look),
 * lowercase, letters touching, stacked flush left in a staircase with a soft shadow; key
 * words in a deep red at twice the size; marked phrases in a red roundhand script; pairs of
 * words either side of the person at chin height; one giant red word behind them. White
 * words cut on as they're said, red ones fade in over three frames.
 */
const MONO_RED = "#980f04";
const MONO_SHADOW = { color: "rgba(0,0,0,0.3)", blur: 0.185, x: 0.033, y: 0.056 };
const JIIA_MONO = base({
  styles: [
    S("base", "Base", { font: "inter-tight", weight: 700, case: "lower", size: 0.105, tracking: -0.1, shadow: MONO_SHADOW }),
    S("red", "Red key word", { font: "inter-tight", weight: 700, case: "lower", size: 0.23, tracking: -0.095, fill: solid(MONO_RED), shadow: { color: "rgba(0,0,0,0.3)", blur: 0.085, x: 0.015, y: 0.025 }, enter: { kind: "fade", dur: 0.125, unit: "word", ease: "linear" } }),
    S("script", "Red script", { font: "pinyon-script", weight: 400, case: "as-said", size: 0.21, tracking: 0, fill: solid("#971009"), stroke: { color: "#971009", width: 0.013 }, shadow: { color: "rgba(0,0,0,0.3)", blur: 0.089, x: 0.016, y: 0.027 }, enter: { kind: "fade", dur: 0.125, unit: "word", ease: "linear" } }),
  ],
  picks: [
    { style: "script", rule: "marked", share: 1 },
    { style: "red", rule: "last", share: 0.3 },
  ],
  layout: "stack",
  leading: 0.84,
  words: 2,
  lines: 3,
  indents: [0, 0.5, 1],
  places: [
    { x: 0.137, y: 0.33, align: "left", valign: "middle", width: 0.34 },
    { x: 0.644, y: 0.32, align: "left", valign: "middle", width: 0.31 },
  ],
  enter: { kind: "none", dur: 0, unit: "word" },
  exit: null,
  alts: [
    { rule: "turn", share: 0.2, layout: "spread", words: 2, lines: 1, places: [{ x: 0.49, y: 0.331, align: "center", valign: "middle", width: 0.5 }] },
    { rule: "keyword", share: 0.08, style: "red", layout: "lines", words: 1, lines: 1, places: [{ x: 0.5, y: 0.3, align: "center", valign: "middle", width: 0.8 }], behind: true },
  ],
});

/**
 * jiia's lifestyle edit (measured): white Google Sans subtitles low down, cut on and off
 * whole; now and then a red title card in their place, a giant Anton key word over a small
 * red line justified to its width, soft-focused, its words cut on as they're said; or a
 * phrase's words spread either side of the head. Nothing behind the speaker.
 */
const RED = "#c70001";
const JIIA_SUBTITLE_PUNCH = base({
  styles: [
    S("base", "Subtitles", { font: "google-sans", weight: 500, case: "as-said", size: 0.041, tracking: -0.02, shadow: { color: "rgba(0,0,0,0.5)", blur: 0.22, x: 0, y: 0.116 } }),
    S("giant", "Giant red", { font: "anton", weight: 400, case: "upper", size: 0.2, tracking: 0, fill: solid(RED), blur: 0.019 }),
    S("red", "Small red", { font: "google-sans", weight: 700, case: "lower", size: 0.059, tracking: -0.01, fill: solid(RED), blur: 0.064 }),
  ],
  layout: "lines",
  words: 4,
  lines: 1,
  places: [{ x: 0.5, y: 0.911, align: "center", valign: "middle", width: 0.6 }],
  enter: { kind: "none", dur: 0, unit: "page" },
  exit: null,
  alts: [
    { rule: "keyword", share: 0.17, style: "red", keyStyle: "giant", layout: "spread", words: 3, lines: 2, places: [{ x: 0.5, y: 0.5, align: "center", valign: "middle", width: 0.5 }], enter: { kind: "none", dur: 0, unit: "word" } },
    { rule: "turn", share: 0.07, style: "red", layout: "spread", words: 4, lines: 1, places: [{ x: 0.5, y: 0.5, align: "center", valign: "middle", width: 0.84 }], enter: { kind: "none", dur: 0, unit: "word" } },
  ],
});

/**
 * themochi.app's vertical promo (measured): bold Zalando Sans at 115% width (SF Pro Expanded's
 * look), near white with a dark soft shadow, lowercase but for names, a word or two a line in
 * stacks of up to five lines over the head, each line its own size (five sizes: the first
 * line smallest, the last biggest, now and then a giant key word), the first line set left,
 * the stack's foot tucked behind the hair. Each line rises 7% of the frame's height on its
 * first word, nearly there at once (a quick fade, a sharp ease), and the caption cuts off
 * whole; captions ride the footage's zooms.
 */
const MOCHI_SHADOW = { color: "rgba(20,20,20,0.55)", blur: 0.11, x: 0.014, y: 0.064 };
const ZS115 = { font: "zalando-sans", stretch: 115, weight: 700, case: "names" as const, tracking: -0.033, fill: solid("#fef8f5"), shadow: MOCHI_SHADOW };
// (The same rise in pixels at every size: 0.069 of the frame's height, in each size's own font sizes.)
const mochiRise = (size: number): TextMotion => ({ kind: "rise", dur: 0.65, unit: "line", dist: Math.round((0.069 / size) * 100) / 100, ease: "quint", fade: 0.2, blur: 0.03 });
const mochi = (id: string, name: string, size: number) => S(id, name, { ...ZS115, size, enter: mochiRise(size) });
const MOCHI_VERTICAL = base({
  styles: [mochi("base", "Base", 0.0573), mochi("small", "Small (first line)", 0.0458), mochi("big", "Big (last line)", 0.0781), mochi("bigger", "Bigger", 0.1088), mochi("hook", "Giant key word", 0.1661)],
  picks: [
    { style: "bigger", rule: "number", share: 1 },
    { style: "hook", rule: "keyword", share: 0.15 },
    { style: "bigger", rule: "last", share: 0.2 },
    { style: "big", rule: "last", share: 0.6 },
    { style: "small", rule: "first", share: 0.6 },
  ],
  layout: "stack",
  leading: 0.93,
  words: 2,
  lines: 4,
  indents: [-0.8, 0.2, -0.3, 0.4, 0],
  places: [{ x: 0.5, y: 0.138, align: "center", valign: "top", width: 0.8 }],
  behind: { share: 0.85 },
  enter: mochiRise(0.0573),
  exit: null,
  ride: true,
});

/**
 * jiia's voice clone promo (measured): bold lowercase Mona Sans widened, near white with a
 * soft shadow, stacked beside the head in a staircase, each word its own size (small words
 * small); now and then one giant word in a red-pink-violet-blue gradient filling most of the
 * width behind the speaker, stretching up from its baseline; a pair split round the head in
 * the same gradient. Words rise, fade and sharpen a little before they're said; the
 * captions ride the footage's zoom.
 */
const VOICE_GRADIENT: Fill = { kind: "linear", colors: ["#ff0018", "#ff14a6", "#ff2a98", "#be36fc", "#6688ff"], stops: [0, 0.28, 0.52, 0.66, 1], angle: 0 };
const MONA = { font: "mona-sans", stretch: 125, weight: 700, case: "lower" as const, tracking: -0.02 };
const VOICE_SHADOW = { color: "rgba(0,0,0,0.35)", blur: 0.1, x: 0.04, y: 0.06 };
const JIIA_VOICE = base({
  styles: [
    S("base", "Base", { ...MONA, size: 0.09, fill: solid("#f9f8ff"), shadow: VOICE_SHADOW }),
    S("small", "Small words", { ...MONA, size: 0.062, fill: solid("#f9f8ff"), shadow: VOICE_SHADOW }),
    S("big", "Big word", { ...MONA, size: 0.13, fill: solid("#f9f8ff"), shadow: VOICE_SHADOW }),
    S("giant", "Giant gradient", { ...MONA, size: 0.55, fill: VOICE_GRADIENT, fillSpan: "line", glow: { color: "#ff2a8a", blur: 0.02, strength: 0.4 }, enter: { kind: "stretch", dur: 0.46, unit: "word", overshoot: 0.18 } }),
    S("split", "Split gradient", { ...MONA, size: 0.13, fill: VOICE_GRADIENT, fillSpan: "line", glow: { color: "#ff2a8a", blur: 0.03, strength: 0.4 } }),
  ],
  picks: [
    { style: "small", rule: "stopword", share: 1 },
    { style: "big", rule: "keyword", share: 0.35 },
  ],
  layout: "stack",
  leading: 0.9,
  words: 2,
  lines: 3,
  indents: [0, 0.8, 1.6],
  places: [
    { x: 0.6, y: 0.45, align: "left", valign: "middle", width: 0.36 },
    { x: 0.4, y: 0.45, align: "right", valign: "middle", width: 0.36 },
  ],
  enter: { kind: "rise", dur: 0.4, unit: "word", dist: 0.35, blur: 0.1, ease: "out", lead: 0.3 },
  exit: { kind: "fade", dur: 0.12, unit: "page" },
  ride: true,
  alts: [
    { rule: "keyword", share: 0.06, style: "giant", layout: "lines", words: 1, lines: 1, places: [{ x: 0.5, y: 0.45, align: "center", valign: "middle", width: 0.78 }], behind: true, fit: true },
    { rule: "turn", share: 0.05, style: "split", layout: "spread", words: 2, lines: 1, places: [{ x: 0.5, y: 0.42, align: "center", valign: "middle", width: 0.8 }] },
  ],
});

/** Magenta lowercase typed out beside the head, a caret after it. */
const JIIA_TYPING = base({
  styles: [S("base", "Base", { font: "tiktok-sans", stretch: 125, weight: 700, case: "lower", size: 0.06, fill: solid("#e33cff"), glow: { color: "#e33cff", blur: 0.3, strength: 0.5 } })],
  leading: 1.2,
  words: 3,
  lines: 2,
  places: [LEFT, RIGHT],
  behind: { share: 0.3 },
  enter: { kind: "type", dur: 0.3, unit: "line", rate: 28, caret: true },
  exit: { kind: "fade", dur: 0.1, unit: "page" },
});

// ----- Popular caption looks -----

const HORMOZI = base({
  styles: [
    S("base", "Base", { font: "montserrat", weight: 900, case: "upper", size: 0.06, stroke: { color: "#000000", width: 0.09 }, shadow: { color: "rgba(0,0,0,0.7)", blur: 0.06, x: 0, y: 0.04 } }),
    S("hot", "Key word", { font: "montserrat", weight: 900, case: "upper", size: 0.06, fill: solid("#ffe11a"), stroke: { color: "#000000", width: 0.09 }, shadow: { color: "rgba(0,0,0,0.7)", blur: 0.06, x: 0, y: 0.04 } }),
    S("money", "Numbers", { font: "montserrat", weight: 900, case: "upper", size: 0.06, fill: solid("#2be24a"), stroke: { color: "#000000", width: 0.09 }, shadow: { color: "rgba(0,0,0,0.7)", blur: 0.06, x: 0, y: 0.04 } }),
  ],
  picks: [
    { style: "money", rule: "number", share: 1 },
    { style: "hot", rule: "keyword", share: 0.7 },
  ],
  leading: 1.25,
  words: 3,
  lines: 2,
  enter: { kind: "pop", dur: 0.12, unit: "word", from: 0.85, overshoot: 0.05, ease: "back" },
  spoken: { fill: solid("#ffe11a") },
});

const HORMOZI_ANTON = base({
  styles: [
    S("base", "Base", { font: "anton", weight: 400, case: "upper", size: 0.075, tracking: 0.01, stroke: { color: "#000000", width: 0.06 }, shadow: { color: "rgba(0,0,0,0.5)", blur: 0.1, x: 0, y: 0.03 } }),
    S("hot", "Key word", { font: "anton", weight: 400, case: "upper", size: 0.075, tracking: 0.01, fill: solid("#ffd400"), stroke: { color: "#000000", width: 0.06 }, shadow: { color: "rgba(0,0,0,0.5)", blur: 0.1, x: 0, y: 0.03 } }),
  ],
  picks: [{ style: "hot", rule: "keyword", share: 0.6 }],
  leading: 1.2,
  enter: { kind: "rise", dur: 0.18, unit: "word", dist: 0.35, ease: "back", overshoot: 0.08 },
  spoken: { fill: solid("#ffd400") },
});

const BEAST = base({
  styles: [
    S("base", "Base", { font: "luckiest-guy", weight: 400, case: "upper", size: 0.075, tracking: 0.02, stroke: { color: "#000000", width: 0.125 }, shadow: { color: "#000000", blur: 0.04, x: 0.04, y: 0.04 } }),
    S("key", "Key word", { font: "luckiest-guy", weight: 400, case: "upper", size: 0.075, tracking: 0.02, fill: solid("#36e64b"), stroke: { color: "#000000", width: 0.125 }, glow: { color: "#36e64b", blur: 0.35, strength: 0.6 } }),
  ],
  picks: [{ style: "key", rule: "keyword", share: 0.6 }],
  leading: 1.15,
  words: 2,
  lines: 1,
  places: [MID],
  enter: { kind: "bounce", dur: 0.28, unit: "word", from: 0.3, overshoot: 0.2 },
  spoken: { fill: solid("#ffea00") },
});

const BEASTY = base({
  styles: [S("base", "Base", { font: "bangers", weight: 400, case: "upper", size: 0.085, tracking: 0.03, fill: solid("#ffe14d"), stroke: { color: "#000000", width: 0.12 }, shadow: { color: "#000000", blur: 0, x: 0.04, y: 0.06 }, skew: 8 })],
  leading: 1.1,
  words: 3,
  lines: 1,
  places: [MID],
  enter: { kind: "bounce", dur: 0.3, unit: "word", from: 0, overshoot: 0.25 },
});

const IMAN = base({
  styles: [S("base", "Base", { font: "montserrat", weight: 300, case: "lower", size: 0.042, shadow: { color: "rgba(0,0,0,0.35)", blur: 0.15, x: 0, y: 0.03 } })],
  leading: 1.35,
  words: 5,
  lines: 1,
  enter: { kind: "fade", dur: 0.12, unit: "line" },
  exit: { kind: "fade", dur: 0.1, unit: "line" },
  spoken: { weight: 700, hold: true },
});

const ALI = base({
  styles: [
    S("base", "Base", { font: "inter", weight: 700, case: "as-said", size: 0.045, tracking: -0.02, shadow: { color: "rgba(0,0,0,0.4)", blur: 0.2, x: 0, y: 0.03 } }),
    S("hot", "Key word", { font: "inter", weight: 700, case: "as-said", size: 0.045, tracking: -0.02, fill: solid("#ffd400"), shadow: { color: "rgba(0,0,0,0.4)", blur: 0.2, x: 0, y: 0.03 } }),
  ],
  picks: [{ style: "hot", rule: "keyword", share: 0.5 }],
  leading: 1.4,
  words: 3,
  lines: 4,
  places: [LEFT, RIGHT],
  enter: { kind: "rise", dur: 0.2, unit: "line", stagger: 0.08, dist: 0.3 },
  exit: { kind: "fade", dur: 0.15, unit: "page" },
});

const KARAOKE = base({
  styles: [S("base", "Base", { font: "montserrat", weight: 900, case: "upper", size: 0.052, stroke: { color: "#000000", width: 0.08 }, shadow: { color: "rgba(0,0,0,0.6)", blur: 0.1, x: 0, y: 0.03 } })],
  leading: 1.25,
  words: 4,
  lines: 2,
  enter: { kind: "fade", dur: 0.08, unit: "page" },
  spoken: { fill: solid("#ffe600"), sweep: true, hold: true },
});

const DEEP_DIVER = base({
  styles: [S("base", "Base", { font: "barlow-condensed", weight: 600, case: "as-said", size: 0.05, fill: solid("#111111"), box: { color: "#e9e9e9", pad: 0.3, radius: 0.35 } })],
  leading: 1.3,
  words: 5,
  lines: 2,
  enter: { kind: "fade", dur: 0.12, unit: "page" },
  exit: { kind: "fade", dur: 0.1, unit: "page" },
  upcoming: { fill: solid("#8a8a8a") },
  spoken: { fill: solid("#111111"), hold: true },
});

const POD_P = base({
  styles: [S("base", "Base", { font: "anton", weight: 400, case: "upper", size: 0.075, stroke: { color: "#000000", width: 0.05 } })],
  leading: 1.1,
  words: 2,
  lines: 1,
  places: [MID],
  enter: { kind: "pop", dur: 0.15, unit: "word", from: 0.7, overshoot: 0.1 },
  spoken: { fill: solid("#ff2bd6"), stroke: { color: "#8a0f73", width: 0.06 } },
});

const MOZI = base({
  styles: [S("base", "Base", { font: "montserrat", weight: 900, case: "upper", size: 0.058, stroke: { color: "#000000", width: 0.1 } })],
  leading: 1.2,
  enter: { kind: "pop", dur: 0.15, unit: "word", from: 0.8, overshoot: 0.12 },
  spoken: { fill: solid("#39ff14"), scale: 1.15 },
});

const POPLINE = base({
  styles: [S("base", "Base", { font: "montserrat", weight: 800, case: "upper", size: 0.05, shadow: { color: "rgba(0,0,0,0.5)", blur: 0.15, x: 0, y: 0.03 } })],
  leading: 1.3,
  words: 4,
  lines: 2,
  enter: { kind: "pop", dur: 0.18, unit: "page", from: 0.9, overshoot: 0.04 },
  spoken: { box: { color: "#7c3aed", pad: 0.18, radius: 0.25 } },
});

const HIGHLIGHTER = base({
  styles: [S("base", "Base", { font: "montserrat", weight: 800, case: "as-said", size: 0.05, shadow: { color: "rgba(0,0,0,0.5)", blur: 0.12, x: 0, y: 0.03 } })],
  leading: 1.3,
  words: 4,
  lines: 2,
  enter: { kind: "fade", dur: 0.1, unit: "page" },
  spoken: { fill: solid("#000000"), box: { color: "#ffe600", pad: 0.12, radius: 0.2 } },
});

const TWO_TONE = base({
  styles: [
    S("base", "Base", { font: "bebas", weight: 400, case: "upper", size: 0.075, tracking: 0.02, shadow: { color: "rgba(0,0,0,0.65)", blur: 0.12, x: 0, y: 0.04 } }),
    S("l2", "Second line", { font: "bebas", weight: 400, case: "upper", size: 0.075, tracking: 0.02, fill: solid("#ffd60a"), shadow: { color: "rgba(0,0,0,0.65)", blur: 0.12, x: 0, y: 0.04 } }),
  ],
  picks: [{ style: "l2", rule: "line2", share: 1 }],
  leading: 1.15,
  enter: { kind: "rise", dur: 0.18, unit: "line", stagger: 0.1, dist: 0.3 },
});

const TIKTOK_BOX = base({
  styles: [S("base", "Base", { font: "tiktok-sans", weight: 600, case: "as-said", size: 0.036, fill: solid("#000000"), box: { color: "#ffffff", pad: 0.28, radius: 0.3 } })],
  leading: 1.45,
  words: 6,
  lines: 2,
  places: [MID],
  enter: { kind: "none", dur: 0, unit: "page" },
});

const WORD_CHIPS = base({
  styles: [S("base", "Base", { font: "anton", weight: 400, case: "upper", size: 0.045, tracking: 0.02, box: { color: "#000000e6", pad: 0.16, radius: 0.16 } })],
  leading: 1.35,
  enter: { kind: "pop", dur: 0.16, unit: "word", from: 0.85, overshoot: 0.05 },
  spoken: { box: { color: "#c8392c", pad: 0.2, radius: 0.16 } },
});

const SUPERSIZE = base({
  styles: [
    S("base", "Base", { font: "inter", weight: 800, case: "as-said", size: 0.045, tracking: -0.02, shadow: SHADOW }),
    S("super", "Supersized", { font: "inter", weight: 800, case: "as-said", size: 0.09, tracking: -0.02, fill: solid("#ffe14d"), shadow: SHADOW }),
  ],
  picks: [{ style: "super", rule: "keyword", share: 0.6 }],
  layout: "stack",
  leading: 1.2,
  words: 3,
  lines: 3,
  enter: { kind: "rise", dur: 0.16, unit: "word", dist: 0.2 },
  accentEnter: { kind: "pop", dur: 0.22, unit: "word", from: 0.5, overshoot: 0.12 },
});

const CAPCUT_POP = base({
  styles: [S("base", "Base", { font: "tiktok-sans", weight: 800, case: "upper", size: 0.055, stroke: { color: "#000000", width: 0.07 }, shadow: { color: "rgba(0,0,0,0.6)", blur: 0.12, x: 0, y: 0.04 } })],
  leading: 1.2,
  enter: { kind: "pop", dur: 0.3, unit: "page", from: 0.2, overshoot: 0.15 },
  spoken: { fill: solid("#ffe600"), glow: { color: "#ffc400", blur: 0.4, strength: 0.6 } },
});

const ONE_WORD = base({
  styles: [
    S("base", "Base", { font: "tiktok-sans", weight: 900, case: "upper", size: 0.12, tracking: -0.01, stroke: { color: "#000000", width: 0.06 }, shadow: { color: "#000000", blur: 0, x: 0, y: 0.06 } }),
    S("hot", "Key word", { font: "tiktok-sans", weight: 900, case: "upper", size: 0.12, tracking: -0.01, fill: solid("#ff3b30"), stroke: { color: "#000000", width: 0.06 }, shadow: { color: "#000000", blur: 0, x: 0, y: 0.06 } }),
  ],
  picks: [{ style: "hot", rule: "keyword", share: 0.4 }],
  leading: 1,
  words: 1,
  lines: 1,
  places: [MID],
  enter: { kind: "pop", dur: 0.18, unit: "word", from: 0.4, overshoot: 0.15 },
});

// ----- Clean, editorial, effects -----

const NEON = base({
  styles: [S("base", "Base", { font: "outfit", weight: 600, case: "lower", size: 0.055, fill: solid("#f7fdff"), glow: { color: "#00e5ff", blur: 0.5, strength: 0.85 } })],
  leading: 1.3,
  places: [MID],
  behind: { share: 0.3 },
  enter: { kind: "blur", dur: 0.25, unit: "word", blur: 0.3 },
  exit: { kind: "fade", dur: 0.15, unit: "page" },
});

const TYPEWRITER = base({
  styles: [S("base", "Base", { font: "jetbrains-mono", weight: 500, case: "as-said", size: 0.036, fill: solid("#e8ffe8"), box: { color: "#0b0f0ce6", pad: 0.4, radius: 0.2 } })],
  leading: 1.4,
  words: 6,
  lines: 3,
  places: [MID],
  enter: { kind: "type", dur: 0.3, unit: "line", rate: 25, caret: true },
  exit: { kind: "fade", dur: 0.12, unit: "page" },
});

const SERIF = base({
  styles: [
    S("base", "Base", { font: "instrument-serif", weight: 400, case: "as-said", size: 0.055, tracking: -0.01, shadow: { color: "rgba(0,0,0,0.4)", blur: 0.25, x: 0, y: 0.02 } }),
    S("ital", "Italic accent", { font: "instrument-serif", weight: 400, italic: true, case: "as-said", size: 0.068, tracking: -0.01, fill: solid("#f3e3c3"), shadow: { color: "rgba(0,0,0,0.4)", blur: 0.25, x: 0, y: 0.02 } }),
  ],
  picks: [{ style: "ital", rule: "keyword", share: 0.7 }],
  leading: 1.35,
  words: 4,
  lines: 2,
  enter: { kind: "blur", dur: 0.3, unit: "word", blur: 0.3 },
  exit: { kind: "fade", dur: 0.2, unit: "page" },
});

const HANDWRITTEN = base({
  styles: [
    S("base", "Base", { font: "inter", weight: 800, case: "upper", size: 0.05, shadow: SHADOW }),
    S("hand", "Handwritten", { font: "caveat", weight: 700, case: "lower", size: 0.085, fill: solid("#ffd400"), rotate: -6 }),
  ],
  picks: [{ style: "hand", rule: "keyword", share: 0.6 }],
  layout: "stack",
  leading: 1.1,
  words: 3,
  lines: 3,
  enter: { kind: "rise", dur: 0.18, unit: "word", dist: 0.25 },
  accentEnter: { kind: "pop", dur: 0.3, unit: "word", from: 0.6, overshoot: 0.1 },
});

const MINIMAL = base({
  styles: [S("base", "Base", { font: "inter", weight: 600, case: "as-said", size: 0.04, tracking: -0.02, shadow: { color: "rgba(0,0,0,0.4)", blur: 0.2, x: 0, y: 0.02 } })],
  leading: 1.35,
  words: 4,
  lines: 2,
  enter: { kind: "blur", dur: 0.25, unit: "word", blur: 0.25 },
  exit: { kind: "fade", dur: 0.15, unit: "page" },
});

const GLASS = base({
  styles: [S("base", "Base", { font: "geist", weight: 600, case: "as-said", size: 0.034, box: { color: "#ffffff2e", pad: 0.6, radius: 0.6 }, shadow: { color: "rgba(0,0,0,0.25)", blur: 0.8, x: 0, y: 0.25 } })],
  leading: 1.4,
  words: 6,
  lines: 2,
  places: [TOP],
  enter: { kind: "pop", dur: 0.35, unit: "page", from: 0.9, overshoot: 0.04 },
  exit: { kind: "fade", dur: 0.2, unit: "page" },
});

const GIANT_BEHIND = base({
  styles: [S("base", "Base", { font: "anton", weight: 400, case: "upper", size: 0.22, tracking: 0, shadow: { color: "rgba(0,0,0,0.35)", blur: 0.35, x: 0, y: 0.06 } })],
  leading: 1,
  words: 1,
  lines: 1,
  places: [{ x: 0.5, y: 0.3, align: "center", valign: "middle", width: 0.98, behind: true }],
  behind: { share: 1 },
  fit: true,
  enter: { kind: "rise", dur: 0.34, unit: "line", dist: 0.18 },
  exit: { kind: "fade", dur: 0.2, unit: "page" },
});

export const PRESETS: DesignPreset[] = [
  { id: "stacked", name: "jiia gradient stack", group: "references", from: "jiia's Mochi DM promo: wide lowercase beside the head, gradient key words, a giant word behind", design: JIIA_STACK },
  { id: "jiia-voice", name: "jiia voice clone", group: "references", from: "jiia's voice clone promo: Mona Sans stacked beside the head, a giant gradient word behind", design: JIIA_VOICE },
  { id: "jiia-difference", name: "jiia difference", group: "references", from: "jiia's cinematic edit: white words mixed in by difference, a serif accent", design: JIIA_DIFFERENCE },
  { id: "jiia-mono", name: "jiia black and white", group: "references", from: "jiia's black and white edit: stacked words, red last word, a giant red word behind", design: JIIA_MONO },
  { id: "jiia-subtitles", name: "jiia subtitles and giant words", group: "references", from: "jiia's lifestyle edit: small subtitles, giant red capitals now and then", design: JIIA_SUBTITLE_PUNCH },
  { id: "mochi", name: "Mochi vertical", group: "references", from: "themochi.app's vertical promo: wide bold lines of five sizes rising over the head, tucked behind the hair", design: MOCHI_VERTICAL },
  { id: "jiia-typing", name: "Magenta typing", group: "references", from: "jiia's typed magenta lines with a caret", design: JIIA_TYPING },
  { id: "hormozi", name: "Hormozi", group: "popular", from: "white capitals, a black outline, the word said in yellow, money in green", design: HORMOZI },
  { id: "hormozi-anton", name: "Hormozi (Anton)", group: "popular", from: "Submagic's newer Hormozi: Anton rising in", design: HORMOZI_ANTON },
  { id: "beast", name: "MrBeast", group: "popular", from: "comic capitals, a thick outline, green key words, a bounce", design: BEAST },
  { id: "beasty", name: "Beasty", group: "popular", from: "slanted yellow comic capitals (Opus Clip)", design: BEASTY },
  { id: "bold", name: "Pop word by word", group: "popular", from: "CapCut's auto captions with a glowing yellow word", design: CAPCUT_POP },
  { id: "karaoke", name: "Karaoke fill", group: "popular", from: "words fill yellow as they're said (Opus Clip)", design: KARAOKE },
  { id: "iman", name: "Light to bold", group: "popular", from: "Iman Gadzhi: lowercase, each word bold as it's said", design: IMAN },
  { id: "ali", name: "Block beside you", group: "popular", from: "Ali Abdaal: a sentence-case block beside the speaker", design: ALI },
  { id: "mozi", name: "Mozi", group: "popular", from: "white capitals, the word said green and bigger (Opus Clip)", design: MOZI },
  { id: "pod-p", name: "Pod P", group: "popular", from: "one or two words, the word said magenta (Opus Clip)", design: POD_P },
  { id: "popline", name: "Pill on the word", group: "popular", from: "a purple pill behind the word said (Opus Clip's Popline)", design: POPLINE },
  { id: "highlighter", name: "Highlighter", group: "popular", from: "a yellow box behind the word said", design: HIGHLIGHTER },
  { id: "deep-diver", name: "Grey box", group: "popular", from: "dark words on a light grey box, upcoming words grey (Opus Clip)", design: DEEP_DIVER },
  { id: "two-tone", name: "Two tone", group: "popular", from: "Bebas, the second line yellow (Think Media)", design: TWO_TONE },
  { id: "tiktok-box", name: "TikTok box", group: "popular", from: "TikTok's own text on a white box", design: TIKTOK_BOX },
  { id: "word-chips", name: "Word chips", group: "popular", from: "each word on a dark chip, the word said on red", design: WORD_CHIPS },
  { id: "supersize", name: "Supersized word", group: "popular", from: "Captions: one word supersized in yellow", design: SUPERSIZE },
  { id: "one-word", name: "One word at a time", group: "popular", from: "one huge word at a time, key words red", design: ONE_WORD },
  { id: "editorial", name: "Serif editorial", group: "clean", from: "a calm serif, an italic accent", design: SERIF },
  { id: "minimal", name: "Minimal blur", group: "clean", from: "sentence case coming into focus", design: MINIMAL },
  { id: "handwritten", name: "Handwritten accent", group: "clean", from: "bold capitals and a tilted marker word", design: HANDWRITTEN },
  { id: "neon", name: "Neon", group: "clean", from: "a white core with a cyan glow", design: NEON },
  { id: "typewriter", name: "Typewriter", group: "clean", from: "mono text typed with a caret, on a dark box", design: TYPEWRITER },
  { id: "glass", name: "Glass card", group: "clean", from: "a caption on a frosted card up top", design: GLASS },
  { id: "giant-behind", name: "Giant word behind you", group: "clean", from: "one word filling the width, behind the speaker", design: GIANT_BEHIND },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);

/**
 * Ready-made text designs: the reference edits' own (measured frame by frame:
 * docs/mimic-text.md) and a few well-known caption looks, each a starting point the
 * page can tune. A reference's own design, when the page reads one off it, comes first.
 */
import type { TextStyle } from "../engine/text/style";
import type { TextDesign } from "./types";

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

export interface DesignPreset {
  id: string;
  name: string;
  /** where it comes from, in a few words */
  from: string;
  design: TextDesign;
}

/** A stacked block beside the head: lowercase wide sans, the key word big in a gradient, some behind the speaker. */
const STACKED: TextDesign = {
  styles: [
    S("base", "Base", { font: "tiktok-sans", stretch: 125, weight: 700, case: "lower", size: 0.048, tracking: -0.02, shadow: { color: "rgba(0,0,0,0.35)", blur: 0.3, x: 0, y: 0.03 } }),
    S("emph", "Key word", { font: "tiktok-sans", stretch: 125, weight: 900, case: "lower", size: 0.1, tracking: -0.03, fill: { kind: "linear", colors: ["#ff2d6f", "#ff6bb5"], angle: 0 } }),
  ],
  picks: [{ style: "emph", rule: "keyword", share: 0.5 }],
  layout: "stack",
  leading: 1.02,
  words: 2,
  lines: 2,
  places: [
    { x: 0.66, y: 0.36, align: "left", valign: "middle", width: 0.32 },
    { x: 0.34, y: 0.36, align: "right", valign: "middle", width: 0.32 },
    { x: 0.5, y: 0.22, align: "center", valign: "middle", width: 0.6, behind: true },
  ],
  behind: { share: 0 },
  enter: { kind: "pop", dur: 0.22, unit: "word", from: 0.7, overshoot: 0.1 },
  exit: { kind: "fade", dur: 0.12, unit: "page" },
};

/** Big bold captions a word at a time, the spoken word in yellow (Hormozi's). */
const BOLD: TextDesign = {
  styles: [
    S("base", "Base", { font: "montserrat", weight: 900, case: "upper", size: 0.055, tracking: -0.01, stroke: { color: "#000000", width: 0.08 }, shadow: { color: "rgba(0,0,0,0.6)", blur: 0.15, x: 0, y: 0.06 } }),
    S("emph", "Key word", { font: "montserrat", weight: 900, case: "upper", size: 0.065, tracking: -0.01, fill: { kind: "solid", color: "#ffe14d" }, stroke: { color: "#000000", width: 0.08 }, shadow: { color: "rgba(0,0,0,0.6)", blur: 0.15, x: 0, y: 0.06 } }),
  ],
  picks: [{ style: "emph", rule: "keyword", share: 0.6 }],
  layout: "lines",
  leading: 1.1,
  words: 3,
  lines: 1,
  places: [{ x: 0.5, y: 0.66, align: "center", valign: "middle", width: 0.86 }],
  behind: { share: 0 },
  enter: { kind: "pop", dur: 0.16, unit: "word", from: 0.5, overshoot: 0.15 },
  exit: null,
};

/** A serif italic accent word laid into the picture (soft light), over plain lowercase sans. */
const EDITORIAL: TextDesign = {
  styles: [
    S("base", "Base", { font: "inter", weight: 600, case: "lower", size: 0.04, tracking: -0.02 }),
    S("accent", "Accent", { font: "instrument-serif", weight: 400, italic: true, case: "title", size: 0.12, tracking: -0.01, opacity: 0.9, blend: "soft-light" }),
  ],
  picks: [{ style: "accent", rule: "last", share: 0.34 }],
  layout: "stack",
  leading: 0.95,
  words: 3,
  lines: 2,
  places: [{ x: 0.5, y: 0.58, align: "center", valign: "middle", width: 0.8 }],
  behind: { share: 0.34, style: "accent" },
  enter: { kind: "blur", dur: 0.25, unit: "word", blur: 0.25 },
  exit: { kind: "fade", dur: 0.15, unit: "page" },
};

export const PRESETS: DesignPreset[] = [
  { id: "stacked", name: "Stacked, beside the head", from: "promo edits (jiia, Mochi)", design: STACKED },
  { id: "editorial", name: "Serif accent", from: "cinematic edits", design: EDITORIAL },
  { id: "bold", name: "Bold, word by word", from: "Hormozi-style talking heads", design: BOLD },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);

/**
 * A text style, as an editor sets one in CapCut or After Effects: the font (any of the
 * library's), its weight, slant and width, the case, the size, the letter spacing, the
 * fill (a colour, or a gradient across the word or the line), an outline, a dropped
 * shadow, a glow, a box behind the words, the opacity and how it mixes with the picture
 * under it (a blend mode). Sizes are in font sizes, the font size a share of the frame's
 * height, so a style looks the same in any frame.
 */
import { fontById, fontString, stretchKeyword, type FontDef } from "./library";
import type { TextMotion } from "./motion";

/** How a style mixes with the picture under it (the canvas's composite operations of the same names). */
export type Blend = "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "color-dodge" | "color-burn" | "hard-light" | "soft-light" | "difference" | "exclusion";

export const BLENDS: { value: Blend; name: string; hint: string }[] = [
  { value: "normal", name: "Normal", hint: "as it is" },
  { value: "multiply", name: "Multiply", hint: "dark letters sink into the picture like ink" },
  { value: "screen", name: "Screen", hint: "light letters glow onto the picture" },
  { value: "overlay", name: "Overlay", hint: "the letters take the picture's light and shade" },
  { value: "soft-light", name: "Soft light", hint: "a gentler overlay, the picture showing through" },
  { value: "hard-light", name: "Hard light", hint: "a harder overlay" },
  { value: "darken", name: "Darken", hint: "only where the letters are darker" },
  { value: "lighten", name: "Lighten", hint: "only where the letters are lighter" },
  { value: "difference", name: "Difference", hint: "inverts what's behind (white over dark, dark over light)" },
  { value: "exclusion", name: "Exclusion", hint: "a softer difference" },
  { value: "color-dodge", name: "Colour dodge", hint: "burns the picture brighter" },
  { value: "color-burn", name: "Colour burn", hint: "burns the picture darker" },
];

export type Fill =
  | { kind: "solid"; color: string }
  /** colours along a line at `angle` degrees (0: left to right, 90: top to bottom), at `stops` (0 to 1; even when unset) */
  | { kind: "linear"; colors: string[]; stops?: number[]; angle: number }
  /** colours out from the middle */
  | { kind: "radial"; colors: string[]; stops?: number[] };

export type TextCase = "as-said" | "upper" | "lower" | "title" | "names";

export interface TextStyle {
  id: string;
  /** what the page calls it ("Base", "Emphasis", "Accent") */
  name?: string;
  /** a font of the library (engine/text/library.ts) */
  font: string;
  weight: number;
  italic: boolean;
  /** width in % of normal, for a font with a width axis (TikTok Sans to 150%, Archivo 62 to 125%) */
  stretch?: number;
  case: TextCase;
  /** the font size, a share of the frame's height */
  size: number;
  /** letter spacing, in font sizes */
  tracking: number;
  fill: Fill;
  /** a gradient spans each word on its own, or the whole line */
  fillSpan?: "word" | "line";
  /** an outline round the letters; width in font sizes */
  stroke: { color: string; width: number } | null;
  /** a dropped shadow; blur and offsets in font sizes */
  shadow: { color: string; blur: number; x: number; y: number } | null;
  /** a glow round the letters; blur in font sizes, strength 0 to 1 (more passes) */
  glow: { color: string; blur: number; strength: number } | null;
  /** a box behind the words; pad and radius in font sizes */
  box: { color: string; pad: number; radius: number } | null;
  opacity: number;
  blend: Blend;
  /** a turn (degrees, clockwise) and a lean (degrees, like an italic) of each word */
  rotate?: number;
  skew?: number;
  /** a soft focus that stays on the letters (in font sizes) */
  blur?: number;
  /** how its words come on, when not as the design's do */
  enter?: TextMotion;
}

/** A plain white sans: what a style falls back on. */
export const PLAIN_STYLE: TextStyle = {
  id: "base",
  name: "Base",
  font: "inter",
  weight: 600,
  italic: false,
  case: "as-said",
  size: 0.04,
  tracking: -0.02,
  fill: { kind: "solid", color: "#ffffff" },
  stroke: null,
  shadow: { color: "rgba(0,0,0,0.35)", blur: 0.25, x: 0, y: 0.04 },
  glow: null,
  box: null,
  opacity: 1,
  blend: "normal",
};

/**
 * A word in a case. "names" is lowercase that keeps names: a capital only there because the
 * word opens a sentence (`opens`) goes, one mid-sentence (Instagram) or inside a word (DMs,
 * iPhone) stays, and so does "I".
 */
export function cased(s: string, c: TextCase, opens?: boolean): string {
  if (c === "upper") return s.toUpperCase();
  if (c === "lower") return s.toLowerCase();
  if (c === "title") return s.replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
  if (c === "names" && opens && !/^I(\b|'|\u2019)/u.test(s)) return s.replace(/^(\P{L}*)(\p{Lu})(?=[\p{Ll}\P{L}]*$)/u, (_, a: string, b: string) => a + b.toLowerCase());
  return s;
}

/** The style's font. */
export const fontOf = (s: Pick<TextStyle, "font">): FontDef => fontById(s.font);

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Set the canvas up to draw (or measure) a style at a font size in pixels. */
export function setStyleFont(ctx: Ctx, s: TextStyle, px: number) {
  const f = fontOf(s);
  const stretch = stretchKeyword(f, s.stretch);
  // (The width in the font string too, for a canvas without fontStretch: Safari.)
  ctx.font = fontString(f, px, s.weight, s.italic, stretch);
  (ctx as unknown as { fontStretch: CanvasFontStretch }).fontStretch = stretch;
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${(s.tracking * px).toFixed(2)}px`;
}

/** The first colour of a fill (for swatches, and a gradient's stand-in). */
export const fillColor = (f: Fill) => (f.kind === "solid" ? f.color : f.colors[0] ?? "#ffffff");

/** A CSS gradient or colour for the page to show a fill. */
export function fillCss(f: Fill): string {
  if (f.kind === "solid") return f.color;
  const stops = f.colors.map((c, i) => `${c} ${Math.round((f.stops?.[i] ?? (f.colors.length > 1 ? i / (f.colors.length - 1) : 0)) * 100)}%`).join(", ");
  return f.kind === "linear" ? `linear-gradient(${(f.angle + 90) % 360}deg, ${stops})` : `radial-gradient(circle, ${stops})`;
}

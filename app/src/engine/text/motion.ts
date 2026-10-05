/**
 * How text comes on and goes off: the moves caption editors use (CapCut's text
 * animations, Submagic's and Captions' word pops), each a curve over its duration
 * that gives, at any moment, the text's opacity, scale, offset, blur and how much of
 * it is revealed (letters typed out, or a wipe across).
 */

export type MotionKind = "none" | "fade" | "pop" | "bounce" | "zoom" | "stretch" | "rise" | "drop" | "slide-left" | "slide-right" | "blur" | "type" | "wipe";

export const MOTIONS: { value: MotionKind; name: string; hint: string }[] = [
  { value: "none", name: "Cut", hint: "simply there" },
  { value: "fade", name: "Fade", hint: "fades in" },
  { value: "pop", name: "Pop", hint: "grows in past its size and settles" },
  { value: "bounce", name: "Bounce", hint: "springs in and wobbles to rest" },
  { value: "zoom", name: "Zoom down", hint: "shrinks in from bigger" },
  { value: "stretch", name: "Stretch up", hint: "grows up from its baseline, past its height and back" },
  { value: "rise", name: "Rise", hint: "slides up into place" },
  { value: "drop", name: "Drop", hint: "drops down into place" },
  { value: "slide-left", name: "Slide from right", hint: "slides in from the right" },
  { value: "slide-right", name: "Slide from left", hint: "slides in from the left" },
  { value: "blur", name: "Blur in", hint: "comes into focus" },
  { value: "type", name: "Type", hint: "typed out letter by letter" },
  { value: "wipe", name: "Wipe", hint: "revealed left to right" },
];

export type Ease = "linear" | "out" | "quint" | "in" | "in-out" | "back";

export interface TextMotion {
  kind: MotionKind;
  /** seconds (for type: per word, the letters spread over it) */
  dur: number;
  /** what moves on its own: each word as it's said, each line, or the whole caption at once */
  unit: "word" | "line" | "page";
  /** seconds between one word's start and the next's, when a line or caption comes on together */
  stagger?: number;
  /** pop and bounce: how far past its size it goes (0.12: to 112%) */
  overshoot?: number;
  /** pop, bounce and zoom: the scale it starts from */
  from?: number;
  /** rise, drop and slides: how far it travels, in font sizes */
  dist?: number;
  /** blur: how blurred it starts, in font sizes */
  blur?: number;
  ease?: Ease;
  /** seconds it takes to fade in, when that's quicker than the move (a line that's nearly there at once and slides on into place) */
  fade?: number;
  /** type: letters a second (the line or caption typed straight through, word after word); unset: each word over `dur` */
  rate?: number;
  /** type: a caret after the letters typed, blinking once they're all out */
  caret?: boolean;
  /** seconds it starts before its word is said, so it settles on the word */
  lead?: number;
}

export interface MotionState {
  alpha: number;
  scale: number;
  /** offsets, in font sizes */
  dx: number;
  dy: number;
  /** blur, in font sizes */
  blur: number;
  /** the share of its letters typed so far, 0 to 1 */
  letters: number;
  /** the share of its width a wipe has revealed, 0 to 1 */
  wipe: number;
  /** a stretch up from the baseline (its height only), 1 at rest */
  sy?: number;
}

export const AT_REST: MotionState = { alpha: 1, scale: 1, dx: 0, dy: 0, blur: 0, letters: 1, wipe: 1 };

const clamp01 = (u: number) => Math.min(1, Math.max(0, u));

/**
 * easeOutBack's constant for an overshoot: the curve 1 + (s+1)(u-1)^3 + s(u-1)^2 peaks at
 * 1 + 4s^3 / (27 (s+1)^2), so 1.70158 gives the classic 10%; found by halving.
 */
export function backConstant(overshoot: number): number {
  const o = Math.max(0, overshoot);
  if (o <= 0) return 0;
  let lo = 0;
  let hi = 60;
  for (let i = 0; i < 50; i++) {
    const s = (lo + hi) / 2;
    if ((4 * s ** 3) / (27 * (s + 1) ** 2) < o) lo = s;
    else hi = s;
  }
  return (lo + hi) / 2;
}

export function ease(e: Ease | undefined, u: number, overshoot = 0.1): number {
  u = clamp01(u);
  switch (e ?? "out") {
    case "linear":
      return u;
    case "in":
      return u * u * u;
    case "in-out":
      return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
    case "quint":
      // (Sharper than the cubic: most of the way in the first third.)
      return 1 - (1 - u) ** 5;
    case "back": {
      // An ease-out that runs past 1 by `overshoot` and settles back (easeOutBack, its
      // constant for that overshoot: 1.70158 gives the classic 10%).
      const s = backConstant(overshoot);
      const v = u - 1;
      return 1 + (s + 1) * v * v * v + s * v * v;
    }
    default:
      return 1 - (1 - u) ** 3;
  }
}

/**
 * The state `u` of the way through coming on (0 just starting, 1 at rest). Going off
 * is the same move played backwards: call it with 1 - (how far through going off).
 */
export function motionAt(m: TextMotion | null | undefined, u: number): MotionState {
  if (!m || m.kind === "none" || m.dur <= 0 || u >= 1) return AT_REST;
  if (u <= 0) return { ...AT_REST, alpha: 0 };
  const k = ease(m.ease, u, m.overshoot);
  // (Opacity comes up over the first third of a move, so a pop or a slide doesn't ghost.)
  const quick = clamp01(u * 3);
  const st = shape(m, u, k, quick);
  // Any move can come into focus as it goes (a zoom out of a blur).
  if (m.kind !== "blur" && m.blur) st.blur += m.blur * (1 - Math.min(1, k));
  // A fade of its own, quicker than the move.
  if (m.fade && m.fade > 0 && m.kind !== "type" && m.kind !== "wipe") st.alpha = ease(m.ease === "back" ? "out" : m.ease, (u * m.dur) / m.fade);
  return st;
}

function shape(m: TextMotion, u: number, k: number, quick: number): MotionState {
  switch (m.kind) {
    case "fade":
      return { ...AT_REST, alpha: k };
    case "pop": {
      // Past its full size by `overshoot` (0.1: to 110%), whatever size it starts from.
      const from = m.from ?? 0.6;
      const v = ease("back", u, (m.overshoot ?? 0.12) / Math.max(0.05, 1 - from));
      return { ...AT_REST, alpha: quick, scale: from + (1 - from) * v };
    }
    case "bounce": {
      // A damped spring: past its full size by `overshoot` a third of the way in, back under, settling.
      const from = m.from ?? 0.3;
      const k = -3 * Math.log(Math.min(0.9, Math.max(0.01, (m.overshoot ?? 0.15) / Math.max(0.05, 1 - from))));
      const v = 1 - Math.exp(-k * u) * Math.cos(3 * Math.PI * u);
      return { ...AT_REST, alpha: quick, scale: from + (1 - from) * v };
    }
    case "zoom": {
      const from = m.from ?? 1.6;
      return { ...AT_REST, alpha: quick, scale: from + (1 - from) * k };
    }
    case "stretch": {
      // Up from its baseline past its full height by `overshoot`, and back.
      const v = ease("back", u, m.overshoot ?? 0.2);
      return { ...AT_REST, alpha: quick, sy: Math.max(0, v) };
    }
    case "rise":
      return { ...AT_REST, alpha: Math.min(1, k), dy: (m.dist ?? 0.4) * (1 - k) };
    case "drop":
      return { ...AT_REST, alpha: Math.min(1, k), dy: -(m.dist ?? 0.4) * (1 - k) };
    case "slide-left":
      return { ...AT_REST, alpha: quick, dx: (m.dist ?? 0.8) * (1 - k) };
    case "slide-right":
      return { ...AT_REST, alpha: quick, dx: -(m.dist ?? 0.8) * (1 - k) };
    case "blur":
      return { ...AT_REST, alpha: k, blur: (m.blur ?? 0.3) * (1 - k) };
    case "type":
      return { ...AT_REST, letters: u };
    case "wipe":
      return { ...AT_REST, wipe: k };
  }
  return AT_REST;
}

/** The moment a word starts coming on: as it's said, with its line, or with the whole caption (staggered from there). */
export function onsetOf(m: TextMotion | null | undefined, word: { start: number }, lineStart: number, pageStart: number, indexInLine: number, indexInPage: number): number {
  if (!m) return word.start;
  if (m.unit === "word") return word.start;
  const st = m.stagger ?? 0;
  return m.unit === "line" ? lineStart + st * indexInLine : pageStart + st * indexInPage;
}

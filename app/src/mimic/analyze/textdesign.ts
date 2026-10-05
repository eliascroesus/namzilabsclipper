/**
 * A reference's richer captions read off it, as a TextDesign. Its caption words frame by
 * frame (measured in words.ts) are followed from frame to frame into captions: a caption
 * goes on while its words stay, gaining the ones that come on, and ends when they go. Each
 * caption's fullest frame shows its layout. Its words are sorted into styles by how they
 * look (their colour or gradient, a blend, a lean, their strokes, and then their size), the
 * commonest the base. A style that takes one word of a caption is a pick (the key word, the
 * last, the first, a number); one that takes whole captions is another look of its own
 * (a big word alone in the middle). Then: words a line and lines a caption, stacked lines
 * of different sizes or one size, words spread round the speaker, the places captions sit
 * in (and whether behind the speaker), how the words mix with the picture, and whether
 * they come on word by word or a caption at once.
 */
import { fontById } from "../../engine/text/library";
import type { TextMotion } from "../../engine/text/motion";
import type { Blend, Fill, TextCase, TextStyle } from "../../engine/text/style";
import { keyness } from "../design";
import type { CaptionPlace, DesignAlt, StylePick, TextDesign } from "../types";
import type { InkMask, RGB, WordBlend, WordInk } from "./words";

/** A caption word read on a frame. */
export interface SampleWord extends WordInk {
  /** the reader's confidence in its line */
  conf: number;
  /** behind the person or in front, when the frame showed */
  layer?: "behind" | "front";
  blend?: WordBlend | null;
  /** its letters, cut out (for matching the font) */
  mask?: InkMask | null;
}

export interface TextSample {
  t: number;
  words: SampleWord[];
}

/** A caption as read: its words at its fullest, in lines, and when it was on. */
export interface ReadCaption {
  start: number;
  end: number;
  lines: SampleWord[][];
  /** it gained words as it went (word by word) */
  grew: boolean;
  behind: boolean;
}

const letters = (s: string) => (s.match(/\p{L}|\p{N}/gu) ?? []).length;
const fold = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const median = (v: number[], d = 0) => {
  if (!v.length) return d;
  const s = [...v].sort((a, b) => a - b);
  return s[s.length >> 1];
};
const pct = (v: number[], p: number, d = 0) => {
  if (!v.length) return d;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
};
const hex = (c: RGB) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** A word's font size in pixels as a generic face draws it: from its lowercase, or its capitals. */
export function wordPx(w: Pick<WordInk, "text" | "xh" | "tall">, xhRatio = 0.53, capRatio = 0.72): number {
  return /\p{Ll}/u.test(w.text) ? w.xh / xhRatio : Math.max(w.xh, w.tall) / capRatio;
}

/** The same word on two frames: its letters alike and its box much where it was. */
function same(a: SampleWord, b: SampleWord): boolean {
  const fa = fold(a.text);
  const fb = fold(b.text);
  const h = Math.max(a.y1 - a.y0, b.y1 - b.y0, 4);
  const near = Math.abs((a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2) < Math.max(1.2 * h, 0.25 * (a.x1 - a.x0)) && Math.abs((a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2) < 0.8 * h;
  if (!near) return false;
  if (fa === fb) return true;
  // A misread letter, or a word half on (typed, wiped).
  const n = Math.min(fa.length, fb.length);
  let k = 0;
  while (k < n && fa[k] === fb[k]) k++;
  return n > 0 && k >= Math.max(1, Math.ceil(0.6 * n));
}

/** The words of one frame in lines: by baseline, a line's words left to right. */
export function linesOf(words: SampleWord[]): SampleWord[][] {
  const out: SampleWord[][] = [];
  for (const w of [...words].sort((a, b) => a.base - b.base)) {
    // (Against the smaller of the two: a small line under a giant word is a line of its own.)
    const line = out.find((l) => Math.abs(median(l.map((x) => x.base)) - w.base) < 0.55 * Math.min(median(l.map((x) => x.xh)), w.xh));
    if (line) line.push(w);
    else out.push([w]);
  }
  for (const l of out) l.sort((a, b) => a.x0 - b.x0);
  return out.sort((a, b) => median(a.map((x) => x.base)) - median(b.map((x) => x.base)));
}

/**
 * Frames of caption words into captions: a caption goes on while most of its words stay
 * (gaining the ones that come on) and ends when they go or others take their place.
 */
export function readCaptions(samples: TextSample[], step: number): ReadCaption[] {
  const out: ReadCaption[] = [];
  let cur: { start: number; last: number; frames: { t: number; words: SampleWord[] }[] } | null = null;
  const close = () => {
    if (!cur) return;
    // Its fullest frame (the latest of the fullest): the whole caption laid out.
    let best = cur.frames[0];
    for (const f of cur.frames) if (f.words.length >= best.words.length) best = f;
    const firstCount = cur.frames[0].words.length;
    const grew = cur.frames.length > 1 && best.words.length > firstCount;
    const layers = best.words.map((w) => w.layer).filter(Boolean);
    out.push({ start: Math.max(0, cur.start - step / 2), end: cur.last + step / 2, lines: linesOf(best.words), grew, behind: layers.filter((l) => l === "behind").length > layers.filter((l) => l === "front").length });
    cur = null;
  };
  for (const s of [...samples].sort((a, b) => a.t - b.t)) {
    if (!s.words.length) {
      close();
      continue;
    }
    if (cur) {
      const prev = cur.frames[cur.frames.length - 1].words;
      const kept = prev.filter((p) => s.words.some((w) => same(p, w))).length;
      const gone = prev.length - kept;
      const gap = s.t - cur.last > 1.5 * step + 1e-6;
      if (!gap && kept > 0 && gone <= Math.max(1, Math.floor(0.34 * prev.length))) {
        cur.frames.push({ t: s.t, words: s.words });
        cur.last = s.t;
        continue;
      }
      close();
    }
    cur = { start: s.t, last: s.t, frames: [{ t: s.t, words: s.words }] };
  }
  close();
  return out;
}

/** How a word looks, apart from its size. */
interface Look {
  color: RGB;
  grad: boolean;
  italic: boolean;
  stroke: number;
  blend: Blend;
}

const lab = (c: RGB): [number, number, number] => {
  const f = (v: number) => {
    const x = v / 255;
    return x > 0.04045 ? ((x + 0.055) / 1.055) ** 2.4 : x / 12.92;
  };
  const [r, g, b] = c.map(f);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.9505;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089;
  const t = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * t(Y) - 16, 500 * (t(X) - t(Y)), 200 * (t(Y) - t(Z))];
};
const dE = (a: RGB, b: RGB) => {
  const x = lab(a);
  const y = lab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

function appearance(w: SampleWord): Look {
  const blend = w.blend?.mode ?? "normal";
  const color = w.blend ? w.blend.color : w.grad ? ([0, 1, 2].map((c) => (w.grad!.from[c] + w.grad!.to[c]) / 2) as RGB) : w.color;
  return { color, grad: !!w.grad && !w.blend, italic: w.slant >= 0.12, stroke: w.stroke, blend };
}

/** How unlike two looks are: about 1 is another style. */
function lookDistance(a: Look, b: Look): number {
  return dE(a.color, b.color) / 32 + (a.grad !== b.grad ? 0.9 : 0) + (a.italic !== b.italic ? 1.2 : 0) + Math.abs(a.stroke - b.stroke) / 0.1 + (a.blend !== b.blend ? 0.8 : 0);
}

/** A caption word with what the design needs of it. */
interface Item {
  w: SampleWord;
  cap: number;
  line: number;
  look: Look;
  /** font size over the frame's height (a generic face's), its log */
  size: number;
  ls: number;
  group: number;
  style: number;
}

/** Weight from stroke thickness over the lowercase's height (a compressed video's letters read a shade heavy). */
const weightOf = (stroke: number) => (stroke < 0.17 ? 400 : stroke < 0.21 ? 500 : stroke < 0.24 ? 600 : stroke < 0.28 ? 700 : stroke < 0.32 ? 800 : 900);

/** The case most of some words are in. */
function caseOf(words: string[]): TextCase {
  const ws = words.filter((w) => letters(w) >= 2);
  if (!ws.length) return "as-said";
  const up = ws.filter((w) => w === w.toUpperCase() && /\p{Lu}/u.test(w)).length;
  const low = ws.filter((w) => w === w.toLowerCase()).length;
  const title = ws.filter((w) => /^\P{L}*\p{Lu}[^\p{Lu}]*$/u.test(w)).length;
  if (up >= 0.8 * ws.length) return "upper";
  if (low >= 0.85 * ws.length) return "lower";
  if (title >= 0.8 * ws.length) return "title";
  return "as-said";
}

/**
 * A face for a style from how its letters measure, until the page matches fonts by eye
 * (fontmatch.ts): an italic is the serif accent; narrow letters a condensed face; wide
 * ones TikTok Sans widened; the rest Inter.
 */
function faceFor(items: Item[], H: number): { font: string; stretch?: number; italic: boolean } {
  const italic = items.filter((i) => i.look.italic).length > items.length / 2;
  if (italic) return { font: "instrument-serif", italic: true };
  // Ink across a letter, over the font size.
  const per = median(items.map((i) => (i.w.x1 - i.w.x0 + 1) / Math.max(1, letters(i.w.text)) / Math.max(1, i.size * H)));
  if (per < 0.42) {
    const lower = items.filter((i) => /\p{Ll}/u.test(i.w.text)).length > items.length / 2;
    return { font: lower ? "oswald" : median(items.map((i) => i.w.stroke)) >= 0.17 ? "anton" : "bebas", italic: false };
  }
  if (per > 0.66) return { font: "tiktok-sans", stretch: per > 0.78 ? 150 : 125, italic: false };
  return { font: "inter", italic: false };
}

/** The colour (or gradient) most of a style's words have. */
function fillFor(items: Item[]): Fill {
  const grads = items.filter((i) => i.w.grad && !i.w.blend);
  if (grads.length > items.length / 2) {
    const g = grads.map((i) => i.w.grad!);
    // (Angles folded to 0 to 180, the ends swapped to match.)
    const angle = Math.round(median(g.map((x) => x.angle)));
    const from = [0, 1, 2].map((c) => median(g.map((x) => x.from[c]))) as RGB;
    const to = [0, 1, 2].map((c) => median(g.map((x) => x.to[c]))) as RGB;
    return { kind: "linear", colors: [hex(from), hex(to)], angle };
  }
  return { kind: "solid", color: hex([0, 1, 2].map((c) => median(items.map((i) => i.look.color[c]))) as RGB) };
}

/**
 * Where a set of caption blocks sit: their anchors (the side the lines line up on, the
 * middle down) gathered into a few places, the most used first.
 */
function placesOf(blocks: { x0: number; x1: number; y0: number; y1: number; align: CaptionPlace["align"]; behind: boolean }[]): CaptionPlace[] {
  const anchors = blocks.map((b) => ({ x: b.align === "left" ? b.x0 : b.align === "right" ? b.x1 : (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, b }));
  const groups: (typeof anchors)[] = [];
  for (const a of anchors) {
    const g = groups.find((gr) => gr[0].b.align === a.b.align && Math.hypot(median(gr.map((x) => x.x)) - a.x, median(gr.map((x) => x.y)) - a.y) < 0.12);
    if (g) g.push(a);
    else groups.push([a]);
  }
  groups.sort((p, q) => q.length - p.length);
  // A place used once in a long video is a one-off: kept only when there's little else.
  const kept = groups.filter((g, i) => i < 4 && (g.length >= 2 || i === 0 || groups.length <= 3));
  return kept.map((g) => ({
    x: r3(median(g.map((a) => a.x))),
    y: r3(median(g.map((a) => a.y))),
    align: g[0].b.align,
    valign: "middle" as const,
    width: r3(Math.min(0.92, Math.max(0.2, pct(g.map((a) => a.b.x1 - a.b.x0), 0.9) + 0.06))),
    ...(g.filter((a) => a.b.behind).length > g.length / 2 ? { behind: true } : {}),
  }));
}

/** How a caption block's lines line up: their left edges, middles or right edges the least spread. */
function alignOf(lines: { x0: number; x1: number }[]): CaptionPlace["align"] {
  if (lines.length < 2) return "center";
  const sd = (v: number[]) => {
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
  };
  const l = sd(lines.map((x) => x.x0));
  const c = sd(lines.map((x) => (x.x0 + x.x1) / 2));
  const r = sd(lines.map((x) => x.x1));
  return l <= c && l <= r ? "left" : r < c ? "right" : "center";
}

export interface DesignReading {
  design: TextDesign;
  captions: ReadCaption[];
  /** what was found, in a few words each, for the page */
  notes: string[];
  /** each style's clearest words (big, read surely, their letters cut out), to match its font by */
  specimens: SampleWord[][];
}

/**
 * The design of a reference's captions from its caption words frame by frame (`step`
 * seconds apart), on a W × H picture. Null when there are too few captions to tell.
 */
/** A screen of an app's interface: ten words or more at once, mostly small, on four lines or more (a list, a chat). */
export function interfaceScreen(words: Pick<SampleWord, "xh" | "base">[], H: number): boolean {
  if (words.length < 10) return false;
  const xs = words.map((w) => w.xh).sort((a, b) => a - b);
  const xh = xs[xs.length >> 1];
  if (xh >= 0.045 * H) return false;
  const bases = words.map((w) => w.base).sort((a, b) => a - b);
  let rows = 1;
  for (let i = 1; i < bases.length; i++) if (bases[i] - bases[i - 1] > xh) rows++;
  return rows >= 4;
}

export function readDesign(samples: TextSample[], W: number, H: number, step: number): DesignReading | null {
  // Caption words: read with some confidence, big enough to be captions (not a picture's small
  // print), and not on a screen of an app's interface (lines of a list or a chat, many at once).
  const clean = samples.map((s) => {
    const words = s.words.filter((w) => w.conf >= 0.6 && letters(w.text) >= 1 && wordPx(w) / H >= 0.028);
    return { t: s.t, words: interfaceScreen(words, H) ? [] : words };
  });
  const lum = (c: RGB) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const sat = (c: RGB) => (Math.max(...c) - Math.min(...c)) / Math.max(1, Math.max(...c));
  let caps = readCaptions(clean, step).filter((c) => {
    const ws = c.lines.flat();
    if (ws.length > 14 || c.end - c.start < step * 0.9) return false;
    // (Held still for longer than anyone reads a caption: a screen's writing.)
    return !(c.end - c.start > 4.5 && !c.grew);
  });
  if (caps.length < 3) return null;
  // White letters mixed in by difference read as the picture turned inside out: light over
  // the dark, dark over the light. When a few words show it plainly (over a light
  // picture), every word whose colour is its backdrop's inverse is taken as mixed so.
  const inverse = (w: SampleWord) => w.bg.every((b, c) => Math.abs(b + w.color[c] - 255) < 45);
  const lightUnder = (w: SampleWord) => 0.299 * w.bg[0] + 0.587 * w.bg[1] + 0.114 * w.bg[2] > 100;
  const flat = caps.flatMap((c) => c.lines.flat());
  // (A few, not a stray two of a long video's hundreds: white over black is its own inverse too.)
  if (flat.filter((w) => w.blend?.mode === "difference" || (inverse(w) && lightUnder(w))).length >= Math.max(2, 0.08 * flat.length))
    for (const w of flat) if (!w.blend && inverse(w)) w.blend = { mode: "difference", color: [255, 255, 255], opacity: 1, gain: 0.5 };
  // Mid grey, mixed in plainly: an interface's secondary text, not a caption's white, black or colour.
  caps = caps.filter((c) => {
    const ws = c.lines.flat();
    return ws.filter((w) => !w.blend && !w.grad && sat(w.color) < 0.12 && lum(w.color) > 45 && lum(w.color) < 165).length <= ws.length / 2;
  });
  if (caps.length < 3) return null;
  // Every caption's words, with how they look.
  let items: Item[] = [];
  caps.forEach((c, ci) =>
    c.lines.forEach((ln, li) =>
      ln.forEach((w) => {
        const size = wordPx(w) / H;
        items.push({ w, cap: ci, line: li, look: appearance(w), size, ls: Math.log(size), group: -1, style: -1 });
      }),
    ),
  );
  // Looks: each word joins the nearest group like it (biggest words first), or starts one.
  const groups: { look: Look; n: number }[] = [];
  for (const it of [...items].sort((a, b) => b.size - a.size)) {
    let best = -1;
    let bd = 1;
    groups.forEach((g, gi) => {
      const d = lookDistance(it.look, g.look);
      if (d < bd) [best, bd] = [gi, d];
    });
    if (best < 0) {
      groups.push({ look: { ...it.look }, n: 1 });
      it.group = groups.length - 1;
    } else {
      const g = groups[best];
      // (The group's look follows its words: a running mean.)
      g.look.color = [0, 1, 2].map((c) => (g.look.color[c] * g.n + it.look.color[c]) / (g.n + 1)) as RGB;
      g.look.stroke = (g.look.stroke * g.n + it.look.stroke) / (g.n + 1);
      g.n++;
      it.group = best;
    }
  }
  // Sizes within a look: a jump of half as big again or more between sizes starts another.
  type Style = { group: number; items: Item[]; size: number };
  const styles: Style[] = [];
  groups.forEach((_, gi) => {
    const its = items.filter((i) => i.group === gi).sort((a, b) => a.ls - b.ls);
    let cur: Item[] = [];
    const flush = () => cur.length && styles.push({ group: gi, items: cur, size: Math.exp(median(cur.map((i) => i.ls))) });
    its.forEach((it, k) => {
      if (k && it.ls - its[k - 1].ls > Math.log(1.45)) {
        flush();
        cur = [];
      }
      cur.push(it);
    });
    flush();
  });
  // The commonest is the base; rare ones fold into the nearest unless they look apart.
  styles.sort((a, b) => b.items.length - a.items.length);
  const total = items.length;
  const kept: Style[] = [];
  // (A look in only one caption that's nothing out of the ordinary, a dull colour at the
  // base's size, is more likely writing in the picture than a style.)
  for (const s of styles) {
    const lk = groups[s.group].look;
    const striking = sat(lk.color) > 0.3 || lk.italic || lk.grad || lk.blend !== "normal" || (kept.length > 0 && s.size > 1.6 * kept[0].size);
    const rare = s.items.length < Math.max(2, 0.03 * total) || (new Set(s.items.map((i) => i.cap)).size < 2 && !striking);
    if (kept.length < 4 && (!rare || !kept.length)) kept.push(s);
    else {
      // Into the kept style nearest in look and size.
      let best = kept[0];
      let bd = Infinity;
      for (const k of kept) {
        const d = lookDistance(groups[s.group].look, groups[k.group].look) + Math.abs(Math.log(s.size / k.size)) / Math.log(1.45);
        if (d < bd) [best, bd] = [k, d];
      }
      best.items.push(...s.items);
    }
  }
  // Dark grey writing in a few captions is the picture's own (a sign, a screen), not a
  // caption style: captions need contrast over video, and get it from light or bright letters.
  const dull = (st: Style) => {
    const lk = groups[st.group].look;
    return lum(lk.color) < 70 && sat(lk.color) < 0.25 && lk.blend === "normal" && new Set(st.items.map((i) => i.cap)).size < 0.3 * caps.length;
  };
  for (let si = kept.length - 1; si > 0; si--) if (dull(kept[si])) kept.splice(si, 1);
  kept.forEach((st, si) => st.items.forEach((i) => (i.style = si)));
  // (Their words, and captions left with none, go.)
  const live = new Set(items.filter((i) => kept.some((st) => st.items.includes(i))));
  const remap = new Map<number, number>();
  caps = caps.filter((c, ci) => {
    c.lines = c.lines.map((ln) => ln.filter((w) => items.some((i) => i.w === w && live.has(i)))).filter((ln) => ln.length);
    if (c.lines.length) remap.set(ci, remap.size);
    return c.lines.length > 0;
  });
  items = items.filter((i) => live.has(i)).map((i) => Object.assign(i, { cap: remap.get(i.cap)! }));
  if (caps.length < 3) return null;
  // Each style as the engine draws it.
  const ids = ["base", "accent", "accent2", "accent3"];
  const textStyles: TextStyle[] = kept.map((s, si) => {
    const face = faceFor(s.items, H);
    const f = fontById(face.font);
    const lower = s.items.filter((i) => /\p{Ll}/u.test(i.w.text));
    // The font size from the lowercase (or the capitals) as this face draws them.
    const px = lower.length >= s.items.length / 2 ? median(lower.map((i) => i.w.xh)) / f.metrics.xh : median(s.items.map((i) => Math.max(i.w.xh, i.w.tall))) / f.metrics.cap;
    const blends = s.items.map((i) => i.w.blend).filter(Boolean) as WordBlend[];
    const blend: Blend = blends.length > s.items.length / 2 ? mostCommon(blends.map((b) => b.mode)) : "normal";
    const mixed = blends.filter((b) => b.mode === blend);
    const fill: Fill = blend !== "normal" ? { kind: "solid", color: hex([0, 1, 2].map((c) => median(mixed.map((b) => b.color[c]))) as RGB) } : fillFor(s.items);
    const opacity = blend !== "normal" ? r3(median(mixed.map((b) => b.opacity), 1)) : 1;
    return {
      id: ids[si],
      name: si === 0 ? "Base" : `Accent ${si}`,
      font: face.font,
      weight: Math.min(f.weights[1], Math.max(f.weights[0], weightOf(median(s.items.map((i) => i.w.stroke))))),
      italic: face.italic,
      ...(face.stretch ? { stretch: face.stretch } : {}),
      case: caseOf(s.items.map((i) => i.w.text)),
      size: r3(px / H),
      tracking: -0.01,
      fill,
      stroke: null,
      shadow: blend === "normal" && dE(hexRgb(fill), [255, 255, 255]) < 30 ? { color: "rgba(0,0,0,0.3)", blur: 0.2, x: 0, y: 0.03 } : null,
      glow: null,
      box: null,
      opacity,
      blend,
    };
  });
  // Captions all in one non-base style are that style's own look; one word of a caption in it, a pick.
  const capStyle = caps.map((_, ci) => {
    const its = items.filter((i) => i.cap === ci);
    const counts = new Map<number, number>();
    for (const i of its) counts.set(i.style, (counts.get(i.style) ?? 0) + 1);
    const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return top && top[0] > 0 && top[1] >= 0.8 * its.length ? top[0] : -1;
  });
  // (A one-word caption in another style is as much a pick as a look of its own: a look
  // takes longer captions, or sets its words far bigger than the base's.)
  for (let si = 1; si < kept.length; si++) {
    const own = caps.map((_, ci) => ci).filter((ci) => capStyle[ci] === si);
    if (own.length && median(own.map((ci) => caps[ci].lines.flat().length)) < 1.5 && kept[si].size < 1.6 * kept[0].size) own.forEach((ci) => (capStyle[ci] = -1));
  }
  // Spread captions: a line's words far apart (a gap over one and a half times their size).
  const spread = caps.map((c) =>
    c.lines.some((ln) =>
      ln.slice(1).some((w, k) => {
        const px = Math.max(wordPx(w), wordPx(ln[k]));
        return w.x0 - ln[k].x1 > 1.5 * px;
      }),
    ),
  );
  const blockOf = (c: ReadCaption) => {
    const lines = c.lines.map((ln) => ({ x0: Math.min(...ln.map((w) => w.x0)) / W, x1: Math.max(...ln.map((w) => w.x1)) / W, y0: Math.min(...ln.map((w) => w.y0)) / H, y1: Math.max(...ln.map((w) => w.y1)) / H }));
    return { x0: Math.min(...lines.map((l) => l.x0)), x1: Math.max(...lines.map((l) => l.x1)), y0: Math.min(...lines.map((l) => l.y0)), y1: Math.max(...lines.map((l) => l.y1)), align: alignOf(lines), behind: c.behind };
  };
  const base = caps.map((_, ci) => ci).filter((ci) => capStyle[ci] < 0 && !spread[ci]);
  const baseCaps = base.length >= 2 ? base : caps.map((_, ci) => ci);
  // Picks: which word of a caption a style takes, by the rule most of its words keep.
  const picks: StylePick[] = [];
  for (let si = 1; si < kept.length; si++) {
    const with_ = baseCaps.filter((ci) => items.some((i) => i.cap === ci && i.style === si));
    if (!with_.length) continue;
    const votes = { keyword: 0, last: 0, first: 0, number: 0 };
    for (const ci of with_) {
      const flat = caps[ci].lines.flat();
      const at = flat.findIndex((w) => items.find((i) => i.w === w)?.style === si);
      if (at < 0) continue;
      const kn = flat.map((w) => keyness(w.text));
      if (kn[at] >= Math.max(...kn) - 1e-9 && kn[at] > 2.5) votes.keyword++;
      if (at === flat.length - 1) votes.last++;
      if (at === 0) votes.first++;
      if (/\d/.test(flat[at].text)) votes.number++;
    }
    const rule = (Object.entries(votes) as [StylePick["rule"], number][]).sort((a, b) => b[1] - a[1])[0][0];
    picks.push({ style: ids[si], rule, share: r3(Math.min(1, with_.length / baseCaps.length)) });
  }
  // The base look's layout: words a line, lines a caption, one size a line or each word its own.
  const bl = baseCaps.map((ci) => caps[ci]);
  const words = Math.max(1, Math.round(pct(bl.flatMap((c) => c.lines.map((l) => l.length)), 0.9, 3)));
  const nLines = Math.max(1, Math.min(4, Math.round(pct(bl.map((c) => c.lines.length), 0.9, 1))));
  const multi = bl.filter((c) => c.lines.length >= 2);
  const mixedSizes = multi.filter((c) => {
    const s = c.lines.map((ln) => median(ln.map((w) => wordPx(w))));
    return Math.max(...s) / Math.max(1, Math.min(...s)) > 1.3;
  });
  const sameLineMix = bl.filter((c) => c.lines.some((ln) => ln.length > 1 && Math.max(...ln.map((w) => wordPx(w))) / Math.max(1, Math.min(...ln.map((w) => wordPx(w)))) > 1.3));
  const layout: TextDesign["layout"] = mixedSizes.length >= Math.max(1, 0.25 * multi.length) || sameLineMix.length >= Math.max(1, 0.2 * bl.length) || picks.some((p) => (textStyles[ids.indexOf(p.style)]?.size ?? 0) > 1.3 * textStyles[0].size) ? "stack" : "lines";
  // Leading: baseline to baseline over the bigger line's cap height, as layoutDesign stacks them.
  const leads: number[] = [];
  for (const c of multi)
    for (let i = 1; i < c.lines.length; i++) {
      const a = c.lines[i - 1];
      const b = c.lines[i];
      const pa = median(a.map((w) => wordPx(w)));
      const pb = median(b.map((w) => wordPx(w)));
      const gap = median(b.map((w) => w.base)) - median(a.map((w) => w.base));
      const up = 0.72 * Math.max(pa, pb);
      leads.push(1 + (gap - 0.72 * pb - 0.22 * 0.55 * pa) / up);
    }
  const leading = r3(Math.max(0.7, Math.min(1.6, median(leads, 1.05))));
  const places = placesOf(baseCaps.map((ci) => blockOf(caps[ci])));
  // Behind the speaker, beyond the places that always are.
  const behindCaps = baseCaps.filter((ci) => caps[ci].behind);
  const placeBehind = places.some((p) => p.behind);
  const behindStyle = (() => {
    if (!behindCaps.length || placeBehind) return undefined;
    const counts = new Map<number, number>();
    for (const ci of behindCaps) for (const i of items.filter((x) => x.cap === ci && x.style > 0)) counts.set(i.style, (counts.get(i.style) ?? 0) + 1);
    const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return top && top[1] >= 0.7 * behindCaps.length ? ids[top[0]] : undefined;
  })();
  // Other looks: whole captions in one style, and words spread round the speaker.
  const alts: DesignAlt[] = [];
  for (let si = 1; si < kept.length; si++) {
    const own = caps.map((_, ci) => ci).filter((ci) => capStyle[ci] === si);
    if (own.length < 1 || own.length < 0.05 * caps.length) continue;

    const oc = own.map((ci) => caps[ci]);
    alts.push({
      rule: "keyword",
      share: r3(own.length / caps.length),
      style: ids[si],
      layout: own.some((ci) => spread[ci]) ? "spread" : "lines",
      words: Math.max(1, Math.round(pct(oc.flatMap((c) => c.lines.map((l) => l.length)), 0.9, 2))),
      lines: Math.max(1, Math.round(pct(oc.map((c) => c.lines.length), 0.9, 1))),
      places: placesOf(own.map((ci) => blockOf(caps[ci]))),
      ...(oc.filter((c) => c.behind).length > oc.length / 2 ? { behind: true } : {}),
    });
  }
  const spreadOwn = caps.map((_, ci) => ci).filter((ci) => spread[ci] && capStyle[ci] < 0);
  if (spreadOwn.length >= Math.max(1, 0.05 * caps.length)) {
    const oc = spreadOwn.map((ci) => caps[ci]);
    alts.push({
      rule: "turn",
      share: r3(spreadOwn.length / caps.length),
      layout: "spread",
      words: Math.max(2, Math.round(pct(oc.flatMap((c) => c.lines.map((l) => l.length)), 0.9, 2))),
      lines: 1,
      places: placesOf(spreadOwn.map((ci) => ({ ...blockOf(caps[ci]), align: "center" as const }))),
      ...(oc.filter((c) => c.behind).length > oc.length / 2 ? { behind: true } : {}),
    });
  }
  // How words come on: one by one as they're said when captions grow, else a caption at once.
  const long = caps.filter((c) => c.end - c.start > 2 * step && c.lines.flat().length > 1);
  const byWord = long.filter((c) => c.grew).length >= Math.max(1, 0.4 * long.length);
  const enter: TextMotion = byWord ? { kind: "pop", dur: 0.2, unit: "word", from: 0.7, overshoot: 0.08 } : { kind: "fade", dur: 0.15, unit: "page" };
  const design: TextDesign = {
    styles: textStyles,
    picks: picks.filter((p) => !alts.some((a) => a.style === p.style) || p.share >= 0.1),
    layout,
    leading,
    words,
    lines: nLines,
    places: places.length ? places : [{ x: 0.5, y: 0.62, align: "center", valign: "middle", width: 0.8 }],
    behind: { share: placeBehind ? 0 : r3(behindCaps.length / Math.max(1, baseCaps.length)), ...(behindStyle ? { style: behindStyle } : {}) },
    enter,
    exit: { kind: "fade", dur: 0.12, unit: "page" },
    ...(alts.length ? { alts } : {}),
  };
  const notes: string[] = [];
  notes.push(`${caps.length} captions in ${textStyles.length} style${textStyles.length > 1 ? "s" : ""}${layout === "stack" ? ", stacked in lines of different sizes" : ""}.`);
  for (const s of textStyles.slice(1)) notes.push(`${s.name}: ${s.italic ? "an italic " : ""}${s.fill.kind === "linear" ? "a gradient" : s.fill.kind === "solid" ? s.fill.color : ""}, ${Math.round((s.size / textStyles[0].size) * 10) / 10} times the base's size${s.blend !== "normal" ? `, mixed in by ${s.blend}` : ""}.`);
  if (textStyles[0].blend !== "normal") notes.push(`The words are mixed into the picture by ${textStyles[0].blend}.`);
  if (behindCaps.length) notes.push(`${behindCaps.length} caption${behindCaps.length > 1 ? "s" : ""} behind the speaker.`);
  if (alts.length) notes.push(`${alts.length} other look${alts.length > 1 ? "s" : ""} (${alts.map((a) => (a.layout === "spread" ? "words spread across" : "a word or two on their own")).join(", ")}).`);
  // Each style's clearest words: read surely, three letters or more, the biggest first, one of each.
  const specimens = kept.map((st) => {
    const seen = new Set<string>();
    return st.items
      .map((i) => i.w)
      .filter((w) => w.mask && w.conf >= 0.9 && letters(w.text) >= 3 && !/[^\p{L}\p{N}'’]/u.test(w.text.trim()))
      .sort((a, b) => b.xh - a.xh)
      .filter((w) => !seen.has(fold(w.text)) && (seen.add(fold(w.text)), true))
      .slice(0, 4);
  });
  return { design, captions: caps, notes, specimens };
}

function mostCommon<T>(v: T[]): T {
  const m = new Map<T, number>();
  for (const x of v) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

const hexRgb = (f: Fill): RGB => {
  const c = f.kind === "solid" ? f.color : f.colors[0];
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

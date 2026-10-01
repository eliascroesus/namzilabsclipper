/**
 * The richer captions (a TextDesign): the words broken into short captions, a word in
 * each picked out for another style (the key word, or the last), each caption laid out
 * as a block of lines whose words keep their own style's size (a small "in the" over a
 * big gradient "wrong"), set in the reference's places in turn (beside the head, over
 * it), some behind the speaker, and drawn word by word as they come on and go off.
 */
import { motionAt, onsetOf, type MotionState, type TextMotion } from "../engine/text/motion";
import { drawBox, drawWord, measureWord, type Box } from "../engine/text/paint";
import { cased, fontOf, PLAIN_STYLE, type TextStyle } from "../engine/text/style";
import type { CaptionPage, PlanWord, StylePick, TextDesign } from "./types";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const ends = (w: string) => /[.!?…]["”')\]]*$/.test(w);
const pauses = (w: string) => /[,;:–-]["”')\]]*$/.test(w);
const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

/** Words too common to be a caption's key word. */
const COMMON = new Set(
  "a an the and or but so if then than that this these those to of in on at by for with from as is are was were be been being am i you he she it we they me him her us them my your his its our their what which who whom whose when where why how not no yes do does did done have has had will would can could should shall may might must just very really also too all any some there here about into out up down over under again more most much many such only own same other each few both before after while because until though although just like get got go going gonna wanna gotta know think say said make made thing things way well right now one two".split(
    " ",
  ),
);

/** How much a word stands out as the caption's key word: long and uncommon, a number, a name. */
export function keyness(w: string): number {
  const b = bare(w);
  if (!b) return 0;
  if (/\d/.test(b)) return 3;
  if (COMMON.has(b)) return 0.1;
  return b.length + (/^\p{Lu}/u.test(w.trim()) ? 1.5 : 0);
}

/** Which word of a caption a pick lands on, or -1. */
function pickIn(words: PlanWord[], rule: StylePick["rule"]): number {
  if (!words.length) return -1;
  switch (rule) {
    case "first":
      return 0;
    case "last":
      return words.length - 1;
    case "number":
      return words.findIndex((w) => /\d/.test(w.text));
    case "marked":
      return words.findIndex((w) => w.mark);
    default: {
      let best = -1;
      let bv = 2.5;
      words.forEach((w, i) => {
        const v = keyness(w.text);
        if (v > bv) [best, bv] = [i, v];
      });
      return best;
    }
  }
}

/**
 * Words into the design's captions: at most `words` a line and `lines` a caption, a new
 * caption after a sentence's end or a pause of 0.35 s or more, a new line after a comma
 * once a line has half its words (breaks typed by the user first, as in paginate). Each
 * caption then gets its picks (the styles' words), its place (the reference's in turn)
 * and whether it's behind the speaker.
 */
export function designPages(words: PlanWord[], d: TextDesign): CaptionPage[] {
  const pages: CaptionPage[] = [];
  let lines: PlanWord[][] = [];
  let line: PlanWord[] = [];
  const flushPage = () => {
    if (line.length) lines.push(line);
    line = [];
    if (lines.length) pages.push({ start: lines[0][0].start, end: lines[lines.length - 1][lines[lines.length - 1].length - 1].end, lines });
    lines = [];
  };
  const flushLine = () => {
    if (line.length) lines.push(line);
    line = [];
    if (lines.length >= Math.max(1, d.lines)) flushPage();
  };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (prev && prev.br !== "line" && w.start - prev.end >= 0.35) flushPage();
    if (line.length >= Math.max(1, d.words)) flushLine();
    line.push({ ...w, style: undefined });
    if (w.br === "page") flushPage();
    else if (w.br === "line") flushLine();
    else if (ends(w.text)) flushPage();
    else if (pauses(w.text) && line.length * 2 >= d.words && words[i + 1]) flushLine();
  });
  flushPage();
  // Each caption until the next starts (or a moment past its last word).
  for (let i = 0; i < pages.length; i++) pages[i].end = Math.min(pages[i + 1]?.start ?? Infinity, pages[i].end + 0.25);
  // The picks: each rule on its share of captions, spread evenly, a word taking only one.
  for (const p of d.picks) {
    if (!d.styles.some((s) => s.id === p.style) || p.share <= 0) continue;
    let owed = 0;
    for (const page of pages) {
      owed += p.share;
      if (owed < 1 - 1e-9 && p.rule !== "marked") continue;
      const flat = page.lines.flat();
      const i = pickIn(flat, p.rule);
      if (i < 0 || flat[i].style) continue;
      flat[i].style = p.style;
      owed -= 1;
    }
  }
  // Places in turn, and behind the speaker: the captions in a place the reference sets
  // behind, or every so many (by share), or those with a word in the given style.
  let owed = 0;
  pages.forEach((page, k) => {
    page.place = d.places.length ? k % d.places.length : undefined;
    const place = page.place !== undefined ? d.places[page.place] : undefined;
    owed += d.behind.share;
    const styled = !d.behind.style || page.lines.flat().some((w) => w.style === d.behind.style);
    if (place?.behind || (owed >= 1 - 1e-9 && styled)) {
      page.behind = true;
      owed = Math.max(0, owed - 1);
    }
  });
  return pages;
}

export const styleOf = (d: TextDesign, id: string | undefined): TextStyle => d.styles.find((s) => s.id === id) ?? d.styles[0] ?? PLAIN_STYLE;

/** How far in from the frame's edges a caption keeps (a share of the frame). */
const SAFE = 0.04;

export interface LaidWord {
  text: string;
  start: number;
  end: number;
  style: TextStyle;
  px: number;
  /** left edge and baseline */
  x: number;
  y: number;
  width: number;
  line: number;
  /** its place among the caption's words, and its line's */
  index: number;
  inLine: number;
}

export interface LaidDesign {
  words: LaidWord[];
  /** each line's box (pixels) */
  lines: Box[];
  block: Box;
}

/** Where every word of a design's caption goes on a W × H frame. */
export function layoutDesign(ctx: Ctx, d: TextDesign, page: CaptionPage, W: number, H: number): LaidDesign {
  const place = d.places[page.place ?? 0] ?? { x: 0.5, y: 0.62, align: "center" as const, valign: "middle" as const, width: 0.8 };
  // Each line at its words' own sizes.
  type Row = { words: { w: PlanWord; style: TextStyle; px: number; width: number; text: string }[]; width: number; up: number; down: number };
  const rows: Row[] = page.lines.map((ln) => {
    const words = ln.map((w) => {
      const style = d.layout === "stack" ? styleOf(d, w.style) : { ...styleOf(d, w.style), size: styleOf(d, undefined).size };
      const px = style.size * H;
      const text = cased(w.text, style.case);
      return { w, style, px, width: measureWord(ctx, style, px, text).width, text };
    });
    // (A space as wide as the smaller of the two words' own spaces: a quarter of its size.)
    const gaps = words.slice(1).map((x, i) => 0.25 * Math.min(x.px, words[i].px));
    const width = words.reduce((a, x) => a + x.width, 0) + gaps.reduce((a, g) => a + g, 0);
    const up = Math.max(...words.map((x) => fontOf(x.style).metrics.cap * x.px));
    const down = Math.max(...words.map((x) => fontOf(x.style).metrics.desc * 0.55 * x.px));
    return { words, width, up, down };
  });
  // A line wider than the place allows is shrunk on its own (a long key word doesn't shrink the rest).
  const room = Math.min(place.width, 1 - 2 * SAFE) * W;
  const ks = rows.map((r) => (r.width > room ? room / r.width : 1));
  // Lines stacked baseline to baseline: the leading on the bigger line's cap height.
  const baselines: number[] = [];
  let y = 0;
  rows.forEach((r, i) => {
    const k = ks[i];
    if (i === 0) y = r.up * k;
    else y += Math.max(r.up * k, rows[i - 1].up * ks[i - 1]) * (d.leading - 1) + r.up * k + rows[i - 1].down * ks[i - 1] * 0.4;
    baselines.push(y);
  });
  const height = (baselines[baselines.length - 1] ?? 0) + (rows[rows.length - 1]?.down ?? 0) * ks[ks.length - 1];
  let top = place.valign === "top" ? place.y * H : place.valign === "bottom" ? place.y * H - height : place.y * H - height / 2;
  // (Kept inside the frame's safe margins.)
  top = Math.min(H * (1 - SAFE) - height, Math.max(H * SAFE, top));
  const words: LaidWord[] = [];
  const lines: Box[] = [];
  let index = 0;
  rows.forEach((r, li) => {
    const k = ks[li];
    const lw = r.width * k;
    let x0 = place.align === "left" ? place.x * W : place.align === "right" ? place.x * W - lw : place.x * W - lw / 2;
    x0 = Math.min(W * (1 - SAFE) - lw, Math.max(W * SAFE, x0));
    const base = top + baselines[li];
    let x = x0;
    r.words.forEach((x_, j) => {
      const px = x_.px * k;
      words.push({ text: x_.text, start: x_.w.start, end: x_.w.end, style: x_.style, px, x, y: base, width: x_.width * k, line: li, index: index++, inLine: j });
      x += x_.width * k + (j + 1 < r.words.length ? 0.25 * Math.min(px, r.words[j + 1].px * k) : 0);
    });
    lines.push({ x0, x1: x0 + lw, y0: base - r.up * k, y1: base + r.down * k });
  });
  const block = lines.reduce((b, l) => ({ x0: Math.min(b.x0, l.x0), y0: Math.min(b.y0, l.y0), x1: Math.max(b.x1, l.x1), y1: Math.max(b.y1, l.y1) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  return { words, lines, block };
}

/** A word's state at t: coming on from its onset, going off with its caption. */
export function wordState(d: TextDesign, laid: LaidDesign, w: LaidWord, page: CaptionPage, t: number): MotionState {
  const base = d.styles[0];
  const enter: TextMotion = (w.style !== base && d.accentEnter) || d.enter;
  const lineStart = laid.words.find((x) => x.line === w.line)?.start ?? w.start;
  const on = onsetOf(enter, w, lineStart, page.start, w.inLine, w.index);
  if (t < on - 1e-6) return { alpha: 0, scale: 1, dx: 0, dy: 0, blur: 0, letters: 0, wipe: 0 };
  const inn = motionAt(enter, enter.dur > 0 ? (t - on) / enter.dur : 1);
  const ex = d.exit;
  if (!ex || ex.kind === "none" || ex.dur <= 0 || t < page.end - ex.dur) return inn;
  const out = motionAt(ex, (page.end - t) / ex.dur);
  return { alpha: inn.alpha * out.alpha, scale: inn.scale * out.scale, dx: inn.dx + out.dx, dy: inn.dy + out.dy, blur: inn.blur + out.blur, letters: Math.min(inn.letters, out.letters), wipe: Math.min(inn.wipe, out.wipe) };
}

/** Draw a design's caption at t (its boxes behind its words). */
export function drawDesign(ctx: Ctx, d: TextDesign, laid: LaidDesign, page: CaptionPage, t: number) {
  const states = laid.words.map((w) => wordState(d, laid, w, page, t));
  // Boxes first, a line's at its first shown word's opacity.
  laid.lines.forEach((box, li) => {
    const ws = laid.words.filter((w, i) => w.line === li && states[i].alpha > 0);
    if (!ws.length || !ws[0].style.box) return;
    drawBox(ctx, ws[0].style, box, ws[0].px, states[laid.words.indexOf(ws[0])].alpha);
  });
  laid.words.forEach((w, i) => drawWord(ctx, { text: w.text, x: w.x, y: w.y, px: w.px, style: w.style, span: laid.lines[w.line], state: states[i] }));
}

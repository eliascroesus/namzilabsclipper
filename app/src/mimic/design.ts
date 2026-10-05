/**
 * The richer captions (a TextDesign): the words broken into short captions, a word in
 * each picked out for another style (the key word, or the last), each caption laid out
 * as a block of lines whose words keep their own style's size (a small "in the" over a
 * big gradient "wrong"), set in the reference's places in turn (beside the head, over
 * it), some behind the speaker, and drawn word by word as they come on and go off.
 */
import { motionAt, onsetOf, type MotionState, type TextMotion } from "../engine/text/motion";
import { drawBox, drawWord, measureWord, type Box } from "../engine/text/paint";
import { cased, fillColor, fontOf, PLAIN_STYLE, setStyleFont, type TextStyle } from "../engine/text/style";
import type { CaptionPage, CaptionPlace, DesignAlt, PlanWord, StylePick, TextDesign } from "./types";

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

/** How strongly a caption's words fit an other look's rule (0: not at all), and the word that does. */
function altScore(words: PlanWord[], rule: DesignAlt["rule"]): { score: number; at: number } {
  if (!words.length) return { score: 0, at: -1 };
  if (rule === "turn") return { score: 1, at: words.length >> 1 };
  if (rule === "marked" || rule === "number") {
    const at = pickIn(words, rule);
    return { score: at >= 0 ? 1 : 0, at };
  }
  let at = 0;
  words.forEach((w, i) => {
    if (keyness(w.text) > keyness(words[at].text)) at = i;
  });
  const k = keyness(words[at].text);
  return { score: k > 2.5 ? k : 0, at };
}

/** Words into lines of at most n. */
const linesOf = (words: PlanWord[], n: number): PlanWord[][] => {
  const out: PlanWord[][] = [];
  for (let i = 0; i < words.length; i += Math.max(1, n)) out.push(words.slice(i, i + Math.max(1, n)));
  return out;
};

/**
 * Words into the design's captions: at most `words` a line and `lines` a caption, a new
 * caption after a sentence's end or a pause of 0.35 s or more, a new line after a comma
 * once a line has half its words (breaks typed by the user first, as in paginate). Some
 * captions then take the design's other looks (the ones with the strongest key words, a
 * marked word, a number, or every so many), a long one giving up just the part round its
 * key word. The rest get their picks (the styles' words); each caption its place (the
 * reference's in turn, its look's own for the others) and whether it's behind the speaker.
 */
export function designPages(words: PlanWord[], d: TextDesign): CaptionPage[] {
  let pages: CaptionPage[] = [];
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
    line.push({ ...w, style: undefined, opens: !prev || ends(prev.text) });
    if (w.br === "page") flushPage();
    else if (w.br === "line") flushLine();
    else if (ends(w.text)) flushPage();
    else if (pauses(w.text) && line.length * 2 >= d.words && words[i + 1]) flushLine();
  });
  flushPage();
  // The other looks: each on its share of the captions that fit its rule best.
  (d.alts ?? []).forEach((alt, a) => {
    if (alt.share <= 0) return;
    const free = pages.filter((p) => p.alt === undefined);
    const want = Math.max(1, Math.round(alt.share * pages.length));
    let chosen: CaptionPage[];
    if (alt.rule === "turn") {
      const every = Math.max(1, Math.round(1 / alt.share));
      chosen = free.filter((_, i) => i % every === every - 1).slice(0, want);
    } else
      chosen = free
        .map((p) => ({ p, s: altScore(p.lines.flat(), alt.rule).score }))
        .filter((x) => x.s > 0)
        .sort((x, y) => y.s - x.s)
        .slice(0, want)
        .map((x) => x.p);
    if (!chosen.length) return;
    const cap = Math.max(1, (alt.words ?? d.words) * (alt.lines ?? d.lines));
    const next: CaptionPage[] = [];
    for (const p of pages) {
      if (!chosen.includes(p)) {
        next.push(p);
        continue;
      }
      const flat = p.lines.flat();
      const { at } = altScore(flat, alt.rule);
      // The part round the key word (as much of it as the look takes), the rest left as they were.
      const from = Math.max(0, Math.min(flat.length - cap, at - ((cap - 1) >> 1)));
      const part = flat.slice(from, from + cap);
      const before = flat.slice(0, from);
      const after = flat.slice(from + cap);
      const page = (ws: PlanWord[], n: number): CaptionPage => ({ start: ws[0].start, end: ws[ws.length - 1].end, lines: linesOf(ws, n) });
      if (before.length) next.push(page(before, d.words));
      const ap: CaptionPage = { ...page(part, alt.words ?? d.words), alt: a };
      // (The word that chose it, for a look with a style of its own for that word.)
      if (alt.keyStyle && at >= from && at < from + cap) part[at - from].style = alt.keyStyle;
      next.push(ap);
      if (after.length) next.push(page(after, d.words));
    }
    pages = next;
  });
  // Words that come on ahead of being said: a caption on that much sooner (not before the last one's words are out).
  const lead = d.enter.lead ?? 0;
  if (lead > 0)
    pages.forEach((p, i) => {
      const prevEnd = i ? Math.max(...pages[i - 1].lines.flat().map((w) => w.end)) : 0;
      p.start = Math.max(prevEnd, p.start - lead);
    });
  // Each caption until the next starts (or a moment past its last word).
  for (let i = 0; i < pages.length; i++) pages[i].end = Math.min(pages[i + 1]?.start ?? Infinity, pages[i].end + 0.25);
  // A look's own style for all its words (its key word kept in its own).
  for (const p of pages) {
    const alt = p.alt !== undefined ? d.alts?.[p.alt] : undefined;
    if (alt?.style) for (const w of p.lines.flat()) if (!alt.keyStyle || w.style !== alt.keyStyle) w.style = alt.style;
  }
  const own = pages.filter((p) => p.alt === undefined || !d.alts?.[p.alt]?.style);
  // The picks: each rule on its share of captions, spread evenly, a word taking only one.
  for (const p of d.picks) {
    if (!d.styles.some((s) => s.id === p.style) || p.share <= 0) continue;
    // The small words, the second line, or the words marked: every word they cover.
    if (p.rule === "stopword" || p.rule === "line2" || p.rule === "marked") {
      for (const page of own) {
        const ws = p.rule === "line2" ? page.lines[1] ?? [] : p.rule === "marked" ? page.lines.flat().filter((w) => w.mark) : page.lines.flat().filter((w) => COMMON.has(bare(w.text)) && bare(w.text).length <= 4);
        for (const w of ws) if (!w.style) w.style = p.style;
      }
      continue;
    }
    let owed = 0;
    for (const page of own) {
      owed += p.share;
      if (owed < 1 - 1e-9) continue;
      const flat = page.lines.flat();
      const i = pickIn(flat, p.rule);
      if (i < 0 || flat[i].style) continue;
      flat[i].style = p.style;
      owed -= 1;
    }
  }
  // Places in turn, and behind the speaker: the captions in a place the reference sets
  // behind, or every so many (by share), or those with a word in the given style; the
  // other looks' captions in their own places, behind as their look is.
  let owed = 0;
  let k = 0;
  const turns = new Map<number, number>();
  for (const page of pages) {
    const alt = page.alt !== undefined ? d.alts?.[page.alt] : undefined;
    if (alt) {
      const n = turns.get(page.alt!) ?? 0;
      turns.set(page.alt!, n + 1);
      const places = alt.places?.length ? alt.places : d.places;
      page.place = places.length ? n % places.length : undefined;
      page.behind = !!(alt.behind || (page.place !== undefined && places[page.place]?.behind));
      continue;
    }
    page.place = d.places.length ? k % d.places.length : undefined;
    k++;
    const place = page.place !== undefined ? d.places[page.place] : undefined;
    owed += d.behind.share;
    const styled = !d.behind.style || page.lines.flat().some((w) => w.style === d.behind.style);
    if (place?.behind || (owed >= 1 - 1e-9 && styled)) {
      page.behind = true;
      owed = Math.max(0, owed - 1);
    }
  }
  return pages;
}

/** The places and layout a caption takes: its look's, or the design's. */
export function lookOf(d: TextDesign, page: CaptionPage): { places: CaptionPlace[]; layout: TextDesign["layout"]; fit: boolean } {
  const alt = page.alt !== undefined ? d.alts?.[page.alt] : undefined;
  return { places: alt?.places?.length ? alt.places : d.places, layout: alt?.layout ?? d.layout, fit: !!(alt?.fit ?? d.fit) };
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
  /** set behind the speaker, but brought in front, there being no room for it round the head */
  front?: boolean;
}

/** Where every word of a design's caption goes on a W × H frame. */
export function layoutDesign(ctx: Ctx, d: TextDesign, page: CaptionPage, W: number, H: number): LaidDesign {
  const { places, layout, fit } = lookOf(d, page);
  const place = places[page.place ?? 0] ?? { x: 0.5, y: 0.62, align: "center" as const, valign: "middle" as const, width: 0.8 };
  // Each line at its words' own sizes.
  type Row = { words: { w: PlanWord; style: TextStyle; px: number; width: number; text: string }[]; width: number; up: number; down: number; gap?: number };
  const rows: Row[] = page.lines.map((ln) => {
    const words = ln.map((w) => {
      const style = layout !== "lines" ? styleOf(d, w.style) : { ...styleOf(d, w.style), size: styleOf(d, undefined).size };
      const px = style.size * H;
      const text = cased(w.text, style.case, w.opens);
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
  // (Fitted: every line as wide as the place, within half to three times its size.)
  const ks = rows.map((r) => (fit && layout !== "spread" ? Math.min(3, Math.max(0.5, room / Math.max(1, r.width))) : r.width > room ? room / r.width : 1));
  // Spread: a line's words pushed apart to fill the place's width.
  if (layout === "spread")
    rows.forEach((r) => {
      const inked = r.words.reduce((a, x) => a + x.width, 0);
      if (r.words.length > 1 && inked < room) {
        r.gap = (room - inked) / (r.words.length - 1);
        r.width = room;
      }
    });
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
    // A staircase: each line set in by its indent (inwards from a right-aligned edge).
    const ind = d.indents?.length ? d.indents[li % d.indents.length] * styleOf(d, undefined).size * H : 0;
    x0 += place.align === "right" ? -ind : ind;
    x0 = Math.min(W * (1 - SAFE) - lw, Math.max(W * SAFE, x0));
    const base = top + baselines[li];
    let x = x0;
    r.words.forEach((x_, j) => {
      const px = x_.px * k;
      words.push({ text: x_.text, start: x_.w.start, end: x_.w.end, style: x_.style, px, x, y: base, width: x_.width * k, line: li, index: index++, inLine: j });
      x += x_.width * k + (j + 1 < r.words.length ? (r.gap ?? 0.25 * Math.min(px, r.words[j + 1].px * k)) : 0);
    });
    lines.push({ x0, x1: x0 + lw, y0: base - r.up * k, y1: base + r.down * k });
  });
  const block = lines.reduce((b, l) => ({ x0: Math.min(b.x0, l.x0), y0: Math.min(b.y0, l.y0), x1: Math.max(b.x1, l.x1), y1: Math.max(b.y1, l.y1) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  // Clear of the speaker's head, as the reference edits keep their words (beside it, above it,
  // tucked behind its top): moved the least way it takes.
  const { dx, dy, front } = page.face ? clearOfHead(block, page.face, !!page.behind, W, H) : { dx: 0, dy: 0, front: false };
  if (dx || dy) {
    for (const w of words) (w.x += dx), (w.y += dy);
    for (const l of [...lines, block]) (l.x0 += dx), (l.x1 += dx), (l.y0 += dy), (l.y1 += dy);
  }
  return { words, lines, block, ...(front ? { front } : {}) };
}

/**
 * How far to move a caption so it doesn't cover the speaker's head (the face, the hair or a
 * cap above it, a little under the chin): in front, the least move up, down or to either side
 * that clears it and stays in the frame. Behind, when the head would hide over a third of it,
 * up until only its foot is tucked behind the top of the head (Mochi's stacks); when there's
 * no room for that above the head (a close-up), it comes out in front (`front`), clear of the
 * head, or failing that goes as far up as the frame lets it. A giant word behind, mostly
 * showing either side of the head, stays.
 */
export function clearOfHead(block: Box, face: NonNullable<CaptionPage["face"]>, behind: boolean, W: number, H: number): { dx: number; dy: number; front: boolean } {
  const stay = { dx: 0, dy: 0, front: false };
  const head = { x0: (face.x - 0.75 * face.w) * W, x1: (face.x + 0.75 * face.w) * W, y0: (face.y - 1.05 * face.h) * H, y1: (face.y + 0.75 * face.h) * H };
  const ix = Math.max(0, Math.min(block.x1, head.x1) - Math.max(block.x0, head.x0));
  const iy = Math.max(0, Math.min(block.y1, head.y1) - Math.max(block.y0, head.y0));
  if (!ix || !iy) return stay;
  const bw = block.x1 - block.x0;
  const bh = block.y1 - block.y0;
  const m = 0.02 * H;
  const fits = (dx: number, dy: number) => block.x0 + dx >= SAFE * W - 1 && block.x1 + dx <= (1 - SAFE) * W + 1 && block.y0 + dy >= SAFE * H - 1 && block.y1 + dy <= (1 - SAFE) * H + 1;
  if (behind) {
    // (A giant word across the frame reads with its middle hidden, as jiia's do.)
    if ((ix * iy) / Math.max(1, bw * bh) <= (bw > 0.6 * W ? 0.55 : 0.34)) return stay;
    const tuck = head.y0 + 0.2 * bh - block.y1;
    if (tuck < 0 && fits(0, tuck)) return { dx: 0, dy: tuck, front: false };
  }
  const moves: [number, number][] = [
    [0, head.y0 - m - block.y1],
    [0, head.y1 + m - block.y0],
    [head.x0 - m - block.x1, 0],
    [head.x1 + m - block.x0, 0],
  ];
  const ok = moves.filter(([dx, dy]) => fits(dx, dy)).sort((a, b) => Math.hypot(a[0] / W, a[1] / H) - Math.hypot(b[0] / W, b[1] / H));
  if (ok.length) return { dx: ok[0][0], dy: ok[0][1], front: behind };
  if (!behind) return stay;
  const up = Math.max(head.y0 + 0.2 * bh - block.y1, SAFE * H - block.y0);
  return up < 0 ? { dx: 0, dy: up, front: false } : stay;
}

/** A word's state at t: coming on from its onset, going off with its caption. */
export function wordState(d: TextDesign, laid: LaidDesign, w: LaidWord, page: CaptionPage, t: number): MotionState {
  const base = d.styles[0];
  const altEnter = page.alt !== undefined ? d.alts?.[page.alt]?.enter : undefined;
  const enter: TextMotion = altEnter ?? w.style.enter ?? ((w.style !== base && d.accentEnter) || d.enter);
  const lineStart = laid.words.find((x) => x.line === w.line)?.start ?? w.start;
  let on = onsetOf(enter, w, lineStart, page.start, w.inLine, w.index) - (enter.unit === "word" ? enter.lead ?? 0 : 0);
  let dur = enter.dur;
  // Typed at a rate: each word its letters' time, a line or caption typed straight through.
  if (enter.kind === "type" && enter.rate && enter.rate > 0) {
    dur = [...w.text].length / enter.rate;
    if (enter.unit !== "word") {
      const before = laid.words.filter((x) => (enter.unit === "line" ? x.line === w.line : true) && x.index < w.index).reduce((a, x) => a + [...x.text].length + 1, 0);
      on = (enter.unit === "line" ? lineStart : page.start) + before / enter.rate;
    }
  }
  if (t < on - 1e-6) return { alpha: 0, scale: 1, dx: 0, dy: 0, blur: 0, letters: 0, wipe: 0 };
  const inn = motionAt(enter, dur > 0 ? (t - on) / dur : 1);
  const ex = d.exit;
  if (!ex || ex.kind === "none" || ex.dur <= 0 || t < page.end - ex.dur) return inn;
  const out = motionAt(ex, (page.end - t) / ex.dur);
  return { alpha: inn.alpha * out.alpha, scale: inn.scale * out.scale, dx: inn.dx + out.dx, dy: inn.dy + out.dy, blur: inn.blur + out.blur, letters: Math.min(inn.letters, out.letters), wipe: Math.min(inn.wipe, out.wipe) };
}

/** How far into its word being said (0 to 1), with the next word's start as its end, so one word is always the one. */
function saying(laid: LaidDesign, i: number, page: CaptionPage, t: number): number | null {
  const w = laid.words[i];
  const end = laid.words[i + 1]?.start ?? Math.max(w.end, page.end);
  if (t < w.start) return null;
  return Math.min(1, (t - w.start) / Math.max(0.05, w.end - w.start)) + (t >= end ? 1 : 0);
}

/** Draw a design's caption at t: its boxes behind its words, the word being said in its look, a caret while typing. */
export function drawDesign(ctx: Ctx, d: TextDesign, laid: LaidDesign, page: CaptionPage, t: number) {
  const states = laid.words.map((w) => wordState(d, laid, w, page, t));
  // Boxes first, a line's at its first shown word's opacity.
  laid.lines.forEach((box, li) => {
    const ws = laid.words.filter((w, i) => w.line === li && states[i].alpha > 0);
    if (!ws.length || !ws[0].style.box) return;
    drawBox(ctx, ws[0].style, box, ws[0].px, states[laid.words.indexOf(ws[0])].alpha);
  });
  const sp = d.spoken;
  laid.words.forEach((w, i) => {
    let style = w.style;
    let state = states[i];
    const k = saying(laid, i, page, t);
    // (k: null before it's said; 0 to 1 while it is; past 1 once the next word has started.)
    const now = k !== null && k <= 1;
    const said = k !== null && k > 1;
    if (k === null && d.upcoming) {
      style = { ...style, ...(d.upcoming.fill ? { fill: d.upcoming.fill } : {}) };
      state = { ...state, alpha: state.alpha * (d.upcoming.opacity ?? 1) };
    }
    const lit = sp && (now || (said && sp.hold));
    if (lit && sp) {
      const look: TextStyle = { ...style, ...(sp.fill ? { fill: sp.fill } : {}), ...(sp.stroke !== undefined ? { stroke: sp.stroke } : {}), ...(sp.glow !== undefined ? { glow: sp.glow } : {}), ...(sp.weight ? { weight: sp.weight } : {}) };
      if (now && sp.scale && sp.scale !== 1) state = { ...state, scale: state.scale * (1 + (sp.scale - 1) * Math.min(1, (k ?? 0) * 6)) };
      if (sp.box && now) {
        const pad = sp.box.pad * w.px;
        const f = fontOf(style).metrics;
        const grow = 0.9 + 0.1 * Math.min(1, (k ?? 0) * 8);
        const cx = w.x + w.width / 2;
        const cy = w.y - (f.cap * w.px) / 2;
        const bw = (w.width + 2 * pad) * grow * state.scale;
        const bh = (f.cap * w.px + 2 * pad) * grow * state.scale;
        ctx.save();
        ctx.globalAlpha = state.alpha;
        ctx.fillStyle = sp.box.color;
        ctx.beginPath();
        ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, sp.box.radius * w.px);
        ctx.fill();
        ctx.restore();
      }
      if (sp.sweep && now && sp.fill) {
        // Karaoke: the word as it was, then the new colour across it as far as it's been said.
        drawWord(ctx, { text: w.text, x: w.x, y: w.y, px: w.px, style, span: laid.lines[w.line], state });
        ctx.save();
        ctx.beginPath();
        ctx.rect(w.x - w.px, w.y - 2 * w.px, w.px + w.width * Math.min(1, k ?? 0), 3 * w.px);
        ctx.clip();
        drawWord(ctx, { text: w.text, x: w.x, y: w.y, px: w.px, style: look, span: laid.lines[w.line], state });
        ctx.restore();
        return;
      }
      style = look;
    }
    drawWord(ctx, { text: w.text, x: w.x, y: w.y, px: w.px, style, span: laid.lines[w.line], state });
  });
  // The caret: after the letters being typed, or blinking after the last once they're out.
  const enter = d.enter;
  if (enter.kind === "type" && enter.caret) {
    let at = -1;
    for (let i = 0; i < laid.words.length; i++) if (states[i].letters > 0) at = i;
    if (at >= 0) {
      const w = laid.words[at];
      const typing = states.some((x) => x.letters > 0 && x.letters < 1) || at < laid.words.length - 1;
      if (typing || Math.floor(t / 0.53) % 2 === 0) {
        const letters = [...w.text];
        const shown = letters.slice(0, Math.max(1, Math.round(states[at].letters * letters.length))).join("");
        setStyleFont(ctx, w.style, w.px);
        const x = w.x + ctx.measureText(shown).width + 0.06 * w.px;
        const f = fontOf(w.style).metrics;
        ctx.save();
        ctx.globalAlpha = states[at].alpha * w.style.opacity;
        ctx.fillStyle = fillColor(w.style.fill);
        ctx.fillRect(x, w.y - f.cap * w.px, Math.max(1, 0.07 * w.px), f.cap * w.px);
        ctx.restore();
      }
    }
  }
}

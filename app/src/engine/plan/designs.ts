/**
 * Edit designs: how an edit looks, on top of how it's cut (styles.ts). The reference
 * editors mostly cut hard in a warm film colour (nio.trade, mico, TJR), and every edit
 * the app made looked that way whatever its style. The short-form edit genres people
 * make with the same footage and songs each have a look you know within a second: a
 * cold edit's flashes and shakes, a zoom edit's rush into every cut, a velocity edit's
 * ramps, a cinematic edit's letterbox and light leaks, black-and-white strobes, glitch
 * edits, whip pans, a split screen, a camcorder tape. Each design here is one of them,
 * as a recipe taken from the editors' own tutorials and templates (docs/edit-analysis.md,
 * "The designs"): its own colour, what the edit opens on, what every cut becomes, what
 * the song's hits do inside a shot (a kick shakes or punches in, a snare or clap flashes
 * or flips to the negative: one sound, one effect), what the drop gets, and how the
 * caption shows. Everything it adds lands on the music (the cuts are all on hits:
 * rhythm.ts; the hits the song plays; its beats; its drop), held back before the drop
 * and let go on it, never two big moves within a beat, and never more than three
 * flashes of black or white a second.
 *
 * A batch set to mix them makes each edit in another design, the ones that suit the
 * song first (a hard, fast song: flashes, glitches, velocity; a calm one: cinematic,
 * clean, black and white, a tape) and night footage leaning to the dark ones.
 */
import type { SongAnalysis } from "../audio/song";
import type { Scan } from "../media/scan";
import { boundsOf } from "./bounds";
import { CUT_LEAD, driveOver, gridTime, hitsHard } from "./montage";
import { headPops, someone, type EditStyle } from "./styles";
import { FPS, sourceSpan, WARM_GRADE, type Aspect, type CaptionEvent, type CaptionStyle, type EditPlan, type FxEvent, type Grade, type OverlayEvent, type ShotEvent } from "./types";

export type Design = "clean" | "flow" | "reframe" | "flash" | "zoom" | "velocity" | "cinematic" | "noir" | "glitch" | "whip" | "split" | "vhs" | "phonk" | "ice";

export const DESIGNS: { value: Design; name: string; desc: string }[] = [
  { value: "clean", name: "Clean", desc: "Hard cuts in warm film colour, a punch-in on the big hits (nio.trade, mico)." },
  { value: "flow", name: "Crossfade", desc: "nio.trade's flex burst: crossfades into the drop a beat apart, nothing on the drop, then a picture a beat, each crossfading in and whole on the kick." },
  { value: "reframe", name: "Reframe", desc: "nio.trade's LARP edits: hard cuts only, the picture jumping closer in one frame on the beats, the subject in black and white snapping to colour, a crash zoom a bar before the drop, a plain cut on it, then a face on someone's head." },
  { value: "flash", name: "Flash & shake", desc: "A cold edit: drained and dark, white flashes on the claps, shakes on the kicks, a strobe into the drop." },
  { value: "zoom", name: "Zoom", desc: "Zooms in and out on the cuts, through with a smear where a phrase starts, pushes and spins mixed in, the picture bumping on the beats." },
  { value: "velocity", name: "Velocity", desc: "Slow motion on each hit, then a rush into the next cut, with zoom blurs and shakes." },
  { value: "cinematic", name: "Cinematic", desc: "Letterbox bars, teal and orange, glow, light leaks; crossfades, slides, film burns, blur-ins and dips." },
  { value: "noir", name: "Noir", desc: "Hard black and white: punches on the kicks, the negative on the claps, strobes in the build." },
  { value: "glitch", name: "Glitch", desc: "Torn bands, colour splits and scanlines on the cuts and the hits, smears, whips and strobes between." },
  { value: "whip", name: "Whip", desc: "Whip pans each way, spins, pushes and slides between the shots, a spin into the drop, swings on the hits." },
  { value: "split", name: "Split screen", desc: "The build in stacked panels, one changing on each cut, then the drop full frame." },
  { value: "vhs", name: "VHS", desc: "A camcorder tape: soft, bleeding colour, wobbling lines, PLAY and the date on screen." },
  { value: "phonk", name: "Phonk", desc: "A cold edit, darker: drained with red in the highlights, the picture freezing into the drop, then shakes, glow and the negative on every hit." },
  { value: "ice", name: "Ice", desc: "A cold edit, cool and glowing: crossfades into the drop, a freeze and a flash on it, then glow pulses and zooms on the hits." },
];

export const designName = (d: Design) => DESIGNS.find((x) => x.value === d)!.name;

/** Each design's colour (the renderer balances every shot first, then this). */
export const DESIGN_GRADES: Record<Design, Grade> = {
  clean: WARM_GRADE,
  // nio.trade's footage as it comes, a touch warm and rich: the look of the vlogs it's cut from.
  flow: { warmth: 0.3, contrast: 0.55, saturation: 1.1, vignette: 0.25, grain: 0.15 },
  // nio.trade's LARP edits: the footage as shot, hardly touched.
  reframe: { warmth: 0.1, contrast: 0.45, saturation: 1.05, vignette: 0.12, grain: 0.05 },
  // Cold: the colour drained, blue-steel shadows, crushed blacks, hard contrast, a little under.
  flash: { warmth: -0.45, contrast: 0.95, saturation: 0.55, vignette: 0.55, grain: 0.3, shadows: [-0.03, 0, 0.05], highlights: [-0.01, 0.01, 0.03], glow: 0.2, exposure: -0.25 },
  // Bright and rich.
  zoom: { warmth: 0.15, contrast: 0.65, saturation: 1.25, vignette: 0.3, grain: 0.1 },
  velocity: { warmth: 0.1, contrast: 0.75, saturation: 1.15, vignette: 0.45, grain: 0.2, shadows: [-0.015, 0, 0.03], glow: 0.15 },
  // Teal shadows, orange highlights, a glow and a slight matte.
  cinematic: { warmth: 0.2, contrast: 0.6, saturation: 0.9, vignette: 0.5, grain: 0.35, shadows: [-0.035, 0.015, 0.05], highlights: [0.05, 0.02, -0.04], glow: 0.35, fade: 0.08 },
  // (Black and white over it all: a mono effect.)
  noir: { warmth: 0, contrast: 1, saturation: 1, vignette: 0.6, grain: 0.5, exposure: -0.1 },
  // Purple shadows, cyan highlights.
  glitch: { warmth: -0.1, contrast: 0.65, saturation: 1.2, vignette: 0.35, grain: 0.2, shadows: [0.025, -0.01, 0.05], highlights: [-0.02, 0.03, 0.03] },
  whip: { warmth: 0.25, contrast: 0.6, saturation: 1.15, vignette: 0.3, grain: 0.15 },
  split: { warmth: 0.2, contrast: 0.6, saturation: 1.12, vignette: 0.2, grain: 0.12 },
  // A tape: lifted blacks, soft contrast, a yellow-green cast, the highlights blooming.
  vhs: { warmth: 0.2, contrast: 0.25, saturation: 0.85, vignette: 0.45, grain: 0.45, fade: 0.35, shadows: [0, 0.015, -0.01], highlights: [0.02, 0.02, -0.03], glow: 0.25 },
  // Phonk: near black and white, hard, red bleeding into the highlights, a heavy vignette.
  phonk: { warmth: 0, contrast: 1.25, saturation: 0.28, vignette: 0.75, grain: 0.45, shadows: [0.005, -0.01, -0.005], highlights: [0.09, -0.02, -0.04], glow: 0.12, exposure: -0.45 },
  // Ice: cold blue, the highlights glowing, a little lifted.
  ice: { warmth: -1, contrast: 0.75, saturation: 0.42, vignette: 0.4, grain: 0.15, shadows: [-0.05, 0.015, 0.1], highlights: [-0.045, 0.015, 0.1], glow: 0.4, fade: 0.04 },
};

/**
 * The designs that go with a style: a slow edit stays calm; black and white all through
 * would undo a style's own flip into colour; panels would hide someone talking and a
 * burst of photos (the burst's pictures on someone's head need the overlays too).
 */
export function fits(d: Design, style: EditStyle): boolean {
  if (style === "slow") return d === "clean" || d === "cinematic" || d === "noir" || d === "vhs" || d === "ice" || d === "flow";
  // (Its black and white snapping to colour would be lost in a style that's black and white till the drop.)
  if (d === "reframe") return style !== "mono";
  if (d === "phonk") return style !== "mono" && style !== "talk";
  if (d === "noir") return style !== "mono" && style !== "talk";
  if (d === "split") return style !== "talk" && style !== "burst";
  return true;
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * How hard a song hits, 0 to 1: how often a kick or an 808 lands (hits whose onset is
 * mostly low end, against the song's length: a phonk or trap song over a second, a
 * story's soft bed a quarter), how fast it goes, and how big its drop is. A song's own
 * levels say nothing here (every song is loud against itself), so it's all in what
 * plays.
 */
export function heatOf(song: SongAnalysis): number {
  const strong = song.accents.filter((a) => Math.max(a.s, a.ls ?? 0) >= 0.4);
  const lows = strong.filter((a) => (a.low ?? 0) >= 1.5).length / Math.max(1, song.duration);
  const fast = clamp((song.bpm - 90) / 60, 0, 1);
  const drop = Math.max(0, ...song.drops.map((d) => d.strength));
  return clamp(0.5 * Math.min(1, lows / 1.2) + 0.3 * fast + 0.2 * drop, 0, 1);
}

/** How dark the footage is on the whole (one less its mean brightness): night footage over about 0.7. */
export function darkness(scans: Scan[]): number {
  const lum = scans.flatMap((sc) => Array.from(sc.stats.luma));
  return lum.length ? 1 - mean(lum) : 0.5;
}

/**
 * The designs a batch set to mix goes through, in order, for this song and footage:
 * the ones that suit it first. A hard, fast song leads with the flashes, glitches and
 * velocity; a calm one with cinematic and the tape, and leaves those three out; night
 * footage brings the dark ones (cinematic, noir, flash) forward. The clean one, the
 * references' own look, comes after the first few, so a batch always opens on
 * something new.
 */
export function designOrder(song: SongAnalysis | null | undefined, scans: Scan[]): Design[] {
  const heat = song ? heatOf(song) : 0.4;
  const hot: Design[] = ["flash", "phonk", "reframe", "glitch", "velocity", "zoom", "whip", "flow", "ice", "noir", "split", "clean", "cinematic", "vhs"];
  const mid: Design[] = ["zoom", "reframe", "flow", "ice", "whip", "cinematic", "clean", "split", "flash", "vhs", "phonk", "velocity", "noir", "glitch"];
  const calm: Design[] = ["cinematic", "flow", "ice", "vhs", "noir", "clean", "split", "whip", "zoom", "reframe"];
  const base = heat >= 0.62 ? hot : heat >= 0.4 ? mid : calm;
  if (darkness(scans) < 0.7) return base;
  const dark = new Set<Design>(["cinematic", "noir", "flash", "phonk"]);
  // (Each dark one two places sooner.)
  const rank = new Map(base.map((d, i) => [d, i - (dark.has(d) ? 2.5 : 0)]));
  return [...base].sort((a, b) => rank.get(a)! - rank.get(b)!);
}

/** The design for edit number `n` of a batch (counting on from earlier batches): the one picked, or the next in the mix that goes with its style. */
export function designFor(n: number, pick: Design | "mix", order: Design[], style: EditStyle = "beat"): Design {
  if (pick !== "mix") return pick;
  const len = order.length;
  for (let k = 0; k < len; k++) {
    const d = order[(((n + k) % len) + len) % len];
    if (fits(d, style)) return d;
  }
  return "clean";
}

/** What a design wants of the footage: movement and people (the hard ones), or calm, steady pictures (a film, a tape); the clean edit, the plain picks. */
export function leanOf(d: Design): "action" | "calm" | undefined {
  return d === "cinematic" || d === "vhs" || d === "ice" ? "calm" : d === "clean" || d === "flow" ? undefined : "action";
}

/** A letterbox for the frame: bars that leave a wide picture in a wide frame and about a 4:5 one in a tall frame, each this share of the frame's height. */
export const BARS: Record<Aspect, number> = { "9x16": 0.14, "4x5": 0.1, "1x1": 0.17, "4x3": 0.16 };

/** A split screen's panels, as shares of the frame (centre, width, height): three rows in a 9:16 frame, two in a square or 4:5 one, two side by side in a 4:3 one, a thin black line between. */
export function panelsFor(aspect: Aspect): { x: number; y: number; w: number; h: number }[] {
  const n = aspect === "9x16" ? 3 : 2;
  const gap = 0.006;
  const size = (1 - (n - 1) * gap) / n;
  return Array.from({ length: n }, (_, k) => {
    const at = k * (size + gap) + size / 2;
    return aspect === "4x3" ? { x: at, y: 0.5, w: size, h: 1 } : { x: 0.5, y: at, w: 1, h: size };
  });
}

// ── the recipes ──────────────────────────────────────────────────────────────

const F = 1 / FPS;
const fr = (t: number) => Math.round(t * FPS) / FPS;

interface Hit {
  /** edit seconds, as cut (a hair ahead of the hit) */
  t: number;
  /** how hard, 0 to 1 */
  s: number;
  /** a kick or an 808 you can't miss */
  big: boolean;
  /** a snare or a clap you can't miss (the middle of the sound, not the low end) */
  snap: boolean;
}

interface Cut {
  t: number;
  shot: ShotEvent;
  prev: ShotEvent;
  /** the cut lands on a hit */
  hit: boolean;
  drop: boolean;
}

/** What an edit's design works from: its song, cuts, hits and beats, in edit time. */
interface Ctx {
  plan: EditPlan;
  song: SongAnalysis;
  songStart: number;
  /** where the footage ends: the card, or the end */
  end: number;
  drop?: number;
  hits: Hit[];
  beats: number[];
  cuts: Cut[];
  /** the cuts on a phrase's first beat, and on a section's */
  phrases: Set<number>;
  sections: Set<number>;
  drive: (t: number) => number;
  fx: FxEvent[];
  scans: Scan[];
  now: Date;
}

/** The song's beats as they fall in the edit (before the card), those with a hit you hear on them. */
export function heardBeats(plan: EditPlan, song: SongAnalysis): number[] {
  const songStart = plan.music?.songStart ?? 0;
  const end = plan.card?.start ?? plan.duration;
  return song.beats
    .map((b) => fr(b - songStart - CUT_LEAD))
    .filter((t) => t > 0.05 && t < end - 0.2 && song.accents.some((a) => Math.abs(a.t - songStart - CUT_LEAD - t) <= 0.05 && a.s >= 0.05 && (a.ls ?? a.s) >= 0.5));
}

function contextOf(plan: EditPlan, song: SongAnalysis, scans: Scan[], now: Date): Ctx {
  const songStart = plan.music?.songStart ?? 0;
  const end = plan.card?.start ?? plan.duration;
  const shots = plan.shots.filter((s) => s.start < end - 1e-6);
  const drop = shots.find((s) => s.role === "drop")?.start;
  const hits: Hit[] = song.accents
    .filter((a) => a.s >= 0.05 && (a.ls ?? a.s) >= 0.5 && Math.max(a.kick, a.mid) >= 0.45 && hitsHard(song, a))
    .map((a) => {
      const s = Math.max(a.s, a.ls ?? 0);
      return { t: fr(gridTime(song, a) - songStart - CUT_LEAD), s, big: a.kick >= 0.6 && s >= 0.7, snap: a.mid >= 0.6 && a.kick < 0.5 && s >= 0.6 };
    })
    .filter((h) => h.t > 0.1 && h.t < end - 0.25)
    .sort((a, b) => a.t - b.t);
  const beats = heardBeats(plan, song);
  // (Not into or out of someone talking, nor inside a burst of photos: those stay hard.)
  const cuts: Cut[] = [];
  for (let i = 1; i < shots.length; i++) {
    const shot = shots[i];
    const prev = shots[i - 1];
    if (shot.audio || shot.crop.inset || prev.crop.inset) continue;
    cuts.push({ t: shot.start, shot, prev, hit: hits.some((h) => Math.abs(h.t - shot.start) <= 1.5 * F), drop: drop !== undefined && Math.abs(shot.start - drop) < 1e-6 });
  }
  const T = song.period;
  const firstBar = song.downbeats.findIndex((d) => d >= songStart - 0.05);
  const phraseAt = firstBar < 0 ? [] : song.downbeats.filter((_, i) => i >= firstBar && (i - firstBar) % 4 === 0).map((d) => d - songStart - CUT_LEAD);
  const sectionAt = (song.structure?.sections ?? []).map((s) => s.t - songStart - CUT_LEAD);
  const near = (ts: number[]) => new Set(cuts.filter((c) => ts.some((p) => Math.abs(p - c.t) <= 1.5 * F)).map((c) => c.t));
  return { plan, song, songStart, end, drop, hits, beats, cuts, phrases: near([...phraseAt, ...sectionAt]), sections: near(sectionAt), drive: (t) => driveOver(song, songStart, Math.max(0, t - T), t + T, drop), fx: [], scans, now };
}

/** A transition peaking on the cut at `t`: `pre` frames of the shot going out, `post` of the one coming in, shortened to leave each two frames of its own. */
function across(c: Cut, kind: FxEvent["kind"], strength: number, pre: number, post: number, dir?: number): FxEvent | null {
  const before = Math.min(pre * F, c.prev.end - c.prev.start - 2 * F);
  const after = Math.min(post * F, c.shot.end - c.shot.start - 2 * F);
  if (after < 2 * F) return null;
  return { kind, start: fr(c.t - Math.max(0, before)), end: fr(c.t + after), strength, at: c.t, ...(dir !== undefined ? { dir } : {}) };
}

/** Effects in, none running into the dip before the card (black and white, the bars and the tape run on to it). */
const push = (ctx: Ctx, ...evs: (FxEvent | null)[]) => {
  for (const e of evs) {
    if (!e || e.end <= e.start || e.start >= ctx.end - 4 * F) continue;
    ctx.fx.push(e.kind === "mono" || e.kind === "bars" || e.kind === "vhs" ? e : { ...e, end: Math.min(e.end, ctx.end - 4 * F) });
  }
};

/** Keep the times at least `gap` apart, the first of each run. */
function spaced<T extends { t: number }>(xs: T[], gap: number): T[] {
  const out: T[] = [];
  for (const x of xs) if (!out.length || x.t - out[out.length - 1].t >= gap) out.push(x);
  return out;
}

/** The hits inside shots (`room` beats or more from a cut), for what happens within a shot. */
function between(ctx: Ctx, hits: Hit[], room = 0.6): Hit[] {
  const T = ctx.song.period;
  return hits.filter((h) => ctx.cuts.every((c) => Math.abs(c.t - h.t) >= room * T) && h.t > 0.3);
}

const afterDrop = (ctx: Ctx, t: number) => ctx.drop === undefined || t >= ctx.drop - 1e-6;
/** Not on the drop itself (it has its own moment): a beat or more from it. */
const offDrop = (ctx: Ctx, t: number) => ctx.drop === undefined || Math.abs(t - ctx.drop) > ctx.song.period;
/** Flashes of white or black no closer than a third of a second (three a second at most). */
const FLASH_GAP = 0.34;

/** The drop's own moment: what every design does there, on top of its own. */
function dropHit(ctx: Ctx, flash: number, shake: number, from = 0) {
  if (ctx.drop === undefined) return;
  const d = ctx.drop + from * F;
  if (flash > 0) push(ctx, { kind: "flash", start: d, end: d + 6 * F, strength: flash, at: d });
  if (shake > 0) push(ctx, { kind: "shake", start: d, end: d + 10 * F, strength: shake, at: d });
  push(ctx, { kind: "split", start: d, end: d + 6 * F, strength: 1, at: d });
}

function flash(ctx: Ctx) {
  const T = ctx.song.period;
  // Out of white, not up from black.
  push(ctx, { kind: "flash", start: 0, end: 7 * F, strength: 1, at: 0 });
  // A strobe into the drop (two black frames), then the flash and the shake.
  if (ctx.drop !== undefined && ctx.drop > 2) push(ctx, { kind: "strobe", start: fr(ctx.drop - 4 * F), end: ctx.drop, strength: 1 });
  dropHit(ctx, 1, 1.3);
  // The cuts: flashes, shakes on landing, zooms through, strobes, by where they fall.
  transitions(ctx, PALETTES.flash!);
  // Inside the shots, a white flash on the claps and snares, lighter before the drop; the
  // kicks shake the picture, punch in and split its colour.
  const flashes = spaced(
    between(ctx, ctx.hits.filter((h) => h.snap), 0.4).filter((x) => offDrop(ctx, x.t) && x.t > 0.4),
    Math.max(0.9 * T, FLASH_GAP),
  );
  for (const x of flashes) {
    const s = afterDrop(ctx, x.t) ? 0.6 : 0.35;
    push(ctx, { kind: "flash", start: x.t, end: x.t + 3 * F, strength: s * (0.6 + 0.4 * ctx.drive(x.t)), at: x.t });
  }
  const kicks = between(ctx, ctx.hits.filter((h) => h.big && (afterDrop(ctx, h.t) || h.s >= 0.9) && offDrop(ctx, h.t)), 0.4);
  let k = 0;
  for (const h of spaced(kicks, 1.5 * T)) {
    push(ctx, { kind: "shake", start: h.t, end: h.t + 8 * F, strength: 0.8, at: h.t }, { kind: "punch", start: h.t - F, end: h.t + 8 * F, strength: 0.6, at: h.t }, { kind: "split", start: h.t, end: h.t + 4 * F, strength: 0.8, at: h.t });
    // (Every other one after the drop drains to black and white for three frames.)
    if (afterDrop(ctx, h.t) && k++ % 2 === 1) push(ctx, { kind: "mono", start: h.t, end: h.t + 3 * F, strength: 1 });
  }
  // The drop blooms.
  if (ctx.drop !== undefined) push(ctx, { kind: "glow", start: ctx.drop, end: ctx.drop + 12 * F, strength: 0.7, at: ctx.drop });
}

function zoom(ctx: Ctx) {
  // The first shot lands zoomed in and settles; the drop rushes in hardest.
  push(ctx, { kind: "zoomin", start: 0, end: 9 * F, strength: 0.8, at: 0 });
  const d = ctx.cuts.find((x) => x.drop);
  if (d) push(ctx, across(d, "zoomin", 1, 4, 8, 1));
  // The cuts: zooms in and out, through with a smear, pushes and spins, by where they fall.
  transitions(ctx, PALETTES.zoom!);
  dropHit(ctx, 0.4, 0);
  // The picture bumps on the beats between the cuts.
  for (const b of ctx.beats) {
    if (ctx.cuts.some((c) => Math.abs(c.t - b) < 0.2) || b < 0.3) continue;
    const s = afterDrop(ctx, b) ? 0.45 : 0.28;
    push(ctx, { kind: "punch", start: b - F, end: b + 6 * F, strength: s, at: b });
  }
}

function velocity(ctx: Ctx) {
  push(ctx, { kind: "zoomin", start: 0, end: 8 * F, strength: 0.6, at: 0 }, { kind: "zoomblur", start: 0, end: 6 * F, strength: 0.9, at: 0 });
  dropHit(ctx, 0.7, 1.2);
  const d = ctx.cuts.find((x) => x.drop);
  if (d) push(ctx, across(d, "zoomin", 1, 4, 8));
  // The cuts: smears out from the middle, shakes on landing, zooms and whips, by where they fall.
  transitions(ctx, PALETTES.velocity!);
}

function cinematic(ctx: Ctx) {
  const plan = ctx.plan;
  push(ctx, { kind: "bars", start: 0, end: ctx.end, strength: BARS[plan.aspect] });
  // Up from black, out of focus, a light leak drifting over the opening.
  if (!plan.fx.some((e) => e.kind === "fadein")) push(ctx, { kind: "fadein", start: 0, end: 12 * F, strength: 1 });
  push(ctx, { kind: "blur", start: 0, end: 20 * F, strength: 1, at: 0 }, { kind: "leak", start: 0, end: Math.min(2, ctx.end - 0.3), strength: 0.75 });
  // The drop: a leak and a blur-in, no flash.
  const d = ctx.cuts.find((x) => x.drop);
  if (d) push(ctx, { kind: "leak", start: d.t, end: Math.min(d.t + 1.4, ctx.end), strength: 0.85 }, across(d, "blur", 0.8, 2, 10));
  // The cuts: a dip to black where a section starts, a blur-in, a crossfade or a slide where
  // a phrase does, crossfades now and then on the beats.
  transitions(ctx, PALETTES.cinematic!);
  // Every clip pushes in or pulls out, slowly.
  let k = plan.shots.length;
  for (const s of plan.shots) {
    if (s.kind !== "video" || s.again || s.audio || s.crop.inset || s.start >= ctx.end - 1e-6) continue;
    const z = Math.max(1, s.crop.zoom0, s.crop.zoom1);
    [s.crop.zoom0, s.crop.zoom1] = k++ % 2 ? [z * 1.06, z] : [z, z * 1.06];
  }
}

function noir(ctx: Ctx) {
  const T = ctx.song.period;
  push(ctx, { kind: "mono", start: 0, end: ctx.end, strength: 1 });
  // Flickering in (two black frames), then a flash on the first beat.
  push(ctx, { kind: "strobe", start: 0, end: 4 * F, strength: 1 });
  const first = ctx.beats.find((b) => b >= 0.25);
  if (first !== undefined && first < 1.2) push(ctx, { kind: "flash", start: first, end: first + 4 * F, strength: 0.7, at: first });
  dropHit(ctx, 1, 1.1);
  // The cuts: mostly hard, a dip or a zoom through where a section starts, zooms and crossfades on the phrases.
  transitions(ctx, PALETTES.noir!);
  // Before the drop, a black flicker on the biggest hits (a second apart at least). After
  // it, by turns, a kick punches in (every other one shaking too) and a clap or snare
  // flips to the negative for a frame: one or the other every two beats, not all of them.
  for (const h of spaced(
    ctx.hits.filter((h) => h.big && !afterDrop(ctx, h.t) && offDrop(ctx, h.t) && h.t > 1.2),
    Math.max(1, 1.5 * T),
  )) {
    push(ctx, { kind: "strobe", start: h.t, end: h.t + 4 * F, strength: 0.9 });
  }
  let k = 0;
  for (const h of spaced(
    ctx.hits.filter((h) => afterDrop(ctx, h.t) && offDrop(ctx, h.t) && (h.big || h.snap)),
    Math.max(1.8 * T, FLASH_GAP),
  )) {
    if (h.big) {
      push(ctx, { kind: "punch", start: h.t - F, end: h.t + 8 * F, strength: 0.8, at: h.t });
      if (k++ % 2 === 0) push(ctx, { kind: "shake", start: h.t, end: h.t + 6 * F, strength: 0.6, at: h.t });
    } else push(ctx, { kind: "invert", start: h.t, end: h.t + F, strength: 1 });
  }
}

function glitch(ctx: Ctx) {
  const T = ctx.song.period;
  push(ctx, { kind: "glitch", start: 0, end: 6 * F, strength: 1 });
  if (ctx.drop !== undefined) {
    const d = ctx.drop;
    push(ctx, { kind: "glitch", start: fr(d - 2 * F), end: d + 8 * F, strength: 1 }, { kind: "invert", start: d, end: d + F, strength: 1 });
  }
  dropHit(ctx, 0.3, 1, 1);
  // The cuts: tears with the colour split, smears, whips, zooms and strobes, by where they
  // fall; the hits inside a shot flicker.
  transitions(ctx, PALETTES.glitch!);
  // (Every third one stutters instead: eight frames at twelve a second, the colour split.)
  let k = 0;
  for (const h of spaced(between(ctx, ctx.hits.filter((h) => h.s >= 0.6 && afterDrop(ctx, h.t))), 1.5 * T)) {
    if (k++ % 3 === 2) push(ctx, { kind: "choppy", start: h.t, end: h.t + 8 * F, strength: 1 }, { kind: "split", start: h.t, end: h.t + 4 * F, strength: 0.7, at: h.t });
    else push(ctx, { kind: "glitch", start: h.t, end: h.t + 3 * F, strength: 0.55 }, { kind: "split", start: h.t, end: h.t + 4 * F, strength: 0.7, at: h.t });
  }
}

/** The moments a flash of white or black shows: a flash's (a strong one), a frame of the negative, each black frame of a strobe. */
function flashesOf(e: FxEvent): number[] {
  if (e.kind === "flash" && e.strength >= 0.5) return [e.at ?? e.start];
  if (e.kind === "invert") return [e.start];
  if (e.kind === "strobe") {
    const out: number[] = [];
    for (let k = 1; e.start + k * F < e.end - 1e-6; k += 2) out.push(e.start + k * F);
    return out;
  }
  return [];
}

/**
 * Never more than three flashes of white or black in any second (WCAG 2.3.1, the
 * photosensitivity limit): the strongest kept first (the drop's), and any that would
 * make a fourth left out.
 */
export function limitFlashes(fx: FxEvent[]): FxEvent[] {
  const kept: number[] = [];
  const drop = new Set<FxEvent>();
  const fits = (ts: number[]) =>
    ts.every((t) => {
      const all = [...kept, ...ts];
      // (Every second-long window with this flash in it: those starting at it, and at each flash in the second before it.)
      return [t, ...all.filter((k) => k > t - 1 && k <= t)].every((w) => all.filter((k) => k >= w - 1e-6 && k < w + 1 - 1e-6).length <= 3);
    });
  for (const e of [...fx].sort((a, b) => b.strength - a.strength || a.start - b.start)) {
    const ts = flashesOf(e);
    if (!ts.length) continue;
    if (fits(ts)) kept.push(...ts);
    else drop.add(e);
  }
  return fx.filter((e) => !drop.has(e));
}

/** Whip directions by turns, degrees: right, left, down, right, left, up. */
const WHIPS = [0, 180, 90, 0, 180, 270];

// ── the transitions ──────────────────────────────────────────────────────────

/** Where a cut falls in the music: on the drop, where a section or a four-bar phrase starts, on a hit, or on a plain beat. */
type Spot = "drop" | "section" | "phrase" | "hit" | "beat";

/**
 * The moves a cut can make: a hard cut, or a transition. The one-shot moves (zooms, a
 * whip, a spin, a blur, a glitch, a smear, a flash, a dip to black, a strobe, a shake on
 * landing) move the whole picture with a hard cut in the middle; the two-shot ones show
 * both shots at once: a crossfade (ending on the beat, as nio.trade's do, and coming in
 * runs), a push (the two along together), a slide (the next over the last).
 */
export type Move = "cut" | "dissolve" | "push" | "slide" | "dip" | "flash" | "burn" | "strobe" | "zoomIn" | "zoomOut" | "zoomThrough" | "whip" | "spin" | "blur" | "glitch" | "shake" | "smear";

/** A design's transitions: at each place in the music, the moves it makes there and how often (weights; "cut" is the hard cut). */
export type Palette = Record<Exclude<Spot, "drop">, Partial<Record<Move, number>>>;

/**
 * Each design's moves (the drop has its own, in the recipe). Mostly hard cuts on the
 * plain beats, as every reference edit is (two thirds to half of their cuts are hard);
 * the bigger moves where a phrase or a section starts; each design its own mix of them.
 */
export const PALETTES: Partial<Record<Design, Palette>> = {
  flash: {
    section: { flash: 2, strobe: 1.2, zoomThrough: 1, dip: 0.6 },
    phrase: { flash: 1.2, zoomThrough: 1, shake: 1, glitch: 0.5, cut: 0.6 },
    hit: { shake: 1.4, flash: 0.9, zoomIn: 0.7, smear: 0.5, cut: 2 },
    beat: { cut: 5, shake: 0.5, zoomIn: 0.4 },
  },
  zoom: {
    section: { zoomThrough: 2, spin: 1, push: 0.8, dip: 0.4 },
    phrase: { zoomThrough: 1.4, zoomOut: 1, push: 1, spin: 0.7, cut: 0.4 },
    hit: { zoomIn: 1.8, zoomOut: 1, smear: 0.6, shake: 0.5, cut: 1.6 },
    beat: { cut: 3.5, zoomIn: 1, zoomOut: 0.4, dissolve: 0.3 },
  },
  velocity: {
    section: { smear: 1.4, zoomThrough: 1.2, whip: 1, flash: 0.5, burn: 0.5 },
    phrase: { smear: 1.4, zoomIn: 1, whip: 0.7, push: 0.5, cut: 0.4 },
    hit: { smear: 1.2, shake: 1, zoomIn: 0.8, cut: 1.6 },
    beat: { cut: 4, smear: 0.6, zoomIn: 0.3 },
  },
  cinematic: {
    section: { dip: 2, dissolve: 1, blur: 0.6, burn: 0.8 },
    phrase: { blur: 1.2, dissolve: 1.2, slide: 0.5, burn: 0.5, cut: 0.6 },
    hit: { cut: 3, dissolve: 0.9, blur: 0.4, push: 0.3 },
    beat: { cut: 5, dissolve: 0.7 },
  },
  noir: {
    section: { dip: 1.4, zoomThrough: 1, dissolve: 0.6 },
    phrase: { zoomIn: 1, dissolve: 0.8, zoomOut: 0.6, cut: 1 },
    hit: { cut: 3, zoomIn: 0.6, shake: 0.4 },
    beat: { cut: 6, dissolve: 0.4 },
  },
  glitch: {
    section: { glitch: 2, strobe: 0.6, zoomThrough: 0.8, whip: 0.5 },
    phrase: { glitch: 1.5, smear: 0.6, whip: 0.6, zoomIn: 0.5, cut: 0.4 },
    hit: { glitch: 1.4, shake: 0.6, zoomIn: 0.5, cut: 1.6 },
    beat: { cut: 3, glitch: 0.7, smear: 0.3 },
  },
  whip: {
    section: { whip: 1.5, spin: 1.5, push: 0.8, burn: 0.4 },
    phrase: { whip: 1.5, push: 1, spin: 0.6, slide: 0.4, cut: 0.4 },
    hit: { whip: 1.2, spin: 0.6, shake: 0.6, push: 0.5, cut: 1.5 },
    beat: { cut: 3, whip: 0.7, push: 0.3 },
  },
  split: {
    section: { zoomThrough: 1.5, spin: 1, push: 0.8 },
    phrase: { zoomThrough: 1, push: 1, whip: 0.7, cut: 0.6 },
    hit: { zoomIn: 1.4, shake: 0.8, whip: 0.5, cut: 1.6 },
    beat: { cut: 4, zoomIn: 0.6 },
  },
  phonk: {
    section: { flash: 1.5, strobe: 1.2, zoomThrough: 1, spin: 0.6 },
    phrase: { smear: 1.2, spin: 0.8, flash: 0.8, glitch: 0.6, cut: 0.4 },
    hit: { shake: 1.5, smear: 0.8, glitch: 0.6, zoomIn: 0.5, cut: 1.5 },
    beat: { cut: 4, shake: 0.6, smear: 0.4 },
  },
  ice: {
    section: { dissolve: 1.4, zoomThrough: 1, slide: 0.8, flash: 0.5 },
    phrase: { dissolve: 1.2, zoomOut: 1, push: 0.7, blur: 0.6, cut: 0.6 },
    hit: { zoomOut: 1, zoomIn: 0.8, dissolve: 0.7, cut: 2 },
    beat: { cut: 4.5, dissolve: 0.8, zoomOut: 0.3 },
  },
  vhs: {
    section: { dip: 1.2, glitch: 0.8, dissolve: 0.5 },
    phrase: { glitch: 0.6, dissolve: 0.6, cut: 1.5 },
    hit: { cut: 4, glitch: 0.3, zoomIn: 0.3 },
    beat: { cut: 6 },
  },
};

/** Frames of room a move needs in the shot before its cut and the one after. */
const ROOM: Record<Exclude<Move, "cut">, [number, number]> = {
  dissolve: [4, 1],
  push: [5, 5],
  slide: [3, 7],
  dip: [6, 7],
  flash: [0, 4],
  burn: [2, 6],
  strobe: [5, 1],
  zoomIn: [5, 6],
  zoomOut: [5, 7],
  zoomThrough: [6, 8],
  whip: [5, 6],
  spin: [5, 7],
  blur: [3, 9],
  glitch: [3, 4],
  shake: [1, 9],
  smear: [5, 5],
};

/** Ways a push or a slide goes, by turns (degrees, as a whip's): left, up, right, down. */
const PUSHES = [180, 270, 0, 90];

/** A random number from 0 to 1 that's the same for the same plan (so an edit plans the same way twice). */
function seeded(plan: EditPlan): () => number {
  let h = 2166136261;
  for (const s of plan.shots) h = Math.imul(h ^ Math.round(s.start * 1000 + s.srcStart * 77), 16777619);
  let x = h >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function spotOf(ctx: Ctx, c: Cut): Spot {
  if (c.drop) return "drop";
  if (ctx.sections.has(c.t)) return "section";
  if (ctx.phrases.has(c.t)) return "phrase";
  return c.hit ? "hit" : "beat";
}

/** The events a move makes across cut `c` (the `k`th move of the edit, for its direction). */
function moveAt(c: Cut, m: Exclude<Move, "cut">, k: number): (FxEvent | null)[] {
  const t = c.t;
  switch (m) {
    case "dissolve":
      return [{ kind: "dissolve", start: fr(t - 4 * F), end: t, strength: 1, at: t }];
    case "push":
      return [{ kind: "push", start: fr(t - 4 * F), end: fr(t + 4 * F), strength: 1, at: t, dir: PUSHES[k % PUSHES.length] }];
    case "slide":
      return [{ kind: "slide", start: fr(t - 2 * F), end: fr(t + 6 * F), strength: 1, at: t, dir: PUSHES[k % PUSHES.length] }];
    case "dip":
      return [across(c, "fade", 1, 5, 6)];
    case "flash":
      return [{ kind: "flash", start: t, end: t + 3 * F, strength: 0.75, at: t }];
    case "burn":
      // (A warm film burn washing over the cut, near opaque on it, fading off the next shot: nio.trade's …8678.)
      return [{ kind: "burn", start: fr(t - F), end: fr(t + 5 * F), strength: 1, at: t }];
    case "strobe":
      return [{ kind: "strobe", start: fr(t - 4 * F), end: t, strength: 1 }];
    case "zoomIn":
      return [across(c, "zoomin", c.hit ? 0.6 : 0.45, 4, 5, 1)];
    case "zoomOut":
      return [across(c, "zoomin", 0.5, 4, 6, -1)];
    case "zoomThrough":
      return [across(c, "zoomin", 0.9, 5, 7, 1), { kind: "zoomblur", start: fr(t - 3 * F), end: fr(t + 3 * F), strength: 0.8, at: t }];
    case "whip":
      return [across(c, "whip", 1, 4, 5, WHIPS[k % WHIPS.length])];
    case "spin":
      return [across(c, "spin", 0.9, 4, 6, k % 2 ? 1 : -1)];
    case "blur":
      return [across(c, "blur", 0.7, 2, 8)];
    case "glitch":
      return [across(c, "glitch", c.hit ? 0.9 : 0.7, 2, 3), { kind: "split", start: t, end: t + 4 * F, strength: 0.8, at: t }];
    case "shake":
      return [{ kind: "shake", start: t, end: t + 8 * F, strength: 0.8, at: t }, { kind: "punch", start: t - F, end: t + 7 * F, strength: 0.6, at: t }];
    case "smear":
      return [{ kind: "zoomblur", start: fr(t - 4 * F), end: fr(t + 4 * F), strength: 0.85, at: t }];
  }
}

/**
 * The cuts' moves, from the design's palette: by where each cut falls in the music, never
 * the same move twice running (crossfades excepted: they come in runs), one used in the
 * last three less often, at most one a beat, fewer before the drop than after it; a quick
 * re-cut of one clip stays a hard cut, and so does a cut with no room for the move. The
 * drop's own move is the recipe's. Returns the moves made, in order.
 */
function transitions(ctx: Ctx, palette: Palette, from = 0): { t: number; move: Move }[] {
  const T = ctx.song.period;
  const rand = seeded(ctx.plan);
  const made: { t: number; move: Move }[] = [];
  let last = -Infinity;
  for (const c of ctx.cuts) {
    if (c.drop || c.t < from - 1e-6) continue;
    if (ctx.drop !== undefined && Math.abs(c.t - ctx.drop) < 0.9 * T) continue;
    if (c.shot.again && c.shot.end - c.shot.start < 0.5) continue;
    if (c.t - last < 0.9 * T) continue;
    // (A cut the recipe already moved, a crossfade into the drop say, keeps its move; so does one a window opens into.)
    if (taken(ctx, c.t)) continue;
    const spot = spotOf(ctx, c) as Exclude<Spot, "drop">;
    const held = !afterDrop(ctx, c.t) && (spot === "hit" || spot === "beat");
    const recent = made.slice(-3).map((x) => x.move);
    const room = (m: Exclude<Move, "cut">) => {
      const [pre, post] = ROOM[m];
      const two = m === "dissolve" || m === "push" || m === "slide";
      const flat = (s: ShotEvent) => !s.crop.inset && !s.crop.tilt && !s.hide && !s.audio;
      return c.prev.end - c.prev.start >= pre * F - 1e-6 && c.shot.end - c.shot.start >= post * F - 1e-6 && (!two || (flat(c.prev) && flat(c.shot)));
    };
    const options = (Object.entries(palette[spot]) as [Move, number][]).map(([m, w]): [Move, number] => {
      if (m === "cut") return [m, w];
      let weight = w * (held ? 0.45 : 1);
      if (recent[recent.length - 1] === m && m !== "dissolve") weight = 0;
      else if (recent.includes(m)) weight *= 0.5;
      if (!room(m)) weight = 0;
      return [m, weight];
    });
    const total = options.reduce((a, [, w]) => a + w, 0);
    if (total <= 0) continue;
    let r = rand() * total;
    let move: Move = "cut";
    for (const [m, w] of options) {
      if ((r -= w) < 0) {
        move = m;
        break;
      }
    }
    if (move === "cut") continue;
    const evs = moveAt(c, move, made.length).filter((e): e is FxEvent => !!e);
    if (!evs.length) continue;
    push(ctx, ...evs);
    made.push({ t: c.t, move });
    last = c.t;
  }
  return made;
}

function whip(ctx: Ctx) {
  const T = ctx.song.period;
  // The first shot slides in.
  push(ctx, { kind: "whip", start: 0, end: 5 * F, strength: 1, at: 0, dir: 0 });
  // A spin into the drop; the other cuts whip pans each way, spins, pushes and slides, by where they fall.
  const d = ctx.cuts.find((x) => x.drop);
  if (d) push(ctx, across(d, "spin", 1, 4, 6, ctx.plan.shots.length % 2 ? 1 : -1));
  transitions(ctx, PALETTES.whip!);
  dropHit(ctx, 0.35, 0);
  // The big hits inside a shot swing it round a few degrees.
  let w = 0;
  for (const h of spaced(between(ctx, ctx.hits.filter((h) => h.big && afterDrop(ctx, h.t))), 2 * T)) {
    push(ctx, { kind: "swing", start: fr(h.t - F), end: h.t + 9 * F, strength: 1, at: h.t, dir: w++ % 2 ? 1 : -1 });
  }
}

/**
 * The split screen: up to the drop (or, with none, the bar line two fifths of the way
 * in) the frame is stacked panels, each new shot going into the next panel in turn and
 * playing there until a shot replaces it, so every cut changes one panel; each panel's
 * first slides in. On the drop they're gone: the edit full frame, landing zoomed in, a
 * flash and a shake. A panel's clip plays on only as far as its own stretch of the
 * footage goes (slower, or held, when that's short).
 */
function split(ctx: Ctx) {
  const plan = ctx.plan;
  const T = ctx.song.period;
  const songStart = ctx.songStart;
  const bars = ctx.song.downbeats.map((d) => fr(d - songStart - CUT_LEAD)).filter((t) => t >= 2 && t <= 0.6 * ctx.end);
  const until = ctx.drop ?? [...bars].sort((a, b) => Math.abs(a - 0.4 * ctx.end) - Math.abs(b - 0.4 * ctx.end))[0];
  const P = panelsFor(plan.aspect);
  const shots = plan.shots.filter((s) => s.start < (until ?? 0) - 1e-6);
  if (until === undefined || shots.length < P.length || shots.some((s) => s.audio || s.crop.inset)) {
    // (No room for panels: the zoom design instead, and it says so.)
    ctx.plan.design = "zoom";
    ctx.plan.checks = { ...ctx.plan.checks, design: "zoom" };
    return zoom(ctx);
  }
  const byId = new Map(ctx.scans.map((sc) => [sc.id, sc]));
  const overlays: OverlayEvent[] = [];
  shots.forEach((s, i) => {
    const p = P[i % P.length];
    const end = i + P.length < shots.length ? shots[i + P.length].start : until;
    const len = end - s.start;
    let speed = s.kind === "video" ? s.speed : 0;
    const scan = byId.get(s.source);
    if (scan && s.kind === "video") {
      const bounds = boundsOf(scan);
      const k = bounds.findIndex((b) => b.t > s.srcStart + 1e-6);
      const room = k >= 0 ? bounds[k].t - bounds[k].margin - s.srcStart : scan.duration - s.srcStart;
      if (room < len * speed) speed = room / len >= 0.35 ? room / len : 0;
    }
    // (In from the side, by turns, over five frames: the first clip in each panel.)
    const from = i % 2 ? 1.5 : -0.5;
    const path = i < P.length && i > 0 ? (plan.aspect === "4x3" ? [0, p.x, from, p.h, 5 * F, p.x, p.y, p.h] : [0, from, p.y, p.h, 5 * F, p.x, p.y, p.h]) : undefined;
    overlays.push({
      start: s.start,
      end,
      source: s.source,
      kind: s.kind,
      srcStart: s.srcStart,
      speed,
      cx: s.crop.cx,
      cy: s.crop.cy,
      zoom: 1,
      ...(s.crop.rect ? { rect: s.crop.rect } : {}),
      x: p.x,
      y: p.y,
      size: p.h,
      aspect: (p.w * plan.width) / (p.h * plan.height),
      tilt: 0,
      panel: true,
      ...(path ? { path } : {}),
    });
    s.hide = true;
  });
  plan.overlays = [...(plan.overlays ?? []), ...overlays].sort((a, b) => a.start - b.start);
  // The drop: full frame, landing zoomed in.
  const d = ctx.cuts.find((c) => Math.abs(c.t - until) < 1e-6);
  if (d) push(ctx, across(d, "zoomin", 0.9, 0, 8));
  if (ctx.drop !== undefined) dropHit(ctx, 0.5, 0.8);
  // After it, the cuts zoom through, push, whip and shake, and the beats bump the picture.
  transitions(ctx, PALETTES.split!, until + T);
  for (const b of ctx.beats) if (b > until + T && !ctx.cuts.some((c) => Math.abs(c.t - b) < 0.2)) push(ctx, { kind: "punch", start: b - F, end: b + 6 * F, strength: 0.35, at: b });
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * A camcorder tape: the picture soft, its colour bleeding late, its lines wobbling, the
 * bottom torn; "PLAY" in the corner and the date under it. The tape catches (a short
 * tear) where a phrase starts, harder on the drop, which pumps the zoom as a camcorder's
 * does.
 */
function vhs(ctx: Ctx) {
  push(ctx, { kind: "vhs", start: 0, end: ctx.end, strength: 1 }, { kind: "glitch", start: 0, end: 4 * F, strength: 0.5 });
  const d = ctx.cuts.find((x) => x.drop);
  if (d) push(ctx, { kind: "glitch", start: d.t, end: d.t + 5 * F, strength: 0.6 }, across(d, "zoomin", 0.6, 0, 12));
  // The cuts: mostly hard, as a camcorder's are; the tape catching or a dip where a section or a phrase starts.
  transitions(ctx, PALETTES.vhs!);
  const n = ctx.now;
  const date = `${MONTHS[n.getMonth()]}. ${String(n.getDate()).padStart(2, "0")} ${n.getFullYear()}`;
  const end = ctx.end - 4 * F;
  ctx.plan.captions.push({ style: "osd", text: "PLAY ▶", start: 0, end }, { style: "osd", text: date, start: 0, end, y: osdLine(ctx.plan, 1) });
}

/** The tape's lettering, line `k` down from the top left (as a share of the frame's height). */
const osdLine = (plan: EditPlan, k: number) => 0.08 + (k * 0.062 * 1.3 * Math.min(plan.width, plan.height)) / plan.height;

/**
 * nio.trade's own: up from black over half a second; the last cuts into the drop
 * crossfading a beat apart (4 frames, the next shot whole on the beat: …3659); nothing
 * on the drop (a hard cut is the moment); then for two bars every cut a linear
 * crossfade, a picture a beat: either 6 frames finishing on its kick (…1290's flex
 * burst) or, in every other edit, short ones (3 or 5 mixed frames by turns) with their
 * halfway frame on the beat (…6955's); hard cuts after, and a crossfade again where a
 * phrase starts.
 */
function flow(ctx: Ctx) {
  const T = ctx.song.period;
  // (Every other edit of a batch: its number is the last part of the plan's id.)
  const centred = Number(/-v(\d+)$/.exec(ctx.plan.id)?.[1] ?? 1) % 2 === 0;
  // (Up from black, the first shot pushing in 6% as it comes up.)
  push(ctx, { kind: "fadein", start: 0, end: 15 * F, strength: 1 });
  const first = ctx.plan.shots[0];
  if (first && first.kind === "video" && !first.audio && !first.crop.inset) first.crop.zoom1 = Math.max(first.crop.zoom1, first.crop.zoom0 * 1.06);
  // (Frames of the shot going out and of the one coming in each needs, two of its own left.)
  const fits = (c: Cut, before: number, after: number) =>
    c.prev.end - c.prev.start >= (before + 2) * F && c.shot.end - c.shot.start >= (after + 2) * F && !c.prev.audio && !c.shot.audio && !c.prev.crop.inset && !c.shot.crop.inset && !c.prev.crop.tilt && !c.shot.crop.tilt && !c.shot.hide && !c.prev.hide;
  const drop = ctx.drop;
  // …6955's lengths by turns: 4, 6, 6, 4, 4, 6, 4, 4, 4, 6, 6, 4 frames (3 or 5 of them mixed).
  const MIXED = [3, 5, 5, 3, 3, 5, 3, 3, 3, 5, 5, 3];
  let last = -Infinity;
  let k = 0;
  for (const c of ctx.cuts) {
    if (c.drop || c.t - last < 0.75 * T || taken(ctx, c.t)) continue;
    const intoDrop = drop !== undefined && c.t < drop - 0.75 * T && c.t > drop - 6.5 * T;
    const burst = drop !== undefined && c.t > drop + 0.5 * T && c.t <= drop + 8.5 * T;
    const phrase = drop !== undefined && c.t > drop + 8.5 * T && ctx.phrases.has(c.t);
    if (!(intoDrop || burst || phrase) || (c.shot.again && c.shot.end - c.shot.start < 0.5)) continue;
    if (centred && !intoDrop) {
      // (The middle mixed frame on the cut: half one shot, half the other, on the beat.)
      const m = MIXED[k % MIXED.length];
      const half = (m - 1) / 2;
      if (!fits(c, half, half + 1)) continue;
      push(ctx, { kind: "dissolve", start: fr(c.t - half * F), end: fr(c.t + (half + 1) * F), strength: 1, at: c.t });
      k++;
    } else {
      const n = intoDrop ? 4 : 6;
      if (!fits(c, n, 0)) continue;
      push(ctx, { kind: "dissolve", start: fr(c.t - n * F), end: c.t, strength: 1, at: c.t });
    }
    last = c.t;
  }
}

/** A cut something already happens on (a window opening into the next shot, a move the recipe made): it keeps it. */
const taken = (ctx: Ctx, t: number) => [...ctx.plan.fx, ...ctx.fx].some((e) => e.at !== undefined && Math.abs(e.at - t) < 1e-6 && e.kind !== "punch");

/**
 * The beat or two before the drop held on one frame (the build stops dead, the song still
 * going), pushing in, then the drop hits out of it: a freeze-frame into the drop. With
 * `choppy`, that many beats before it the picture stutters at twelve frames a second (as
 * it does under TJR's windows), slowing to the stop.
 */
function freezeIntoDrop(ctx: Ctx, beats = 1, choppy = 0) {
  const d = ctx.cuts.find((x) => x.drop);
  if (!d) return;
  const len = Math.min(beats * ctx.song.period, d.prev.end - d.prev.start - 3 * F);
  if (len < 6 * F) return;
  const from = fr(d.t - len);
  push(ctx, { kind: "freeze", start: from, end: d.t, strength: 1 }, { kind: "punch", start: from, end: d.t, strength: 0.5, at: d.t });
  const stutter = Math.min(choppy * ctx.song.period, from - d.prev.start - 2 * F);
  if (stutter >= 6 * F) push(ctx, { kind: "choppy", start: fr(from - stutter), end: from, strength: 1 });
}

/** Phonk: dark and hard. The build slows on its biggest hits, freezes into the drop; then every kick shakes and glows, the claps flash or flip to the negative by turns. */
function phonk(ctx: Ctx) {
  const T = ctx.song.period;
  push(ctx, { kind: "strobe", start: 0, end: 4 * F, strength: 1 }, { kind: "glow", start: 0, end: 10 * F, strength: 0.3, at: 2 * F });
  freezeIntoDrop(ctx, 2, 1);
  dropHit(ctx, 1, 1.4);
  if (ctx.drop !== undefined) push(ctx, { kind: "glow", start: ctx.drop, end: ctx.drop + 12 * F, strength: 0.4, at: ctx.drop }, { kind: "zoomblur", start: ctx.drop, end: ctx.drop + 5 * F, strength: 0.9, at: ctx.drop });
  // Then the drop's shot zooms in by steps, as nio.trade's …0002 does its chart.
  const dc = ctx.cuts.find((x) => x.drop);
  if (dc && dc.shot.end - dc.shot.start >= 16 * F) push(ctx, { kind: "steps", start: fr(dc.t + 6 * F), end: fr(Math.min(dc.shot.end, dc.t + 6 * F + 0.9)), strength: 0.5 });
  transitions(ctx, PALETTES.phonk!);
  // Before the drop, a black flicker on the biggest hits; after it, each kick shakes, glows
  // and punches in, and the claps and snares flash white or flip to the negative, by turns.
  for (const h of spaced(ctx.hits.filter((h) => h.big && !afterDrop(ctx, h.t) && offDrop(ctx, h.t) && h.t > 1), Math.max(1, 2 * T))) {
    push(ctx, { kind: "strobe", start: h.t, end: h.t + 4 * F, strength: 0.9 });
  }
  let k = 0;
  for (const h of spaced(between(ctx, ctx.hits.filter((h) => afterDrop(ctx, h.t) && offDrop(ctx, h.t) && (h.big || h.snap)), 0.3), Math.max(0.9 * T, FLASH_GAP))) {
    if (h.big) push(ctx, { kind: "shake", start: h.t, end: h.t + 8 * F, strength: 0.9, at: h.t }, { kind: "punch", start: h.t - F, end: h.t + 7 * F, strength: 0.7, at: h.t }, { kind: "glow", start: h.t, end: h.t + 6 * F, strength: 0.25, at: h.t });
    else push(ctx, k++ % 2 ? { kind: "invert", start: h.t, end: h.t + F, strength: 1 } : { kind: "flash", start: h.t, end: h.t + 3 * F, strength: 0.7, at: h.t });
  }
}

/** Ice: cool and glowing. Crossfades into the drop a beat apart, a freeze and a white flash on it, then glow pulses, zooms out and in, and crossfades on the phrases. */
function ice(ctx: Ctx) {
  const T = ctx.song.period;
  push(ctx, { kind: "glow", start: 0, end: 14 * F, strength: 0.6, at: 0 }, { kind: "blur", start: 0, end: 12 * F, strength: 0.8, at: 0 });
  // The last cuts into the drop crossfade (as nio.trade's builds do), a beat apart.
  const into = ctx.cuts.filter((c) => !c.drop && ctx.drop !== undefined && c.t < ctx.drop - 0.9 * T && c.t > ctx.drop - 6 * T);
  for (const c of into) if (c.prev.end - c.prev.start >= 6 * F && !c.prev.audio && !c.shot.audio && !c.prev.crop.inset && !c.shot.crop.inset) push(ctx, { kind: "dissolve", start: fr(c.t - 4 * F), end: c.t, strength: 1, at: c.t });
  freezeIntoDrop(ctx, 1);
  if (ctx.drop !== undefined) {
    const d = ctx.drop;
    push(ctx, { kind: "flash", start: d, end: d + 6 * F, strength: 1, at: d }, { kind: "glow", start: d, end: d + 18 * F, strength: 0.9, at: d });
    const dc = ctx.cuts.find((x) => x.drop);
    if (dc) push(ctx, across(dc, "zoomin", 0.8, 0, 8, -1));
  }
  transitions(ctx, PALETTES.ice!);
  // The kicks after the drop glow (no shakes: it stays smooth).
  for (const h of spaced(between(ctx, ctx.hits.filter((h) => h.big && afterDrop(ctx, h.t) && offDrop(ctx, h.t)), 0.3), 1.8 * T)) {
    push(ctx, { kind: "glow", start: h.t, end: h.t + 10 * F, strength: 0.5, at: h.t }, { kind: "punch", start: h.t - F, end: h.t + 8 * F, strength: 0.35, at: h.t });
  }
}

/** The song's beats as they fall in the edit (every one, heard or not: the grid the editor cuts on), and with the eighths between them. */
function gridOf(ctx: Ctx): { beats: number[]; eighths: number[] } {
  const inside = (t: number) => t > 0.05 && t < ctx.end - 0.2;
  const bs = ctx.song.beats.map((b) => b - ctx.songStart - CUT_LEAD);
  const eighths: number[] = [];
  for (let i = 0; i < bs.length; i++) {
    eighths.push(fr(bs[i]));
    if (i + 1 < bs.length) eighths.push(fr((bs[i] + bs[i + 1]) / 2));
  }
  return { beats: bs.map(fr).filter(inside), eighths: eighths.filter(inside) };
}

/** The song's bar lines as they fall in the edit. */
const barsOf = (ctx: Ctx) => ctx.song.downbeats.map((d) => fr(d - ctx.songStart - CUT_LEAD)).filter((t) => t > -0.01 && t < ctx.end);

/** A shot the in-shot moves can work on: a clip, whole frame, shown. */
const plainShot = (s: ShotEvent) => s.kind === "video" && !s.crop.inset && !s.crop.tilt && !s.hide;

/** A punch-in step's size (the first in a clip, then a second smaller one) and its turn, degrees, as measured in nio.trade's …2531 and …5448. */
const STEPS = [0.084, 0.161, 0.12, 0.047, 0.145, 0.1];
const SECOND_STEPS = [0.039, 0.088, 0.06];
const ROLLS = [1, 0, 1.2, 0, -1.1, 1.3, 0, -0.9];

/**
 * nio.trade's LARP edits (…5448, …2531), as they're cut: hard cuts only, not a transition
 * anywhere, the variety all inside the shots. Up from black over half a second. Before the
 * drop the picture changes on every beat or eighth even inside a clip: in one frame it
 * jumps closer (4 to 16%, turning a degree or so) and stays, up to twice a clip and a
 * quarter closer at most. The first shot on a bar line after the opening two bars comes in
 * black and white and a fifth darker, and snaps to colour on the next beat (the one after
 * it too, when it's on the next bar). A bar or two before the drop, a crash zoom: half as
 * close again in five frames, landing on a beat, held to the cut. The drop is a plain hard
 * cut; on its shot, someone in it gets a face on their head on the beats (a picture of
 * theirs or a still, turned), the shot freezing under it in some; then now and then a step
 * closer on an eighth, or a push in of two fifths whose quickest frame is on the beat.
 */
function reframe(ctx: Ctx) {
  const T = ctx.song.period;
  const plan = ctx.plan;
  const rand = seeded(plan);
  const drop = ctx.drop;
  const { beats: beatsAll, eighths: grid } = gridOf(ctx);
  push(ctx, { kind: "fadein", start: 0, end: 15 * F, strength: 1 });
  const busy = new Set<ShotEvent>();
  const preDrop = (t: number) => drop === undefined || t < drop - 1e-6;

  // The subject in black and white, snapping to colour on the next beat (twice running when
  // the next cut is on the bar after): a person in the shot when there's one.
  const bars = barsOf(ctx);
  const onBar = (t: number) => bars.some((b) => Math.abs(b - t) <= 1.5 * F);
  const scanOf = (id: string) => ctx.scans.find((sc) => sc.id === id);
  const someoneIn = (sh: ShotEvent) => {
    const sc = scanOf(sh.source);
    return sc ? someone(sc, sh.srcStart, sh.srcStart + sourceSpan(sh)) : 0;
  };
  const snapOf = (c: Cut) => {
    const len = c.shot.end - c.shot.start;
    if (len >= T + 3 * F) return fr(c.t + T);
    if (T / 2 >= 0.3 && len >= T / 2 + 3 * F) return fr(c.t + T / 2);
    return null;
  };
  const grey = (t: number) => plan.fx.some((e) => e.kind === "mono" && e.start <= t + 1e-6 && e.end > t + T);
  const reveals = ctx.cuts.filter((c) => !c.drop && preDrop(c.t) && c.t >= Math.min(2 * 4 * T, 3, 0.4 * (drop ?? ctx.end)) && (drop === undefined || c.t <= drop - 2 * T) && plainShot(c.shot) && !c.shot.audio && !grey(c.t) && snapOf(c) !== null);
  const reveal = [...reveals].sort((a, b) => Number(onBar(b.t)) - Number(onBar(a.t)) || Number(someoneIn(b.shot) >= 0.5) - Number(someoneIn(a.shot) >= 0.5) || a.t - b.t)[0];
  if (reveal) {
    const again = reveals.find((c) => c.t > reveal.t && c.t - reveal.t <= 4 * T + 2 * F && Math.abs(c.t - reveal.shot.end) < 1e-6);
    for (const c of again ? [reveal, again] : [reveal]) {
      push(ctx, { kind: "bw", start: c.t, end: snapOf(c)!, strength: 1 });
      busy.add(c.shot);
    }
  }

  // The crash zoom, a bar or two before the drop: onto the beat a clip has room for, held to its cut.
  if (drop !== undefined) {
    const into = plan.shots.filter((sh) => plainShot(sh) && !busy.has(sh) && sh.start >= drop - 8 * T && sh.end <= drop + 1e-6 && sh.start > 0.5);
    for (const sh of [...into].reverse()) {
      const beat = beatsAll.find((b) => b >= sh.start + 6 * F && b <= sh.end - Math.max(0.25, 0.5 * T));
      if (beat === undefined) continue;
      const n = rand() < 0.5 ? 5 : 7;
      push(ctx, { kind: "crash", start: fr(Math.max(sh.start + F, beat - n * F)), end: sh.end, strength: 0.45 + 0.15 * rand(), at: beat });
      busy.add(sh);
      break;
    }
  }

  // The steps: before the drop, in every clip a beat and a half long or more, closer on the
  // beats or eighths that split it (one, or two in a long one); after it, one every two bars.
  let k = Math.floor(rand() * STEPS.length);
  let pre = 0;
  let post = 0;
  let lastPost = -Infinity;
  for (const sh of plan.shots) {
    if (sh.start >= ctx.end - 1e-6) break;
    if (!plainShot(sh) || busy.has(sh)) continue;
    const len = sh.end - sh.start;
    const before = preDrop(sh.start);
    // (Not the last shot after the drop: it dips into the card.)
    if (before ? pre >= 5 || len < Math.max(0.55, 1.4 * T) : post >= 3 || len < Math.max(0.42, 0.9 * T) || sh.start - lastPost < 8 * T || sh.role === "drop" || sh.end >= ctx.end - 1e-6) continue;
    const n = before && len >= 2.6 * T ? 2 : 1;
    const room = grid.filter((g) => g >= sh.start + Math.max(0.2, 0.4 * T) && g <= sh.end - Math.max(0.15, 0.4 * T));
    const at: number[] = [];
    for (let j = 1; j <= n; j++) {
      const want = sh.start + (len * j) / (n + 1);
      const g = room.filter((x) => !at.length || x - at[at.length - 1] >= 0.3).sort((a, b) => Math.abs(a - want) - Math.abs(b - want))[0];
      if (g !== undefined && (!at.length || g > at[at.length - 1])) at.push(g);
    }
    if (!at.length) continue;
    // (A quarter closer at most, both steps together.)
    const first = before ? STEPS[k % STEPS.length] : 0.09 + 0.11 * rand();
    const second = Math.min(SECOND_STEPS[k % SECOND_STEPS.length], 1.25 / (1 + first) - 1);
    at.forEach((g, j) => push(ctx, { kind: "reframe", start: g, end: sh.end, strength: j ? second : first, dir: ROLLS[(k + j) % ROLLS.length] }));
    k++;
    if (before) pre += at.length;
    else {
      post++;
      lastPost = sh.start;
    }
  }

  // After the drop, now and then a push in of two fifths over ten frames, its quickest frame on a beat or an eighth.
  let lastPush = drop ?? Infinity;
  for (const sh of plan.shots) {
    if (drop === undefined || sh.start < drop + 2 * T || sh.start >= ctx.end - 1e-6 || !plainShot(sh) || busy.has(sh)) continue;
    if (sh.start - lastPush < 6 * T || ctx.fx.some((e) => e.kind === "reframe" && e.start >= sh.start - 1e-6 && e.start < sh.end)) continue;
    const beat = grid.find((b) => b >= sh.start + 6 * F && b <= sh.end - 6 * F);
    if (beat === undefined) continue;
    push(ctx, { kind: "crash", start: fr(beat - 5 * F), end: sh.end, strength: 0.37 + 0.06 * rand(), at: fr(beat + 5 * F) });
    lastPush = sh.start;
  }

  // The drop: a plain cut. Then on its shot, if someone's in it, a face on their head on
  // the last beats (a picture, then another on the eighth), the shot freezing under it in
  // some (…5448 freezes, …2531 plays on); not when the edit has its own pictures on heads.
  const dropShot = plan.shots.find((sh) => sh.role === "drop");
  if (dropShot && dropShot.kind === "video" && !plan.overlays?.some((o) => o.place) && someoneIn(dropShot) >= 0.5) {
    const pops = headPops(dropShot, dropShot.end, grid, ctx.scans, plan.shots, Math.floor(rand() * 4)).slice(-2);
    if (pops.length) {
      plan.overlays = [...(plan.overlays ?? []), ...pops].sort((a, b) => a.start - b.start);
      if (rand() < 0.5) push(ctx, { kind: "freeze", start: pops[0].start, end: dropShot.end, strength: 1 });
    }
  }
}

const RECIPES: Record<Exclude<Design, "clean">, (ctx: Ctx) => void> = { flow, reframe, flash, zoom, velocity, cinematic, noir, glitch, whip, split, vhs, phonk, ice };

// ── the caption ──────────────────────────────────────────────────────────────

/** Each design's caption: how the words show (a line held, or a word on each beat first, popping in), in which style. */
const CAPTIONS: Partial<Record<Design, { style: CaptionStyle; words: boolean }>> = {
  flash: { style: "impact", words: true },
  zoom: { style: "impact", words: true },
  velocity: { style: "impact", words: true },
  whip: { style: "impact", words: true },
  split: { style: "impact", words: true },
  glitch: { style: "glitch", words: true },
  cinematic: { style: "film", words: false },
  vhs: { style: "osd", words: false },
  phonk: { style: "impact", words: true },
  ice: { style: "film", words: false },
};

/**
 * A caption shown a word at a time on the beats (each replacing the last and popping
 * in, a third of a second apart at least), then the whole line to its end. Up to eight
 * words; a longer caption shows whole.
 */
export function wordByWord(cap: CaptionEvent, style: CaptionStyle, beats: number[]): CaptionEvent[] {
  const words = cap.text.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 8) return [{ ...cap, style }];
  const at = [cap.start];
  for (const b of beats) if (b > at[at.length - 1] + 0.3 - 1e-6 && b < cap.end - 0.5) at.push(b);
  if (at.length < words.length + 1) return [{ ...cap, style }];
  const out: CaptionEvent[] = words.map((w, i) => ({ ...cap, style, text: w, start: at[i], end: at[i + 1], pop: true }));
  out.push({ ...cap, style, start: at[words.length], pop: true });
  return out;
}

/** How a design brings its caption on, for a caption of the user's own design left to it. */
const DESIGN_ANIMATES: Partial<Record<Design, NonNullable<CaptionEvent["anim"]> | "words" | "pop">> = { cinematic: "fade", vhs: "type", noir: "fade" };

/**
 * Captions of the user's own design (the caption editor) come on as they say: as the
 * edit's design brings its caption on (`design`), a word on each beat (on an even beat
 * of their own when the song has too few: at most eight words), popping in, fading in,
 * typed out, or simply there. Where they sit and how they look stay as the user set them.
 */
export function ownCaptions(captions: CaptionEvent[], design: Design | undefined, beats: number[]): CaptionEvent[] {
  return captions.flatMap((c) => {
    if (!c.look) return [c];
    // (A subtitle keeps to the words said: popping in where it would have gone word by word.)
    const asked = c.spoken && (c.look.animate === "words" || c.look.animate === "design") ? "pop" : c.look.animate;
    const how = asked === "design" ? (design ? (CAPTIONS[design]?.words ? "words" : (DESIGN_ANIMATES[design] ?? "none")) : "pop") : asked;
    if (how === "words") {
      const split = wordByWord(c, c.style, beats);
      if (split.length > 1) return split;
      // (Too few beats heard: a word every 0.4 s or so, the whole line after.)
      const n = c.text.split(/\s+/).filter(Boolean).length;
      const step = n >= 2 && n <= 8 ? Math.min(0.4, (c.end - c.start - 0.5) / n) : 0;
      return step >= 0.3 ? wordByWord(c, c.style, Array.from({ length: n }, (_, i) => c.start + (i + 1) * step)) : [{ ...c, pop: true }];
    }
    if (how === "pop") return [{ ...c, pop: true }];
    if (how === "fade" || how === "type") return [{ ...c, anim: how }];
    return [{ ...c, pop: false }];
  });
}

// ── applying one ─────────────────────────────────────────────────────────────

export interface DesignOptions {
  /** the footage (a split screen's panels play only as far as their stretch of it goes) */
  scans?: Scan[];
  /** the date a tape shows (today) */
  now?: Date;
}

/**
 * A montage in a design: its colour, and the design's effects in place of the plain
 * flourish (a clean edit keeps it); its mood line or POV label restyled (a meme caption
 * stays as it is: it's the joke). The plan is changed and returned.
 */
export function applyDesign(plan: EditPlan, design: Design, song: SongAnalysis, opts: DesignOptions = {}): EditPlan {
  plan.grade = DESIGN_GRADES[design];
  plan.design = design;
  plan.checks = { ...plan.checks, design };
  // (Captions of the user's own design: before the drop, as they asked to come on.)
  if (plan.captions.some((c) => c.look)) {
    const drop = plan.shots.find((s) => s.role === "drop")?.start;
    plan.captions = ownCaptions(plan.captions, design, heardBeats(plan, song).filter((b) => b < (drop ?? Infinity)));
  }
  if (design === "clean") return plan;
  const ctx = contextOf(plan, song, opts.scans ?? [], opts.now ?? new Date());
  // (What finish added for the plain edit goes: its flash, burn, shake, punches and blurs.
  // Up from black stays for the designs that don't open their own way.)
  const own = new Set<FxEvent["kind"]>(["flash", "burn", "punch", "shake", "zoomblur", "split"]);
  const opensOwn = design !== "cinematic";
  plan.fx = plan.fx.filter((e) => !own.has(e.kind) && !(opensOwn && e.kind === "fadein" && e.start < 1e-6));
  const cap = CAPTIONS[design];
  if (cap && plan.captions.length) {
    const beats = ctx.beats.filter((b) => b < (ctx.drop ?? ctx.end));
    plan.captions = plan.captions.flatMap((c) => {
      if (c.style === "meme" || c.look || c.spoken) return [c];
      // (A film title in a wide frame sits in the bottom bar; in a tall one, where the app's
      // own caption covers the bottom, in the middle. A tape's, under the date.)
      const y = cap.style === "film" ? (plan.height > plan.width * 1.2 ? 0.5 : 1 - BARS[plan.aspect] / 2) : cap.style === "osd" ? osdLine(plan, 2) : undefined;
      const placed = y !== undefined ? { ...c, y } : c;
      return cap.words ? wordByWord(placed, cap.style, beats) : [{ ...placed, style: cap.style }];
    });
  }
  RECIPES[design](ctx);
  plan.fx = limitFlashes([...plan.fx, ...ctx.fx]);
  return plan;
}

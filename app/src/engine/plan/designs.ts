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
import type { EditStyle } from "./styles";
import { FPS, WARM_GRADE, type Aspect, type CaptionEvent, type CaptionStyle, type EditPlan, type FxEvent, type Grade, type OverlayEvent, type ShotEvent } from "./types";

export type Design = "clean" | "flash" | "zoom" | "velocity" | "cinematic" | "noir" | "glitch" | "whip" | "split" | "vhs";

export const DESIGNS: { value: Design; name: string; desc: string }[] = [
  { value: "clean", name: "Clean", desc: "Hard cuts in warm film colour, a punch-in on the big hits (nio.trade, mico)." },
  { value: "flash", name: "Flash & shake", desc: "A cold edit: drained and dark, white flashes on the claps, shakes on the kicks, a strobe into the drop." },
  { value: "zoom", name: "Zoom", desc: "Every cut rushes in and lands zoomed, the picture bumping on the beats between." },
  { value: "velocity", name: "Velocity", desc: "Slow motion on each hit, then a rush into the next cut, with zoom blurs and shakes." },
  { value: "cinematic", name: "Cinematic", desc: "Letterbox bars, teal and orange, glow, light leaks, blur-ins and dips." },
  { value: "noir", name: "Noir", desc: "Hard black and white: punches on the kicks, the negative on the claps, strobes in the build." },
  { value: "glitch", name: "Glitch", desc: "Torn bands, colour splits and scanlines on the cuts and the hits." },
  { value: "whip", name: "Whip", desc: "Whip pans between the shots, a spin into the drop, swings on the hits." },
  { value: "split", name: "Split screen", desc: "The build in stacked panels, one changing on each cut, then the drop full frame." },
  { value: "vhs", name: "VHS", desc: "A camcorder tape: soft, bleeding colour, wobbling lines, PLAY and the date on screen." },
];

export const designName = (d: Design) => DESIGNS.find((x) => x.value === d)!.name;

/** Each design's colour (the renderer balances every shot first, then this). */
export const DESIGN_GRADES: Record<Design, Grade> = {
  clean: WARM_GRADE,
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
};

/**
 * The designs that go with a style: a slow edit stays calm; black and white all through
 * would undo a style's own flip into colour; panels would hide someone talking and a
 * burst of photos (the burst's pictures on someone's head need the overlays too).
 */
export function fits(d: Design, style: EditStyle): boolean {
  if (style === "slow") return d === "clean" || d === "cinematic" || d === "noir" || d === "vhs";
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
  const hot: Design[] = ["flash", "glitch", "velocity", "zoom", "whip", "noir", "split", "clean", "cinematic", "vhs"];
  const mid: Design[] = ["zoom", "whip", "cinematic", "clean", "split", "flash", "vhs", "velocity", "noir", "glitch"];
  const calm: Design[] = ["cinematic", "vhs", "noir", "clean", "split", "whip", "zoom"];
  const base = heat >= 0.62 ? hot : heat >= 0.4 ? mid : calm;
  if (darkness(scans) < 0.7) return base;
  const dark = new Set<Design>(["cinematic", "noir", "flash"]);
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
  return d === "cinematic" || d === "vhs" ? "calm" : d === "clean" ? undefined : "action";
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
  const beats = song.beats
    .map((b) => fr(b - songStart - CUT_LEAD))
    .filter((t) => t > 0.05 && t < end - 0.2 && song.accents.some((a) => Math.abs(a.t - songStart - CUT_LEAD - t) <= 0.05 && a.s >= 0.05 && (a.ls ?? a.s) >= 0.5));
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
  // A white flash on the claps and snares, and on the cuts that land on a hit, lighter
  // before the drop; the kicks shake the picture, punch in and split its colour.
  const flashes = spaced(
    [...ctx.cuts.filter((c) => c.hit && !c.drop).map((c) => ({ t: c.t })), ...between(ctx, ctx.hits.filter((h) => h.snap), 0.4)]
      .filter((x) => offDrop(ctx, x.t) && x.t > 0.4)
      .sort((a, b) => a.t - b.t),
    Math.max(0.9 * T, FLASH_GAP),
  );
  for (const x of flashes) {
    const s = afterDrop(ctx, x.t) ? 0.6 : 0.35;
    push(ctx, { kind: "flash", start: x.t, end: x.t + 3 * F, strength: s * (0.6 + 0.4 * ctx.drive(x.t)), at: x.t });
  }
  const kicks = ctx.hits.filter((h) => h.big && (afterDrop(ctx, h.t) || h.s >= 0.9) && offDrop(ctx, h.t));
  for (const h of spaced(kicks, 1.5 * T)) {
    push(ctx, { kind: "shake", start: h.t, end: h.t + 8 * F, strength: 0.8, at: h.t }, { kind: "punch", start: h.t - F, end: h.t + 8 * F, strength: 0.6, at: h.t }, { kind: "split", start: h.t, end: h.t + 4 * F, strength: 0.8, at: h.t });
  }
}

function zoom(ctx: Ctx) {
  const T = ctx.song.period;
  // The first shot lands zoomed in and settles.
  push(ctx, { kind: "zoomin", start: 0, end: 9 * F, strength: 0.8, at: 0 });
  // Every cut rushes in and lands zoomed (every fourth pulls out instead), harder on a hit
  // and hardest on the drop; a re-cut a few frames on stays a hard cut.
  let k = 0;
  let last = -Infinity;
  for (const c of ctx.cuts) {
    if (c.t - last < 0.8 * T && !c.drop) continue;
    if (c.shot.again && c.shot.end - c.shot.start < 0.3) continue;
    const s = c.drop ? 1 : c.hit ? 0.6 : 0.4;
    const e = across(c, "zoomin", s, 4, c.drop ? 8 : 5, !c.drop && k % 4 === 3 ? -1 : 1);
    if (e) {
      push(ctx, e);
      k++;
      last = c.t;
    }
  }
  dropHit(ctx, 0.4, 0);
  // The picture bumps on the beats between the cuts.
  for (const b of ctx.beats) {
    if (ctx.cuts.some((c) => Math.abs(c.t - b) < 0.2) || b < 0.3) continue;
    const s = afterDrop(ctx, b) ? 0.45 : 0.28;
    push(ctx, { kind: "punch", start: b - F, end: b + 6 * F, strength: s, at: b });
  }
}

function velocity(ctx: Ctx) {
  const T = ctx.song.period;
  push(ctx, { kind: "zoomin", start: 0, end: 8 * F, strength: 0.6, at: 0 }, { kind: "zoomblur", start: 0, end: 6 * F, strength: 0.9, at: 0 });
  dropHit(ctx, 0.7, 1.2);
  const d = ctx.cuts.find((x) => x.drop);
  if (d) push(ctx, across(d, "zoomin", 1, 4, 8));
  // Each cut on a hit smears out from the middle and knocks the picture, punching in
  // (after the drop; before it, the cuts that start a phrase).
  for (const c of spaced(ctx.cuts.filter((c) => !c.drop && ((afterDrop(ctx, c.t) && c.hit) || ctx.phrases.has(c.t))), T)) {
    push(ctx, { kind: "zoomblur", start: fr(c.t - 4 * F), end: fr(c.t + 4 * F), strength: 0.85, at: c.t });
    if (afterDrop(ctx, c.t)) push(ctx, { kind: "shake", start: c.t, end: c.t + 8 * F, strength: 0.7, at: c.t }, { kind: "punch", start: c.t - F, end: c.t + 7 * F, strength: 0.7, at: c.t });
  }
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
  // A dip to black where a section starts, a blur-in where a phrase does.
  for (const c of ctx.cuts) {
    if (c.drop) continue;
    if (ctx.sections.has(c.t)) push(ctx, across(c, "fade", 0.9, 5, 6));
    else if (ctx.phrases.has(c.t)) push(ctx, across(c, "blur", 0.6, 2, 8));
  }
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
  // Before the drop, a black flicker on the biggest hits (a second apart at least). After
  // it, the kicks punch in and shake, the claps and snares flip to the negative for a frame.
  for (const h of spaced(
    ctx.hits.filter((h) => h.big && !afterDrop(ctx, h.t) && offDrop(ctx, h.t) && h.t > 1.2),
    Math.max(1, 1.5 * T),
  )) {
    push(ctx, { kind: "strobe", start: h.t, end: h.t + 4 * F, strength: 0.9 });
  }
  for (const h of spaced(
    ctx.hits.filter((h) => afterDrop(ctx, h.t) && offDrop(ctx, h.t) && (h.big || h.snap)),
    Math.max(0.9 * T, FLASH_GAP),
  )) {
    if (h.big) push(ctx, { kind: "punch", start: h.t - F, end: h.t + 8 * F, strength: 0.8, at: h.t }, { kind: "shake", start: h.t, end: h.t + 6 * F, strength: 0.6, at: h.t });
    else push(ctx, { kind: "invert", start: h.t, end: h.t + F, strength: 1 });
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
  // Every cut tears (before the drop, the cuts on a hit and the phrases'), and the hits
  // inside a shot flicker.
  for (const c of spaced(ctx.cuts.filter((c) => !c.drop && (afterDrop(ctx, c.t) || c.hit || ctx.phrases.has(c.t))), 0.45 * T)) {
    push(ctx, across(c, "glitch", c.hit ? 0.9 : 0.65, 2, 3));
  }
  for (const h of spaced(between(ctx, ctx.hits.filter((h) => h.s >= 0.6 && afterDrop(ctx, h.t))), 1.5 * T)) {
    push(ctx, { kind: "glitch", start: h.t, end: h.t + 3 * F, strength: 0.55 }, { kind: "split", start: h.t, end: h.t + 4 * F, strength: 0.7, at: h.t });
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

function whip(ctx: Ctx) {
  const T = ctx.song.period;
  // The first shot slides in.
  push(ctx, { kind: "whip", start: 0, end: 5 * F, strength: 1, at: 0, dir: 0 });
  // A whip pan on every cut with room either side (a shot of 0.4 s or more), a spin into the drop.
  let k = ctx.plan.shots.length;
  let last = -Infinity;
  for (const c of ctx.cuts) {
    if (c.drop) {
      push(ctx, across(c, "spin", 1, 4, 6, k % 2 ? 1 : -1));
      last = c.t;
      continue;
    }
    if (c.t - last < 0.9 * T || c.prev.end - c.prev.start < 0.4 || c.shot.end - c.shot.start < 0.4 || (c.shot.again && c.shot.end - c.shot.start < 0.5)) continue;
    const e = across(c, "whip", 1, 4, 5, WHIPS[k++ % WHIPS.length]);
    if (e) {
      push(ctx, e);
      last = c.t;
    }
  }
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
  // After it, the beats bump the picture.
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
  const T = ctx.song.period;
  push(ctx, { kind: "vhs", start: 0, end: ctx.end, strength: 1 }, { kind: "glitch", start: 0, end: 4 * F, strength: 0.5 });
  const d = ctx.cuts.find((x) => x.drop);
  if (d) push(ctx, { kind: "glitch", start: d.t, end: d.t + 5 * F, strength: 0.6 }, across(d, "zoomin", 0.6, 0, 12));
  for (const c of spaced(ctx.cuts.filter((c) => !c.drop && ctx.phrases.has(c.t)), 2 * T)) push(ctx, { kind: "glitch", start: c.t, end: c.t + 3 * F, strength: 0.35 });
  const n = ctx.now;
  const date = `${MONTHS[n.getMonth()]}. ${String(n.getDate()).padStart(2, "0")} ${n.getFullYear()}`;
  const end = ctx.end - 4 * F;
  ctx.plan.captions.push({ style: "osd", text: "PLAY ▶", start: 0, end }, { style: "osd", text: date, start: 0, end, y: osdLine(ctx.plan, 1) });
}

/** The tape's lettering, line `k` down from the top left (as a share of the frame's height). */
const osdLine = (plan: EditPlan, k: number) => 0.08 + (k * 0.062 * 1.3 * Math.min(plan.width, plan.height)) / plan.height;

const RECIPES: Record<Exclude<Design, "clean">, (ctx: Ctx) => void> = { flash, zoom, velocity, cinematic, noir, glitch, whip, split, vhs };

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
      if (c.style === "meme") return [c];
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

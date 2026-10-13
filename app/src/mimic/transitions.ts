/**
 * The reference's transitions on the edit's cuts. Every cut in the edit gets one: the
 * footage's jumps (between the pieces its pauses were cut out of, and its own cuts), into
 * and out of each cutaway, and the fade up at the start and down at the end when the
 * reference has them. A cutaway the reference has takes the reference's own transitions
 * in and out of it; any other cut takes the reference's transition joining the same
 * things (the talking to the talking, the talking to a cutaway, a cutaway back) nearest
 * the same point of the edit, so a reference whose crossfades come in a run after its
 * opening has them there in the edit too. Without one, a plain cut. The user's changes,
 * by what they're on, go over the top.
 */
import type { MimicTemplate, PlanBroll, PlanTransition, RefTransition, Segment, TransitionKind, TransitionLook } from "./types";

/** The user's change to a transition: another kind, length, way, ease or colour. */
export type TransitionEdit = Partial<TransitionLook>;

/** Every kind, with its name and the look it starts from when the user picks it. */
export const TRANSITIONS: { kind: TransitionKind; name: string; look: TransitionLook }[] = [
  { kind: "cut", name: "Cut", look: { kind: "cut", dur: 0, ease: "linear" } },
  { kind: "dissolve", name: "Crossfade", look: { kind: "dissolve", dur: 0.2, ease: "linear" } },
  { kind: "dip", name: "Dip", look: { kind: "dip", dur: 0.4, color: "black", ease: "linear" } },
  { kind: "flash", name: "Flash", look: { kind: "flash", dur: 0.13, color: "white", ease: "linear" } },
  { kind: "push", name: "Push", look: { kind: "push", dur: 0.3, dir: "left", ease: "inout" } },
  { kind: "slide", name: "Slide", look: { kind: "slide", dur: 0.3, dir: "left", over: "in", ease: "out" } },
  { kind: "wipe", name: "Wipe", look: { kind: "wipe", dur: 0.3, dir: "left", ease: "inout" } },
  { kind: "whip", name: "Whip", look: { kind: "whip", dur: 0.27, dir: "left", ease: "inout" } },
  { kind: "zoom", name: "Zoom", look: { kind: "zoom", dur: 0.3, dir: "in", ease: "inout" } },
  { kind: "blur", name: "Blur", look: { kind: "blur", dur: 0.3, ease: "inout" } },
  { kind: "glitch", name: "Glitch", look: { kind: "glitch", dur: 0.13, ease: "linear" } },
  { kind: "spin", name: "Spin", look: { kind: "spin", dur: 0.4, dir: "left", ease: "inout" } },
];

/** Kinds that move the pictures (a sound goes with them). */
export const MOVING: ReadonlySet<TransitionKind> = new Set(["push", "slide", "wipe", "whip", "zoom", "spin"]);

/** The times a transition takes (output): about its cut, or from its start for a fade in or out. */
export function transitionSpan(x: Pick<PlanTransition, "t" | "dur" | "from" | "to">): [number, number] {
  if (x.from === "black" || x.to === "black") return [x.t, x.t + x.dur];
  return [x.t - x.dur / 2, x.t + x.dur / 2];
}

/** How far through it is at t (0 to 1, eased as it says), when it's on. */
export function transitionAt(xs: PlanTransition[] | undefined, t: number): { x: PlanTransition; p: number; raw: number } | null {
  for (const x of xs ?? []) {
    if (x.kind === "cut" || x.dur <= 0) continue;
    const [a, b] = transitionSpan(x);
    if (t < a - 1e-6 || t >= b - 1e-6) continue;
    const raw = Math.min(1, Math.max(0, (t - a) / Math.max(1e-6, b - a)));
    return { x, p: ease(x.ease, raw), raw };
  }
  return null;
}

export function ease(kind: TransitionLook["ease"], u: number): number {
  if (kind === "in") return u * u;
  if (kind === "out") return 1 - (1 - u) * (1 - u);
  if (kind === "inout") return u * u * (3 - 2 * u);
  return u;
}

export interface CopyInput {
  template: MimicTemplate;
  segments: Segment[];
  /** the footage's own cuts on the edit's clock */
  rawCuts: number[];
  broll: PlanBroll[];
  /** where the footage ends in the edit (the black tail after) */
  body: number;
  /** the user's changes, by key */
  edits?: Record<string, TransitionEdit>;
}

const lookOf = (x: TransitionLook): TransitionLook => ({ kind: x.kind, dur: x.dur, ease: x.ease, ...(x.dir ? { dir: x.dir } : {}), ...(x.color ? { color: x.color } : {}), ...(x.over ? { over: x.over } : {}) });
const CUT: TransitionLook = { kind: "cut", dur: 0, ease: "linear" };

export function copyTransitions(inp: CopyInput): PlanTransition[] {
  const { template: tpl, segments, broll, body } = inp;
  const ref = tpl.transitions ?? [];
  const fades = ref.filter((x) => x.kind === "dip" && x.over);
  const joins = ref.filter((x) => !(x.kind === "dip" && x.over));
  const refBody = Math.max(1e-3, tpl.duration - (tpl.tail || 0));

  // ── the edit's cuts ──
  type Cut = { key: string; t: number; from: PlanTransition["from"]; to: PlanTransition["to"]; slot?: string; side?: "in" | "out" };
  const cuts: Cut[] = [];
  const sorted = [...broll].sort((a, b) => a.start - b.start);
  const under = (t: number) => sorted.some((b) => t > b.start + 0.02 && t < b.end - 0.02);
  sorted.forEach((b, i) => {
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    if (b.start > 0.02) cuts.push({ key: `in:${b.slot}`, t: b.start, from: prev && Math.abs(prev.end - b.start) < 0.03 ? "broll" : "main", to: "broll", slot: b.slot, side: "in" });
    if (b.end < body - 0.02 && !(next && Math.abs(next.start - b.end) < 0.03)) cuts.push({ key: `out:${b.slot}`, t: b.end, from: "broll", to: "main", slot: b.slot, side: "out" });
  });
  const jumps: { t: number; src: number }[] = [];
  for (let i = 1; i < segments.length; i++) jumps.push({ t: segments[i].start, src: segments[i].from });
  for (const t of inp.rawCuts) {
    const seg = segments.find((s) => t >= s.start && t < s.end);
    if (seg) jumps.push({ t, src: seg.from + (t - seg.start) });
  }
  jumps.sort((a, b) => a.t - b.t);
  for (const j of jumps) {
    if (j.t < 0.05 || j.t > body - 0.05 || under(j.t) || cuts.some((c) => Math.abs(c.t - j.t) < 0.06)) continue;
    cuts.push({ key: `jump:${j.src.toFixed(2)}`, t: j.t, from: "main", to: "main" });
  }
  cuts.sort((a, b) => a.t - b.t);

  // ── each cut's look: the reference's own at its cutaway, or the nearest joining the same ──
  const near = (c: Cut): { x: RefTransition; how: string } | null => {
    const slot = c.slot ? tpl.broll.find((b) => b.id === c.slot) : undefined;
    if (slot) {
      const at = c.side === "in" ? slot.start : slot.end;
      const own = joins.filter((x) => (c.side === "in" ? x.to === "broll" : x.from === "broll") && Math.abs(x.t - at) <= Math.max(0.12, x.dur / 2 + 0.06));
      if (own.length) return { x: own.reduce((a, x) => (Math.abs(x.t - at) < Math.abs(a.t - at) ? x : a)), how: "its own" };
    }
    const want = (x: RefTransition) => x.from === (c.from === "black" ? "main" : c.from) && x.to === (c.to === "black" ? "main" : c.to);
    const same = joins.filter(want);
    if (!same.length) return null;
    const share = c.t / Math.max(1e-3, body);
    return { x: same.reduce((a, x) => (Math.abs(x.t / refBody - share) < Math.abs(a.t / refBody - share) ? x : a)), how: "nearest" };
  };
  const out: PlanTransition[] = cuts.map((c) => {
    const n = near(c);
    const look = n ? lookOf(n.x) : CUT;
    const why = !n ? "a plain cut (the reference has nothing joining these)" : `${n.how === "its own" ? "as the reference does at this cutaway" : "the reference's"} (${n.x.t.toFixed(2)} s: ${n.x.why})`;
    return { ...look, key: c.key, t: c.t, from: c.from, to: c.to, why };
  });
  // The fade up at the start and down at the end.
  const open = fades.find((x) => x.over === "in");
  if (open) out.unshift({ ...lookOf(open), key: "open", t: 0, from: "black", to: sorted[0] && sorted[0].start <= 0.02 ? "broll" : "main", why: `the reference's opening (${open.why})` });
  const close = fades.find((x) => x.over === "out");
  if (close) out.push({ ...lookOf(close), key: "close", t: Math.max(0, body - close.dur), from: sorted.some((b) => b.end >= body - 0.02) ? "broll" : "main", to: "black", why: `the reference's ending (${close.why})` });

  // ── the user's changes ──
  for (const x of out) {
    const e = inp.edits?.[x.key];
    if (!e) continue;
    Object.assign(x, e, { mine: true, why: "yours" });
    if (x.kind === "cut") x.dur = 0;
    if (x.kind !== "slide" && x.over && x.from !== "black" && x.to !== "black") delete x.over;
  }
  // ── no two overlapping, none longer than the shots either side allow ──
  const times = out.filter((x) => x.from !== "black" && x.to !== "black").map((x) => x.t);
  for (const x of out) {
    if (x.kind === "cut") continue;
    if (x.key === "open") x.dur = Math.min(x.dur, 0.9 * (times[0] ?? body));
    else if (x.key === "close") {
      const room = 0.9 * (body - (times[times.length - 1] ?? 0));
      x.dur = Math.min(x.dur, room);
      x.t = Math.max(0, body - x.dur);
    } else {
      const k = times.indexOf(x.t);
      const before = k > 0 ? x.t - times[k - 1] : x.t;
      const after = k < times.length - 1 ? times[k + 1] - x.t : body - x.t;
      x.dur = Math.min(x.dur, 1.2, 0.9 * Math.min(before, after));
    }
    x.dur = Math.max(0, Math.round(x.dur * 1000) / 1000);
  }
  return out.sort((a, b) => a.t - b.t);
}

/** A transition's name, for the page: "Crossfade", "Whip left", "Fade in from black". */
export function lookName(x: Pick<TransitionLook, "kind" | "dir" | "color" | "over">): string {
  if (x.kind === "dip" && x.over === "in") return `Fade in from ${x.color ?? "black"}`;
  if (x.kind === "dip" && x.over === "out") return `Fade out to ${x.color ?? "black"}`;
  if (x.kind === "dip") return `Dip to ${x.color ?? "black"}`;
  const base = TRANSITIONS.find((k) => k.kind === x.kind)?.name ?? x.kind;
  return x.dir && x.kind !== "dissolve" && x.kind !== "blur" && x.kind !== "glitch" && x.kind !== "flash" ? `${base} ${x.dir}` : base;
}

/**
 * An edit none of whose shots runs over one of its source's own cuts. The planner
 * knows a long video's cuts only as well as its skim does (a frame every second or
 * two), so once an edit is planned, every frame of the stretches it uses is looked
 * at (media/cuts.ts), the cuts found are kept on the scans, and the edit is
 * planned again with them, until nothing new turns up. Only what the edits use
 * gets looked at, never the whole video.
 */
import { noteChecked, type CutFinder } from "../media/cuts";
import type { Scan } from "../media/scan";
import { cropFor } from "./montage";
import { sourceSpan, type EditPlan, type OverlayEvent, type ShotEvent } from "./types";

const covered = (scan: Scan, a: number, b: number) => !!scan.checked?.some(([x, y]) => a >= x - 1e-6 && b <= y + 1e-6);

/** The known cuts strictly inside a shot's stretch of its source (more than half a frame from its ends). */
function cutsInside(scan: Scan, a: number, b: number): number[] {
  const half = 0.5 / (scan.fps ?? 30);
  return (scan.exactCuts ?? []).filter((c) => c > a + half && c < b - half);
}

/** The stretch of its source a clip laid over the shots plays (a still: none). */
const overSpan = (o: OverlayEvent): [number, number] | null => (o.kind === "video" && o.speed > 0 ? [o.srcStart, o.srcStart + (o.end - o.start) * o.speed] : null);

/**
 * Looks frame by frame at the stretches a plan's shots use that haven't been
 * looked at yet (with a second either side, where the next plan is likely to look
 * too), and says how many of its shots run over a cut, and of the clips laid over
 * them. Shots carrying their own sound (a story's dialogue) are the source's own
 * edit, and are left as they are.
 */
export async function checkShots(plan: EditPlan, scans: Map<string, Scan>, find: CutFinder): Promise<number> {
  const stretches: [string, number, number][] = [];
  for (const shot of plan.shots) if (shot.kind === "video" && !shot.audio) stretches.push([shot.source, shot.srcStart, shot.srcStart + sourceSpan(shot)]);
  for (const o of plan.overlays ?? []) {
    const span = overSpan(o);
    if (span) stretches.push([o.source, ...span]);
  }
  let crossing = 0;
  for (const [source, a, b] of stretches) {
    const scan = scans.get(source);
    if (!scan || scan.kind !== "video") continue;
    if (!covered(scan, a, b)) {
      const lo = Math.max(scan.start, a - 1);
      const hi = Math.min(scan.duration, b + 1);
      noteChecked(scan, lo, hi, await find(scan, lo, hi));
    }
    if (cutsInside(scan, a, b).length) crossing++;
  }
  return crossing;
}

/**
 * Keeps a shot inside one shot of its source: moved to the longest clean stretch
 * around it, or slowed (to half speed at most) when that's a little short. It only
 * moves within what has been looked at frame by frame (past that, a cut nobody has
 * seen yet could be anywhere). A shot with nowhere to go stays as it is.
 */
function repair(shot: ShotEvent, scan: Scan, aspect: EditPlan["aspect"]): ShotEvent {
  const a = shot.srcStart;
  const span = sourceSpan(shot);
  const cuts = cutsInside(scan, a, a + span);
  if (!cuts.length) return shot;
  const seen = scan.checked?.find(([x, y]) => a >= x - 1e-6 && a + span <= y + 1e-6);
  if (!seen) return shot;
  const d = shot.end - shot.start;
  const gap = 0.07;
  // The clean stretches the shot overlaps, between the cuts inside it and the ones either side.
  const all = [scan.start, ...(scan.exactCuts ?? []), scan.duration];
  let best: [number, number] | null = null;
  for (let i = 0; i + 1 < all.length; i++) {
    const lo = Math.max(seen[0], all[i] + (i ? gap : 0));
    const hi = Math.min(seen[1], all[i + 1] - (i + 2 < all.length ? gap : 0));
    if (hi <= a || lo >= a + span || hi - lo <= 0) continue;
    if (!best || hi - lo > best[1] - best[0]) best = [lo, hi];
  }
  if (!best || best[1] - best[0] < 0.5 * d) return shot;
  const room = best[1] - best[0];
  const need = Math.min(span, room);
  // As near where it was as fits.
  const srcStart = Math.min(Math.max(a, best[0]), best[1] - need);
  // Short of room, it plays slower and gives up a speed ramp.
  const { ramp, ...rest } = shot;
  const fits = need >= span;
  const speed = fits ? shot.speed : Math.max(0.5, need / d);
  // Re-aimed at where the interest is in its new stretch, with the same push or pull.
  const crop = shot.crop.fit === "cover" ? { ...cropFor(scan, srcStart, srcStart + need, aspect), zoom0: shot.crop.zoom0, zoom1: shot.crop.zoom1 } : shot.crop;
  return { ...rest, ...(fits && ramp ? { ramp } : {}), srcStart, speed, crop };
}

/**
 * A plan none of whose shots runs over one of the source's own cuts: plan, look
 * frame by frame at what the plan uses, and plan again with what was found, until
 * nothing new turns up. If the footage cuts so fast that a few rounds don't do it,
 * the last plan's shots are moved (or slowed a little) to fit inside their scenes,
 * and a clip laid over them that runs over a cut is left out.
 */
export async function settlePlan(make: () => EditPlan, scans: Map<string, Scan>, find: CutFinder, rounds = 4): Promise<EditPlan> {
  let plan = make();
  for (let r = 0; ; r++) {
    if (!(await checkShots(plan, scans, find))) return plan;
    if (r + 1 >= rounds) break;
    plan = make();
  }
  const clean = (o: OverlayEvent) => {
    const span = overSpan(o);
    const scan = scans.get(o.source);
    return !span || !scan || scan.kind !== "video" || !cutsInside(scan, ...span).length;
  };
  return {
    ...plan,
    shots: plan.shots.map((s) => (s.kind === "video" && !s.audio && scans.get(s.source) ? repair(s, scans.get(s.source)!, plan.aspect) : s)),
    ...(plan.overlays ? { overlays: plan.overlays.filter(clean) } : {}),
  };
}

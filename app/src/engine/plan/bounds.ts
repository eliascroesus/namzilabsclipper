/**
 * Where a source's own cuts are, and how far a shot keeps from them (plan/montage.ts
 * picks its stretches inside them; plan/styles.ts keeps what it lays over a shot there too).
 */
import type { Scan } from "../media/scan";

/**
 * How far a shot keeps from the source's own cuts: a couple of frames, or in a long
 * video skimmed a frame every second or two, half that gap (a cut is only known to
 * lie somewhere between two samples, and a shot running over it flashes the next
 * scene for a moment).
 */
const cutMargin = (scan: Scan) => Math.max(0.08, 0.5 / scan.rate);

/** A shot boundary in a source, and how far a shot keeps from it: before it, and after it when that differs. */
export interface Bound {
  t: number;
  margin: number;
  after?: number;
}

const boundCache = new WeakMap<Scan, { key: string; bounds: Bound[] }>();

/**
 * A source's shot boundaries, from its start to its end, each with the berth a shot
 * keeps from it: the cuts the skim found (known only to within a sample or two, so
 * a wide berth), except inside stretches since looked at frame by frame, and the
 * cuts found that way (exact, so two frames').
 */
export function boundsOf(scan: Scan): Bound[] {
  let sum = 0;
  for (const [a, b] of scan.checked ?? []) sum += a + 2 * b;
  for (const t of scan.exactCuts ?? []) sum += 3 * t;
  const key = `${scan.cuts.length}|${scan.exactCuts?.length ?? 0}|${scan.checked?.length ?? 0}|${sum}`;
  const hit = boundCache.get(scan);
  if (hit && hit.key === key) return hit.bounds;
  const checked = scan.checked ?? [];
  const inner: Bound[] = [];
  // (A cut on a key frame that marks a scene change is there to the frame, if it's
  // there at all: a narrow berth, a little wider before it.)
  for (const t of scan.cuts) if (!checked.some(([a, b]) => t >= a && t <= b)) inner.push(scan.keyCuts ? { t, margin: 0.25, after: 0.05 } : { t, margin: cutMargin(scan) });
  for (const t of scan.exactCuts ?? []) inner.push({ t, margin: 0.07 });
  inner.sort((x, y) => x.t - y.t);
  const bounds = [{ t: scan.start, margin: 0.08 }, ...inner.filter((b) => b.t > scan.start && b.t < scan.duration), { t: scan.duration, margin: 0.08 }];
  boundCache.set(scan, { key, bounds });
  return bounds;
}

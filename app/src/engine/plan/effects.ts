/**
 * The effects a user can leave out of their edits, in the groups an editor thinks in
 * (black and white, flashes, shakes, glitches, transitions, a tape, film bars), and what
 * happens on the drop: the black and white that turns to colour on it, and the hit it
 * lands with (a flash, a punch-in, a strobe, a freeze, a whip into it). They're taken out
 * of an edit after its style and design have placed them; a style or design that is
 * nothing but one of them (black and white to colour, noir, the tape) is left out of a
 * batch along with it.
 */
import type { Design } from "./designs";
import type { EditStyle } from "./styles";
import type { EditPlan, FxKind } from "./types";

export type FxGroup = "bw" | "flashes" | "shakes" | "glitches" | "moves" | "tape" | "film";

export const FX_GROUPS: { value: FxGroup; name: string; desc: string }[] = [
  { value: "bw", name: "Black and white", desc: "Black and white stretches, shots snapping to colour, the noir and phonk designs." },
  { value: "flashes", name: "Flashes", desc: "White flashes, strobes, the negative, film burns and glow pulses." },
  { value: "shakes", name: "Shakes", desc: "Shakes, punch-ins, crash zooms and swings on the hits." },
  { value: "glitches", name: "Glitches", desc: "Torn bands, colour splits and choppy frames." },
  { value: "moves", name: "Transitions", desc: "Whips, spins, zooms, pushes, slides, crossfades and blurs between shots. Off: hard cuts." },
  { value: "tape", name: "VHS tape", desc: "The camcorder tape: its lines, PLAY and the date (the VHS design)." },
  { value: "film", name: "Film bars", desc: "Letterbox bars and light leaks." },
];

const KINDS: Record<FxGroup, FxKind[]> = {
  bw: ["mono", "bw"],
  flashes: ["flash", "strobe", "invert", "burn", "glow"],
  shakes: ["shake", "punch", "swing", "crash", "reframe", "steps"],
  glitches: ["glitch", "split", "choppy"],
  moves: ["zoomin", "whip", "spin", "blur", "fade", "dip", "dissolve", "push", "slide", "zoomblur"],
  tape: ["vhs"],
  film: ["bars", "leak"],
};

/** What lasts through a stretch rather than landing on a moment: never a drop's hit. */
const LASTING: ReadonlySet<FxKind> = new Set<FxKind>(["mono", "bw", "bars", "vhs", "leak", "fadein"]);

export interface FxChoice {
  /** the groups left out */
  off: FxGroup[];
  /** black and white until the drop, turning to colour on it */
  bwToDrop: boolean;
  /** the drop lands with a hit (a flash, a punch-in, a strobe, a freeze, a move into it); off, a plain cut */
  dropHit: boolean;
}

export const ALL_FX: FxChoice = { off: [], bwToDrop: true, dropHit: true };

/** Whether a batch can use this style with these effects: black and white to colour needs its black and white. */
export function styleAllowed(s: EditStyle, c: FxChoice): boolean {
  return s !== "mono" || (c.bwToDrop && !c.off.includes("bw"));
}

/** Whether a batch can use this design: the tape needs its tape, noir and phonk their black and white. */
export function designAllowed(d: Design, c: FxChoice): boolean {
  if (d === "vhs") return !c.off.includes("tape");
  if (d === "noir" || d === "phonk") return !c.off.includes("bw");
  return true;
}

/** An edit without the effects left out: the plan is changed and returned. */
export function withoutFx(plan: EditPlan, c: FxChoice): EditPlan {
  const out = new Set(c.off.flatMap((g) => KINDS[g]));
  const drop = plan.shots.find((s) => s.role === "drop")?.start;
  plan.fx = plan.fx.filter((e) => {
    if (out.has(e.kind)) return false;
    if (drop === undefined) return true;
    // (Black and white that turns to colour on the drop.)
    if (!c.bwToDrop && (e.kind === "mono" || e.kind === "bw") && e.start < drop && Math.abs(e.end - drop) < 0.25) return false;
    // (Anything landing on it: a plain cut.)
    if (!c.dropHit && !LASTING.has(e.kind) && e.start <= drop + 0.12 && e.end >= drop - 0.12) return false;
    return true;
  });
  // The tape's writing on screen (PLAY, the date) goes with it.
  if (c.off.includes("tape")) plan.captions = plan.captions.filter((cap) => cap.style !== "osd");
  return plan;
}

/** The ones of a list a batch can use for these effects: those allowed, or all of them when none is (the user's own pick still counts). */
export function usable<T>(xs: T[], ok: (x: T) => boolean): T[] {
  const kept = xs.filter(ok);
  return kept.length ? kept : xs;
}

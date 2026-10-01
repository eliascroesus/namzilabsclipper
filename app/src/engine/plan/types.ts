/** An edit, described completely enough for the renderer to draw every frame of it. */

export type Aspect = "9x16" | "4x3" | "1x1" | "4x5";

export const FRAME_SIZE: Record<Aspect, [number, number]> = {
  "9x16": [1080, 1920],
  "4x3": [1440, 1080],
  "1x1": [1080, 1080],
  "4x5": [1080, 1350],
};

export const FPS = 30;

export interface Crop {
  /** centre of the visible window in the source, 0 to 1 */
  cx: number;
  cy: number;
  /** extra zoom on top of the cover fit, at the shot's start and end (1 = none) */
  zoom0: number;
  zoom1: number;
  /** where the centre drifts to by the shot's end (a pan), 0 to 1 */
  cx1?: number;
  cy1?: number;
  /** 'cover' fills the frame; 'fit' shows the whole source over a blurred copy of itself */
  fit: "cover" | "fit";
  /**
   * the picture inside any black bars, [x0, y0, x1, y1] of the source's frame (0 to
   * 1); the centre above is inside this picture. Absent: the whole frame.
   */
  rect?: [number, number, number, number];
  /**
   * the centre following someone through the shot, as flat [t, cx, cy] keyframes
   * (t in seconds from the shot's start), joined by straight lines; replaces the pan
   */
  path?: number[];
  /** the picture as a card turned this many degrees (clockwise) on black, a photo flying in (see inset) */
  tilt?: number;
  /** the card's size in the frame at the shot's start and end (1 = the whole frame); the picture fills it */
  inset?: [number, number];
}

export interface ShotEvent {
  /** output time, seconds */
  start: number;
  end: number;
  source: string;
  kind: "video" | "image";
  /** source time at the shot's start (video) */
  srcStart: number;
  /** playback speed, 1 = real time */
  speed: number;
  crop: Crop;
  /** why it was picked, for the review panel */
  role?: "hook" | "drop" | "closer" | "build" | "body";
  score?: number;
  /** play this shot's own sound (dialogue); defaults to the plan's sourceAudio */
  audio?: boolean;
  /** a speed ramp in place of the steady speed (velocity edits) */
  ramp?: Ramp;
  /** a re-cut of the shot before it on the beat: the same clip, a jump further on */
  again?: boolean;
  /** not drawn: pictures over it fill the frame (a split screen's panels), black where they don't */
  hide?: boolean;
}

/**
 * A picture or a clip drawn over the shot under it (nio.trade's photos landing on
 * someone's head, TJR's window with the next clip in it): a card at a place in the
 * frame, turned, the picture filling it.
 */
export interface OverlayEvent {
  /** output time, seconds */
  start: number;
  end: number;
  source: string;
  kind: "video" | "image";
  /** source time at the start (video) */
  srcStart: number;
  /** playback speed; 0 holds the frame at srcStart */
  speed: number;
  /** the source's point at the card's centre (0 to 1), and a zoom on the picture filling the card (1 = cover) */
  cx: number;
  cy: number;
  zoom: number;
  /** the card: its centre in the frame (0 to 1), its height as a share of the frame's, its width over its height, turned this many degrees clockwise */
  x: number;
  y: number;
  size: number;
  aspect: number;
  tilt: number;
  /** following something through it: flat [t, x, y, size] keyframes (t in seconds from its start), in place of x, y and size */
  path?: number[];
  /**
   * placed in the page, where faces are found: on the head of whoever is in the shot
   * under it ("head"), and the picture cropped to its own face ("face")
   */
  place?: { on?: "head"; crop?: "face" };
  /** a split screen's panel: rather than left out when what it plays runs over one of its footage's own cuts, it holds its first frame */
  panel?: boolean;
  /** the picture inside any black bars of the source, [x0, y0, x1, y1] of its frame (0 to 1): the card shows only that */
  rect?: [number, number, number, number];
}

/** Where an overlay's card is `tau` seconds into it: centre and height as a share of the frame's. */
export function overlayAt(o: Pick<OverlayEvent, "x" | "y" | "size" | "path">, tau: number): [number, number, number] {
  const p = o.path;
  if (!p || p.length < 4) return [o.x, o.y, o.size];
  if (tau <= p[0]) return [p[1], p[2], p[3]];
  for (let i = 4; i < p.length; i += 4) {
    if (tau <= p[i]) {
      const f = (tau - p[i - 4]) / Math.max(1e-6, p[i] - p[i - 4]);
      return [p[i - 3] + (p[i + 1] - p[i - 3]) * f, p[i - 2] + (p[i + 2] - p[i - 2]) * f, p[i - 1] + (p[i + 3] - p[i - 1]) * f];
    }
  }
  return [p[p.length - 3], p[p.length - 2], p[p.length - 1]];
}

/**
 * A velocity edit's speed ramp: the shot plays at `slow` for its first `hold`
 * seconds (slow motion on the hit), then speeds up smoothly to `fast` by its
 * end, rushing into the next cut.
 */
export interface Ramp {
  slow: number;
  fast: number;
  hold: number;
}

/** Seconds of source a shot has played `tau` seconds into it (from its srcStart). */
export function sourceAt(shot: Pick<ShotEvent, "start" | "end" | "speed" | "ramp">, tau: number): number {
  const d = shot.end - shot.start;
  const r = shot.ramp;
  if (!r) return tau * shot.speed;
  const t = Math.min(d, Math.max(0, tau));
  if (t <= r.hold) return t * r.slow;
  const span = Math.max(1e-6, d - r.hold);
  const u = (t - r.hold) / span;
  // The speed eases along a smoothstep; its integral from 0 to u is u^3 - u^4 / 2.
  return r.hold * r.slow + span * (r.slow * u + (r.fast - r.slow) * (u ** 3 - u ** 4 / 2));
}

/** Seconds of source a whole shot plays. */
export const sourceSpan = (shot: Pick<ShotEvent, "start" | "end" | "speed" | "ramp">) => sourceAt(shot, shot.end - shot.start);

/** The moment into a shot (edit seconds) that shows source second `offset` past its srcStart. */
export function outputAt(shot: Pick<ShotEvent, "start" | "end" | "speed" | "ramp">, offset: number): number {
  const d = shot.end - shot.start;
  if (!shot.ramp) return offset / Math.max(1e-6, shot.speed);
  let lo = 0;
  let hi = d;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (sourceAt(shot, mid) < offset) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * flash, film burn, dip to black, fade up; a punch-in (a quick zoom on a hit), a shake,
 * a zoom blur across a cut, a colour split; and black and white (on at its start, off at
 * its end, hard: a talking intro before the drop, a shot turning to colour on a hit).
 *
 * The edit designs' own (designs.ts), most of them transitions peaking on a cut (`at`):
 * - zoomin: the picture rushes in to the cut and the next one lands zoomed in and
 *   settles (a zoom-in transition); `dir` -1 pulls out instead
 * - whip: a whip pan, the picture sliding out blurred and the next one sliding in from
 *   the other side; `dir` is the way it goes, in degrees (0 right, 90 down)
 * - spin: the same turning, `dir` 1 clockwise, -1 the other way
 * - swing: the picture knocked round a few degrees on a hit, settling back
 * - blur: out of focus into the cut, sharpening after it (a blur-in)
 * - glitch: bands of the picture torn sideways, the colour split, blocks of noise
 * - invert: the picture's negative, a frame or two on a hit
 * - strobe: black every other frame
 * - leak: a light leak drifting across, warm and pink
 * - bars: letterbox bars, each this share of the frame's height (`strength`), sliding
 *   in over their first frames
 * - fade: down to black into the cut and back up out of it (a dip across a cut)
 * - vhs: a videotape's picture (soft, its colour bleeding late, its lines wobbling, a
 *   torn band at the bottom), on over its span
 */
export type FxKind = "flash" | "burn" | "dip" | "fadein" | "punch" | "shake" | "zoomblur" | "split" | "mono" | "zoomin" | "whip" | "spin" | "swing" | "blur" | "glitch" | "invert" | "strobe" | "leak" | "bars" | "fade" | "vhs";

export interface FxEvent {
  kind: FxKind;
  start: number;
  end: number;
  /** 0 to 1 */
  strength: number;
  /** the moment of peak effect (a cut), if not the middle */
  at?: number;
  /** which way it goes: a whip's direction in degrees, a spin's or a zoom's sign */
  dir?: number;
}

export type CaptionStyle = "doc" | "pov" | "shout" | "lyric" | "mood" | "meme" | "impact" | "film" | "glitch" | "osd";

export interface CaptionEvent {
  style: CaptionStyle;
  text: string;
  start: number;
  end: number;
  /** vertical centre, 0 (top) to 1 (bottom); the style's default when absent */
  y?: number;
  /** where it sits across, 0 (left) to 1 (right): its centre, or its edge in a style set left or right; the style's default when absent */
  x?: number;
  /** pops in: small, a little too big, then settling, over its first five frames */
  pop?: boolean;
}

export interface CardSpec {
  /** a device drawn with the product on it, or the user's own video (a motion design) */
  kind: "laptop" | "phone" | "video";
  /** the line above the device, e.g. "start free" */
  top: string;
  /** the line below it, e.g. "namzilabs.co" */
  bottom: string;
  accent: string;
  /** source id of the screenshot shown on the screen */
  shot?: string;
  /** seconds on screen, including the fade out */
  hold: number;
  /** draw the arrow on instead of showing it whole */
  draw: boolean;
  /** kind "video": the source id of the video, played whole in place of a drawn card (its own sound off, the song under it) */
  video?: string;
  /** its width over its height, to fill the frame when it has the edit's shape and fit inside it when not */
  videoAspect?: number;
}

export interface CardEvent {
  spec: CardSpec;
  start: number;
  end: number;
  /** seconds to fade in and out */
  fadeIn: number;
  fadeOut: number;
}

export interface MusicEvent {
  source: string;
  /** where in the song the edit starts */
  songStart: number;
  start: number;
  end: number;
  fadeIn: number;
  fadeOut: number;
  /** linear gain before loudness normalisation */
  gain: number;
  /** the song's level over the edit, as [edit time, gain] points joined by straight ramps (ducking under dialogue) */
  gainPoints?: [number, number][];
}

export interface Grade {
  /** colour temperature push, -1 cool to 1 warm */
  warmth: number;
  /** 0 = untouched, 1 = strong S-curve */
  contrast: number;
  /** 1 = untouched */
  saturation: number;
  /** darkening towards the corners, 0 to 1 */
  vignette: number;
  /** film grain, 0 to 1 */
  grain: number;
  /** a colour pushed into the shadows and one into the highlights (added, about ±0.1), as a colourist's split tone */
  shadows?: [number, number, number];
  highlights?: [number, number, number];
  /** the blacks lifted to a matte, 0 to 1 (1: black at a fifth of white) */
  fade?: number;
  /** the highlights glowing into what's around them, 0 to 1 */
  glow?: number;
  /** brighter or darker, in stops (-0.3: a little under) */
  exposure?: number;
}

export const WARM_GRADE: Grade = { warmth: 0.45, contrast: 0.5, saturation: 1.0, vignette: 0.35, grain: 0.25 };
export const NO_GRADE: Grade = { warmth: 0, contrast: 0, saturation: 1, vignette: 0, grain: 0 };

export interface PostNote {
  caption: string;
  hashtags: string[];
  /** how to add the sound in the app so the cuts land */
  sound: string;
}

export interface EditPlan {
  id: string;
  label: string;
  format: "montage" | "story" | "meme";
  aspect: Aspect;
  width: number;
  height: number;
  fps: number;
  duration: number;
  shots: ShotEvent[];
  /** pictures and clips drawn over the shots, in order (the later over the earlier) */
  overlays?: OverlayEvent[];
  fx: FxEvent[];
  captions: CaptionEvent[];
  card?: CardEvent;
  music?: MusicEvent;
  /** play the footage's own sound too (dialogue), with the music ducked under it */
  sourceAudio: boolean;
  /**
   * the footage's own voice brought to this many dB against the song where it plays in
   * full (a phone's voice can sit 15 dB under a mastered song): a talking intro, clear,
   * with the drop still landing harder
   */
  levelVoice?: number;
  grade: Grade;
  /** the edit design it's in (plan/designs.ts), when it's in one */
  design?: string;
  note: PostNote;
  /** measurements the quality gate checks, filled by the planner */
  checks?: Record<string, number | string | boolean>;
}

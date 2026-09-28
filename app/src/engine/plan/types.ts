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
}

/** flash, film burn, dip to black, fade up; a punch-in (a quick zoom on a hit) and a shake */
export type FxKind = "flash" | "burn" | "dip" | "fadein" | "punch" | "shake";

export interface FxEvent {
  kind: FxKind;
  start: number;
  end: number;
  /** 0 to 1 */
  strength: number;
  /** the moment of peak effect (a cut), if not the middle */
  at?: number;
}

export type CaptionStyle = "doc" | "pov" | "shout" | "lyric" | "mood" | "meme";

export interface CaptionEvent {
  style: CaptionStyle;
  text: string;
  start: number;
  end: number;
  /** vertical centre, 0 (top) to 1 (bottom); the style's default when absent */
  y?: number;
}

export interface CardSpec {
  kind: "laptop" | "phone";
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
}

export const WARM_GRADE: Grade = { warmth: 0.35, contrast: 0.35, saturation: 1.06, vignette: 0.35, grain: 0.25 };
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
  fx: FxEvent[];
  captions: CaptionEvent[];
  card?: CardEvent;
  music?: MusicEvent;
  /** play the footage's own sound too (dialogue), with the music ducked under it */
  sourceAudio: boolean;
  grade: Grade;
  note: PostNote;
  /** measurements the quality gate checks, filled by the planner */
  checks?: Record<string, number | string | boolean>;
}

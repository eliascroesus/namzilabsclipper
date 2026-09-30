/**
 * Each shot balanced on its own before the look goes on, as a colourist does. Phone
 * footage comes flat: measured on a user's edit, its blacks a milky grey (the darkest
 * twentieth of the picture at 0.12 of white), its colour thin (saturation 0.17) and its
 * frames bright (0.52). The reference edits' shots sit deep in the blacks (0.003 to
 * 0.05), rich (0.26 to 0.36) and darker (0.27 to 0.46). So each shot's first frame, as
 * it shows (cropped, as the compositor draws it), is measured, and the shot's black
 * point goes down to black (a lift of a fifth at most taken out), its white point up to
 * white (by a sixth at most, so a hazy shot isn't blown out), its exposure towards 0.40
 * and its colour towards the references'. A shot that's already graded (the
 * references' own, measured so) is barely touched.
 */

/** A shot's balance: its black point and white point (luma, 0 to 1), a gamma for the exposure, a saturation gain. */
export type Tone = [lo: number, hi: number, gamma: number, sat: number];

/** What a picture shows: the luma its darkest 1% is under and its brightest 0.5% over, its mean, and how colourful its lit part is (HSV saturation). */
export interface Look {
  lo: number;
  hi: number;
  mean: number;
  sat: number;
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** The look of RGBA pixels (straight alpha), the transparent ones left out (outside a card, around a picture fitted in the frame). Null with too little picture. */
export function lookOf(px: Uint8Array | Uint8ClampedArray): Look | null {
  const levels = new Uint32Array(256);
  let n = 0;
  let sum = 0;
  let satSum = 0;
  let lit = 0;
  for (let q = 0; q < px.length; q += 4) {
    if (px[q + 3] < 128) continue;
    const r = px[q];
    const g = px[q + 1];
    const b = px[q + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    levels[Math.min(255, Math.round(y))]++;
    sum += y;
    n++;
    const mx = Math.max(r, g, b);
    if (mx > 20) {
      satSum += (mx - Math.min(r, g, b)) / mx;
      lit++;
    }
  }
  if (n < 64) return null;
  const at = (share: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) if ((acc += levels[v]) >= share * n) return v / 255;
    return 1;
  };
  return { lo: at(0.01), hi: at(0.995), mean: sum / n / 255, sat: lit ? satSum / lit : 0 };
}

/** The balance for a shot that looks as `look`; none for a picture with next to no range (black, a flat colour). */
export function balance(look: Look): Tone | undefined {
  const lo = Math.min(look.lo, 0.2);
  const hi = Math.max(look.hi, 0.85);
  if (look.hi - look.lo < 0.15 || look.mean < 0.03) return undefined;
  const m = clamp((look.mean - lo) / (hi - lo), 0.02, 0.98);
  const gamma = clamp(Math.log(0.4) / Math.log(m), 0.85, 1.4);
  // (Taking the lift out adds colour of its own; the rest of the way to the references' 0.33.)
  const sat = clamp((0.33 / Math.max(look.sat * (1 + 0.8 * lo), 0.04)) ** 0.75, 0.9, 1.5);
  return [lo, hi, gamma, sat];
}

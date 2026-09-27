/**
 * The demo end card, nio.trade style, drawn on a 2D canvas: the same design as
 * templates/endcard/laptop.html, laid out on the reference edit's own 960 × 720
 * grid and scaled to the frame. A black frame, a space-grey laptop showing the
 * product, the call to action above, the address below, and a hand-drawn arrow
 * from one to the other down the laptop's left side.
 */
import type { CardSpec } from "../plan/types";
import { FONT } from "./fonts";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const AXIS = 482; // the laptop's centre on the 960-wide grid
const LEFT_REACH = 350; // from the axis to the arrow's outer edge
const HEIGHT = 420; // the call to action's top to the address's bottom

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: [number, number, number, number]) {
  const [tl, tr, br, bl] = r;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

type Pt = [number, number];
function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

/** The screenshot, cropped to fill the screen from the top (CSS: center top / cover). */
function drawScreen(ctx: Ctx, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, 0, sw, sh, x, y, w, h);
}

export interface CardAssets {
  shot?: CanvasImageSource & { width: number; height: number };
}

/**
 * Draw the card as it looks `t` seconds after it starts, on a card `duration`
 * seconds long. Fades in from black over `fadeIn` and out over `fadeOut`.
 */
export function drawLaptopCard(ctx: Ctx, W: number, H: number, t: number, duration: number, spec: CardSpec, assets: CardAssets, fadeIn = 0.27, fadeOut = 0.5) {
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  const alpha = Math.min(clamp01(t / fadeIn), clamp01((duration - t) / fadeOut));
  if (alpha <= 0) {
    ctx.restore();
    return;
  }
  ctx.globalAlpha = alpha;

  // Scale and place the 960 × 720 composition: about 58% of the frame's height,
  // unless a narrow frame runs out of width first, on the frame's centre line.
  const k = Math.min((W * 0.47) / LEFT_REACH, (H * 0.58) / HEIGHT);
  const cy = H * (H > W ? 0.46 : 0.5);
  // The slow pull-out the references hold under the card: 6% across it.
  const s = 1.06 - 0.06 * clamp01(t / duration);
  ctx.translate(W / 2 - AXIS * k, cy - 360 * k);
  ctx.scale(k, k);
  ctx.translate(482, 356);
  ctx.scale(s, s);
  ctx.translate(-482, -356);

  // The two lines, centred on the 960 grid. Baselines match the template's CSS
  // line boxes (Inter's ascent is 0.969 em).
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `500 34px ${FONT.sans}`;
  ctx.letterSpacing = "-0.34px";
  const topW = ctx.measureText(spec.top).width;
  ctx.fillText(spec.top, 480, 184.4);
  ctx.font = `500 36px ${FONT.sans}`;
  ctx.letterSpacing = "-0.36px";
  const bottomW = ctx.measureText(spec.bottom).width;
  ctx.fillText(spec.bottom, 480, 555.1);
  ctx.letterSpacing = "0px";

  // The laptop: a lid with a thin bezel, the screen, the notch, then the base and its lip.
  const lidX = 272;
  const lidY = 222;
  roundRect(ctx, lidX, lidY, 420, 246, [13, 13, 3, 3]);
  ctx.fillStyle = "#4a4b50";
  ctx.fill();
  roundRect(ctx, lidX + 1.5, lidY + 1.5, 417, 243, [11.5, 11.5, 1.5, 1.5]);
  ctx.fillStyle = "#111114";
  ctx.fill();
  roundRect(ctx, lidX + 3, lidY + 3, 414, 240, [10, 10, 0.5, 0.5]);
  ctx.fillStyle = "#0c0c0e";
  ctx.fill();
  ctx.save();
  roundRect(ctx, lidX + 7, lidY + 7, 406, 230, [4, 4, 4, 4]);
  ctx.clip();
  ctx.fillStyle = "#111";
  ctx.fillRect(lidX + 7, lidY + 7, 406, 230);
  if (assets.shot) drawScreen(ctx, assets.shot, lidX + 7, lidY + 7, 406, 230);
  ctx.restore();
  roundRect(ctx, 459, lidY + 7, 46, 6, [0, 0, 4, 4]);
  ctx.fillStyle = "#0c0c0e";
  ctx.fill();

  // The base: square-ish top corners, elliptical bottom ones (CSS 2px / 14×10px),
  // over a 1px dark shadow line.
  const baseY = lidY + 246 - 1;
  const basePath = (dy: number) => {
    const y = baseY + dy;
    ctx.beginPath();
    ctx.moveTo(234, y);
    ctx.lineTo(730, y);
    ctx.quadraticCurveTo(732, y, 732, y + 2);
    ctx.ellipse(718, y + 2, 14, 10, 0, 0, Math.PI / 2);
    ctx.lineTo(246, y + 12);
    ctx.ellipse(246, y + 2, 14, 10, 0, Math.PI / 2, Math.PI);
    ctx.quadraticCurveTo(232, y, 234, y);
    ctx.closePath();
  };
  basePath(1);
  ctx.fillStyle = "#1b1b1d";
  ctx.fill();
  const g = ctx.createLinearGradient(0, baseY, 0, baseY + 12);
  g.addColorStop(0, "#9a9ba1");
  g.addColorStop(0.22, "#6d6e74");
  g.addColorStop(0.6, "#4d4e53");
  g.addColorStop(1, "#2c2d30");
  basePath(0);
  ctx.fillStyle = g;
  ctx.fill();
  const lip = ctx.createLinearGradient(0, baseY, 0, baseY + 5);
  lip.addColorStop(0, "#3b3c40");
  lip.addColorStop(1, "#5d5e63");
  ctx.fillStyle = lip;
  roundRect(ctx, 447, baseY, 70, 5, [0, 0, 6, 6]);
  ctx.fill();

  // The arrow: from just left of the call to action, out past the laptop's left
  // side, back in just left of the address. One stroke, then the head.
  const sx = 480 - topW / 2 - 14;
  const sy = 174.1;
  const ex = 480 - bottomW / 2 - 18;
  const ey = 544.2;
  const bulge = 232 - 82;
  const midY = (sy + ey) / 2;
  const a: [Pt, Pt, Pt, Pt] = [[sx, sy], [sx - (sx - bulge) * 0.55, sy + 2], [bulge, sy + 48], [bulge, midY]];
  const b: [Pt, Pt, Pt, Pt] = [[bulge, midY], [bulge, ey - 42], [ex - (ex - bulge) * 0.62, ey + 2], [ex, ey]];
  const pts: Pt[] = [];
  for (let i = 0; i <= 60; i++) pts.push(bezier(...a, i / 60));
  for (let i = 1; i <= 60; i++) pts.push(bezier(...b, i / 60));
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = lens[lens.length - 1];
  const drawn = spec.draw ? total * easeOut(clamp01((t - 0.15) / 0.55)) : total;
  ctx.strokeStyle = spec.accent;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (drawn > 0.5) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      if (lens[i] <= drawn) ctx.lineTo(pts[i][0], pts[i][1]);
      else {
        const f = (drawn - lens[i - 1]) / (lens[i] - lens[i - 1]);
        ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f);
        break;
      }
    }
    ctx.stroke();
  }
  // The head follows the stroke's own direction where it lands.
  const headAlpha = spec.draw ? clamp01((t - 0.62) / 0.08) : 1;
  if (headAlpha > 0) {
    let j = pts.length - 1;
    while (j > 0 && total - lens[j] < 6) j--;
    const p1 = pts[pts.length - 1];
    const p0 = pts[j];
    const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    const len = 27;
    const spread = 0.72;
    ctx.globalAlpha = alpha * headAlpha;
    ctx.beginPath();
    ctx.moveTo(p1[0] - len * Math.cos(ang + spread), p1[1] - len * Math.sin(ang + spread));
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p1[0] - len * Math.cos(ang - spread), p1[1] - len * Math.sin(ang - spread));
    ctx.stroke();
  }
  ctx.restore();
}

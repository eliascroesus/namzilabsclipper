/**
 * Contact sheets: frames of the footage laid out in numbered grids, the way an
 * editor logs footage. A video gets a new frame whenever its picture changes
 * and at least every few seconds; photos get one each. The sheets are what
 * Gemini looks at to judge the footage (smart picks): small stills, never the
 * video itself.
 */

export interface Sheets {
  /** JPEG contact sheets */
  images: Blob[];
  /** per cell, numbered from 1 across all the sheets: what it shows (a sample index, or a photo's place) */
  cells: number[];
  /** per cell: its time in the source */
  times: number[];
  /** the first cell number on each sheet */
  firsts: number[];
}

const MAX_W = 1280;
const MAX_H = 960;

/** Builds numbered contact sheets one frame at a time. */
export class SheetMaker {
  private readonly canvas: OffscreenCanvas;
  private readonly ctx: OffscreenCanvasRenderingContext2D;
  private readonly cw: number;
  private readonly ch: number;
  private readonly cols: number;
  private readonly rows: number;
  private inSheet = 0;
  private readonly pending: Promise<Blob>[] = [];
  private readonly firsts: number[] = [];
  readonly cells: number[] = [];
  readonly times: number[] = [];

  /** `aspect`: the frames' width over height. */
  constructor(aspect: number) {
    const a = Math.min(3, Math.max(1 / 3, aspect || 16 / 9));
    if (a >= 1) {
      this.cw = 320;
      this.ch = Math.round(320 / a);
    } else {
      this.ch = 320;
      this.cw = Math.round(320 * a);
    }
    this.cols = Math.max(1, Math.floor(MAX_W / this.cw));
    this.rows = Math.max(1, Math.floor(MAX_H / this.ch));
    this.canvas = new OffscreenCanvas(this.cols * this.cw, this.rows * this.ch);
    this.ctx = this.canvas.getContext("2d", { alpha: false })!;
  }

  get count() {
    return this.cells.length;
  }

  /** Add a frame: `draw` paints it into the cell at (x, y, w, h). */
  add(draw: (ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void, cell: number, t: number) {
    if (this.inSheet === 0) {
      this.ctx.fillStyle = "#000";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.firsts.push(this.cells.length + 1);
    }
    const x = (this.inSheet % this.cols) * this.cw;
    const y = Math.floor(this.inSheet / this.cols) * this.ch;
    draw(this.ctx, x, y, this.cw, this.ch);
    // The number, big enough to read at a glance, in the top left corner.
    const label = String(this.cells.length + 1);
    this.ctx.font = "bold 22px sans-serif";
    const w = this.ctx.measureText(label).width + 12;
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    this.ctx.fillRect(x + 4, y + 4, w, 28);
    this.ctx.fillStyle = "#fff";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(label, x + 10, y + 19);
    // A hairline between cells so neighbours don't blend.
    this.ctx.strokeStyle = "#000";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x + 1, y + 1, this.cw - 2, this.ch - 2);
    this.cells.push(cell);
    this.times.push(t);
    this.inSheet++;
    if (this.inSheet === this.cols * this.rows) this.flush();
  }

  private flush() {
    if (!this.inSheet) return;
    // Only the rows used.
    const used = Math.ceil(this.inSheet / this.cols) * this.ch;
    const out = new OffscreenCanvas(this.canvas.width, used);
    out.getContext("2d")!.drawImage(this.canvas, 0, 0);
    this.pending.push(out.convertToBlob({ type: "image/jpeg", quality: 0.8 }));
    this.inSheet = 0;
  }

  async finish(): Promise<Sheets> {
    this.flush();
    return { images: await Promise.all(this.pending), cells: [...this.cells], times: [...this.times], firsts: [...this.firsts] };
  }
}

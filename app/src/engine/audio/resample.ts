/**
 * A streaming windowed-sinc resampler (Kaiser window, 32 taps), so an hour of
 * audio can be brought to 22,050 Hz for analysis without holding it all at the
 * source rate. The same code runs in the browser and in the Node tests.
 */

const TAPS = 16; // each side of the centre
const PHASES = 512;

function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  for (let k = 1; k < 40; k++) {
    term *= (x / (2 * k)) ** 2;
    sum += term;
    if (term < 1e-12 * sum) break;
  }
  return sum;
}

export class Resampler {
  private readonly step: number;
  private readonly table: Float32Array;
  /** input kept for windows still to come; buf[0] is absolute input sample `base` */
  private buf = new Float32Array(0);
  private base = 0;
  private seen = 0;
  /** the next output sample's position, in input samples */
  private pos = 0;
  private emitted = 0;

  constructor(
    readonly inRate: number,
    readonly outRate: number,
  ) {
    this.step = inRate / outRate;
    // Low-pass at 95% of the lower Nyquist.
    const cutoff = Math.min(1, outRate / inRate) * 0.95;
    const beta = 8.6;
    const i0b = besselI0(beta);
    this.table = new Float32Array(2 * TAPS * PHASES + 2);
    for (let i = 0; i < this.table.length; i++) {
      const d = i / PHASES - TAPS;
      const x = Math.PI * cutoff * d;
      const sinc = d === 0 ? 1 : Math.sin(x) / x;
      const r = d / TAPS;
      const w = Math.abs(r) <= 1 ? besselI0(beta * Math.sqrt(1 - r * r)) / i0b : 0;
      this.table[i] = cutoff * sinc * w;
    }
  }

  /** Feed input; returns every output sample whose window is now complete. */
  write(input: Float32Array): Float32Array {
    const joined = new Float32Array(this.buf.length + input.length);
    joined.set(this.buf);
    joined.set(input, this.buf.length);
    this.buf = joined;
    this.seen += input.length;
    return this.drain(this.seen - 1 - TAPS, Infinity);
  }

  /** The input has ended: returns the tail, with silence after the last sample. */
  end(): Float32Array {
    return this.drain(Infinity, Math.ceil((this.seen * this.outRate) / this.inRate));
  }

  private drain(maxCentre: number, total: number): Float32Array {
    const out: number[] = [];
    const { table, buf, base, seen } = this;
    while (this.emitted + out.length < total) {
      const p = this.pos;
      const c = Math.floor(p);
      if (c > maxCentre) break;
      let s = 0;
      const frac = (p - c) * PHASES;
      const fi = Math.floor(frac);
      const ff = frac - fi;
      for (let k = c - TAPS + 1; k <= c + TAPS; k++) {
        if (k < 0 || k >= seen) continue;
        // kernel(p - k), read from the table with linear interpolation between phases
        const ti = (c - k + TAPS) * PHASES + fi;
        s += buf[k - base] * (table[ti] * (1 - ff) + table[ti + 1] * ff);
      }
      out.push(s);
      this.pos += this.step;
    }
    this.emitted += out.length;
    // Drop input no future window reaches.
    const drop = Math.min(this.buf.length, Math.floor(this.pos) - TAPS + 1 - this.base);
    if (drop > 0) {
      this.buf = this.buf.slice(drop);
      this.base += drop;
    }
    return Float32Array.from(out);
  }
}

/** Resample a whole buffer in one go. */
export function resample(x: Float32Array, inRate: number, outRate: number): Float32Array {
  if (inRate === outRate) return x.slice();
  const r = new Resampler(inRate, outRate);
  const a = r.write(x);
  const b = r.end();
  const out = new Float32Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

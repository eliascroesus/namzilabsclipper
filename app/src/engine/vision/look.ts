/**
 * Smart picks: Gemini looks at the footage's contact sheets (sheets.ts) and
 * judges every frame for what these edits live on: how much it sells the life,
 * how striking it is as a picture, and what's in it. The montage then opens on
 * the supercar and skips the coffee-shop chat, and the twist finds the desk for
 * its second act. Only the small stills are sent; the answers are kept in this
 * browser per file, so the same video is never looked at twice.
 */
import { generateJSON, toBase64, type Part } from "../ai/gemini";
import { KINDS, type Kind, type Look, type Scan } from "../media/scan";
import { SheetMaker, type Sheets } from "./sheets";

export interface Rating {
  /** the frame's number on the sheets */
  n: number;
  /** 0 to 10 */
  flex: number;
  wow: number;
  kind: Kind;
  /** where the picture model puts the frame (unit length), when it looked (sense.ts) */
  emb?: Float32Array;
}

export const LOOK_VERSION = 2;

const SYSTEM =
  "You are the picture editor for short Instagram Reels and TikToks in the luxury lifestyle genre: supercars, watches, travel, penthouses and money, cut hard to a trending song (the trader lifestyle and flex edits). You look at contact sheets of someone's footage and judge every frame for those edits, honestly: most everyday footage is not flex.";

const PROMPT = `Each sheet is a grid of frames from the footage, each with its number in the top left corner. Judge EVERY numbered frame.

kind: the main thing in it.
- car: a car is the subject (inside or out: the dashboard, the steering wheel, driving shots too)
- watch: a watch or jewellery close up
- jet: a private jet, plane or helicopter, inside or out (its stairs, its cabin, people sitting in it)
- yacht: a yacht or boat, its deck, a party on it, the wake behind it, a jet ski
- home: a house, penthouse, villa, hotel room or pool
- view: a skyline, landscape, beach or sea, a view from high up
- city: streets, buildings, city nights, nightlife outside
- travel: an airport, a plane cabin, arriving somewhere
- money: cash, cards, a big number or win on a screen
- fashion: clothes, shoes, a fit check
- party: a club, bottle service, sparklers, a VIP table, a crowd, a pool or boat party
- food: food or drinks as the subject
- sport: a gym, training, a match
- work: a desk, a laptop, charts, a trading setup, someone working late (the grind)
- talking: someone talking to the camera or to others (vlog talk, an interview, a podcast, people sitting at a table talking)
- people: people doing something else
- text: titles, graphics, logos, subscribe or end screens, ads or sponsor segments, black or blank frames
- other

flex, 0 to 10: how much it sells the dream (the LARP: what a flex edit is made of). 9 or 10: a supercar or hypercar (Lamborghini, Ferrari, McLaren, Rolls-Royce, G-Wagon and the like) outside or from the driver's seat, a private jet (outside, its stairs or its cabin), a helicopter, a yacht or a party on one, a luxury watch or jewellery close up, a penthouse or mansion, an infinity pool, a skyline from a height, stacks of cash, first class. 7 or 8: a nightclub VIP table or bottle service with sparklers, a packed club with lights, a luxury hotel, an overwater villa, a speedboat or jet ski. 5 or 6: a nice car, a fine restaurant, designer clothes and shopping bags, beautiful travel spots, city nights, a pool party. 0 to 4: ordinary life: a regular room, a plain street, an everyday car, food, people sitting or talking, someone talking to the camera however nice the room.

wow, 0 to 10: how striking it is as a picture, whatever it shows: composition, light (golden hour, city lights, neon), movement (driving, drone shots, speed), water, scale. Low for dull, dark, blurry, cluttered or badly framed frames, and for talking heads.

Answer with one entry per numbered frame, using its number.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    frames: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          n: { type: "INTEGER" },
          kind: { type: "STRING", enum: [...KINDS] },
          flex: { type: "INTEGER" },
          wow: { type: "INTEGER" },
        },
        required: ["n", "kind", "flex", "wow"],
        propertyOrdering: ["n", "kind", "flex", "wow"],
      },
    },
  },
  required: ["frames"],
};

export interface RateOptions {
  key: string;
  model: string;
  signal?: AbortSignal;
  onProgress?: (p: number) => void;
  /** sheets per request */
  batch?: number;
}

const clamp10 = (v: unknown) => Math.min(10, Math.max(0, Math.round(Number(v) || 0)));

/** Rate every frame on a set of contact sheets. Frames it skipped are simply missing. */
export async function rateSheets(sheets: Sheets, o: RateOptions): Promise<Map<number, Rating>> {
  const per = o.batch ?? 4;
  const out = new Map<number, Rating>();
  const total = sheets.images.length;
  for (let k = 0; k < total; k += per) {
    const parts: Part[] = [{ text: PROMPT }];
    let lo = Infinity;
    let hi = 0;
    for (let j = k; j < Math.min(total, k + per); j++) {
      const first = sheets.firsts[j];
      const last = (sheets.firsts[j + 1] ?? sheets.cells.length + 1) - 1;
      lo = Math.min(lo, first);
      hi = Math.max(hi, last);
      parts.push({ text: `Sheet ${j + 1}: frames ${first} to ${last}.` });
      parts.push({ inlineData: { mimeType: "image/jpeg", data: toBase64(new Uint8Array(await sheets.images[j].arrayBuffer())) } });
    }
    const res = await generateJSON<{ frames?: Partial<Rating>[] }>({ key: o.key, model: o.model, parts, system: SYSTEM, schema: SCHEMA, temperature: 0.2, signal: o.signal, maxOutputTokens: 16384 });
    for (const f of res.frames ?? []) {
      const n = Math.round(Number(f.n));
      if (!(n >= lo && n <= hi)) continue;
      const kind = (KINDS as readonly string[]).includes(f.kind as string) ? (f.kind as Kind) : "other";
      out.set(n, { n, flex: clamp10(f.flex), wow: clamp10(f.wow), kind });
    }
    o.onProgress?.(Math.min(1, (k + per) / total));
  }
  return out;
}

/**
 * The ratings spread over a video's samples: each sample takes the rating of the
 * frame logged for its stretch (the latest one at or before it), and frames that
 * went unrated borrow their neighbour's.
 */
export function lookFor(scan: Scan, sheets: Sheets, ratings: Map<number, Rating>): Look | undefined {
  const n = scan.stats.t.length;
  if (!ratings.size || !sheets.cells.length) return undefined;
  const byCell: (Rating | undefined)[] = sheets.cells.map((_, c) => ratings.get(c + 1));
  // Fill gaps from the nearest rated frame.
  for (let c = 0; c < byCell.length; c++) {
    if (byCell[c]) continue;
    for (let d = 1; d < byCell.length; d++) {
      const r = ratings.get(c + 1 - d) ?? ratings.get(c + 1 + d);
      if (r) {
        byCell[c] = r;
        break;
      }
    }
  }
  const look: Look = { flex: new Float32Array(n), wow: new Float32Array(n), kind: new Uint8Array(n) };
  const embs = byCell.map((r) => r?.emb);
  if (embs.some(Boolean)) {
    look.embs = embs;
    look.cell = new Int32Array(n);
  }
  let c = 0;
  for (let i = 0; i < n; i++) {
    while (c + 1 < sheets.cells.length && sheets.cells[c + 1] <= i) c++;
    const r = byCell[c]!;
    look.flex[i] = r.flex / 10;
    look.wow[i] = r.wow / 10;
    look.kind[i] = KINDS.indexOf(r.kind);
    if (look.cell) look.cell[i] = c;
  }
  return look;
}

/** Contact sheets of photos (one frame each, shown whole), to rate them together. */
export async function photoSheets(photos: { index: number; image: ImageBitmap }[]): Promise<Sheets> {
  const maker = new SheetMaker(4 / 3);
  for (const p of photos) {
    maker.add(
      (ctx, x, y, w, h) => {
        const k = Math.min(w / p.image.width, h / p.image.height);
        const dw = p.image.width * k;
        const dh = p.image.height * k;
        ctx.drawImage(p.image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      },
      p.index,
      0,
    );
  }
  return maker.finish();
}

/** The ratings as they're remembered: per frame number, [flex, wow, kind index], and the picture model's embeddings when it looked. */
export type StoredLook = { v: number; cells: number; frames: [number, number, number, number][]; embs?: (Float32Array | null)[] };

export function storeLook(sheets: Sheets, ratings: Map<number, Rating>): StoredLook {
  const rs = [...ratings.values()];
  const embs = rs.some((r) => r.emb) ? rs.map((r) => r.emb ?? null) : undefined;
  return { v: LOOK_VERSION, cells: sheets.cells.length, frames: rs.map((r) => [r.n, r.flex, r.wow, KINDS.indexOf(r.kind)]), ...(embs ? { embs } : {}) };
}

export function restoreLook(stored: StoredLook, sheets: Sheets): Map<number, Rating> | null {
  if (stored.v !== LOOK_VERSION || stored.cells !== sheets.cells.length) return null;
  return new Map(stored.frames.map(([n, flex, wow, k], i) => [n, { n, flex, wow, kind: KINDS[k] ?? "other", ...(stored.embs?.[i] ? { emb: stored.embs[i]! } : {}) }]));
}

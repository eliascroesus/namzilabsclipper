import { afterEach, describe, expect, it, vi } from "vitest";
import { montageStretches, PROFILE_BINS, scoreInterest, type Scan } from "../src/engine/media/scan";
import { lookFor, rateSheets, restoreLook, storeLook, type Rating } from "../src/engine/vision/look";
import type { Sheets } from "../src/engine/vision/sheets";
import { skipSegments, youtubeId } from "../src/engine/ai/sponsorblock";

function clip(id: string, duration: number): Scan {
  const n = Math.round(duration * 2);
  const f = (k: number) => new Float32Array(k);
  const stats = { t: f(n), luma: f(n).fill(0.5), contrast: f(n).fill(0.2), sharp: f(n).fill(5), color: f(n).fill(0.3), skin: f(n), motion: f(n).fill(0.05), hist: f(n * 64), cols: f(n * PROFILE_BINS), rows: f(n * PROFILE_BINS), rgb: f(n * 3) };
  for (let i = 0; i < n; i++) stats.t[i] = (i + 0.5) / 2;
  return { id, kind: "video", start: 0, duration, width: 1920, height: 1080, rate: 2, stats, cuts: [] };
}

const sheets = (cells: number[]): Sheets => ({ images: [new Blob(["x"], { type: "image/jpeg" })], cells, times: cells.map((c) => (c + 0.5) / 2), firsts: [1] });

afterEach(() => vi.unstubAllGlobals());

describe("smart picks", () => {
  it("spreads each logged frame's rating over its stretch", () => {
    const scan = clip("a", 10); // 20 samples
    const sh = sheets([0, 8, 14]);
    const ratings = new Map<number, Rating>([
      [1, { n: 1, flex: 2, wow: 3, kind: "talking" }],
      [2, { n: 2, flex: 9, wow: 8, kind: "car" }],
      // frame 3 left unrated: it borrows its neighbour's
    ]);
    const look = lookFor(scan, sh, ratings)!;
    expect(look.flex[0]).toBeCloseTo(0.2);
    expect(look.flex[7]).toBeCloseTo(0.2);
    expect(look.flex[8]).toBeCloseTo(0.9);
    expect(look.flex[19]).toBeCloseTo(0.9);
  });

  it("puts the flex first and the talking and titles last", () => {
    const flex = clip("flex", 6);
    const talk = clip("talk", 6);
    const title = clip("title", 6);
    const all = (scan: Scan, r: Rating) => {
      scan.look = lookFor(scan, sheets([0]), new Map([[1, r]]));
    };
    all(flex, { n: 1, flex: 9, wow: 8, kind: "car" });
    all(talk, { n: 1, flex: 2, wow: 3, kind: "talking" });
    all(title, { n: 1, flex: 5, wow: 5, kind: "text" });
    scoreInterest([flex, talk, title]);
    const mean = (s: Scan) => s.interest!.reduce((a, v) => a + v, 0) / s.interest!.length;
    expect(mean(flex)).toBeGreaterThan(3 * mean(talk));
    expect(mean(talk)).toBeGreaterThan(mean(title) * 0.5);
    expect(mean(flex)).toBeGreaterThan(0.6);
    // The grind (a desk, charts) scores for a twist's second act, the car doesn't.
    const desk = clip("desk", 6);
    all(desk, { n: 1, flex: 1, wow: 6, kind: "work" });
    scoreInterest([desk, flex]);
    expect(desk.real![0]).toBeGreaterThan(0.5);
    expect(flex.real![0]).toBeLessThan(0.2);
  });

  it("finds a video's own montage stretches: four cuts or more in five seconds", () => {
    // A minute of vlog: talking with a cut every eight seconds, and from 20 to 30 s the
    // B-roll cut to its music, a shot every 0.8 s.
    const vlog = clip("vlog", 60);
    vlog.cuts = [8, 16, ...Array.from({ length: 13 }, (_, k) => 20 + 0.8 * k), 32, 40, 48, 56];
    const m = montageStretches(vlog);
    const at = (t: number) => m[vlog.stats.t.findIndex((x) => x >= t)];
    expect([10, 17, 40, 50].map(at)).toEqual([0, 0, 0, 0]);
    expect([21, 25, 29].map(at)).toEqual([1, 1, 1]);
    // An edit dropped in as footage is all montage: nothing to set apart.
    const edit = clip("edit", 20);
    edit.cuts = Array.from({ length: 24 }, (_, k) => 0.8 * (k + 1));
    expect(montageStretches(edit).every((v) => v === 0)).toBe(true);
  });

  it("LARP picks: the flex leads, the rest counts for little, a montage stretch's flex for more", () => {
    const rate = (scan: Scan, flex: number, kind: Rating["kind"]) => (scan.look = lookFor(scan, sheets([0]), new Map([[1, { n: 1, flex, wow: 6, kind }]]))!);
    const car = clip("car", 30);
    const dinner = clip("dinner", 30);
    const talk = clip("talk", 30);
    rate(car, 9, "car");
    rate(dinner, 3, "food");
    rate(talk, 2, "talking");
    const mean = (s: Scan) => s.interest!.reduce((a, v) => a + v, 0) / s.interest!.length;
    scoreInterest([car, dinner, talk]);
    const plain = { dinner: mean(car) / mean(dinner), talk: mean(car) / mean(talk) };
    scoreInterest([car, dinner, talk], { larp: true });
    expect(mean(car) / mean(dinner)).toBeGreaterThan(1.5 * plain.dinner);
    expect(mean(car) / mean(talk)).toBeGreaterThan(1.5 * plain.talk);
    // The car cut as a montage from 10 to 20 s: those moments count for more.
    car.cuts = [5, ...Array.from({ length: 12 }, (_, k) => 10 + 0.8 * k), 25];
    scoreInterest([car, dinner, talk], { larp: true });
    const at = (t: number) => car.interest![car.stats.t.findIndex((x) => x >= t)];
    expect(at(15)).toBeGreaterThan(1.1 * at(27));
  });

  it("counts the flex of a frame too dark to read for less", () => {
    // One yacht by day, at dusk and at night, rated alike.
    const [day, dusk, night] = [0.5, 0.25, 0.08].map((luma, k) => {
      const scan = clip(`y${k}`, 6);
      scan.stats.luma.fill(luma);
      scan.look = lookFor(scan, sheets([0]), new Map([[1, { n: 1, flex: 8, wow: 5, kind: "yacht" }]]));
      return scan;
    });
    scoreInterest([day, dusk, night]);
    expect(dusk.interest![3]).toBeGreaterThan(0.9 * day.interest![3]);
    expect(night.interest![3]).toBeLessThan(0.7 * day.interest![3]);
  });

  it("asks Gemini with the sheets and a schema, and keeps only the frames it asked about", async () => {
    const calls: { parts: { text?: string; inlineData?: unknown }[]; schema: boolean }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        calls.push({ parts: body.contents[0].parts, schema: !!body.generationConfig.responseSchema });
        const frames = [
          { n: 1, kind: "car", flex: 12, wow: 7 },
          { n: 2, kind: "not-a-kind", flex: 3, wow: 4 },
          { n: 99, kind: "car", flex: 10, wow: 10 },
        ];
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ frames }) }] } }] }), { status: 200 });
      }),
    );
    const sh = sheets([0, 4]);
    const got = await rateSheets(sh, { key: "k", model: "gemini-x" });
    expect(calls).toHaveLength(1);
    expect(calls[0].schema).toBe(true);
    expect(calls[0].parts.some((p) => p.inlineData)).toBe(true);
    expect(calls[0].parts.some((p) => p.text === "Sheet 1: frames 1 to 2.")).toBe(true);
    expect(got.get(1)).toEqual({ n: 1, flex: 10, wow: 7, kind: "car" });
    expect(got.get(2)?.kind).toBe("other");
    expect(got.has(99)).toBe(false);
    // Remembered and restored for the same footage, refused for different footage.
    const stored = storeLook(sh, got);
    expect(restoreLook(stored, sh)?.get(1)?.flex).toBe(10);
    expect(restoreLook(stored, sheets([0, 4, 9]))).toBeNull();
  });
});

describe("SponsorBlock", () => {
  it("finds a YouTube ID in the names downloaders give files", () => {
    expect(youtubeId("How I Made $1M [dQw4w9WgXcQ].mp4")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("watch?v=dQw4w9WgXcQ.webm")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("IMG_4412.MOV")).toBeNull();
  });

  it("asks by hash prefix and keeps this video's segments", async () => {
    let asked = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        asked = url;
        return new Response(
          JSON.stringify([
            { videoID: "other123456", segments: [{ category: "sponsor", segment: [1, 2] }] },
            { videoID: "dQw4w9WgXcQ", segments: [{ category: "sponsor", segment: [60, 95.5] }, { category: "outro", segment: [600, 620] }] },
          ]),
          { status: 200 },
        );
      }),
    );
    const skips = await skipSegments("dQw4w9WgXcQ");
    expect(asked).toMatch(/\/skipSegments\/[0-9a-f]{4}\?categories=/);
    expect(asked).not.toContain("dQw4w9WgXcQ");
    expect(skips).toEqual([
      { category: "sponsor", start: 60, end: 95.5 },
      { category: "outro", start: 600, end: 620 },
    ]);
  });

  it("leaves the marked stretches out of the picks", () => {
    const scan = clip("yt", 10);
    scan.skip = [[2, 6]];
    scoreInterest([scan]);
    const inSkip = scan.interest![6]; // t = 3.25
    const outside = scan.interest![14]; // t = 7.25
    expect(inSkip).toBeLessThan(outside * 0.1);
  });
});

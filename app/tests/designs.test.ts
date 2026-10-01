import { describe, expect, it } from "vitest";
import { analyzeSong, type SongAnalysis } from "../src/engine/audio/song";
import { lifeFootage, scoreInterest, type Kind, type Scan } from "../src/engine/media/scan";
import { applyDesign, BARS, designFor, designOrder, DESIGNS, fits, heatOf, limitFlashes, panelsFor, wordByWord, type Design } from "../src/engine/plan/designs";
import { CUT_LEAD, planMontage } from "../src/engine/plan/montage";
import { FPS, type CardSpec, type EditPlan, type FxEvent } from "../src/engine/plan/types";
import { fxAt } from "../src/engine/render/export";
import { lookedAt } from "./scans";

const SR = 22050;
const F = 1 / FPS;

/** `secs` of music at `bpm`: quiet hats, then from `drop` on kicks on every beat and claps on two and four (or nothing but soft hats). */
function track(bpm: number, secs: number, drop: number, drums = true): SongAnalysis {
  const y = new Float32Array(SR * secs);
  const period = 60 / bpm;
  const hit = (t: number, amp: number, hz: number, decay: number) => {
    const s0 = Math.round(t * SR);
    for (let i = 0; i < 3000 && s0 + i < y.length; i++) y[s0 + i] += amp * Math.exp(-i / decay) * Math.sin((2 * Math.PI * hz * i) / SR);
  };
  for (let b = 0; b * period < secs - 0.5; b++) {
    const t = 0.1 + b * period;
    hit(t, 0.08, 6000, 60);
    if (drums && t > drop) {
      hit(t, b % 4 === 0 ? 0.9 : 0.6, 60, 900);
      if (b % 2 === 1) hit(t, 0.4, 1800, 250);
    }
  }
  return analyzeSong(y, SR);
}

const song = track(128, 24, 8);
const card: CardSpec = { kind: "laptop", top: "start free", bottom: "namzilabs.co", accent: "#568CFF", hold: 4, draw: false };

function footage(): Scan[] {
  const kinds: Kind[] = ["car", "jet", "yacht", "home", "view", "watch", "city", "travel", "party", "money"];
  const out = kinds.map((kind, k) => lookedAt(kind, [{ len: 5 + (k % 4), kind, flex: 0.7 + 0.02 * k, wow: 0.6, look: k }], 300 + k));
  scoreInterest(out);
  return out;
}

const base = { song, songSource: "song", songName: "click", fromStart: false, aspect: "9x16" as const, length: 14, variant: 0 };
const TRANSITIONS = new Set<FxEvent["kind"]>(["zoomin", "whip", "spin", "blur"]);

const NOW = new Date(2026, 9, 1);

function planIn(design: Design, opts: Partial<Parameters<typeof planMontage>[0]> = {}): EditPlan {
  const scans = footage();
  const plan = planMontage({ ...base, scans, card, caption: { style: "mood", text: "Peak life." }, velocity: design === "velocity", ...opts });
  return applyDesign(plan, design, song, { scans, now: NOW });
}

describe("edit designs", () => {
  const plans = new Map(DESIGNS.map((d) => [d.value, planIn(d.value)]));

  it("each design looks its own way: its own colour, and its own effects", () => {
    const grades = new Set([...plans.values()].map((p) => JSON.stringify(p.grade)));
    expect(grades.size).toBe(DESIGNS.length);
    const kinds = [...plans.entries()].map(([d, p]) => [d, [...new Set(p.fx.map((f) => f.kind))].sort().join(",")]);
    expect(new Set(kinds.map(([, k]) => k)).size).toBe(DESIGNS.length);
    for (const [d, p] of plans) expect(p.design).toBe(d);
    // The signature of each.
    const has = (d: Design, k: FxEvent["kind"]) => plans.get(d)!.fx.some((f) => f.kind === k);
    expect(has("zoom", "zoomin") && has("whip", "whip") && has("whip", "spin") && has("glitch", "glitch") && has("cinematic", "bars") && has("cinematic", "leak") && has("noir", "mono") && has("flash", "strobe") && has("vhs", "vhs")).toBe(true);
    expect(plans.get("split")!.overlays!.filter((o) => o.panel).length).toBeGreaterThanOrEqual(3);
    expect(plans.get("vhs")!.captions.map((c) => c.text)).toEqual(["Peak life.", "PLAY ▶", "OCT. 01 2026"]);
  });

  it("shows within the first second: every design but the clean one does something from its first frames", () => {
    for (const [d, p] of plans) {
      if (d === "clean") continue;
      if (d === "split") expect(p.overlays!.some((o) => o.start === 0 && o.panel), d).toBe(true);
      else expect(p.fx.some((f) => f.start < 0.05 && f.kind !== "fadein"), d).toBe(true);
    }
    // Black and white and the bars from the very start.
    expect(plans.get("noir")!.fx.some((f) => f.kind === "mono" && f.start === 0)).toBe(true);
    expect(plans.get("cinematic")!.fx.find((f) => f.kind === "bars")!.strength).toBe(BARS["9x16"]);
  });

  it("everything lands on the music: transitions peak on cuts, the rest on cuts, hits or beats", () => {
    const songStart = (p: EditPlan) => p.music!.songStart;
    for (const [d, p] of plans) {
      const cuts = p.shots.map((s) => s.start);
      const onCut = (t: number) => cuts.some((c) => Math.abs(c - t) < 1e-6);
      const onHit = (t: number) => song.accents.some((a) => Math.abs(a.t - songStart(p) - CUT_LEAD - t) <= 1.5 * F + 0.06 && a.s >= 0.05);
      for (const f of p.fx) {
        if (f.at === undefined || f.at < 1e-6) continue;
        if (TRANSITIONS.has(f.kind)) expect(onCut(f.at), `${d} ${f.kind} at ${f.at}`).toBe(true);
        else expect(onCut(f.at) || onHit(f.at), `${d} ${f.kind} at ${f.at}`).toBe(true);
      }
    }
  });

  it("held back before the drop, let go on it, and nothing runs into the card", () => {
    for (const [d, p] of plans) {
      const cardAt = p.card!.start;
      for (const f of p.fx) if (f.kind !== "mono" && f.kind !== "bars" && f.kind !== "vhs" && f.kind !== "dip") expect(f.end, `${d} ${f.kind}`).toBeLessThanOrEqual(cardAt - 4 * F + 1e-6);
      for (const f of p.fx) expect(f.end, `${d} ${f.kind}`).toBeLessThanOrEqual(cardAt + 1e-6);
      const drop = p.shots.find((s) => s.role === "drop")!.start;
      const before = p.fx.filter((f) => f.start > 0.3 && f.start < drop - 0.2 && f.kind !== "punch").length / drop;
      const after = p.fx.filter((f) => f.start >= drop - 1e-6 && f.kind !== "punch").length / (cardAt - drop);
      if (d !== "clean" && d !== "cinematic" && d !== "vhs") expect(after, d).toBeGreaterThan(before);
    }
    // The flash design's drop: a strobe into it, then a flash and a shake on it.
    const p = plans.get("flash")!;
    const drop = p.shots.find((s) => s.role === "drop")!.start;
    expect(p.fx.some((f) => f.kind === "strobe" && Math.abs(f.end - drop) < 1e-6)).toBe(true);
    for (const k of ["flash", "shake"] as const) expect(p.fx.some((f) => f.kind === k && Math.abs(f.start - drop) < 1e-6), k).toBe(true);
  });

  it("never more than three flashes of white or black in a second", () => {
    for (const [d, p] of plans) {
      const ts: number[] = [];
      for (const f of p.fx) {
        if (f.kind === "flash" && f.strength >= 0.5) ts.push(f.at ?? f.start);
        if (f.kind === "invert") ts.push(f.start);
        if (f.kind === "strobe") for (let k = 1; f.start + k * F < f.end - 1e-6; k += 2) ts.push(f.start + k * F);
      }
      for (const w of ts) expect(ts.filter((t) => t >= w - 1e-6 && t < w + 1 - 1e-6).length, `${d} at ${w}`).toBeLessThanOrEqual(3);
    }
    // The strongest stay: four flashes in half a second lose the weakest.
    const fx: FxEvent[] = [0.1, 0.2, 0.3, 0.4].map((t, k) => ({ kind: "flash", start: t, end: t + 0.1, strength: k === 1 ? 0.6 : 1, at: t }));
    expect(limitFlashes(fx).map((f) => f.start)).toEqual([0.1, 0.3, 0.4]);
  });

  it("never two transitions within a beat", () => {
    for (const d of ["zoom", "whip"] as const) {
      const ts = plans
        .get(d)!
        .fx.filter((f) => TRANSITIONS.has(f.kind) && (f.at ?? 0) > 0)
        .map((f) => f.at!)
        .sort((a, b) => a - b);
      expect(ts.length, d).toBeGreaterThan(3);
      for (let i = 1; i < ts.length; i++) expect(ts[i] - ts[i - 1], d).toBeGreaterThanOrEqual(0.8 * song.period - 1e-6);
    }
  });

  it("the caption in the design's way: a word on each beat, then the line; a film title; a meme as it is", () => {
    const flash = plans.get("flash")!.captions;
    expect(flash.map((c) => c.text)).toEqual(["Peak", "life.", "Peak life."]);
    expect(flash.every((c) => c.style === "impact" && c.pop)).toBe(true);
    expect(flash[0].start).toBe(0);
    expect(flash[1].start).toBeGreaterThan(0.29);
    const cine = plans.get("cinematic")!.captions;
    expect(cine).toHaveLength(1);
    expect(cine[0].style).toBe("film");
    // In a wide frame, in the bottom bar.
    const wide = planIn("cinematic", { aspect: "4x3" });
    expect(wide.captions[0].y).toBeCloseTo(1 - BARS["4x3"] / 2, 5);
    const meme = planIn("glitch", { caption: { style: "meme", text: "me and bro if we bought bitcoin in 2011" } });
    expect(meme.captions).toHaveLength(1);
    expect(meme.captions[0].style).toBe("meme");
    // Too few beats for every word: the line whole.
    expect(wordByWord({ style: "mood", text: "a b c", start: 0, end: 0.5 }, "impact", [0.3])).toEqual([{ style: "impact", text: "a b c", start: 0, end: 0.5 }]);
  });

  it("the clean design is the plain edit, warm, with its own flourish", () => {
    const plain = planMontage({ ...base, scans: footage(), card, caption: { style: "mood", text: "Peak life." } });
    const clean = plans.get("clean")!;
    expect(clean.fx).toEqual(plain.fx);
    expect(clean.captions).toEqual(plain.captions);
  });
});

describe("the split screen", () => {
  it("the build in stacked panels, each cut changing one of them, then the drop full frame", () => {
    const plan = planIn("split");
    const drop = plan.shots.find((s) => s.role === "drop")!.start;
    const panels = plan.overlays!.filter((o) => o.panel);
    // Three rows filling a 9:16 frame, a thin line between.
    const P = panelsFor("9x16");
    expect(P).toHaveLength(3);
    expect(P.reduce((a, p) => a + p.h, 0) + 2 * 0.006).toBeCloseTo(1, 6);
    expect(panelsFor("4x3").every((p) => p.h === 1)).toBe(true);
    // The shots before the drop are in the panels, not drawn themselves; the ones after are full frame.
    for (const s of plan.shots) expect(!!s.hide, `${s.start}`).toBe(s.start < drop - 1e-6);
    for (const o of panels) expect(o.end).toBeLessThanOrEqual(drop + 1e-6);
    // Each cut before the drop brings one panel a new clip: never more than three at once.
    for (const s of plan.shots.filter((x) => x.start < drop - 1e-6)) {
      const now = panels.filter((o) => s.start + 0.01 >= o.start && s.start + 0.01 < o.end);
      expect(now.length).toBeLessThanOrEqual(3);
      expect(panels.filter((o) => Math.abs(o.start - s.start) < 1e-6)).toHaveLength(1);
    }
    // Each panel's first clip slides in, the rest cut in place.
    expect(panels.filter((o) => o.path).length).toBe(2);
    // The drop lands zoomed in.
    expect(plan.fx.some((f) => f.kind === "zoomin" && Math.abs((f.at ?? -1) - drop) < 1e-6)).toBe(true);
  });
});

describe("picks for the footage and the song", () => {
  it("tells footage of the life from luxury", () => {
    const trip = (["people", "party", "view", "food", "people"] as Kind[]).map((kind, k) => lookedAt(`t${k}`, [{ len: 4, kind, flex: 0.45, wow: 0.5, look: k }], 80 + k));
    const lux = (["car", "jet", "yacht", "watch", "people"] as Kind[]).map((kind, k) => lookedAt(`l${k}`, [{ len: 4, kind, flex: kind === "people" ? 0.2 : 0.9, wow: 0.6, look: k }], 90 + k));
    expect(lifeFootage(trip)).toBe(true);
    expect(lifeFootage(lux)).toBe(false);
    // (Unjudged footage isn't.)
    expect(lifeFootage(footage().map((sc) => ({ ...sc, look: undefined })))).toBe(false);
  });

  it("where the music drives, people doing something over an empty view; where it's calm, the view", () => {
    // A long day out filmed six ways, all rated alike: three of the crew at the pool, and
    // three of the bay from the terrace with nobody in it.
    const crew = [1, 2, 3].map((k) => lookedAt(`crew${k}`, [{ len: 100, kind: "people", flex: 0.5, wow: 0.6, look: k }], 7 + k));
    const bay = [4, 5, 6].map((k) => lookedAt(`bay${k}`, [{ len: 100, kind: "view", flex: 0.5, wow: 0.6, look: k }], 7 + k));
    const scans = [...crew, ...bay];
    scoreInterest(scans);
    const plan = planMontage({ ...base, scans, card, caption: null });
    const isCrew = (s: { source: string }) => s.source.startsWith("crew");
    const drop = plan.shots.find((s) => s.role === "drop")!;
    const after = plan.shots.filter((s) => s.start >= drop.start - 1e-6 && s.start < plan.card!.start);
    expect(after.filter(isCrew).length).toBeGreaterThan(1.5 * after.filter((s) => !isCrew(s)).length);
    expect(isCrew(drop)).toBe(true);
    expect(plan.shots.filter((s) => s.start < drop.start - 1e-6).some((s) => !isCrew(s))).toBe(true);
  });
});

describe("a batch's designs, suited to the song", () => {
  const scans = footage();
  const hot = track(150, 20, 2);
  const calm = track(84, 20, 30, false);

  it("a hard, fast song leads with the flashes and glitches; a calm one with cinematic, and leaves the hard ones out", () => {
    expect(heatOf(hot)).toBeGreaterThan(heatOf(calm) + 0.2);
    expect(designOrder(hot, scans).slice(0, 2)).toEqual(["flash", "glitch"]);
    const soft = designOrder(calm, scans);
    expect(soft[0]).toBe("cinematic");
    expect(soft).not.toContain("flash");
    expect(soft).not.toContain("glitch");
  });

  it("night footage brings the dark designs forward", () => {
    const night = footage().map((sc) => ({ ...sc, stats: { ...sc.stats, luma: new Float32Array(sc.stats.luma.length).fill(0.12) } }));
    const day = designOrder(song, scans);
    const dark = designOrder(song, night);
    expect(dark.indexOf("cinematic")).toBeLessThan(day.indexOf("cinematic"));
    expect(dark.indexOf("noir")).toBeLessThan(day.indexOf("noir"));
  });

  it("each edit in another design, each one that goes with its style", () => {
    const order = designOrder(song, scans);
    const five = [0, 1, 2, 3, 4].map((n) => designFor(n, "mix", order, "beat"));
    expect(new Set(five).size).toBe(5);
    for (let n = 0; n < 12; n++) {
      expect(["clean", "cinematic", "noir", "vhs"]).toContain(designFor(n, "mix", order, "slow"));
      expect(designFor(n, "mix", order, "mono")).not.toBe("noir");
      expect(["noir", "split"]).not.toContain(designFor(n, "mix", order, "talk"));
      expect(designFor(n, "mix", order, "burst")).not.toBe("split");
    }
    expect(designFor(3, "glitch", order, "slow")).toBe("glitch");
    expect(fits("noir", "burst")).toBe(true);
  });
});

describe("the designs' moves, frame by frame", () => {
  const at = 1;
  it("a whip slides out along its way and the next shot slides in from the other side, smeared", () => {
    const fx: FxEvent[] = [{ kind: "whip", start: at - 3 * F, end: at + 4 * F, strength: 1, at, dir: 0 }];
    const before = fxAt(fx, at - F, FPS);
    const after = fxAt(fx, at, FPS);
    const settled = fxAt(fx, at + 4 * F, FPS);
    expect(before.move[0]).toBeGreaterThan(0.1);
    expect(after.move[0]).toBeLessThan(-0.3);
    expect(before.streak[0]).toBeGreaterThan(0.1);
    expect(after.streak[0]).toBeGreaterThan(0.1);
    expect(Math.abs(before.move[1]) + Math.abs(after.move[1])).toBeLessThan(1e-9);
    expect(settled.move).toEqual([0, 0]);
  });

  it("a zoom-in transition rushes in to the cut and lands zoomed; pulling out goes the other way", () => {
    const fx: FxEvent[] = [{ kind: "zoomin", start: at - 3 * F, end: at + 6 * F, strength: 1, at }];
    const s = [-3, -2, -1, 0, 2, 4].map((k) => fxAt(fx, at + k * F, FPS).scale);
    expect(s[0]).toBeLessThan(s[2]);
    expect(s[3]).toBeCloseTo(1.5, 5);
    expect(s[4]).toBeLessThan(s[3]);
    expect(s[5]).toBeLessThan(s[4]);
    expect(fxAt([{ ...fx[0], dir: -1 }], at, FPS).scale).toBeCloseTo(1 / 1.5, 5);
  });

  it("a swing turns the picture and zooms just enough that no corner shows", () => {
    const e = fxAt([{ kind: "swing", start: at - F, end: at + 9 * F, strength: 1, at, dir: 1 }], at, FPS, 9 / 16);
    const th = Math.abs(e.spin);
    expect(th).toBeCloseTo((4 * Math.PI) / 180, 5);
    // The frame turned inside the picture stays inside it.
    expect(e.scale).toBeGreaterThanOrEqual(Math.cos(th) + (16 / 9) * Math.sin(th) - 1e-9);
  });

  it("a strobe is black every other frame; the bars slide in and hold", () => {
    const fx: FxEvent[] = [{ kind: "strobe", start: at, end: at + 6 * F, strength: 1 }];
    expect([0, 1, 2, 3].map((k) => fxAt(fx, at + k * F, FPS).dim)).toEqual([0, 1, 0, 1]);
    const bars: FxEvent[] = [{ kind: "bars", start: 0, end: 10, strength: 0.14 }];
    expect(fxAt(bars, 0, FPS).bars).toBeLessThan(0.05);
    expect(fxAt(bars, 9 * F, FPS).bars).toBeGreaterThan(0.05);
    expect(fxAt(bars, 2, FPS).bars).toBeCloseTo(0.14, 6);
  });
});

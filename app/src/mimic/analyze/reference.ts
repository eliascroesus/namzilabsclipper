/**
 * Studying a reference video, start to end, on this computer: every frame
 * (small and gray) for its cuts, cards and zooms; a frame a second read for
 * text, to find where its captions sit; three frames a second of that band
 * read closely, for how its captions look and come on; its sound for the
 * voice, a bed under it and sounds on its events. The result is a template the
 * mimic planner follows.
 */
import { fontById } from "../../engine/text/library";
import type { MimicTemplate, BrollSlot, CardSlot, CaptionLook, SoundLook, TextDesign } from "../types";
import { CardFinder, type Gray } from "./cards";
import { captionLook, captionScript, measureLine, type CaptionSample } from "./captions";
import type { Picture, TextBox, TextReader } from "./ocr";
import { blackTail, classifyShots, findCuts, type Shot } from "./shots";
import { findSfx, soundProfile } from "./sound";
import { readDesign, type DesignReading, type TextSample } from "./textdesign";
import { matchFont, sizeIn, type Renderer } from "./fontmatch";
import { blendOf, layerOf, lineWords, wordMask, type Plane } from "./words";
import { scaleBetween, zoomEvents, zoomLook, type ZoomEvent } from "./zoom";

export interface FrameSource {
  name: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  /** every frame in order, gray, at w × h */
  frames(w: number, h: number, each: (t: number, g: Gray) => void, signal?: AbortSignal): Promise<void>;
  /** pictures (RGBA) at these times, at w × h */
  pictures(times: number[], w: number, h: number, each: (t: number, p: Picture) => Promise<void>, signal?: AbortSignal): Promise<void>;
  /** the sound, 16 kHz mono */
  audio(): Promise<Float32Array>;
  /** a small picture of part of the frame at t (x, y, w, h shares), as a data URL */
  thumb?(t: number, rect?: [number, number, number, number]): Promise<string | undefined>;
}

export interface Analysts {
  reader: TextReader;
  /** sees the caption samples (tests) */
  onSamples?: (s: CaptionSample[]) => void;
  /** faces in a picture (centre and size, shares of it) */
  faces?: (p: Picture) => Promise<{ x: number; y: number; w: number; h: number }[]>;
  /** the person in a picture (0 to 1), to tell captions behind the speaker */
  person?: (p: Picture) => Promise<Plane | null>;
  /** sees the design reading's frames (tests) */
  onDesignSamples?: (s: TextSample[]) => void;
  /** draws words in the library's faces, to match a design's fonts by eye */
  fonts?: () => Promise<Renderer>;
}

export type Progress = (p: number, label: string) => void;

const cancelled = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
};

/** Analysis sizes: the long side 320 (cards), half that (cuts, zooms), and up to 960 for reading text. */
function sizes(W: number, H: number) {
  const k = 320 / Math.max(W, H);
  const gw = Math.round((W * k) / 2) * 2;
  const gh = Math.round((H * k) / 2) * 2;
  const r = Math.min(1, 960 / Math.max(W, H));
  return { gw, gh, pw: Math.round(W * r), ph: Math.round(H * r) };
}

function half(g: Gray): Gray {
  const w = g.width >> 1;
  const h = g.height >> 1;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = 2 * y * g.width + 2 * x;
      out[y * w + x] = (g.data[i] + g.data[i + 1] + g.data[i + g.width] + g.data[i + g.width + 1]) / 4;
    }
  return { data: out, width: w, height: h };
}

const letters = (s: string) => (s.match(/\p{L}|\p{N}/gu) ?? []).length;

export async function analyzeReference(src: FrameSource, a: Analysts, onProgress: Progress = () => {}, signal?: AbortSignal): Promise<MimicTemplate> {
  const { duration, width: W, height: H } = src;
  const { gw, gh, pw, ph } = sizes(W, H);
  const notes: string[] = [];

  // 1. Every frame: cards, and small copies for cuts and zooms.
  onProgress(0, "Watching every frame");
  const finder = new CardFinder(src.fps || 30);
  const small: Gray[] = [];
  const times: number[] = [];
  const means: number[] = [];
  await src.frames(
    gw,
    gh,
    (t, g) => {
      finder.push(t, g);
      const s = half(g);
      small.push(s);
      times.push(t);
      let m = 0;
      for (let i = 0; i < s.data.length; i++) m += s.data[i];
      means.push(m / s.data.length);
      onProgress(0.3 * Math.min(1, t / duration), "Watching every frame");
    },
    signal,
  );
  cancelled(signal);
  const cuts = findCuts(small, times);
  const cards = finder.finish(cuts);

  // 2. A frame a second, read whole: where the text is, and faces.
  onProgress(0.3, "Reading the text");
  const firstTimes: number[] = [];
  for (let t = 0.5; t < duration; t += 1) firstTimes.push(t);
  const firstBoxes: { t: number; boxes: TextBox[] }[] = [];
  const faceAt = new Map<number, { x: number; y: number; w: number; h: number }[]>();
  await src.pictures(
    firstTimes,
    pw,
    ph,
    async (t, p) => {
      const boxes = (await a.reader.find(p, 640)).filter((b) => b.y1 - b.y0 > 0.012 * ph);
      for (const b of boxes) Object.assign(b, await a.reader.read(p, b));
      firstBoxes.push({ t, boxes });
      if (a.faces) faceAt.set(t, await a.faces(p));
      onProgress(0.3 + 0.15 * Math.min(1, t / duration), "Reading the text");
    },
    signal,
  );
  cancelled(signal);
  // The caption band: where big, changing lines of text sit most often.
  const big = firstBoxes.flatMap((f) => f.boxes.filter((b) => (b.conf ?? 0) >= 0.6 && letters(b.text ?? "") >= 1 && b.y1 - b.y0 > 0.025 * ph).map((b) => ({ t: f.t, cy: (b.y0 + b.y1) / 2 / ph, text: (b.text ?? "").replace(/\s/g, "") })));
  const same = new Map<string, number>();
  for (const b of big) same.set(`${Math.round(b.cy * 40)}:${b.text}`, (same.get(`${Math.round(b.cy * 40)}:${b.text}`) ?? 0) + 1);
  const changing = big.filter((b) => (same.get(`${Math.round(b.cy * 40)}:${b.text}`) ?? 0) < Math.max(3, firstTimes.length * 0.3));
  let band: [number, number] | null = null;
  if (changing.length >= 3) {
    const bins = new Float64Array(50);
    for (const b of changing) bins[Math.min(49, Math.floor(b.cy * 50))]++;
    let peak = 0;
    for (let i = 1; i < 49; i++) if (bins[i - 1] + bins[i] + bins[i + 1] > bins[peak - 1 < 0 ? 0 : peak - 1] + bins[peak] + bins[peak + 1]) peak = i;
    band = [Math.max(0, peak / 50 - 0.08), Math.min(1, peak / 50 + 0.12)];
  }

  // 2b. Richer captions (stacked beside the head, several styles, some behind the speaker):
  // when big lines of text come and go all over the frame, or at very different sizes, the
  // frames round them are read whole, three a second, word by word, for the design.
  let design: DesignReading | null = null;
  if (richCaptions(changing, firstBoxes, ph)) {
    onProgress(0.45, "Reading the caption design");
    const on = [...new Set(changing.map((b) => b.t))];
    // (Not a screen of an app's interface, the motion graphics' cards and lists: no face, and
    // lines of small text all over. Its writing isn't the captions.)
    const ui = new Set(
      firstBoxes
        .filter((f) => {
          if ((faceAt.get(f.t) ?? []).some((q) => q.h > 0.12) || f.boxes.length < 4) return false;
          const hs = f.boxes.map((b) => b.y1 - b.y0).sort((x, y) => x - y);
          return hs[hs.length >> 1] < 0.065 * ph;
        })
        .map((f) => f.t),
    );
    let designTimes: number[] = [];
    for (let t = 1 / 6; t < duration; t += 1 / 3) {
      const near = firstTimes.reduce((a, u) => (Math.abs(u - t) < Math.abs(a - t) ? u : a), firstTimes[0]);
      if (on.some((u) => Math.abs(u - t) <= 0.85) && !ui.has(near)) designTimes.push(t);
    }
    // (And in a promo, while the speaker is on screen, not in the long stretches without them:
    // the motion graphics between, their screens of an app and their titles, aren't the
    // captions. A cutaway of a second or two keeps its captions, a short edit all of its own,
    // and a speaker too small to find, standing back (too few moments with a face), leaves them.)
    const faced = firstTimes.map((u) => (faceAt.get(u) ?? []).some((q) => q.h > 0.06));
    const away = new Set<number>();
    for (let i = 0; i < faced.length; ) {
      let j = i;
      while (j < faced.length && !faced[j]) j++;
      if (j - i >= 3) for (let k = i; k < j; k++) away.add(firstTimes[k]);
      i = Math.max(j, i + 1);
    }
    const talking = designTimes.filter((t) => !away.has(firstTimes.reduce((a, u) => (Math.abs(u - t) < Math.abs(a - t) ? u : a), firstTimes[0])));
    if (a.faces && duration >= 25 && talking.length >= 15) designTimes = talking;
    const samples: TextSample[] = [];
    await src.pictures(
      designTimes,
      pw,
      ph,
      async (t, p) => {
        const boxes = (await a.reader.find(p, 640)).filter((b) => b.y1 - b.y0 > 0.012 * ph);
        const words: TextSample["words"] = [];
        let person: Plane | null | undefined;
        for (const b of boxes) {
          const r = await a.reader.read(p, b);
          if (r.conf < 0.6 || !letters(r.text)) continue;
          const lw = lineWords(p, b, r.text, boxes);
          if (!lw) continue;
          if (person === undefined) person = a.person ? await a.person(p).catch(() => null) : null;
          const layer = person ? layerOf(lw, person, pw, ph) : undefined;
          for (const w of lw.words) words.push({ ...w, conf: r.conf, layer, blend: w.spread > 18 ? blendOf(p, lw, w) : null, mask: a.fonts && w.xh >= 8 ? wordMask(lw, w) : null });
        }
        samples.push({ t, words });
        onProgress(0.45 + 0.12 * Math.min(1, t / duration), "Reading the caption design");
      },
      signal,
    );
    cancelled(signal);
    a.onDesignSamples?.(samples);
    design = readDesign(samples, pw, ph, 1 / 3);
    // Each style's font, matched by drawing the library's faces over its clearest words.
    if (design && a.fonts) {
      onProgress(0.57, "Matching the fonts");
      const render = await a.fonts().catch(() => null);
      if (render)
        design.design.styles.forEach((st, si) => {
          const sp = design!.specimens[si]?.filter((w) => w.mask).map((w) => ({ text: w.text, mask: w.mask!, xh: w.xh, tall: w.tall })) ?? [];
          const g = sp.length ? matchFont(sp, render, { weight: st.weight, italic: st.italic }) : null;
          // (Under 55% alike, the face picked from the letters' proportions is the safer bet.)
          if (!g || g.score < 0.55) return;
          const f = fontById(g.font);
          const px = sp.map((x) => sizeIn(f, x)).sort((p, q) => p - q);
          Object.assign(st, { font: g.font, weight: g.weight, italic: g.italic, stretch: g.stretch, tracking: Math.max(-0.12, Math.min(0.2, g.tracking)), size: Math.round((px[px.length >> 1] / ph) * 1000) / 1000 });
          design!.notes.push(`${st.name ?? st.id}: set in ${f.name}${g.stretch ? ` at ${g.stretch}% width` : ""}, ${g.weight} (${Math.round(g.score * 100)}% alike).`);
        });
      cancelled(signal);
    }
  }

  // 3. The caption band, three frames a second, read closely.
  onProgress(0.45, "Studying the captions");
  const samples: CaptionSample[] = [];
  if (band) {
    const bandTimes: number[] = [];
    for (let t = 1 / 6; t < duration; t += 1 / 3) bandTimes.push(t);
    const region = { x: 0, y: Math.round(band[0] * ph), w: pw, h: Math.round((band[1] - band[0]) * ph) };
    await src.pictures(
      bandTimes,
      pw,
      ph,
      async (t, p) => {
        // The band at the scale a whole frame is read at 960 pixels.
        const side = Math.round((960 * Math.max(region.w, region.h)) / Math.max(pw, ph));
        const boxes = (await a.reader.find(p, side, region)).filter((b) => b.y1 - b.y0 > 0.012 * ph);
        const lines: CaptionSample["lines"] = [];
        for (const b of boxes) {
          const r = await a.reader.read(p, b);
          lines.push({ ...b, text: r.text, conf: r.conf, ink: measureLine(p, b) });
        }
        samples.push({ t, lines });
        onProgress(0.45 + 0.3 * Math.min(1, t / duration), "Studying the captions");
      },
      signal,
    );
  }
  cancelled(signal);
  a.onSamples?.(samples);
  let captions = captionLook(samples, pw, ph, cards);
  let script = band ? captionScript(samples, ph, band) : [];
  // The design rides on the look (which stays the fallback); without a band of captions,
  // the look is made from the design's base style, and the script from its captions.
  if (design && designWorthIt(design.design)) {
    captions = { ...(captions ?? lookFromDesign(design.design)), design: design.design };
    if (!script.length) script = design.captions.map((c) => ({ start: Math.round(c.start * 100) / 100, end: Math.round(c.end * 100) / 100, text: c.lines.map((l) => l.map((w) => w.text).join(" ")).join(" ") }));
    notes.push(...design.notes);
  }

  // 4. Shots: the talking footage and the cutaways.
  const faceTimes = [...faceAt.keys()];
  const hasFace = a.faces
    ? (t: number) => {
        const near = faceTimes.filter((f) => Math.abs(f - t) < 1.2);
        return near.some((f) => (faceAt.get(f) ?? []).some((q) => q.h > 0.06));
      }
    : undefined;
  const shots = classifyShots(small, times, cuts, duration, hasFace);
  const main = shots.filter((s) => s.main);

  // 5. Zooms, on the talking footage, leaving out the captions and the cards.
  onProgress(0.75, "Measuring the zooms");
  const sw = small[0]?.width ?? 1;
  const sh = small[0]?.height ?? 1;
  const events: ZoomEvent[] = [];
  const brollZoom = new Map<Shot, [number, number]>();
  for (const shot of shots) {
    const idx = times.map((t, i) => [t, i] as const).filter(([t]) => t >= shot.start - 1e-6 && t < shot.end - 1e-6).map(([, i]) => i);
    const ts: number[] = [];
    const ss: number[] = [];
    for (let k = 1; k < idx.length; k++) {
      const t = times[idx[k]];
      const mask = new Uint8Array(sw * sh).fill(1);
      if (band) for (let y = Math.floor(band[0] * sh); y < Math.min(sh, Math.ceil(band[1] * sh)); y++) mask.fill(0, y * sw, (y + 1) * sw);
      for (const c of cards)
        if (t >= c.start - 0.1 && t <= c.end + 0.1)
          for (let y = Math.max(0, Math.floor(c.rect[1] * sh) - 2); y < Math.min(sh, Math.ceil((c.rect[1] + c.rect[3]) * sh) + 2); y++) mask.fill(0, y * sw, (y + 1) * sw);
      ts.push(t);
      ss.push(scaleBetween(small[idx[k - 1]], small[idx[k]], mask).s);
    }
    const ev = zoomEvents(ts, ss, src.fps || 30);
    if (shot.main) events.push(...ev);
    else brollZoom.set(shot, [1, ev.reduce((p, e) => p * e.total, 1)]);
    cancelled(signal);
  }
  const zoom = zoomLook(events, src.fps || 30, main.map((s) => [s.start, s.end]));

  // 6. Cutaways: runs of shots that aren't the talking footage.
  const broll: BrollSlot[] = [];
  for (const s of shots) {
    if (s.main) continue;
    const last = broll[broll.length - 1];
    const z = brollZoom.get(s) ?? [1, 1];
    if (last && Math.abs(last.end - s.start) < 0.05) {
      last.end = s.end;
      last.cuts++;
      last.zoom = [last.zoom[0], Math.max(last.zoom[1], z[1])];
    } else broll.push({ id: `broll${broll.length + 1}`, start: s.start, end: s.end, zoom: z, cuts: 0 });
  }
  // The black at the end is the ending, not a cutaway.
  const tail = Math.round(blackTail(means, times, duration) * 100) / 100;
  const cutaways = broll.filter((b) => b.end - b.start >= 0.4 && !(tail > 0 && b.start >= duration - tail - 0.1));
  cutaways.forEach((b, i) => (b.id = `broll${i + 1}`));

  // 7. What each card showed: a clip (it moves at rest), a screenshot (lines of small text), or a photo.
  for (const c of cards) {
    const rest = times.map((t, i) => [t, i] as const).filter(([t]) => t > c.start + 0.25 && t < c.end - 0.25);
    const moves: number[] = [];
    for (let k = 6; k < rest.length; k += 6) {
      const a0 = small[rest[k - 6][1]];
      const a1 = small[rest[k][1]];
      // Well inside it (a tenth in from each side), so the footage moving round it doesn't count.
      const x0 = Math.floor((c.rect[0] + 0.1 * c.rect[2]) * sw);
      const x1 = Math.floor((c.rect[0] + 0.9 * c.rect[2]) * sw);
      const y0 = Math.floor((c.rect[1] + 0.1 * c.rect[3]) * sh);
      const y1 = Math.floor((c.rect[1] + 0.9 * c.rect[3]) * sh);
      let d = 0;
      let n = 0;
      for (let y = Math.max(0, y0); y < Math.min(sh, y1); y++) {
        // Captions written over a card change its inside too; they don't make it a clip.
        if (band && y >= band[0] * sh && y <= band[1] * sh) continue;
        for (let x = Math.max(0, x0); x < Math.min(sw, x1); x++) {
          d += Math.abs(a0.data[y * sw + x] - a1.data[y * sw + x]);
          n++;
        }
      }
      if (n) moves.push(d / n);
    }
    const texts = firstBoxes.filter((f) => f.t >= c.start && f.t <= c.end).flatMap((f) => f.boxes.filter((b) => (b.x0 + b.x1) / 2 / pw > c.rect[0] && (b.x0 + b.x1) / 2 / pw < c.rect[0] + c.rect[2] && (b.y0 + b.y1) / 2 / ph > c.rect[1] && (b.y0 + b.y1) / 2 / ph < c.rect[1] + c.rect[3] && b.y1 - b.y0 < 0.03 * ph));
    // A clip keeps changing the whole time it rests; a picture only while it settles.
    moves.sort((p, q) => p - q);
    const moving = moves.length >= 3 && moves[moves.length >> 1] > 6;
    c.content = moving ? "video" : texts.length >= 3 ? "screenshot" : "photo";
    // What the captions said as it came on.
    const said = samples.filter((s) => Math.abs(s.t - c.start) < 0.7).flatMap((s) => s.lines.filter((l) => band && (l.y0 + l.y1) / 2 / ph >= band[0] && (l.y0 + l.y1) / 2 / ph <= band[1]).map((l) => l.text ?? ""));
    if (said.length) c.said = said.sort((p, q) => q.length - p.length)[0];
  }

  // 8. Sound.
  onProgress(0.88, "Listening");
  const audio = await src.audio();
  cancelled(signal);
  const sp = soundProfile(audio);
  const sfxEvents: { t: number; on: import("../types").SfxOn }[] = [];
  const runs = new Map<number, CardSlot[]>();
  for (const c of cards) runs.set(c.run, [...(runs.get(c.run) ?? []), c]);
  for (const r of runs.values()) {
    sfxEvents.push({ t: r[0].start, on: "card-in" });
    sfxEvents.push({ t: r[r.length - 1].end, on: "card-out" });
  }
  for (const b of cutaways) sfxEvents.push({ t: b.start, on: "broll" });
  for (const e of events) sfxEvents.push({ t: e.start, on: "zoom" });
  const sound: SoundLook = { bed: sp.bed, sfx: findSfx(sp.high, sfxEvents, duration) };

  // 9. The speaker's framing: where the face sits in the talking footage.
  let speaker: MimicTemplate["speaker"] = null;
  const facesMain = [...faceAt.entries()].filter(([t]) => main.some((s) => t >= s.start && t < s.end) && !cards.some((c) => t >= c.start && t < c.end)).map(([, f]) => f.sort((p, q) => q.h - p.h)[0]).filter(Boolean);
  if (facesMain.length >= 3) {
    const med = (v: number[]) => v.sort((p, q) => p - q)[v.length >> 1];
    speaker = { x: med(facesMain.map((f) => f.x)), y: med(facesMain.map((f) => f.y)), h: med(facesMain.map((f) => f.h)) };
  }

  // 10. Pictures of each card and cutaway, for the page.
  if (src.thumb) {
    for (const c of cards) c.thumb = await src.thumb((c.start + c.end) / 2, c.rect);
    for (const b of cutaways) b.thumb = await src.thumb((b.start + b.end) / 2);
  }
  onProgress(1, "Done");

  if (captions) notes.push(`Captions ${captions.lines === 1 ? "on one line" : `on up to ${captions.lines} lines`}, ${captions.reveal === "word" ? "word by word as they're said" : "a caption at a time"}, at ${Math.round(captions.y * 100)}% of the height.`);
  if (cards.length) notes.push(`${cards.length} card${cards.length > 1 ? "s" : ""} laid over the talk, in ${runs.size} run${runs.size > 1 ? "s" : ""}.`);
  if (cutaways.length) notes.push(`${cutaways.length} cutaway${cutaways.length > 1 ? "s" : ""} over the voice.`);
  if (zoom) notes.push(`${zoom.changes.length} zooms on the talking, to about ${Math.round((zoom.close - 1) * 100)}% closer.`);
  if (sound.bed) notes.push(`A bed under the voice from ${sound.bed.start.toFixed(1)} s, ${-sound.bed.level} dB down.`);
  notes.push(sound.sfx.length ? `Sounds on ${sound.sfx.map((s) => s.on).join(", ")}.` : "No sound effects to be heard in its sound (the edit gets whooshes on the cards' moves; see Sound).");
  if (tail > 0.2) notes.push(`Ends on ${tail.toFixed(1)} s of black.`);

  return {
    version: 1,
    name: src.name,
    duration,
    width: W,
    height: H,
    speech: sp.speech,
    captions,
    cards,
    broll: cutaways,
    zoom,
    sound,
    tail,
    speaker,
    maxPause: sp.maxPause,
    script,
    notes,
  };
}

/**
 * Whether a reference's captions are more than subtitles in a band: big lines of text
 * coming and going all over the frame (the middles of the middle half more than a sixth
 * of the height apart), or at very different sizes.
 */
function richCaptions(changing: { t: number; cy: number }[], firstBoxes: { t: number; boxes: TextBox[] }[], ph: number): boolean {
  if (changing.length < 3) return false;
  const cys = changing.map((b) => b.cy).sort((x, y) => x - y);
  const spread = cys[Math.floor(0.85 * (cys.length - 1))] - cys[Math.floor(0.15 * (cys.length - 1))];
  const hs = firstBoxes
    .flatMap((f) => f.boxes.filter((b) => (b.conf ?? 0) >= 0.6 && b.y1 - b.y0 > 0.025 * ph).map((b) => b.y1 - b.y0))
    .sort((x, y) => x - y);
  const range = hs.length >= 3 ? hs[Math.floor(0.9 * (hs.length - 1))] / Math.max(1, hs[Math.floor(0.1 * (hs.length - 1))]) : 1;
  return spread > 0.16 || range > 1.8;
}

/** A design worth more than the plain look: several styles, other looks, stacked, beside the middle, behind, or mixed in. */
function designWorthIt(d: TextDesign): boolean {
  return d.styles.length > 1 || !!d.alts?.length || d.layout !== "lines" || d.places.length > 1 || d.places.some((p) => Math.abs(p.x - 0.5) > 0.12 || p.behind) || d.behind.share > 0 || d.styles[0].blend !== "normal";
}

/** A plain look from a design's base style and first place (what's drawn if the design is turned off). */
function lookFromDesign(d: TextDesign): CaptionLook {
  const s = d.styles[0];
  const p = d.places[0];
  const color = s.fill.kind === "solid" ? s.fill.color : s.fill.colors[0] ?? "#ffffff";
  return {
    y: p.y,
    width: p.width,
    maxSize: s.size,
    minSize: s.size,
    fit: false,
    pitch: 1.15,
    lines: Math.max(1, Math.min(3, d.lines)) as 1 | 2 | 3,
    chars: 16,
    align: p.align === "left" ? "left" : "center",
    reveal: d.enter.unit === "word" ? "word" : "page",
    fade: 0.1,
    case: s.case === "title" ? "as-said" : s.case === "names" ? "lower" : s.case,
    font: "sans",
    weight: s.weight,
    tracking: -0.02,
    color,
    active: null,
    stroke: s.stroke,
    shadow: s.shadow && { color: s.shadow.color, blur: s.shadow.blur, y: s.shadow.y },
    box: s.box,
    hold: 0.2,
  };
}

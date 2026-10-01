/**
 * The captions as they'll look, drawn live: a frame of the footage (framed as the edit
 * frames it) with one of the captions on it in the look as it's set now. It redraws as the
 * look changes, steps through the captions, and plays one coming on word by word. With a
 * text design, a caption set behind the speaker is drawn behind them (the person cut out
 * of the frame, as the export does), and dragging the caption moves its place.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { loadFonts } from "../../engine/render/fonts";
import { loadFontsFor } from "../../engine/text/library";
import { PersonMasker } from "../../engine/vision/person";
import { drawPage, layoutPage } from "../captions";
import { designPages, drawDesign, layoutDesign } from "../design";
import type { CaptionLook, CaptionPage, MimicPlan } from "../types";
import { mimic } from "./store";

const SAMPLE: CaptionPage = {
  start: 0,
  end: 2.4,
  lines: [
    [
      { text: "Your", start: 0, end: 0.3 },
      { text: "captions", start: 0.3, end: 0.7 },
      { text: "look", start: 0.7, end: 1 },
    ],
    [
      { text: "like", start: 1, end: 1.3 },
      { text: "this", start: 1.3, end: 1.8 },
    ],
  ],
};

/** The source time a moment of the edit shows. */
const sourceAt = (plan: MimicPlan, t: number) => {
  const seg = plan.segments.find((s) => t >= s.start && t < s.end) ?? plan.segments[0];
  return seg ? seg.from + (t - seg.start) : t;
};

export function CaptionPreview({ look, plan }: { look: CaptionLook; plan: MimicPlan | null }) {
  const design = look.design;
  // (A sample in the design's own way when there's no plan yet.)
  const pages = plan?.captions?.pages ?? (design ? designPages(SAMPLE.lines.flat(), design) : []);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fonts, setFonts] = useState(false);
  const [frame, setFrame] = useState<{ at: number; bmp: ImageBitmap } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const page = pages[Math.min(i, pages.length - 1)] ?? SAMPLE;
  const W = plan?.width ?? 1080;
  const H = plan?.height ?? 1920;

  const fontKey = design ? design.styles.map((x) => x.font).join(",") : "";
  useEffect(() => {
    let live = true;
    setFonts(false);
    void Promise.all([loadFonts(), loadFontsFor(fontKey ? fontKey.split(",") : [])]).then(() => live && setFonts(true));
    return () => {
      live = false;
    };
  }, [fontKey]);
  // The person cut out, for a caption set behind them (loaded the first time one is).
  const [masker, setMasker] = useState<PersonMasker | null>(null);
  const wantsMask = !!design && pages.some((p) => p.behind);
  useEffect(() => {
    if (!wantsMask || masker) return;
    let live = true;
    void PersonMasker.get()
      .then((m) => live && setMasker(m))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [wantsMask, masker]);

  // A frame of the footage where this caption is said.
  const at = plan && pages.length ? sourceAt(plan, (page.start + page.end) / 2) : -1;
  useEffect(() => {
    if (at < 0) return;
    let live = true;
    void mimic.frameAt(at).then((bmp) => {
      if (!live || !bmp) return bmp?.close();
      setFrame((old) => {
        old?.bmp.close();
        return { at, bmp };
      });
    });
    return () => {
      live = false;
    };
  }, [at]);

  const laid = useMemo(() => {
    if (!fonts) return null;
    const ctx = new OffscreenCanvas(8, 8).getContext("2d")!;
    return design ? { design: layoutDesign(ctx, design, page, W, H) } : { plain: layoutPage(ctx, look, page, W, H) };
  }, [fonts, look, design, page, W, H]);

  // Draw (and while playing, keep drawing the caption coming on).
  useEffect(() => {
    const c = canvas.current;
    if (!c || !laid) return;
    const ctx = c.getContext("2d")!;
    const draw = (t: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, W, H);
      const bmp = frame && Math.abs(frame.at - at) < 0.5 ? frame.bmp : null;
      if (bmp) {
        // Cover the frame about the edit's framing of this moment.
        const fr = plan?.frames?.find((f) => (page.start + page.end) / 2 >= f.start && (page.start + page.end) / 2 < f.end) ?? plan?.frame ?? { cx: 0.5, cy: 0.5, zoom: 1 };
        const k = Math.max(W / bmp.width, H / bmp.height) * fr.zoom;
        const vw = W / k;
        const vh = H / k;
        const sx = Math.min(bmp.width - vw, Math.max(0, fr.cx * bmp.width - vw / 2));
        const sy = Math.min(bmp.height - vh, Math.max(0, fr.cy * bmp.height - vh / 2));
        ctx.drawImage(bmp, sx, sy, vw, vh, 0, 0, W, H);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "#3a3f4b");
        g.addColorStop(1, "#1b1d22");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      const octx = ctx as unknown as OffscreenCanvasRenderingContext2D;
      if (laid.design && design) {
        const cv = c;
        if (page.behind && masker && bmp) {
          // The speaker cut out of the frame and laid back over the caption.
          const m = masker.mask((c, w, h) => c.drawImage(cv, 0, 0, w, h), W, H, -1);
          const person = new OffscreenCanvas(W, H);
          const pc = person.getContext("2d")!;
          pc.drawImage(cv, 0, 0);
          pc.globalCompositeOperation = "destination-in";
          pc.drawImage(m, 0, 0, W, H);
          drawDesign(octx, design, laid.design, page, t);
          ctx.drawImage(person, 0, 0);
        } else drawDesign(octx, design, laid.design, page, t);
      } else if (laid.plain) drawPage(octx, look, laid.plain, page, t);
    };
    if (!playing) {
      draw(page.end - 0.001);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const span = page.end - page.start + 0.6;
    const tick = () => {
      const u = ((performance.now() - t0) / 1000) % span;
      draw(page.start + u - 0.2);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [laid, look, design, masker, page, playing, frame, at, plan, W, H]);

  // Dragging the caption moves its place (a design's), as in CapCut.
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const placeIdx = page.place ?? 0;
  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = design?.places[placeIdx];
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: p.x, py: p.y };
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const g = drag.current;
    if (!g) return;
    const r = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
    mimic.patchPlace(placeIdx, { x: clamp(g.px + (e.clientX - g.x) / r.width), y: clamp(g.py + (e.clientY - g.y) / r.height) });
  };
  const onUp = () => (drag.current = null);

  return (
    <div className="cap-preview">
      <canvas
        ref={canvas}
        width={W}
        height={H}
        style={{ aspectRatio: `${W} / ${H}`, cursor: design ? "grab" : undefined, touchAction: design ? "none" : undefined }}
        aria-label={design ? "How the captions look: drag a caption to move its place" : "How the captions look"}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      {design && <span className="hint">Place {placeIdx + 1}{page.behind ? ", behind you" : ""}. Drag the caption to move it.</span>}
      <div className="row between">
        <button type="button" className="btn icon" aria-label="The caption before" disabled={i <= 0} onClick={() => setI((v) => Math.max(0, v - 1))}>
          <ChevronLeft size={14} />
        </button>
        <span className="hint num">{pages.length ? `${Math.min(i, pages.length - 1) + 1} of ${pages.length}` : "a sample"}</span>
        <button type="button" className="btn icon" aria-label={playing ? "Stop" : "Play it coming on"} onClick={() => setPlaying((v) => !v)}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button type="button" className="btn icon" aria-label="The next caption" disabled={i >= pages.length - 1} onClick={() => setI((v) => Math.min(pages.length - 1, v + 1))}>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

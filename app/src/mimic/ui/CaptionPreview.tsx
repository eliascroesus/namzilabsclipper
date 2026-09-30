/**
 * The captions as they'll look, drawn live: a frame of the footage (framed as the edit
 * frames it) with one of the captions on it in the look as it's set now. It redraws as the
 * look changes, steps through the captions, and plays one coming on word by word.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { loadFonts } from "../../engine/render/fonts";
import { drawPage, layoutPage } from "../captions";
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
  const pages = plan?.captions?.pages ?? [];
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fonts, setFonts] = useState(false);
  const [frame, setFrame] = useState<{ at: number; bmp: ImageBitmap } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const page = pages[Math.min(i, pages.length - 1)] ?? SAMPLE;
  const W = plan?.width ?? 1080;
  const H = plan?.height ?? 1920;

  useEffect(() => {
    void loadFonts().then(() => setFonts(true));
  }, []);

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
    return layoutPage(ctx, look, page, W, H);
  }, [fonts, look, page, W, H]);

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
      drawPage(ctx as unknown as OffscreenCanvasRenderingContext2D, look, laid, page, t);
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
  }, [laid, look, page, playing, frame, at, plan, W, H]);

  return (
    <div className="cap-preview">
      <canvas ref={canvas} width={W} height={H} style={{ aspectRatio: `${W} / ${H}` }} aria-label="How the captions look" />
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

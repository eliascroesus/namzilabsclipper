/**
 * The caption editor (as in CapCut): the caption's face, size, colour, outline, shadow,
 * box, how it mixes with the picture (multiply, screen, difference...), where it sits
 * (dragged about on a live preview over the footage), how it's turned and how it comes
 * on. What it draws is what the export draws (engine/render/captions.ts).
 */
import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CANVAS_BLEND, DEFAULT_LOOK, drawLook, FACES, TEXT_LOOKS } from "../../engine/render/captions";
import { loadFonts } from "../../engine/render/fonts";
import { FRAME_SIZE, type Blend, type Face, type TextLook } from "../../engine/plan/types";
import { studio, type State } from "../studio";
import { Segmented, Switch } from "./bits";

const COLOURS = ["#FFFFFF", "#000000", "#FFE14D", "#FF3B30", "#34C759", "#0A84FF", "#BF5AF2"];

const BLENDS: { value: Blend; label: string; hint: string }[] = [
  { value: "normal", label: "Normal", hint: "Drawn over the picture." },
  { value: "multiply", label: "Multiply", hint: "Darker letters sink into the picture like ink; white disappears." },
  { value: "darken", label: "Darken", hint: "Shows only where the letters are darker than the picture." },
  { value: "screen", label: "Screen", hint: "Lighter letters glow out of the picture; black disappears." },
  { value: "lighten", label: "Lighten", hint: "Shows only where the letters are lighter than the picture." },
  { value: "overlay", label: "Overlay", hint: "Letters take on the picture's contrast." },
  { value: "soft-light", label: "Soft light", hint: "A gentler overlay." },
  { value: "difference", label: "Difference", hint: "Letters invert what's behind them: white on dark, black on light." },
  { value: "exclusion", label: "Exclusion", hint: "A softer difference." },
  { value: "color-dodge", label: "Colour dodge", hint: "Letters burn bright into the picture." },
];

const ANIMATIONS: { value: TextLook["animate"]; label: string }[] = [
  { value: "design", label: "Design's" },
  { value: "words", label: "Word by word" },
  { value: "pop", label: "Pop" },
  { value: "fade", label: "Fade" },
  { value: "type", label: "Type" },
  { value: "none", label: "None" },
];

const PLACES = [
  { label: "Top", y: 0.2 },
  { label: "Middle", y: 0.5 },
  { label: "Lower third", y: 0.68 },
];

/** The text the preview shows: the format's own caption, or a sample. */
function sampleText(s: State): string {
  const st = s.style;
  const text = st.format === "meme" ? st.memeText : st.text;
  return text.trim() || "Your caption here";
}

function Slider({ id, label, value, min, max, step, show, onChange }: { id: string; label: string; value: number; min: number; max: number; step: number; show: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div className="field tight">
      <div className="row between">
        <label htmlFor={id}>{label}</label>
        <span className="num muted">{show(value)}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function Colours({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="swatches">
      {COLOURS.map((c) => (
        <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={`${label} ${c}`} aria-pressed={value.toUpperCase() === c} onClick={() => onChange(c)} />
      ))}
      <span className="swatch custom" title="Any colour">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`Pick a ${label.toLowerCase()}`} />
      </span>
    </div>
  );
}

/** The caption over a frame of the footage, dragged about to place it (it snaps to the middle). */
function Preview({ s }: { s: State }) {
  const look = s.style.captionLook;
  const [w, h] = FRAME_SIZE[s.style.aspect];
  // (Drawn at half size: sharp enough, and quick.)
  const W = Math.round(w / 2);
  const H = Math.round(h / 2);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fonts, setFonts] = useState(false);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [guides, setGuides] = useState<{ x: boolean; y: boolean } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const thumb = s.footage.find((f) => f.status === "ready" && f.thumb)?.thumb;
  const text = sampleText(s);

  useEffect(() => {
    void loadFonts().then(() => setFonts(true));
  }, []);
  useEffect(() => {
    if (!thumb) return setImg(null);
    const im = new Image();
    im.onload = () => setImg(im);
    im.src = thumb;
  }, [thumb]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.globalCompositeOperation = "source-over";
    if (img) {
      const k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const vw = W / k;
      const vh = H / k;
      ctx.drawImage(img, (img.naturalWidth - vw) / 2, (img.naturalHeight - vh) / 2, vw, vh, 0, 0, W, H);
    } else {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#5b6170");
      g.addColorStop(0.55, "#2a2d35");
      g.addColorStop(1, "#c9b38a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (!fonts) return;
    // (The caption drawn on its own layer, then mixed with the picture as a whole, as the export mixes it.)
    const layer = new OffscreenCanvas(W, H);
    drawLook(layer.getContext("2d")!, W, H, text, look);
    ctx.globalCompositeOperation = CANVAS_BLEND[look.blend];
    ctx.drawImage(layer, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    if (guides) {
      ctx.strokeStyle = "rgba(255, 64, 160, 0.9)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      if (guides.x) {
        ctx.moveTo(W / 2, 0);
        ctx.lineTo(W / 2, H);
      }
      if (guides.y) {
        ctx.moveTo(0, H / 2);
        ctx.lineTo(W, H / 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [fonts, img, look, text, W, H, guides]);

  const at = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const p = at(e);
    let x = Math.min(0.95, Math.max(0.05, p.x - drag.current.dx));
    let y = Math.min(0.95, Math.max(0.05, p.y - drag.current.dy));
    const sx = Math.abs(x - 0.5) < 0.025;
    const sy = Math.abs(y - 0.5) < 0.02;
    if (sx) x = 0.5;
    if (sy) y = 0.5;
    setGuides({ x: sx, y: sy });
    studio.setCaptionLook({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
  };
  const end = () => {
    drag.current = null;
    setGuides(null);
  };

  // (Reels and TikTok cover the bottom fifth with the caption and buttons, and a strip down the right.)
  const tall = h > w * 1.5;
  return (
    <div className="cap-editor-preview">
      <div className="cap-stage" style={{ aspectRatio: `${W} / ${H}` }}>
        <canvas
          ref={canvas}
          width={W}
          height={H}
          aria-label="The caption as it will look: drag it to place it"
          onPointerDown={(e) => {
            const p = at(e);
            drag.current = { dx: p.x - look.x, dy: p.y - look.y };
            e.currentTarget.setPointerCapture(e.pointerId);
            setGuides({ x: false, y: false });
          }}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
        {tall && <div className="cap-safe" aria-hidden="true" />}
      </div>
      <span className="hint">Drag the caption to place it.{tall ? " The shaded strip is where the app's own buttons and caption sit." : ""}</span>
    </div>
  );
}

export function CaptionEditor({ s }: { s: State }) {
  const st = s.style;
  const look = st.captionLook;
  const set = (p: Partial<TextLook>) => studio.setCaptionLook(p);
  const face = FACES[look.font];
  const blend = BLENDS.find((b) => b.value === look.blend) ?? BLENDS[0];
  return (
    <div className="field">
      <Switch checked={st.ownCaption} onChange={(v) => studio.setStyle({ ownCaption: v })} hint={st.ownCaption ? "Your own font, size, colour, outline, blend and place, over the style's look." : "Off: each design sets the caption in its own look."}>
        Design the caption
      </Switch>
      {st.ownCaption && (
        <div className="cap-editor">
          <Preview s={s} />
          <div className="cap-controls">
            <div className="field tight">
              <div className="row between">
                <span className="label">Start from</span>
                <button type="button" className="btn ghost small" onClick={() => studio.setStyle({ captionLook: { ...DEFAULT_LOOK } })} title="Back to the classic look">
                  <RotateCcw size={13} /> Reset
                </button>
              </div>
              <div className="chips">
                {TEXT_LOOKS.map((p) => (
                  <button key={p.id} type="button" className="chip" style={{ fontFamily: FACES[p.look.font].family, fontWeight: FACES[p.look.font].weight ?? p.look.weight, fontStyle: FACES[p.look.font].italic ? "italic" : undefined }} onClick={() => studio.setStyle({ captionLook: { ...p.look, x: look.x, y: p.look.y } })}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="field tight">
              <span className="label">Font</span>
              <div className="chips">
                {(Object.keys(FACES) as Face[]).map((f) => (
                  <button key={f} type="button" className="chip" aria-pressed={look.font === f} style={{ fontFamily: FACES[f].family, fontWeight: FACES[f].weight ?? look.weight, fontStyle: FACES[f].italic ? "italic" : undefined }} onClick={() => set({ font: f })}>
                    {FACES[f].name}
                  </button>
                ))}
              </div>
            </div>
            <Slider id="cap-size" label="Size" value={look.size} min={0.03} max={0.3} step={0.005} show={(v) => `${Math.round(v * 100)}`} onChange={(v) => set({ size: v })} />
            {face.weight === undefined && <Slider id="cap-weight" label="Weight" value={look.weight} min={300} max={900} step={100} show={(v) => String(v)} onChange={(v) => set({ weight: v })} />}
            <div className="field tight">
              <span className="label">Colour</span>
              <Colours label="Text colour" value={look.color} onChange={(v) => set({ color: v })} />
            </div>
            <Slider id="cap-stroke" label="Outline" value={look.stroke} min={0} max={0.2} step={0.01} show={(v) => (v ? `${Math.round(v * 100)}` : "none")} onChange={(v) => set({ stroke: v })} />
            {look.stroke > 0 && <Colours label="Outline colour" value={look.strokeColor} onChange={(v) => set({ strokeColor: v })} />}
            <Slider id="cap-shadow" label="Shadow / glow" value={look.shadow} min={0} max={1} step={0.05} show={(v) => (v ? `${Math.round(v * 100)}%` : "none")} onChange={(v) => set({ shadow: v })} />
            {look.shadow > 0 && <Colours label="Shadow colour" value={look.shadowColor} onChange={(v) => set({ shadowColor: v })} />}
            <div className="field tight">
              <Switch checked={look.box} onChange={(v) => set({ box: v })}>
                Box behind the words
              </Switch>
              {look.box && (
                <>
                  <Colours label="Box colour" value={look.boxColor} onChange={(v) => set({ boxColor: v })} />
                  <Slider id="cap-box" label="Box opacity" value={look.boxOpacity} min={0.1} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ boxOpacity: v })} />
                </>
              )}
            </div>
            <div className="field tight">
              <label htmlFor="cap-blend">Blend</label>
              <select id="cap-blend" className="select" value={look.blend} onChange={(e) => set({ blend: e.target.value as Blend })}>
                {BLENDS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
              <span className="hint">{blend.hint}</span>
            </div>
            <div className="field tight">
              <span className="label">Align</span>
              <Segmented label="Align" value={look.align} options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }]} onChange={(v) => set({ align: v })} />
            </div>
            <div className="field tight">
              <span className="label">Letters</span>
              <Segmented label="Letter case" value={look.case} options={[{ value: "typed", label: "Typed" }, { value: "upper", label: "CAPS" }, { value: "lower", label: "lower" }]} onChange={(v) => set({ case: v })} />
            </div>
            <div className="field tight">
              <span className="label">Place</span>
              <div className="chips">
                {PLACES.map((p) => (
                  <button key={p.label} type="button" className="chip small" aria-pressed={look.x === 0.5 && look.y === p.y} onClick={() => set({ x: 0.5, y: p.y })}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <Slider id="cap-spacing" label="Letter spacing" value={look.spacing} min={-0.05} max={0.4} step={0.01} show={(v) => v.toFixed(2)} onChange={(v) => set({ spacing: v })} />
            <Slider id="cap-width" label="Line width" value={look.width} min={0.3} max={1} step={0.02} show={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ width: v })} />
            <Slider id="cap-rotate" label="Turn" value={look.rotate} min={-30} max={30} step={1} show={(v) => `${v}°`} onChange={(v) => set({ rotate: v })} />
            <Slider id="cap-opacity" label="Opacity" value={look.opacity} min={0.1} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ opacity: v })} />
            <div className="field tight">
              <span className="label">How it comes on</span>
              <div className="chips" role="group" aria-label="How it comes on">
                {ANIMATIONS.map((a) => (
                  <button key={a.value} type="button" className="chip small" aria-pressed={look.animate === a.value} onClick={() => set({ animate: a.value })}>
                    {a.label}
                  </button>
                ))}
              </div>
              <span className="hint">
                {look.animate === "design"
                  ? "As the edit's design brings its caption on: a word on each beat for the hard ones, a fade for cinematic, typed for VHS."
                  : look.animate === "words"
                    ? "A word on each beat before the drop, then the whole line (up to eight words)."
                    : look.animate === "pop"
                      ? "Pops in: small, a little too big, then settles."
                      : look.animate === "fade"
                        ? "Fades in over a quarter of a second."
                        : look.animate === "type"
                          ? "Typed out letter by letter."
                          : "There from the first frame."}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

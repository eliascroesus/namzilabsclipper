/**
 * The richer captions, set by hand as in CapCut: a design from the reference (or a
 * ready-made one), its text styles one tab each (font, weight, slant, width, size,
 * letters, spacing, a colour or a gradient, an outline, a shadow, a glow, a box, opacity
 * and how it mixes with the picture), which words take each style, how captions are laid
 * out and where they sit (some behind the speaker), and how the words come on and go off.
 */
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { MOTIONS, type MotionKind, type TextMotion } from "../../engine/text/motion";
import { FONT_KINDS, FONTS, fontById } from "../../engine/text/library";
import { BLENDS, fillColor, fillCss, type Blend, type Fill, type TextCase, type TextStyle } from "../../engine/text/style";
import { PRESET_GROUPS, PRESETS } from "../presets";
import type { CaptionPlace, DesignAlt, StylePick, TextDesign } from "../types";
import { mimic, type State } from "./store";

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Range({ label, value, min, max, step, show, onChange, title }: { label: string; value: number; min: number; max: number; step: number; show: string; onChange: (v: number) => void; title?: string }) {
  return (
    <label title={title}>
      {label} <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /> <span className="num">{show}</span>
    </label>
  );
}

function FillEditor({ fill, onChange }: { fill: Fill; onChange: (f: Fill) => void }) {
  const colors = fill.kind === "solid" ? [fill.color] : fill.colors;
  const setColor = (i: number, c: string) => {
    if (fill.kind === "solid") return onChange({ kind: "solid", color: c });
    const next = [...fill.colors];
    next[i] = c;
    onChange({ ...fill, colors: next });
  };
  return (
    <div className="fill-editor">
      <div className="seg" role="group" aria-label="Fill">
        {(["solid", "linear"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={fill.kind === k}
            onClick={() => onChange(k === "solid" ? { kind: "solid", color: fillColor(fill) } : { kind: "linear", colors: [fillColor(fill), fill.kind === "linear" ? fill.colors[1] : "#5b6cff"], angle: fill.kind === "linear" ? fill.angle : 0 })}
          >
            {k === "solid" ? "Colour" : "Gradient"}
          </button>
        ))}
      </div>
      <span className="swatch" style={{ background: fillCss(fill) }} />
      {colors.map((c, i) => (
        <input key={i} type="color" value={c.slice(0, 7)} aria-label={`Colour ${i + 1}`} onChange={(e) => setColor(i, e.target.value)} />
      ))}
      {fill.kind === "linear" && (
        <>
          {fill.colors.length < 4 && (
            <button type="button" className="btn small" onClick={() => onChange({ ...fill, colors: [...fill.colors, fill.colors[fill.colors.length - 1]] })}>
              + colour
            </button>
          )}
          {fill.colors.length > 2 && (
            <button type="button" className="btn small" onClick={() => onChange({ ...fill, colors: fill.colors.slice(0, -1) })}>
              − colour
            </button>
          )}
          <label className="angle">
            Angle <input type="range" min={0} max={359} step={1} value={fill.angle} onChange={(e) => onChange({ ...fill, angle: Number(e.target.value) })} /> <span className="num">{fill.angle}°</span>
          </label>
        </>
      )}
    </div>
  );
}

function StylePanel({ st, d }: { st: TextStyle; d: TextDesign }) {
  const set = (p: Partial<TextStyle>) => mimic.patchStyle(st.id, p);
  const f = fontById(st.font);
  const isBase = d.styles[0]?.id === st.id;
  const pick = d.picks.find((p) => p.style === st.id);
  return (
    <div className="style-panel">
      <div className="look">
        <label className="wide">
          Font
          <select className="select" value={st.font} onChange={(e) => set({ font: e.target.value })} style={{ fontFamily: `"NZ ${f.name}", system-ui` }}>
            {FONT_KINDS.map((k) => (
              <optgroup key={k.kind} label={k.name}>
                {FONTS.filter((x) => x.kind === k.kind).map((x) => (
                  <option key={x.id} value={x.id} title={x.like}>
                    {x.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <Range label="Size" value={st.size} min={0.015} max={0.25} step={0.001} show={pct(st.size)} onChange={(v) => set({ size: v })} title="The font size, a share of the frame's height" />
        <Range label="Weight" value={st.weight} min={f.weights[0]} max={f.weights[1]} step={100} show={String(Math.min(f.weights[1], Math.max(f.weights[0], st.weight)))} onChange={(v) => set({ weight: v })} />
        {f.stretch && <Range label="Width" value={st.stretch ?? 100} min={f.stretch[0]} max={f.stretch[1]} step={1} show={`${st.stretch ?? 100}%`} onChange={(v) => set({ stretch: v })} title="Condensed to extended" />}
        {f.italic && (
          <label className="check">
            <input type="checkbox" checked={st.italic} onChange={(e) => set({ italic: e.target.checked })} /> Italic
          </label>
        )}
        <label>
          Letters
          <select className="select" value={st.case} onChange={(e) => set({ case: e.target.value as TextCase })}>
            <option value="as-said">As said</option>
            <option value="lower">lowercase</option>
            <option value="names">lowercase, keeping Names</option>
            <option value="upper">CAPITALS</option>
            <option value="title">Title Case</option>
          </select>
        </label>
        <Range label="Spacing" value={st.tracking} min={-0.1} max={0.3} step={0.005} show={`${st.tracking > 0 ? "+" : ""}${Math.round(st.tracking * 100)}`} onChange={(v) => set({ tracking: v })} title="Letter spacing" />
        <Range label="Opacity" value={st.opacity} min={0.1} max={1} step={0.01} show={pct(st.opacity)} onChange={(v) => set({ opacity: v })} />
        <label title={BLENDS.find((b) => b.value === st.blend)?.hint}>
          Blend
          <select className="select" value={st.blend} onChange={(e) => set({ blend: e.target.value as Blend })}>
            {BLENDS.map((b) => (
              <option key={b.value} value={b.value} title={b.hint}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <FillEditor fill={st.fill} onChange={(fill) => set({ fill })} />
      {st.fill.kind === "linear" && (
        <label className="check">
          <input type="checkbox" checked={st.fillSpan === "line"} onChange={(e) => set({ fillSpan: e.target.checked ? "line" : "word" })} /> One gradient across the whole line
        </label>
      )}
      <div className="look">
        <label className="check">
          <input type="checkbox" checked={!!st.stroke} onChange={(e) => set({ stroke: e.target.checked ? { color: "#000000", width: 0.06 } : null })} /> Outline
        </label>
        {st.stroke && (
          <>
            <input type="color" aria-label="Outline colour" value={st.stroke.color.slice(0, 7)} onChange={(e) => set({ stroke: { ...st.stroke!, color: e.target.value } })} />
            <Range label="Thickness" value={st.stroke.width} min={0.01} max={0.2} step={0.005} show={pct(st.stroke.width)} onChange={(v) => set({ stroke: { ...st.stroke!, width: v } })} />
          </>
        )}
        <label className="check">
          <input type="checkbox" checked={!!st.glow} onChange={(e) => set({ glow: e.target.checked ? { color: fillColor(st.fill), blur: 0.35, strength: 0.6 } : null })} /> Glow
        </label>
        {st.glow && (
          <>
            <input type="color" aria-label="Glow colour" value={st.glow.color.slice(0, 7)} onChange={(e) => set({ glow: { ...st.glow!, color: e.target.value } })} />
            <Range label="Spread" value={st.glow.blur} min={0.05} max={1.2} step={0.01} show={pct(st.glow.blur)} onChange={(v) => set({ glow: { ...st.glow!, blur: v } })} />
            <Range label="Strength" value={st.glow.strength} min={0.1} max={1} step={0.05} show={pct(st.glow.strength)} onChange={(v) => set({ glow: { ...st.glow!, strength: v } })} />
          </>
        )}
        <label className="check">
          <input type="checkbox" checked={!!st.shadow} onChange={(e) => set({ shadow: e.target.checked ? { color: "rgba(0,0,0,0.45)", blur: 0.25, x: 0, y: 0.04 } : null })} /> Shadow
        </label>
        {st.shadow && <Range label="Shadow blur" value={st.shadow.blur} min={0} max={1} step={0.01} show={pct(st.shadow.blur)} onChange={(v) => set({ shadow: { ...st.shadow!, blur: v } })} />}
        <label className="check">
          <input type="checkbox" checked={!!st.box} onChange={(e) => set({ box: e.target.checked ? { color: "#000000", pad: 0.18, radius: 0.12 } : null })} /> Box behind
        </label>
        {st.box && <input type="color" aria-label="Box colour" value={st.box.color.slice(0, 7)} onChange={(e) => set({ box: { ...st.box!, color: e.target.value } })} />}
        <Range label="Turn" value={st.rotate ?? 0} min={-20} max={20} step={0.5} show={`${st.rotate ?? 0}°`} onChange={(v) => set({ rotate: v || undefined })} title="Tilt each word" />
        <Range label="Lean" value={st.skew ?? 0} min={-20} max={20} step={0.5} show={`${st.skew ?? 0}°`} onChange={(v) => set({ skew: v || undefined })} title="Slant each word, like an italic" />
      </div>
      {!isBase && (
        <div className="look">
          <label>
            Words in it
            <select className="select" value={pick?.rule ?? "keyword"} onChange={(e) => mimic.patchPick(st.id, { rule: e.target.value as StylePick["rule"] })}>
              <option value="keyword">each caption's key word</option>
              <option value="last">each caption's last word</option>
              <option value="first">each caption's first word</option>
              <option value="number">numbers</option>
              <option value="marked">words I mark (*like this*)</option>
              <option value="stopword">the small words (the, in, you)</option>
              <option value="line2">the second line</option>
            </select>
          </label>
          <Range label="In captions" value={pick?.share ?? 0} min={0} max={1} step={0.05} show={pct(pick?.share ?? 0)} onChange={(v) => mimic.patchPick(st.id, { share: v })} title="The share of captions with a word in this style" />
          <button type="button" className="btn small" onClick={() => mimic.removeStyle(st.id)}>
            <Trash2 size={13} /> Remove this style
          </button>
        </div>
      )}
    </div>
  );
}

function MotionEditor({ label, m, onChange, allowNone }: { label: string; m: TextMotion | null | undefined; onChange: (m: TextMotion | null) => void; allowNone?: boolean }) {
  const kind = m?.kind ?? "none";
  return (
    <div className="look">
      <label>
        {label}
        <select
          className="select"
          value={m ? kind : "off"}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "off") return onChange(null);
            onChange({ unit: "word", dur: 0.22, ...(m ?? {}), kind: v as MotionKind });
          }}
        >
          {allowNone && <option value="off">as the base comes on</option>}
          {MOTIONS.map((x) => (
            <option key={x.value} value={x.value} title={x.hint}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      {m && m.kind !== "none" && (
        <>
          <Range label="Time" value={m.dur} min={0.04} max={1} step={0.01} show={`${Math.round(m.dur * 1000)} ms`} onChange={(v) => onChange({ ...m, dur: v })} />
          <label>
            Each
            <select className="select" value={m.unit} onChange={(e) => onChange({ ...m, unit: e.target.value as TextMotion["unit"] })}>
              <option value="word">word, as it's said</option>
              <option value="line">line at once</option>
              <option value="page">caption at once</option>
            </select>
          </label>
          {m.unit !== "word" && <Range label="Stagger" value={m.stagger ?? 0} min={0} max={0.3} step={0.01} show={`${Math.round((m.stagger ?? 0) * 1000)} ms`} onChange={(v) => onChange({ ...m, stagger: v })} />}
          {(m.kind === "pop" || m.kind === "bounce") && <Range label="Overshoot" value={m.overshoot ?? 0.12} min={0} max={0.4} step={0.01} show={pct(m.overshoot ?? 0.12)} onChange={(v) => onChange({ ...m, overshoot: v })} />}
          {(m.kind === "rise" || m.kind === "drop" || m.kind === "slide-left" || m.kind === "slide-right") && (
            <Range label="Distance" value={m.dist ?? (m.kind === "rise" || m.kind === "drop" ? 0.4 : 0.8)} min={0.05} max={2} step={0.05} show={`${(m.dist ?? (m.kind === "rise" || m.kind === "drop" ? 0.4 : 0.8)).toFixed(2)} of its size`} onChange={(v) => onChange({ ...m, dist: v })} />
          )}
          {m.kind !== "type" && m.kind !== "pop" && m.kind !== "bounce" && m.kind !== "stretch" && (
            <label>
              Curve
              <select className="select" value={m.ease ?? "out"} onChange={(e) => onChange({ ...m, ease: e.target.value as TextMotion["ease"] })}>
                <option value="out">Smooth</option>
                <option value="quint">Sharp (most of the way at once)</option>
                <option value="in-out">Gentle both ends</option>
                <option value="linear">Even</option>
                <option value="back">Past and back</option>
              </select>
            </label>
          )}
          {m.kind !== "fade" && m.kind !== "type" && m.kind !== "wipe" && (
            <Range label="Fades in over" value={m.fade ?? 0} min={0} max={1} step={0.01} show={m.fade ? `${Math.round(m.fade * 1000)} ms` : "the move"} onChange={(v) => onChange({ ...m, fade: v || undefined })} />
          )}
          {m.kind !== "blur" && <Range label="Out of focus" value={m.blur ?? 0} min={0} max={0.3} step={0.01} show={m.blur ? pct(m.blur) : "no"} onChange={(v) => onChange({ ...m, blur: v || undefined })} />}
          {m.unit === "word" && <Range label="Starts early" value={m.lead ?? 0} min={0} max={0.5} step={0.01} show={`${Math.round((m.lead ?? 0) * 1000)} ms`} onChange={(v) => onChange({ ...m, lead: v || undefined })} />}
          {m.kind === "type" && (
            <>
              <Range label="Letters a second" value={m.rate ?? 0} min={0} max={40} step={1} show={m.rate ? String(m.rate) : "each word over its time"} onChange={(v) => onChange({ ...m, rate: v || undefined })} />
              <label className="check">
                <input type="checkbox" checked={!!m.caret} onChange={(e) => onChange({ ...m, caret: e.target.checked || undefined })} /> Caret
              </label>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** The reference's own design (when one was read off it), and the ready-made ones by group. */
function PresetPicker({ s }: { s: State }) {
  const own = s.template?.captions?.design;
  return (
    <div className="chips">
      {own && (
        <button type="button" className="chip on" title="As read off the reference" onClick={() => mimic.setDesign(own)}>
          As the reference
        </button>
      )}
      <select
        className="select"
        aria-label="Ready-made looks"
        value=""
        onChange={(e) => {
          const p = PRESETS.find((x) => x.id === e.target.value);
          if (p) mimic.setDesign(p.design);
        }}
      >
        <option value="">Start from a look…</option>
        {PRESET_GROUPS.map((g) => (
          <optgroup key={g.id} label={g.name}>
            {PRESETS.filter((p) => p.group === g.id).map((p) => (
              <option key={p.id} value={p.id} title={p.from}>
                {p.name}: {p.from}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/** The word being said (karaoke) and the words not said yet. */
function SpokenEditor({ d }: { d: TextDesign }) {
  const sp = d.spoken;
  const set = (p: Partial<NonNullable<TextDesign["spoken"]>> | null) => mimic.patchDesign({ spoken: p === null ? undefined : { ...(sp ?? {}), ...p } });
  return (
    <div className="look">
      <label className="check">
        <input type="checkbox" checked={!!sp} onChange={(e) => set(e.target.checked ? { fill: { kind: "solid", color: "#ffe14d" } } : null)} /> Its own look
      </label>
      {sp && (
        <>
          <FillEditor fill={sp.fill ?? d.styles[0].fill} onChange={(fill) => set({ fill })} />
          <Range label="Grows to" value={sp.scale ?? 1} min={1} max={1.4} step={0.01} show={pct(sp.scale ?? 1)} onChange={(v) => set({ scale: v === 1 ? undefined : v })} />
          <Range label="Weight" value={sp.weight ?? d.styles[0].weight} min={100} max={900} step={100} show={String(sp.weight ?? d.styles[0].weight)} onChange={(v) => set({ weight: v })} />
          <label className="check">
            <input type="checkbox" checked={!!sp.box} onChange={(e) => set({ box: e.target.checked ? { color: "#7c3aed", pad: 0.18, radius: 0.25 } : undefined })} /> Box behind it
          </label>
          {sp.box && <input type="color" aria-label="Its box's colour" value={sp.box.color.slice(0, 7)} onChange={(e) => set({ box: { ...sp.box!, color: e.target.value } })} />}
          <label className="check" title="The colour sweeps across the word as it's said">
            <input type="checkbox" checked={!!sp.sweep} onChange={(e) => set({ sweep: e.target.checked || undefined })} /> Sweep across
          </label>
          <label className="check" title="Said words keep the look">
            <input type="checkbox" checked={!!sp.hold} onChange={(e) => set({ hold: e.target.checked || undefined })} /> Keep it once said
          </label>
          <Range label="Words to come" value={d.upcoming?.opacity ?? 1} min={0.1} max={1} step={0.05} show={pct(d.upcoming?.opacity ?? 1)} onChange={(v) => mimic.patchDesign({ upcoming: v >= 1 ? undefined : { ...(d.upcoming ?? {}), opacity: v } })} title="How strong the words not said yet are, when a caption comes on whole" />
        </>
      )}
    </div>
  );
}

/** One of the design's other looks: which captions take it, and how they're set. */
function AltEditor({ i, a, d }: { i: number; a: DesignAlt; d: TextDesign }) {
  const set = (p: Partial<DesignAlt>) => mimic.patchAlt(i, p);
  const pl = a.places?.[0] ?? d.places[0];
  const setPlace = (p: Partial<CaptionPlace>) => set({ places: [{ ...pl, ...p }, ...(a.places ?? []).slice(1)] });
  return (
    <div className="look alt">
      <label>
        Look {i + 1} takes
        <select className="select" value={a.rule} onChange={(e) => set({ rule: e.target.value as DesignAlt["rule"] })}>
          <option value="keyword">the captions with the strongest word</option>
          <option value="marked">captions with a *marked* word</option>
          <option value="number">captions with a number</option>
          <option value="turn">every so many captions</option>
        </select>
      </label>
      <Range label="Share" value={a.share} min={0} max={1} step={0.05} show={pct(a.share)} onChange={(v) => set({ share: v })} />
      <label>
        Words in
        <select className="select" value={a.style ?? ""} onChange={(e) => set({ style: e.target.value || undefined })}>
          <option value="">the styles as picked</option>
          {d.styles.map((x, k) => (
            <option key={x.id} value={x.id}>
              {x.name ?? (k ? `Style ${k + 1}` : "Base")}
            </option>
          ))}
        </select>
      </label>
      <label>
        Set
        <select className="select" value={a.layout ?? d.layout} onChange={(e) => set({ layout: e.target.value as TextDesign["layout"] })}>
          <option value="stack">stacked</option>
          <option value="lines">all one size</option>
          <option value="spread">spread across</option>
        </select>
      </label>
      <Range label="Words a line" value={a.words ?? d.words} min={1} max={6} step={1} show={String(a.words ?? d.words)} onChange={(v) => set({ words: v })} />
      <Range label="Lines" value={a.lines ?? d.lines} min={1} max={4} step={1} show={String(a.lines ?? d.lines)} onChange={(v) => set({ lines: v })} />
      {pl && (
        <>
          <Range label="Across" value={pl.x} min={0} max={1} step={0.005} show={pct(pl.x)} onChange={(v) => setPlace({ x: v })} />
          <Range label="Down" value={pl.y} min={0} max={1} step={0.005} show={pct(pl.y)} onChange={(v) => setPlace({ y: v })} />
          <Range label="Widest" value={pl.width} min={0.15} max={1} step={0.01} show={pct(pl.width)} onChange={(v) => setPlace({ width: v })} />
        </>
      )}
      <label className="check" title="These captions go behind the person talking">
        <input type="checkbox" checked={!!a.behind} onChange={(e) => set({ behind: e.target.checked })} /> Behind me
      </label>
      <button type="button" className="btn small" onClick={() => mimic.removeAlt(i)}>
        <Trash2 size={13} /> Remove
      </button>
    </div>
  );
}

export function DesignEditor({ s }: { s: State }) {
  const d = s.look.design;
  const [tab, setTab] = useState(0);
  const [place, setPlace] = useState(0);
  if (!d) {
    return (
      <div className="design-off">
        <span className="hint">Several text styles, words picked out, stacked beside you, some behind you:</span>
        <PresetPicker s={s} />
      </div>
    );
  }
  const st = d.styles[Math.min(tab, d.styles.length - 1)];
  const pl = d.places[Math.min(place, d.places.length - 1)];
  const set = (p: Partial<TextDesign>) => mimic.patchDesign(p);
  return (
    <div className="design">
      <div className="row between wrap">
        <PresetPicker s={s} />
        <button type="button" className="btn small" onClick={() => mimic.setDesign(null)}>
          Back to one style
        </button>
      </div>

      <div className="tabs" role="tablist" aria-label="Text styles">
        {d.styles.map((x, i) => (
          <button key={x.id} type="button" role="tab" aria-selected={i === tab} className={i === tab ? "on" : ""} onClick={() => setTab(i)}>
            <span className="tab-font" style={{ fontFamily: `"NZ ${fontById(x.font).name}", system-ui`, fontWeight: x.weight, fontStyle: x.italic ? "italic" : "normal", background: x.fill.kind === "solid" ? undefined : fillCss(x.fill), WebkitBackgroundClip: x.fill.kind === "solid" ? undefined : "text", color: x.fill.kind === "solid" ? x.fill.color : "transparent" }}>
              Aa
            </span>{" "}
            {x.name ?? (i ? `Style ${i + 1}` : "Base")}
          </button>
        ))}
        <button type="button" className="btn small" onClick={() => mimic.addStyle()} title="Another style for picked words">
          <Plus size={13} /> Style
        </button>
      </div>
      {st && <StylePanel st={st} d={d} />}

      <span className="caps">Layout</span>
      <div className="look">
        <label>
          Lines
          <select className="select" value={d.layout} onChange={(e) => set({ layout: e.target.value as TextDesign["layout"] })}>
            <option value="stack">stacked, each word its style's size</option>
            <option value="lines">all one size</option>
            <option value="spread">spread across the place's width</option>
          </select>
        </label>
        <Range label="Words a line" value={d.words} min={1} max={6} step={1} show={String(d.words)} onChange={(v) => set({ words: v })} />
        <Range label="Lines a caption" value={d.lines} min={1} max={4} step={1} show={String(d.lines)} onChange={(v) => set({ lines: v })} />
        <Range label="Line spacing" value={d.leading} min={0.7} max={1.6} step={0.01} show={pct(d.leading)} onChange={(v) => set({ leading: v })} />
        <label className="check" title="Each line sized to fill the place's width">
          <input type="checkbox" checked={!!d.fit} onChange={(e) => set({ fit: e.target.checked || undefined })} /> Lines fill the width
        </label>
      </div>

      <span className="caps">The word being said</span>
      <SpokenEditor d={d} />

      <span className="caps">Where captions sit</span>
      <div className="tabs" role="tablist" aria-label="Places">
        {d.places.map((p, i) => (
          <button key={i} type="button" role="tab" aria-selected={i === place} className={i === place ? "on" : ""} onClick={() => setPlace(i)}>
            Place {i + 1}
            {p.behind ? " (behind)" : ""}
          </button>
        ))}
        <button type="button" className="btn small" onClick={() => mimic.addPlace()}>
          <Plus size={13} /> Place
        </button>
      </div>
      {pl && (
        <div className="look">
          <Range label="Across" value={pl.x} min={0} max={1} step={0.005} show={pct(pl.x)} onChange={(v) => mimic.patchPlace(place, { x: v })} />
          <Range label="Down" value={pl.y} min={0} max={1} step={0.005} show={pct(pl.y)} onChange={(v) => mimic.patchPlace(place, { y: v })} />
          <Range label="Widest" value={pl.width} min={0.15} max={1} step={0.01} show={pct(pl.width)} onChange={(v) => mimic.patchPlace(place, { width: v })} />
          <label>
            Lines line up
            <select className="select" value={pl.align} onChange={(e) => mimic.patchPlace(place, { align: e.target.value as typeof pl.align })}>
              <option value="left">on the left</option>
              <option value="center">in the middle</option>
              <option value="right">on the right</option>
            </select>
          </label>
          <label className="check" title="Captions here go behind the person talking (cut out of the frame and laid back over the words)">
            <input type="checkbox" checked={!!pl.behind} onChange={(e) => mimic.patchPlace(place, { behind: e.target.checked })} /> Behind me
          </label>
          {d.places.length > 1 && (
            <button type="button" className="btn small" onClick={() => mimic.removePlace(place)}>
              <Trash2 size={13} /> Remove
            </button>
          )}
        </div>
      )}
      <div className="look">
        <Range label="Also behind me" value={d.behind.share} min={0} max={1} step={0.05} show={pct(d.behind.share)} onChange={(v) => set({ behind: { ...d.behind, share: v } })} title="The share of captions set behind you, wherever they sit" />
      </div>

      <span className="caps">Other looks</span>
      <span className="hint">A share of the captions set another way: a big word alone in the middle, words spread round you.</span>
      {(d.alts ?? []).map((a, i) => (
        <AltEditor key={i} i={i} a={a} d={d} />
      ))}
      <div className="row">
        <button type="button" className="btn small" onClick={() => mimic.addAlt()}>
          <Plus size={13} /> Look
        </button>
      </div>

      <span className="caps">Coming on and going off</span>
      <MotionEditor label="Words come on" m={d.enter} onChange={(m) => m && set({ enter: m })} />
      {d.styles.length > 1 && <MotionEditor label="Picked words" m={d.accentEnter} allowNone onChange={(m) => set({ accentEnter: m ?? undefined })} />}
      <MotionEditor label="Going off" m={d.exit} allowNone onChange={(m) => set({ exit: m })} />
    </div>
  );
}

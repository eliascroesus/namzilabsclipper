/**
 * The edit on a timeline, in layers, as in CapCut: the footage and its cutaways with a
 * transition at every cut, the cards over it, the captions, the zoom, the sound effects and
 * the music, under a preview of the frame at the playhead. Click anything to change it in
 * the panel beside the preview: a transition's kind, length, way, ease and sound (or the
 * same on every cut like it); a card's moves on and off and how long it stays; a sound's
 * sound and level. Drag a card or cutaway along to move it, its right edge to make it
 * longer or shorter, a sound along to move it. Space plays and stops, the arrow keys step
 * a frame (a second with Shift), Delete takes out a sound or makes a transition a cut,
 * and undo takes back any change made here.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Layers, Pause, Play, Plus, Redo2, RotateCcw, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { fmtTime, Segmented } from "../../ui/components/bits";
import { zoomAt } from "../plan";
import { SOUNDS } from "../sfx";
import { lookName, TRANSITIONS, transitionSpan } from "../transitions";
import type { Edge, MimicPlan, Motion, PlanTransition, TransitionLook } from "../types";
import { mimic, type State } from "./store";

const LABEL = 84;
const ROW = { video: 40, cards: 30, text: 26, zoom: 26, sfx: 26, music: 26 } as const;
type Row = keyof typeof ROW;
const ROWS: { id: Row; name: string }[] = [
  { id: "video", name: "Video" },
  { id: "cards", name: "Cards" },
  { id: "text", name: "Captions" },
  { id: "zoom", name: "Zoom" },
  { id: "sfx", name: "Sounds" },
  { id: "music", name: "Music" },
];

type Pick = { kind: "tr"; key: string } | { kind: "card"; slot: string } | { kind: "broll"; slot: string } | { kind: "cue"; key: string } | { kind: "page"; i: number } | { kind: "zoom"; t: number } | null;

/** Where the zoom steps in or out (the first key of each change), and to what. */
export function zoomSteps(keys: [number, number][]): { t: number; to: number; jump: boolean }[] {
  const out: { t: number; to: number; jump: boolean }[] = [];
  for (let i = 1; i < keys.length; i++) {
    const [t0, z0] = keys[i - 1];
    const [t1, z1] = keys[i];
    if (Math.abs(z1 - z0) > 1e-6) out.push({ t: t0, to: z1, jump: t1 - t0 < 1e-6 });
  }
  return out;
}
type Drag = { kind: "move"; slot: string; px0: number; start: number; dt: number } | { kind: "len"; slot: string; px0: number; len: number; dl: number } | { kind: "cue"; key: string; px0: number; t: number; dt: number } | { kind: "scrub" } | null;

const EASES: { value: TransitionLook["ease"]; label: string }[] = [
  { value: "linear", label: "Even" },
  { value: "out", label: "Fast, then settles" },
  { value: "in", label: "Slow, then fast" },
  { value: "inout", label: "Slow at both ends" },
];
const WAYS = ["left", "right", "up", "down"] as const;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const stamp = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;

export function Editor({ s, plan }: { s: State; plan: MimicPlan }) {
  const preview = useRef<HTMLCanvasElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);
  const [pps, setPps] = useState<number | null>(null);
  const [width, setWidth] = useState(800);
  const [pick, setPick] = useState<Pick>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const dur = Math.max(0.1, plan.duration);
  const fps = plan.fps || 30;
  const scale = pps ?? Math.max(20, (width - LABEL - 16) / dur);
  const toX = (time: number) => time * scale;
  const trs = plan.transitions ?? [];

  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The preview, drawn at the playhead (and while it plays).
  useEffect(() => {
    if (s.playing) return;
    if (preview.current) void mimic.paintAt(t, preview.current);
  }, [t, plan, s.playing]);
  useEffect(() => {
    if (!s.playing) return;
    let raf = 0;
    const tick = () => {
      const now = s.playing!.from + (performance.now() - s.playing!.since) / 1000;
      setT(Math.min(now, dur));
      if (preview.current) void mimic.paintAt(now, preview.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing, dur]);

  const play = () => (s.playing ? mimic.stopListening() : void mimic.listen(t >= dur - 0.05 ? 0 : t));
  const seek = (time: number) => {
    const v = clamp(Math.round(time * fps) / fps, 0, dur - 1 / fps);
    setT(v);
    if (s.playing) void mimic.listen(v);
  };

  // Keys, while the editor has focus.
  const onKey = (e: React.KeyboardEvent) => {
    const typing = e.target instanceof Element && !!e.target.closest("input, select, textarea");
    if (typing) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) mimic.redo();
      else mimic.undo();
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      mimic.redo();
    } else if (e.key === " ") {
      e.preventDefault();
      play();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      seek(t + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 1 : 1 / fps));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (pick?.kind === "cue") {
        mimic.editCue(pick.key, { off: true });
        setPick(null);
      } else if (pick?.kind === "tr") mimic.editTransition(pick.key, { kind: "cut", dur: 0 });
      else if (pick?.kind === "card" || pick?.kind === "broll") {
        mimic.removeFromEdit(pick.slot);
        setPick(null);
      } else if (pick?.kind === "zoom") {
        mimic.editZoom(pick.t, false);
        setPick(null);
      }
    }
  };

  // Drags on the strip.
  const timeAt = (e: React.PointerEvent) => {
    const r = strip.current!.getBoundingClientRect();
    return clamp((e.clientX - r.left - LABEL + strip.current!.scrollLeft) / scale, 0, dur);
  };
  const begin = (e: React.PointerEvent, d: NonNullable<Drag>, p: Pick) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag(d);
    if (p) setPick(p);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.kind === "scrub") return seek(timeAt(e));
    const dx = (e.clientX - drag.px0) / scale;
    if (drag.kind === "move") setDrag({ ...drag, dt: dx });
    else if (drag.kind === "len") setDrag({ ...drag, dl: dx });
    else setDrag({ ...drag, dt: dx });
  };
  const onUp = () => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.kind === "move" && Math.abs(d.dt) * scale > 3) mimic.moveOnTimeline(d.slot, Math.max(0, d.start + d.dt));
    if (d.kind === "len" && Math.abs(d.dl) * scale > 3) mimic.editCard(d.slot, { len: Math.max(0.3, d.len + d.dl) });
    if (d.kind === "cue" && Math.abs(d.dt) * scale > 3) mimic.editCue(d.key, { dt: d.dt });
  };

  const sounds = [...SOUNDS.map((x) => ({ id: x.id as string, name: x.name })), ...s.sounds.filter((x) => x.status === "ready").map((x) => ({ id: x.id, name: x.name }))];
  const extraName = (id: string) => s.extras.find((e) => e.id === id)?.label ?? s.extras.find((e) => e.id === id)?.name ?? id;
  const ticks = useMemo(() => {
    const every = [0.5, 1, 2, 5, 10, 15, 30].find((v) => v * scale >= 60) ?? 60;
    const out: number[] = [];
    for (let v = 0; v <= dur; v += every) out.push(v);
    return out;
  }, [scale, dur]);
  const zoomLine = useMemo(() => {
    const pts: string[] = [];
    const lo = 1;
    const hi = Math.max(1.05, ...plan.zoom.map(([, z]) => z));
    for (let px = 0; px <= toX(dur); px += 3) {
      const z = zoomAt(plan.zoom, px / scale);
      pts.push(`${px.toFixed(1)},${(ROW.zoom - 4 - ((z - lo) / (hi - lo)) * (ROW.zoom - 8)).toFixed(1)}`);
    }
    return pts.join(" ");
  }, [plan.zoom, scale, dur]);

  const ratio = plan.width / Math.max(1, plan.height);
  const top = (row: Row) => ROWS.slice(0, ROWS.findIndex((r) => r.id === row)).reduce((a, r) => a + ROW[r.id] + 4, 22);
  const totalH = top("music") + ROW.music + 6;
  const picked = pick;

  return (
    <section className="card editor" tabIndex={0} onKeyDown={onKey}>
      <div className="section-head">
        <span className="caps">Edit it</span>
        <span className="right">
          <button type="button" className="btn icon" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!s.undoable} onClick={() => mimic.undo()}>
            <Undo2 size={14} />
          </button>
          <button type="button" className="btn icon" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!s.redoable} onClick={() => mimic.redo()}>
            <Redo2 size={14} />
          </button>
        </span>
      </div>
      <div className="editor-top">
        <div className="editor-view">
          <canvas ref={preview} className="editor-frame" style={{ aspectRatio: `${ratio}` }} aria-label="The edit at the playhead" />
          <div className="transport">
            <button type="button" className="btn icon" aria-label="A frame back" onClick={() => seek(t - 1 / fps)}>
              <ChevronLeft size={14} />
            </button>
            <button type="button" className="btn" disabled={s.mixing} onClick={play}>
              {s.playing ? <Pause size={13} /> : <Play size={13} />} {s.mixing ? "Mixing" : s.playing ? "Pause" : "Play"}
            </button>
            <button type="button" className="btn icon" aria-label="A frame on" onClick={() => seek(t + 1 / fps)}>
              <ChevronRight size={14} />
            </button>
            <span className="num muted">
              {stamp(t)} / {stamp(dur)}
            </span>
          </div>
        </div>
        <div className="inspector">
          <Inspector s={s} plan={plan} pick={picked} t={t} sounds={sounds} extraName={extraName} onSeek={seek} onPick={setPick} />
        </div>
      </div>
      <div className="tl-tools">
        <button type="button" className="btn icon" aria-label="Zoom out" onClick={() => setPps(Math.max(8, scale / 1.5))}>
          <ZoomOut size={14} />
        </button>
        <button type="button" className="btn icon" aria-label="Zoom in" onClick={() => setPps(Math.min(600, scale * 1.5))}>
          <ZoomIn size={14} />
        </button>
        {pps !== null && (
          <button type="button" className="btn ghost" onClick={() => setPps(null)}>
            Fit
          </button>
        )}
        <span className="hint">Click a diamond for its transition, a block for its card or cutaway. Drag blocks to move them, their right edge to trim.</span>
      </div>
      <div className="tl" ref={strip} onPointerMove={onMove} onPointerUp={onUp}>
        <div className="tl-inner" style={{ width: LABEL + toX(dur) + 16, height: totalH }}>
          <div className="tl-labels" style={{ height: totalH }}>
            {ROWS.map((r) => (
              <span key={r.id} style={{ top: top(r.id), height: ROW[r.id] }}>
                {r.name}
              </span>
            ))}
          </div>
          <div className="tl-body" style={{ left: LABEL }}>
            <div className="tl-ruler" onPointerDown={(e) => (begin(e, { kind: "scrub" }, null), seek(timeAt(e)))}>
              {ticks.map((v) => (
                <span key={v} style={{ left: toX(v) }}>
                  {fmtTime(v)}
                </span>
              ))}
            </div>
            {ROWS.map((r) => (
              <div key={r.id} className={`tl-row ${r.id}`} style={{ top: top(r.id), height: ROW[r.id], width: toX(dur) }} onPointerDown={(e) => (begin(e, { kind: "scrub" }, null), seek(timeAt(e)))} />
            ))}
            {/* The footage, piece by piece, and the cutaways over it. */}
            {plan.segments.map((g, i) => (
              <div key={`g${i}`} className="blk seg" style={{ left: toX(g.start), width: Math.max(2, toX(g.end) - toX(g.start)), top: top("video"), height: ROW.video }} title={`Your footage, ${fmtTime(g.from)} to ${fmtTime(g.to)}`} />
            ))}
            {plan.broll.map((b) => {
              const dt = drag?.kind === "move" && drag.slot === b.slot ? drag.dt : 0;
              const dl = drag?.kind === "len" && drag.slot === b.slot ? drag.dl : 0;
              const on = picked?.kind === "broll" && picked.slot === b.slot;
              return (
                <div key={b.slot} className={`blk broll${on ? " on" : ""}`} style={{ left: toX(b.start + dt), width: Math.max(4, toX(b.end - b.start + dl)), top: top("video") + 3, height: ROW.video - 6 }} onPointerDown={(e) => begin(e, { kind: "move", slot: b.slot, px0: e.clientX, start: b.start, dt: 0 }, { kind: "broll", slot: b.slot })} title={`Cutaway: ${extraName(b.extra)}`}>
                  <span>{extraName(b.extra)}</span>
                  <i className="trim" onPointerDown={(e) => begin(e, { kind: "len", slot: b.slot, px0: e.clientX, len: b.end - b.start, dl: 0 }, { kind: "broll", slot: b.slot })} />
                </div>
              );
            })}
            {/* A transition at every cut. */}
            {trs.map((x) => {
              const [a, b] = transitionSpan(x);
              const on = picked?.kind === "tr" && picked.key === x.key;
              const mid = x.from === "black" ? a : x.to === "black" ? b : x.t;
              return (
                <div key={x.key}>
                  {x.dur > 0 && <div className={`tr-band${x.mine ? " mine" : ""}`} style={{ left: toX(a), width: Math.max(2, toX(b) - toX(a)), top: top("video"), height: ROW.video }} />}
                  <button type="button" className={`tr-dot ${x.kind}${on ? " on" : ""}${x.mine ? " mine" : ""}`} style={{ left: toX(mid) - 8, top: top("video") + ROW.video / 2 - 8 }} onPointerDown={(e) => e.stopPropagation()} onClick={() => setPick({ kind: "tr", key: x.key })} aria-label={`${lookName(x)} at ${fmtTime(x.t)}`} title={`${lookName(x)}${x.dur > 0 ? `, ${Math.round(x.dur * fps)} frames` : ""}`} />
                </div>
              );
            })}
            {plan.cards.map((c) => {
              const dt = drag?.kind === "move" && drag.slot === c.slot ? drag.dt : 0;
              const dl = drag?.kind === "len" && drag.slot === c.slot ? drag.dl : 0;
              const on = picked?.kind === "card" && picked.slot === c.slot;
              return (
                <div key={c.slot} className={`blk card${on ? " on" : ""}`} style={{ left: toX(c.start + dt), width: Math.max(4, toX(c.end - c.start + dl)), top: top("cards") + 2, height: ROW.cards - 4 }} onPointerDown={(e) => begin(e, { kind: "move", slot: c.slot, px0: e.clientX, start: c.start, dt: 0 }, { kind: "card", slot: c.slot })} title={`Card: ${extraName(c.extra)}`}>
                  <span>{extraName(c.extra)}</span>
                  <i className="trim" onPointerDown={(e) => begin(e, { kind: "len", slot: c.slot, px0: e.clientX, len: c.end - c.start, dl: 0 }, { kind: "card", slot: c.slot })} />
                </div>
              );
            })}
            {(plan.captions?.pages ?? []).map((p, i) => (
              <div key={`p${i}`} className={`blk page${picked?.kind === "page" && picked.i === i ? " on" : ""}`} style={{ left: toX(p.start), width: Math.max(2, toX(p.end) - toX(p.start) - 1), top: top("text") + 2, height: ROW.text - 4 }} onPointerDown={(e) => (e.stopPropagation(), setPick({ kind: "page", i }), seek(p.start + 0.05))}>
                <span>{p.lines.map((l) => l.map((w) => w.text).join(" ")).join(" / ")}</span>
              </div>
            ))}
            <svg className="zoom-line" style={{ left: 0, top: top("zoom"), width: toX(dur), height: ROW.zoom }}>
              <polyline points={zoomLine} />
            </svg>
            {zoomSteps(plan.zoom)
              .filter((z) => z.t > 0.01 && z.t < dur - 0.01)
              .map((z) => (
                <button key={`z${z.t}`} type="button" className={`zoom-dot${picked?.kind === "zoom" && Math.abs(picked.t - z.t) < 1e-3 ? " on" : ""}`} style={{ left: toX(z.t) - 5, top: top("zoom") + ROW.zoom / 2 - 5 }} onPointerDown={(e) => e.stopPropagation()} onClick={() => (setPick({ kind: "zoom", t: z.t }), seek(z.t))} aria-label={`Zoom ${z.to > 1 ? "in" : "out"} at ${fmtTime(z.t)}`} title={`${z.jump ? "Jumps" : "Steps"} ${z.to > 1 ? "in" : "out"} to ${Math.round(z.to * 100)}%`} />
              ))}
            {plan.sfx.map((c) => {
              const dt = drag?.kind === "cue" && drag.key === c.key ? drag.dt : 0;
              const on = picked?.kind === "cue" && picked.key === c.key;
              return <button key={c.key} type="button" className={`cue-dot${on ? " on" : ""}${c.key.startsWith("mine:") ? " mine" : ""}`} style={{ left: toX(c.t + dt) - 6, top: top("sfx") + ROW.sfx / 2 - 6 }} onPointerDown={(e) => begin(e, { kind: "cue", key: c.key, px0: e.clientX, t: c.t, dt: 0 }, { kind: "cue", key: c.key })} aria-label={`${c.why} at ${fmtTime(c.t)}`} title={`${sounds.find((x) => x.id === c.sound)?.name ?? c.sound}: ${c.why}`} />;
            })}
            {plan.music && <div className="blk music" style={{ left: toX(plan.music.start), width: Math.max(4, toX((plan.music.end ?? dur) - plan.music.start)), top: top("music") + 2, height: ROW.music - 4 }} title="Music (move, trim and set its volume under Sound)"><span>{s.music?.name ?? "Music"}</span></div>}
            <div className="playhead" style={{ left: toX(t), height: totalH }} />
          </div>
        </div>
      </div>
    </section>
  );
}

const SIDES: Edge[] = ["left", "right", "top", "bottom"];

function MotionEdit({ label, m, onChange }: { label: string; m: Motion; onChange: (m: Motion) => void }) {
  return (
    <div className="motion-edit">
      <span className="caps">{label}</span>
      <Segmented
        label={label}
        value={m.kind}
        options={[
          { value: "cut", label: "Cut" },
          { value: "slide", label: "Slide" },
          { value: "fade", label: "Fade" },
          { value: "pop", label: "Pop" },
        ]}
        onChange={(kind) => onChange({ ...m, kind, dur: kind === "cut" ? 0 : m.dur || 0.25, ...(kind === "slide" && !m.from ? { from: "right" as Edge } : {}) })}
      />
      {m.kind === "slide" && (
        <Segmented label={`${label}: from`} value={m.from ?? "right"} options={SIDES.map((v) => ({ value: v, label: v }))} onChange={(from) => onChange({ ...m, from })} />
      )}
      {m.kind !== "cut" && (
        <label className="slider">
          <span>{m.dur.toFixed(2)} s</span>
          <input type="range" min={0.05} max={1} step={0.01} value={m.dur} onChange={(e) => onChange({ ...m, dur: Number(e.target.value) })} aria-label={`${label}: how long`} />
        </label>
      )}
    </div>
  );
}

function AddHere({ s, t, sounds }: { s: State; t: number; sounds: { id: string; name: string }[] }) {
  const ready = s.extras.filter((e) => e.status === "ready");
  const [extra, setExtra] = useState("");
  const [sound, setSound] = useState("whoosh");
  const pick = extra || ready[0]?.id || "";
  return (
    <div className="add-here">
      <span className="caps">Add at {fmtTime(t)}</span>
      {ready.length > 0 && (
        <div className="row">
          <select className="select" aria-label="A picture or clip to add" value={pick} onChange={(e) => setExtra(e.target.value)}>
            {ready.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label ?? e.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn" disabled={!pick} onClick={() => mimic.addAtTime(pick, t)}>
            <Layers size={13} /> Put it here
          </button>
        </div>
      )}
      <div className="row">
        <select className="select" aria-label="A sound to add" value={sound} onChange={(e) => setSound(e.target.value)}>
          {sounds.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn" onClick={() => mimic.addCue(t, sound)}>
          <Plus size={13} /> Add the sound
        </button>
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={() => mimic.editZoom(t, true)}>
          <ZoomIn size={13} /> A zoom step here
        </button>
      </div>
    </div>
  );
}

function Inspector({ s, plan, pick, t, sounds, extraName, onSeek, onPick }: { s: State; plan: MimicPlan; pick: Pick; t: number; sounds: { id: string; name: string }[]; extraName: (id: string) => string; onSeek: (t: number) => void; onPick: (p: Pick) => void }) {
  const fps = plan.fps || 30;
  if (!pick) {
    const moves = (plan.transitions ?? []).filter((x) => x.kind !== "cut");
    return (
      <div className="hint">
        <AddHere s={s} t={t} sounds={sounds} />
        <p>
          <strong>{(plan.transitions ?? []).length}</strong> cuts, <strong>{moves.length}</strong> of them a transition copied from the reference
          {moves.length ? ` (${[...new Set(moves.map((x) => lookName(x)))].join(", ")})` : ""}.
        </p>
        <p>Click a diamond on the Video layer to change its transition, a card or cutaway to change its moves and length, a sound to change it. Space plays, the arrow keys step a frame.</p>
        {Object.keys(s.transitionEdits).length > 0 && (
          <button type="button" className="btn ghost" onClick={() => mimic.resetTransitions()}>
            <RotateCcw size={13} /> Every transition back as the reference has it
          </button>
        )}
      </div>
    );
  }
  if (pick.kind === "tr") {
    const x = plan.transitions?.find((v) => v.key === pick.key);
    if (!x) return null;
    return <TransitionEdit x={x} fps={fps} plan={plan} sounds={sounds} onSeek={onSeek} />;
  }
  if (pick.kind === "card") {
    const c = plan.cards.find((v) => v.slot === pick.slot);
    if (!c) return null;
    const edited = !!s.cardEdits[c.slot];
    return (
      <div className="insp">
        <div className="insp-head">
          <strong>Card: {extraName(c.extra)}</strong>
          <span className="num muted">
            {fmtTime(c.start)} to {fmtTime(c.end)}
          </span>
        </div>
        <MotionEdit label="Comes on" m={c.enter} onChange={(enter) => mimic.editCard(c.slot, { enter })} />
        <MotionEdit label="Goes off" m={c.exit} onChange={(exit) => mimic.editCard(c.slot, { exit })} />
        <label className="slider">
          <span>Stays {(c.end - c.start).toFixed(1)} s</span>
          <input type="range" min={0.3} max={8} step={0.1} value={c.end - c.start} onChange={(e) => mimic.editCard(c.slot, { len: Number(e.target.value) })} aria-label="How long it stays" />
        </label>
        <div className="row">
          <button type="button" className="btn" onClick={() => onSeek(Math.max(0, c.start - 0.5))}>
            <Play size={13} /> Go to it
          </button>
          {edited && (
            <button type="button" className="btn ghost" onClick={() => mimic.editCard(c.slot, null)}>
              <RotateCcw size={13} /> As planned
            </button>
          )}
          <button type="button" className="btn ghost" onClick={() => (mimic.removeFromEdit(c.slot), onPick(null))}>
            <Trash2 size={13} /> Take it out
          </button>
        </div>
      </div>
    );
  }
  if (pick.kind === "broll") {
    const b = plan.broll.find((v) => v.slot === pick.slot);
    if (!b) return null;
    const into = plan.transitions?.find((x) => x.key === `in:${b.slot}`);
    const outOf = plan.transitions?.find((x) => x.key === `out:${b.slot}`);
    return (
      <div className="insp">
        <div className="insp-head">
          <strong>Cutaway: {extraName(b.extra)}</strong>
          <span className="num muted">
            {fmtTime(b.start)} to {fmtTime(b.end)}
          </span>
        </div>
        <label className="slider">
          <span>Stays {(b.end - b.start).toFixed(1)} s</span>
          <input type="range" min={0.3} max={8} step={0.1} value={b.end - b.start} onChange={(e) => mimic.editCard(b.slot, { len: Number(e.target.value) })} aria-label="How long it stays" />
        </label>
        <div className="row wrap">
          {into && (
            <button type="button" className="btn" onClick={() => onPick({ kind: "tr", key: into.key })}>
              In: {lookName(into)}
            </button>
          )}
          {outOf && (
            <button type="button" className="btn" onClick={() => onPick({ kind: "tr", key: outOf.key })}>
              Out: {lookName(outOf)}
            </button>
          )}
          {s.cardEdits[b.slot] && (
            <button type="button" className="btn ghost" onClick={() => mimic.editCard(b.slot, null)}>
              <RotateCcw size={13} /> As planned
            </button>
          )}
          <button type="button" className="btn ghost" onClick={() => (mimic.removeFromEdit(b.slot), onPick(null))}>
            <Trash2 size={13} /> Take it out
          </button>
        </div>
      </div>
    );
  }
  if (pick.kind === "cue") {
    const c = plan.sfx.find((v) => v.key === pick.key);
    if (!c) return null;
    return (
      <div className="insp">
        <div className="insp-head">
          <strong>Sound at {fmtTime(c.t)}</strong>
          <span className="muted">{c.why}</span>
        </div>
        <select className="select" aria-label="Sound" value={c.sound} onChange={(e) => mimic.editCue(c.key, { sound: e.target.value })}>
          {sounds.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <label className="slider">
          <span>
            {c.db > 0 ? "+" : ""}
            {c.db} dB
          </span>
          <input type="range" min={-24} max={12} step={1} value={c.db} onChange={(e) => mimic.editCue(c.key, { db: Number(e.target.value) })} aria-label="Its level" />
        </label>
        <div className="row">
          <button type="button" className="btn" onClick={() => void mimic.hearSound(c.sound)}>
            <Play size={13} /> Hear it
          </button>
          <button type="button" className="btn ghost" onClick={() => (mimic.editCue(c.key, { off: true }), onPick(null))}>
            Take it out
          </button>
        </div>
      </div>
    );
  }
  if (pick.kind === "zoom") {
    const z = zoomSteps(plan.zoom).find((v) => Math.abs(v.t - pick.t) < 1e-3);
    if (!z) return null;
    return (
      <div className="insp">
        <div className="insp-head">
          <strong>
            Zoom {z.to > 1 ? "in" : "out"} to {Math.round(z.to * 100)}%
          </strong>
          <span className="num muted">
            {fmtTime(z.t)} · {z.jump ? "a jump, hiding a cut in your footage" : "a step, as the reference zooms"}
          </span>
        </div>
        <div className="row">
          <button type="button" className="btn ghost" onClick={() => (mimic.editZoom(z.t, false), onPick(null))}>
            <Trash2 size={13} /> Take it out
          </button>
        </div>
      </div>
    );
  }
  const p = plan.captions?.pages[pick.i];
  if (!p) return null;
  return (
    <div className="insp">
      <div className="insp-head">
        <strong>Caption</strong>
        <span className="num muted">
          {fmtTime(p.start)} to {fmtTime(p.end)}
        </span>
      </div>
      <p>{p.lines.map((l) => l.map((w) => w.text).join(" ")).join(" / ")}</p>
      <p className="hint">Change its words in the text under your footage, and its look under Captions.</p>
    </div>
  );
}

function TransitionEdit({ x, fps, plan, sounds, onSeek }: { x: PlanTransition; fps: number; plan: MimicPlan; sounds: { id: string; name: string }[]; onSeek: (t: number) => void }) {
  const edit = (patch: Partial<TransitionLook>) => mimic.editTransition(x.key, patch);
  const frames = Math.round(x.dur * fps);
  const fade = x.from === "black" || x.to === "black";
  const kinds = fade ? TRANSITIONS.filter((k) => k.kind === "dip" || k.kind === "cut" || k.kind === "dissolve") : TRANSITIONS;
  const ways = x.kind === "zoom" ? (["in", "out"] as const) : x.kind === "spin" ? (["left", "right"] as const) : x.kind === "push" || x.kind === "slide" || x.kind === "wipe" || x.kind === "whip" ? WAYS : null;
  // Its sound: the cue on it (a cutaway's own on the way in), or none yet.
  const cueKey = x.key.startsWith("in:") ? `cut:${x.key.slice(3)}` : `tr:${x.key}`;
  const cue = plan.sfx.find((c) => c.key === cueKey) ?? plan.sfx.find((c) => c.key.startsWith("mine:") && Math.abs(c.t - x.t) < 0.05);
  const joins = (v: PlanTransition["from"]) => (v === "black" ? "black" : v === "broll" ? "a cutaway" : "the talking");
  return (
    <div className="insp">
      <div className="insp-head">
        <strong>{lookName(x)}</strong>
        <span className="num muted">
          {fmtTime(x.t)} · {joins(x.from)} to {joins(x.to)}
        </span>
      </div>
      <p className="hint">{x.why}</p>
      <div className="kinds" role="group" aria-label="Transition">
        {kinds.map((k) => (
          <button key={k.kind} type="button" aria-pressed={x.kind === k.kind} onClick={() => edit(fade && k.kind === "dip" ? { kind: "dip", color: x.color ?? "black", over: x.from === "black" ? "in" : "out", dur: x.dur || 0.4 } : { kind: k.kind })}>
            {k.name}
          </button>
        ))}
      </div>
      {x.kind !== "cut" && (
        <>
          <label className="slider">
            <span>
              {frames} frame{frames === 1 ? "" : "s"}
            </span>
            <input type="range" min={1} max={36} step={1} value={Math.max(1, frames)} onChange={(e) => edit({ dur: Number(e.target.value) / fps })} aria-label="How long" />
          </label>
          {ways && <Segmented label="Which way" value={(x.dir ?? ways[0]) as string} options={ways.map((v) => ({ value: v as string, label: v }))} onChange={(dir) => edit({ dir: dir as TransitionLook["dir"] })} />}
          {x.kind === "slide" && (
            <Segmented
              label="Which moves"
              value={x.over ?? "in"}
              options={[
                { value: "in", label: "Next slides over" },
                { value: "out", label: "Last slides off" },
              ]}
              onChange={(over) => edit({ over })}
            />
          )}
          {(x.kind === "dip" || x.kind === "flash") && (
            <Segmented
              label="Colour"
              value={x.color ?? (x.kind === "flash" ? "white" : "black")}
              options={[
                { value: "black", label: "Black" },
                { value: "white", label: "White" },
              ]}
              onChange={(color) => edit({ color })}
            />
          )}
          <select className="select" aria-label="Its speed" value={x.ease} onChange={(e) => edit({ ease: e.target.value as TransitionLook["ease"] })}>
            {EASES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </>
      )}
      <label className="field-row">
        <span>Sound</span>
        <select
          className="select"
          aria-label="Its sound"
          value={cue ? cue.sound : ""}
          onChange={(e) => {
            const v = e.target.value;
            if (cue && !v) mimic.editCue(cue.key, { off: true });
            else if (cue) mimic.editCue(cue.key, { sound: v });
            else if (v) mimic.addCue(x.t, v);
          }}
        >
          <option value="">None</option>
          {sounds.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <div className="row wrap">
        <button type="button" className="btn" onClick={() => onSeek(Math.max(0, transitionSpan(x)[0] - 0.6))}>
          <Play size={13} /> Go to it
        </button>
        {!fade && (
          <button type="button" className="btn" title="Every cut joining the same things gets this transition" onClick={() => mimic.transitionToAll(x.key)}>
            <Copy size={13} /> On every cut like this
          </button>
        )}
        {!fade && (
          <button type="button" className="btn ghost" onClick={() => mimic.transitionToAll(x.key, true)}>
            On every cut
          </button>
        )}
        {x.mine && (
          <button type="button" className="btn ghost" onClick={() => mimic.editTransition(x.key, null)}>
            <RotateCcw size={13} /> As the reference has it
          </button>
        )}
      </div>
    </div>
  );
}

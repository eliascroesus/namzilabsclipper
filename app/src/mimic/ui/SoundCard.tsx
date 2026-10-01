/**
 * The edit's sound laid out in time: where the voice talks (its captions), the cards and
 * cutaways, the sound effects on them, and the music with its volume line. Listen from any
 * moment; drag a sound effect to move it. The music's bar: drag its middle to move where
 * it comes in, its ends to trim it (as in CapCut). On its volume lane, click to add a point,
 * drag a point up or down (or along), double-click one to take it out, or drag across a
 * stretch to set that stretch's level; or give it a shape at once (down under the talking,
 * fading in or out, a louder ending).
 */
import { useEffect, useRef, useState } from "react";
import { Play, Plus, RotateCcw, Square, Volume2, VolumeX, X } from "lucide-react";
import { fmtTime } from "../../ui/components/bits";
import { lineAt, shapeLine, withStretch, type MusicShape } from "../plan";
import { SOUNDS } from "../sfx";
import type { MimicPlan, VolumeLine } from "../types";
import { mimic, type State } from "./store";

const LANE = { ruler: [0, 16], voice: [20, 38], cards: [42, 62], sfx: [66, 88], clip: [94, 110], music: [114, 184] } as const;
const HEIGHT = 186;
const SHAPES: { value: MusicShape; label: string; title: string }[] = [
  { value: "duck", label: "Down under the talking", title: "6 dB down while each line is said, back up in the gaps" },
  { value: "fadein", label: "Fade in", title: "In from silence over its first 2 seconds" },
  { value: "fadeout", label: "Fade out", title: "Out to silence over its last 2 seconds" },
  { value: "ending", label: "Louder ending", title: "6 dB up for the ending" },
];
const DB_TOP = 12;
const DB_BOTTOM = -30;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

type Drag =
  | { kind: "point"; i: number }
  | { kind: "cue"; key: string; from: number; t: number }
  // the music's bar: moved, or trimmed at its start or end (the song's own time stays put under a trim)
  | { kind: "clip"; mode: "move" | "start" | "end"; t0: number; start: number; end: number; from: number; now: { start: number; end: number; from: number } }
  // a stretch of the volume lane, being picked
  | { kind: "stretch"; a: number; b: number; px: number }
  | null;

export function SoundCard({ s, plan }: { s: State; plan: MimicPlan }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(760);
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [adding, setAdding] = useState("whoosh");
  const [drag, setDrag] = useState<Drag>(null);
  // A stretch picked on the volume lane, its level being set (from the line as it was when picked).
  const [stretch, setStretch] = useState<{ a: number; b: number; base: VolumeLine; db: number } | null>(null);
  const dur = Math.max(0.1, plan.duration);
  const line: VolumeLine = s.musicLine;
  const sounds = [...SOUNDS.map((x) => ({ id: x.id as string, name: x.name })), ...s.sounds.filter((x) => x.status === "ready").map((x) => ({ id: x.id, name: x.name }))];
  const nameOf = (id: string) => sounds.find((x) => x.id === id)?.name ?? id;

  const toX = (t: number) => (t / dur) * width;
  const toT = (px: number) => clamp((px / width) * dur, 0, dur);
  const toY = (db: number) => LANE.music[0] + ((DB_TOP - db) / (DB_TOP - DB_BOTTOM)) * (LANE.music[1] - LANE.music[0]);
  const toDb = (py: number) => clamp(DB_TOP - ((py - LANE.music[0]) / (LANE.music[1] - LANE.music[0])) * (DB_TOP - DB_BOTTOM), DB_BOTTOM, DB_TOP);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(240, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The playhead while it plays.
  useEffect(() => {
    if (!s.playing) return setNow(null);
    let raf = 0;
    const tick = () => {
      setNow(s.playing!.from + (performance.now() - s.playing!.since) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.playing]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(HEIGHT * dpr);
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, HEIGHT);
    const css = getComputedStyle(c);
    const muted = css.getPropertyValue("--muted").trim() || "#8a8f98";
    const line1 = css.getPropertyValue("--line").trim() || "#2a2d33";
    const brand = css.getPropertyValue("--brand").trim() || "#4f7cff";
    g.font = "11px ui-sans-serif, system-ui, sans-serif";
    // Time, every 5 or 10 s.
    const step = dur > 90 ? 10 : 5;
    g.fillStyle = muted;
    for (let t = 0; t <= dur; t += step) {
      g.fillRect(toX(t), LANE.ruler[1] - 4, 1, 4);
      g.fillText(fmtTime(t), toX(t) + 3, 11);
    }
    const lane = (y: readonly [number, number]) => {
      g.fillStyle = "rgba(127,127,127,0.07)";
      g.fillRect(0, y[0], width, y[1] - y[0]);
    };
    // The voice: its captions.
    lane(LANE.voice);
    g.fillStyle = "rgba(160,170,190,0.45)";
    for (const p of plan.captions?.pages ?? []) g.fillRect(toX(p.start), LANE.voice[0] + 3, Math.max(1, toX(p.end) - toX(p.start) - 1), LANE.voice[1] - LANE.voice[0] - 6);
    // Cards and cutaways.
    lane(LANE.cards);
    for (const c of plan.cards) {
      g.fillStyle = "rgba(79,124,255,0.55)";
      g.fillRect(toX(c.start), LANE.cards[0] + 2, Math.max(2, toX(c.end) - toX(c.start)), LANE.cards[1] - LANE.cards[0] - 4);
    }
    for (const b of plan.broll) {
      g.fillStyle = "rgba(168,85,247,0.55)";
      g.fillRect(toX(b.start), LANE.cards[0] + 2, Math.max(2, toX(b.end) - toX(b.start)), LANE.cards[1] - LANE.cards[0] - 4);
    }
    // Sound effects.
    lane(LANE.sfx);
    for (const c of plan.sfx) {
      const t = drag?.kind === "cue" && drag.key === c.key ? drag.t : c.t;
      const x = toX(t);
      const my = (LANE.sfx[0] + LANE.sfx[1]) / 2;
      g.fillStyle = c.key === selected ? "#f59e0b" : c.key.startsWith("mine:") ? "#22c55e" : "#e5e7eb";
      g.beginPath();
      g.moveTo(x, my - 7);
      g.lineTo(x + 6, my);
      g.lineTo(x, my + 7);
      g.lineTo(x - 6, my);
      g.closePath();
      g.fill();
    }
    // Music: its bar, and its volume line.
    lane(LANE.clip);
    lane(LANE.music);
    const m = plan.music;
    if (m) {
      const clip = drag?.kind === "clip" ? drag.now : { start: m.start, end: m.end ?? dur, from: m.from };
      const x0 = toX(clip.start);
      const x1 = toX(clip.end);
      g.fillStyle = "rgba(34,197,94,0.45)";
      g.beginPath();
      g.roundRect(x0, LANE.clip[0] + 1, Math.max(6, x1 - x0), LANE.clip[1] - LANE.clip[0] - 2, 4);
      g.fill();
      g.fillStyle = "#e5e7eb";
      g.fillRect(x0 + 1, LANE.clip[0] + 3, 3, LANE.clip[1] - LANE.clip[0] - 6);
      g.fillRect(Math.max(x0 + 6, x1 - 4), LANE.clip[0] + 3, 3, LANE.clip[1] - LANE.clip[0] - 6);
      g.save();
      g.beginPath();
      g.rect(x0 + 8, LANE.clip[0], Math.max(0, x1 - x0 - 16), LANE.clip[1] - LANE.clip[0]);
      g.clip();
      g.fillStyle = "#0b1a10";
      g.fillText(`${s.music?.name ?? "music"} · from ${fmtTime(clip.from)}`, x0 + 10, LANE.clip[1] - 5);
      g.restore();
      g.fillStyle = "rgba(34,197,94,0.10)";
      g.fillRect(x0, LANE.music[0], Math.max(0, x1 - x0), LANE.music[1] - LANE.music[0]);
      // The stretch picked (or being picked).
      const st = drag?.kind === "stretch" ? { a: Math.min(drag.a, drag.b), b: Math.max(drag.a, drag.b) } : stretch;
      if (st) {
        g.fillStyle = "rgba(245,158,11,0.18)";
        g.fillRect(toX(st.a), LANE.music[0], Math.max(1, toX(st.b) - toX(st.a)), LANE.music[1] - LANE.music[0]);
      }
      g.strokeStyle = line1;
      g.setLineDash([3, 3]);
      g.beginPath();
      g.moveTo(0, toY(0));
      g.lineTo(width, toY(0));
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = "#22c55e";
      g.lineWidth = 2;
      g.beginPath();
      for (let px = Math.max(0, x0); px <= x1; px += 2) {
        const y = toY(lineAt(line, toT(px)));
        if (px <= x0 + 0.5) g.moveTo(px, y);
        else g.lineTo(px, y);
      }
      g.stroke();
      g.lineWidth = 1;
      line.forEach(([t, db], i) => {
        g.fillStyle = drag?.kind === "point" && drag.i === i ? "#f59e0b" : "#22c55e";
        g.beginPath();
        g.arc(toX(t), toY(db), 5, 0, Math.PI * 2);
        g.fill();
        if (drag?.kind === "point" && drag.i === i) {
          g.fillStyle = "#fff";
          g.fillText(`${db > 0 ? "+" : ""}${db.toFixed(0)} dB`, Math.min(width - 44, toX(t) + 8), toY(db) - 6);
        }
      });
    } else {
      g.fillStyle = muted;
      g.fillText("Drop music under Sound to shape its volume here", 8, LANE.music[0] + 20);
    }
    // Where listening starts, and where it's playing.
    g.fillStyle = brand;
    g.fillRect(toX(cursor), 0, 1.5, HEIGHT);
    if (now !== null) {
      g.fillStyle = "#f43f5e";
      g.fillRect(toX(Math.min(now, dur)), 0, 2, HEIGHT);
    }
  }, [plan, width, line, cursor, now, selected, drag, dur, stretch, s.music]);

  const at = (e: React.PointerEvent | React.MouseEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };
  const nearPoint = (px: number, py: number) => line.findIndex(([t, db]) => Math.hypot(toX(t) - px, toY(db) - py) < 9);

  const down = (e: React.PointerEvent) => {
    const { px, py } = at(e);
    canvas.current!.setPointerCapture(e.pointerId);
    const m = plan.music;
    if (m && py >= LANE.clip[0] && py < LANE.clip[1]) {
      const end = m.end ?? dur;
      const x0 = toX(m.start);
      const x1 = toX(end);
      if (px >= x0 - 8 && px <= x1 + 8) {
        const mode = Math.abs(px - x0) <= 8 ? "start" : Math.abs(px - x1) <= 8 ? "end" : "move";
        const was = { start: m.start, end, from: m.from };
        setDrag({ kind: "clip", mode, t0: toT(px), ...was, now: was });
        return;
      }
    }
    if (py >= LANE.music[0] && m) {
      const i = nearPoint(px, py);
      if (i >= 0) {
        setDrag({ kind: "point", i });
        return;
      }
      // (A click adds a point there; a drag along picks a stretch.)
      setStretch(null);
      setDrag({ kind: "stretch", a: toT(px), b: toT(px), px });
      return;
    }
    if (py >= LANE.sfx[0] && py < LANE.sfx[1]) {
      const hit = plan.sfx.map((c) => ({ c, d: Math.abs(toX(c.t) - px) })).filter((h) => h.d < 9).sort((a, b) => a.d - b.d)[0];
      if (hit) {
        setSelected(hit.c.key);
        setDrag({ kind: "cue", key: hit.c.key, from: hit.c.t, t: hit.c.t });
        return;
      }
    }
    const t = toT(px);
    setCursor(t);
    if (s.playing) void mimic.listen(t);
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const { px, py } = at(e);
    if (drag.kind === "clip") {
      const dt = toT(px) - drag.t0;
      const song = s.music?.duration ?? Infinity;
      let now = { start: drag.start, end: drag.end, from: drag.from };
      if (drag.mode === "move") {
        // (Moved later, it's trimmed where the edit or the song ends; running to the end, it still does.)
        const d = clamp(dt, -drag.start, dur - 0.5 - drag.start);
        const start = drag.start + d;
        const toEnd = drag.end >= dur - 0.05;
        now = { start, end: Math.min(dur, toEnd ? dur : drag.end + d, start + (song - drag.from)), from: drag.from };
      } else if (drag.mode === "start") {
        // (Trimming its start: the song stays where it was under it, so it starts further in.)
        const d = clamp(dt, -Math.min(drag.start, drag.from), drag.end - drag.start - 0.5);
        now = { start: drag.start + d, end: drag.end, from: drag.from + d };
      } else {
        const end = clamp(drag.end + dt, drag.start + 0.5, Math.min(dur, drag.start + song - drag.from));
        now = { start: drag.start, end, from: drag.from };
      }
      setDrag({ ...drag, now });
      return;
    }
    if (drag.kind === "stretch") {
      setDrag({ ...drag, b: toT(px) });
      return;
    }
    if (drag.kind === "point") {
      const next = line.map((p) => [...p] as [number, number]);
      const lo = drag.i > 0 ? next[drag.i - 1][0] + 0.05 : 0;
      const hi = drag.i < next.length - 1 ? next[drag.i + 1][0] - 0.05 : dur;
      next[drag.i] = [clamp(toT(px), lo, hi), Math.round(toDb(py))];
      mimic.setMusicOption({ musicLine: next });
    } else setDrag({ ...drag, t: toT(px) });
  };
  const up = (e: React.PointerEvent) => {
    if (drag?.kind === "cue" && Math.abs(drag.t - drag.from) > 0.01) mimic.editCue(drag.key, { dt: drag.t - drag.from });
    if (drag?.kind === "clip") {
      const { start, end, from } = drag.now;
      const r = (t: number) => Math.round(t * 100) / 100;
      if (Math.abs(start - drag.start) > 0.01 || Math.abs(end - drag.end) > 0.01) mimic.setMusicOption({ musicAt: r(start), musicEnd: end < dur - 0.05 ? r(end) : null, musicFrom: r(from) });
    }
    if (drag?.kind === "stretch" && plan.music) {
      const { px } = at(e);
      if (Math.abs(px - drag.px) < 5) {
        // A click: a new point; the first one anchors the line at the ends, level, so it's a dip or a rise, not a new level everywhere.
        const { py } = at(e);
        const pt: [number, number] = [toT(px), Math.round(toDb(py))];
        const next: VolumeLine = line.length ? [...line, pt].sort((a, b) => a[0] - b[0]) : [[plan.music.start, 0], pt, [dur, 0]];
        mimic.setMusicOption({ musicLine: next });
      } else {
        // (Only where the music plays.)
        const a = Math.max(plan.music.start, Math.min(drag.a, drag.b));
        const b = Math.min(plan.music.end ?? dur, Math.max(drag.a, drag.b));
        if (b - a >= 0.2) setStretch({ a, b, base: line, db: Math.round(lineAt(line, (a + b) / 2)) });
      }
    }
    setDrag(null);
  };
  const setLevel = (db: number) => {
    if (!stretch) return;
    setStretch({ ...stretch, db });
    mimic.setMusicOption({ musicLine: withStretch(stretch.base, stretch.a, stretch.b, db, dur) });
  };
  const dbl = (e: React.MouseEvent) => {
    const { px, py } = at(e);
    const i = nearPoint(px, py);
    if (i < 0) return;
    const next = line.filter((_, k) => k !== i);
    mimic.setMusicOption({ musicLine: next.length <= 2 && next.every(([, db]) => db === 0) ? [] : next });
  };

  const edited = Object.keys(s.cueEdits).length > 0 || s.myCues.length > 0;
  return (
    <section className="card sound-card">
      <div className="section-head">
        <span className="caps">Sound</span>
        <span className="right">
          {s.playing ? (
            <button type="button" className="btn" onClick={() => mimic.stopListening()}>
              <Square size={13} /> Stop
            </button>
          ) : (
            <button type="button" className="btn" disabled={s.mixing} onClick={() => void mimic.listen(cursor)}>
              <Play size={13} /> {s.mixing ? "Mixing the sound" : `Listen from ${fmtTime(cursor)}`}
            </button>
          )}
        </span>
      </div>
      <div className="timeline" ref={wrap}>
        <canvas ref={canvas} style={{ width: "100%", height: HEIGHT }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onDoubleClick={dbl} aria-label="The edit's sound over time" />
        <div className="lanes hint">
          <span>voice</span>
          <span>cards, cutaways</span>
          <span>sound effects</span>
          <span>music</span>
          <span>music volume</span>
        </div>
      </div>
      <p className="hint">Click the timeline to listen from there. Drag a sound effect along to move it. Drag the music's bar to move where it comes in, or its ends to trim it. On the volume lane, drag across a stretch to set its level, click to add a point and drag it up or down, double-click a point to remove it.</p>
      {plan.music && (
        <div className="music-tools">
          {stretch ? (
            <div className="row wrap stretch-row">
              <span className="num">
                {fmtTime(stretch.a)} to {fmtTime(stretch.b)}
              </span>
              <label className="level grow" title={`${stretch.db > 0 ? "+" : ""}${stretch.db} dB`}>
                <Volume2 size={13} />
                <input type="range" min={-30} max={12} step={1} value={stretch.db} onChange={(e) => setLevel(Number(e.target.value))} aria-label="The stretch's level" />
                <span className="num">{stretch.db > 0 ? "+" : ""}{stretch.db} dB</span>
              </label>
              <button type="button" className="btn" onClick={() => setLevel(-30)}>
                <VolumeX size={13} /> Mute it
              </button>
              <button type="button" className="btn ghost" onClick={() => setStretch(null)}>
                Done
              </button>
            </div>
          ) : (
            <div className="row wrap">
              {SHAPES.map((sh) => (
                <button key={sh.value} type="button" className="btn" title={sh.title} onClick={() => mimic.setMusicOption({ musicLine: shapeLine(line, sh.value, plan) })}>
                  {sh.label}
                </button>
              ))}
              {line.length > 0 && (
                <button type="button" className="btn ghost" onClick={() => mimic.setMusicOption({ musicLine: [] })}>
                  <RotateCcw size={13} /> Level all through
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <div className="cues">
        {plan.sfx.length === 0 && <p className="hint">No sound effects. Turn them on under Sound, or add one here.</p>}
        {plan.sfx.map((c) => (
          <div key={c.key} className={`cue${c.key === selected ? " on" : ""}`} onClick={() => setSelected(c.key)}>
            <span className="num">{fmtTime(c.t)}</span>
            <span className="why" title={c.why}>
              {c.why}
            </span>
            <select className="select" aria-label="Sound" value={c.sound} onChange={(e) => mimic.editCue(c.key, { sound: e.target.value })}>
              {sounds.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
              {!sounds.some((x) => x.id === c.sound) && <option value={c.sound}>{nameOf(c.sound)}</option>}
            </select>
            <label className="level" title={`${c.db > 0 ? "+" : ""}${c.db} dB`}>
              <Volume2 size={13} />
              <input type="range" min={-24} max={12} step={1} value={c.db} onChange={(e) => mimic.editCue(c.key, { db: Number(e.target.value) })} aria-label="Its level" />
            </label>
            <button type="button" className="btn icon" aria-label="Hear it" onClick={() => void mimic.hearSound(c.sound)}>
              <Play size={12} />
            </button>
            <button type="button" className="btn icon" aria-label="Take it out" onClick={() => mimic.editCue(c.key, { off: true })}>
              <X size={12} />
            </button>
          </div>
        ))}
        <div className="row">
          <select className="select" aria-label="A sound to add" value={adding} onChange={(e) => setAdding(e.target.value)}>
            {sounds.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={() => mimic.addCue(cursor, adding)}>
            <Plus size={13} /> Add at {fmtTime(cursor)}
          </button>
          {edited && (
            <button type="button" className="btn ghost" onClick={() => mimic.resetCues()}>
              <RotateCcw size={13} /> Undo my changes
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

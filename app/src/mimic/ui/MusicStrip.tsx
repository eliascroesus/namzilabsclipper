/**
 * The song as a strip to pick its part from: its loudness, its biggest drops (orange) and bar
 * lines, and the stretch of it the edit plays (as long as the music runs in the edit).
 * Drag the stretch along the song (it snaps to the bar lines) or click where it should
 * start; play the part on its own; or jump to the top, a drop, or the loudest part.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Play, Square } from "lucide-react";
import { fmtTime } from "../../ui/components/bits";
import type { MimicPlan } from "../types";
import { mimic, type State } from "./store";

const HEIGHT = 56;
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/** Where a stretch `span` seconds long is loudest on the strip (its start, seconds). */
function loudest(bars: number[], duration: number, span: number): number {
  const n = bars.length;
  const w = Math.max(1, Math.round((span / duration) * n));
  let best = 0;
  let bestSum = -Infinity;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += bars[i];
    if (i >= w) sum -= bars[i - w];
    if (i >= w - 1 && sum > bestSum) {
      bestSum = sum;
      best = i - w + 1;
    }
  }
  return (best / n) * duration;
}

export function MusicStrip({ s, plan }: { s: State; plan: MimicPlan | null }) {
  const music = s.music!;
  const song = s.musicSong;
  const D = Math.max(0.1, music.duration);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);
  const [drag, setDrag] = useState<{ grab: number; from: number } | null>(null);
  const [head, setHead] = useState<number | null>(null);
  // As long as the music runs in the edit (15 s before there is one).
  const span = Math.min(D, plan?.music ? Math.max(0.5, (plan.music.end ?? plan.duration) - plan.music.start) : 15);
  const from = drag?.from ?? s.musicFrom;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(200, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const p = s.songPlaying;
    if (!p) return setHead(null);
    let raf = 0;
    const tick = () => {
      setHead(p.from + (performance.now() - p.since) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.songPlaying]);

  // Stop the song when the strip goes.
  useEffect(() => () => mimic.stopSong(), []);

  const toX = (t: number) => (t / D) * width;
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(HEIGHT * dpr);
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, HEIGHT);
    const bars = song?.bars ?? [];
    const bw = width / Math.max(1, bars.length);
    const inside = (t: number) => t >= from && t <= from + span;
    bars.forEach((v, i) => {
      const t = ((i + 0.5) / bars.length) * D;
      const h = Math.max(2, v * (HEIGHT - 14));
      g.fillStyle = inside(t) ? "rgba(34,197,94,0.85)" : "rgba(160,170,190,0.45)";
      g.fillRect(i * bw + 0.5, HEIGHT - 4 - h, Math.max(1, bw - 1), h);
    });
    if (!bars.length) {
      g.fillStyle = "rgba(160,170,190,0.6)";
      g.font = "11px ui-sans-serif, system-ui, sans-serif";
      g.fillText("Reading the song…", 8, HEIGHT / 2);
    }
    // Bar lines, faint; drops, orange.
    g.fillStyle = "rgba(255,255,255,0.12)";
    for (const d of song?.downbeats ?? []) g.fillRect(toX(d), HEIGHT - 4, 1, 4);
    g.fillStyle = "#f59e0b";
    for (const d of song?.drops.slice(0, 4) ?? []) g.fillRect(toX(d) - 1, 0, 2, HEIGHT);
    // The stretch the edit plays.
    g.strokeStyle = "#22c55e";
    g.lineWidth = 2;
    g.strokeRect(toX(from) + 1, 1, Math.max(4, toX(from + span) - toX(from) - 2), HEIGHT - 2);
    if (head !== null) {
      g.fillStyle = "#f43f5e";
      g.fillRect(toX(Math.min(head, D)), 0, 2, HEIGHT);
    }
  }, [song, width, from, span, head, D]);

  const clampFrom = (t: number) => Math.max(0, Math.min(t, D - span));
  const snap = (t: number) => {
    let best = t;
    let bestD = 0.5;
    for (const d of song?.downbeats ?? []) {
      const dd = Math.abs(d - t);
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    return best;
  };
  const timeAt = (e: ReactPointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * D;
  };
  const set = (t: number) => mimic.setMusicOption({ musicFrom: Math.round(clampFrom(t) * 100) / 100 });

  const top = song?.drops.slice(0, 2).sort((a, b) => a - b) ?? [];
  const loud = song ? loudest(song.bars, D, span) : null;
  const playing = !!s.songPlaying;
  return (
    <div className="music-strip">
      <div ref={wrap} className="strip-wrap">
        <canvas
          ref={canvas}
          style={{ width: "100%", height: HEIGHT, touchAction: "none", cursor: drag ? "grabbing" : "grab" }}
          aria-label="The song: drag the green box to the part the edit plays"
          onPointerDown={(e) => {
            const t = timeAt(e);
            e.currentTarget.setPointerCapture(e.pointerId);
            // (Outside the box: the box starts there.)
            const start = t >= from && t <= from + span ? from : clampFrom(t);
            setDrag({ grab: t - start, from: start });
          }}
          onPointerMove={(e) => drag && setDrag({ ...drag, from: clampFrom(snap(timeAt(e) - drag.grab)) })}
          onPointerUp={() => {
            if (drag) set(drag.from);
            setDrag(null);
          }}
          onPointerCancel={() => setDrag(null)}
        />
      </div>
      <div className="row between wrap">
        <span className="hint num">
          Plays {mmss(from)} to {mmss(from + span)} of {mmss(D)}
          {song ? `, ${Math.round(song.bpm)} BPM` : ""}
        </span>
        {playing ? (
          <button type="button" className="btn" onClick={() => mimic.stopSong()}>
            <Square size={13} /> Stop
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => mimic.hearSong(from, span)}>
            <Play size={13} /> Play this part
          </button>
        )}
      </div>
      <div className="chips">
        <button type="button" className="chip" aria-pressed={from < 0.05} onClick={() => set(0)}>
          From the top
        </button>
        {top.map((d) => (
          <button key={d} type="button" className="chip" aria-pressed={Math.abs(from - clampFrom(d)) < 0.05} onClick={() => set(d)} title="Start on the drop">
            Drop at {fmtTime(d)}
          </button>
        ))}
        {loud !== null && (
          <button type="button" className="chip" aria-pressed={Math.abs(from - clampFrom(loud)) < 0.05} onClick={() => set(snap(loud))} title="The loudest stretch as long as the edit's music">
            Loudest part
          </button>
        )}
      </div>
    </div>
  );
}

import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { studio, type State } from "../studio";

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/**
 * The sound as a strip to pick from: its loudness, its drops (orange), and the
 * stretch the edits will use. Drag the stretch to choose where the edits start
 * in the song (it snaps to the bar lines); for story clips, drag the marker to
 * the moment that should hit as the talking ends. Play plays that stretch.
 */
export function SongTimeline({ s }: { s: State }) {
  const snd = s.sound!;
  const win = studio.songWindow();
  const story = s.style.format === "story";
  const strip = useRef<HTMLDivElement>(null);
  const grab = useRef(0);
  const [drag, setDrag] = useState<number | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const raf = useRef(0);
  const [head, setHead] = useState<number | null>(null);
  const D = Math.max(0.1, snd.duration);
  const marks = snd.downbeats?.length ? snd.downbeats : (snd.beats ?? []);

  // Stop playing when the sound changes or the panel goes.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(raf.current);
      audio.current?.pause();
      audio.current = null;
      setHead(null);
    };
  }, [snd.url]);

  if (!win) return null;
  const len = win.end - win.start;
  const lead = win.cardAt - win.start;
  const snap = (t: number) => {
    let best = t;
    let bestD = Infinity;
    for (const m of marks) {
      const d = Math.abs(m - t);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return bestD < 2.5 ? best : t;
  };
  const clampStart = (t: number) => Math.min(Math.max(0, t), Math.max(0, D - Math.min(len, D)));
  const start = story ? win.start : (drag ?? win.start);
  const payoff = story ? (drag ?? win.payoff ?? 0) : null;
  const timeAt = (x: number) => {
    const r = strip.current!.getBoundingClientRect();
    return ((x - r.left) / Math.max(1, r.width)) * D;
  };
  const place = (x: number) => {
    const t = timeAt(x);
    setDrag(story ? Math.min(D, Math.max(0, snap(t))) : clampStart(snap(t - grab.current)));
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const t = timeAt(e.clientX);
    grab.current = !story && t >= start && t <= start + len ? t - start : Math.min(len, 2);
    e.currentTarget.setPointerCapture(e.pointerId);
    place(e.clientX);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (drag !== null && e.currentTarget.hasPointerCapture(e.pointerId)) place(e.clientX);
  };
  const up = () => {
    if (drag === null) return;
    // A click that didn't move anything leaves an automatic choice automatic.
    const moved = Math.abs(drag - (story ? (win.payoff ?? 0) : win.start)) > 0.01;
    if (moved || !win.auto) {
      if (story) studio.setPayoff(drag);
      else studio.setSongStart(drag);
    }
    setDrag(null);
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const at = story ? (payoff ?? 0) : start;
    const next = e.key === "ArrowRight" ? marks.find((m) => m > at + 0.05) : [...marks].reverse().find((m) => m < at - 0.05);
    if (next === undefined) return;
    if (story) studio.setPayoff(next);
    else studio.setSongStart(clampStart(next));
  };

  const playing = head !== null;
  const play = () => {
    if (playing) {
      cancelAnimationFrame(raf.current);
      audio.current?.pause();
      setHead(null);
      return;
    }
    const from = story ? Math.max(0, (payoff ?? 0) - 6) : start;
    const to = story ? win.end : start + len;
    const a = (audio.current ??= new Audio(snd.url));
    a.currentTime = from;
    void a.play().catch(() => setHead(null));
    const tick = () => {
      if (a.paused || a.currentTime >= to) {
        a.pause();
        setHead(null);
        return;
      }
      setHead(a.currentTime);
      raf.current = requestAnimationFrame(tick);
    };
    setHead(from);
    raf.current = requestAnimationFrame(tick);
  };

  const bars = snd.bars ?? [];
  const inside = (i: number) => {
    const t = ((i + 0.5) / bars.length) * D;
    return story ? t >= (payoff ?? 0) - 12 && t <= win.end : t >= start && t <= start + len;
  };
  return (
    <div className="timeline">
      <div
        ref={strip}
        className="song-strip"
        role="slider"
        tabIndex={0}
        aria-label={story ? "The moment of the song that hits as the talking ends" : "Where the edits start in the song"}
        aria-valuemin={0}
        aria-valuemax={Math.round(D)}
        aria-valuenow={Math.round(story ? (payoff ?? 0) : start)}
        aria-valuetext={story ? `The burst hits at ${mmss(payoff ?? 0)}` : `From ${mmss(start)} to ${mmss(start + len)}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
      >
        <div className="bars" aria-hidden="true">
          {bars.map((b, i) => (
            <i key={i} className={inside(i) ? "in" : undefined} style={{ height: `${Math.max(5, b * 100)}%` }} />
          ))}
        </div>
        {snd.drops?.map((t, i) => (
          <span key={i} className="drop-mark" style={{ left: `${(t / D) * 100}%` }} title={`Drop at ${mmss(t)}`} />
        ))}
        {story ? (
          <span className="payoff" style={{ left: `${((payoff ?? 0) / D) * 100}%` }} />
        ) : (
          <span className="window" style={{ left: `${(start / D) * 100}%`, width: `${(Math.min(len, D) / D) * 100}%` }}>
            {lead < len - 0.05 && <span className="card-part" style={{ left: `${(lead / len) * 100}%` }} title="The card" />}
          </span>
        )}
        {head !== null && <span className="head" style={{ left: `${(head / D) * 100}%` }} />}
      </div>
      <div className="timeline-foot">
        <button type="button" className="btn ghost" onClick={play} aria-label={playing ? "Stop" : "Play this part"}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
          {playing ? "Stop" : "Play"}
        </button>
        <span className="num muted">{story ? `The burst hits at ${mmss(payoff ?? 0)}` : `${mmss(start)} to ${mmss(start + len)}`}</span>
        {!win.auto && (
          <button type="button" className="btn ghost" onClick={() => (story ? studio.setPayoff(null) : studio.setSongStart(null))} title="Let it choose again">
            <RotateCcw size={14} /> Auto
          </button>
        )}
      </div>
      <span className="hint">
        {story
          ? "Drag the line to the moment that should hit as the talking ends: the burst of shots starts there."
          : win.auto
            ? s.sound?.fromReel
              ? "Starts at the Reel's 0:00. Drag the box to start somewhere else in the song."
              : "It picked the strongest stretch. Drag the box to start somewhere else."
            : "Every edit in the batch starts here. It snaps to the bar lines."}
      </span>
    </div>
  );
}

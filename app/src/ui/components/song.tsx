import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MAX_LENGTH, studio, type State } from "../studio";
import { Switch } from "./bits";

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/**
 * The sound as a strip to pick from: its loudness, its drops (orange), where
 * sung lines start (blue dots, once it has listened for the singing), and the
 * stretch the edits will use. Drag the stretch to choose where the edits start
 * in the song (it snaps to the bar lines), and its right edge to choose how long
 * they run (the card comes in on a bar line); for story clips, drag the marker to
 * the moment that should hit as the talking ends. Play plays that stretch. Marking
 * the drop yourself, a pin: tap the song where it hits, drag the pin, or tap Drop
 * here as it plays.
 */
export function SongTimeline({ s }: { s: State }) {
  const snd = s.sound!;
  const win = studio.songWindow();
  const story = s.style.format === "story";
  const strip = useRef<HTMLDivElement>(null);
  const grab = useRef(0);
  const [drag, setDrag] = useState<number | null>(null);
  // How long the footage runs before the card while the box's right edge is dragged.
  const [stretch, setStretch] = useState<number | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const raf = useRef(0);
  const [head, setHead] = useState<number | null>(null);
  // The drop pin while it's dragged (song seconds), and where a tap on the song began (x).
  const [pin, setPin] = useState<number | null>(null);
  const tap = useRef<number | null>(null);
  // The edit's stretch close up, and the stretch it shows while the drop is dragged on it.
  const zoom = useRef<HTMLDivElement>(null);
  const held = useRef<[number, number] | null>(null);
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
  // Marking the drop yourself: a pin on the strip, dragged (on the beats), put where the
  // song is tapped, or tapped in while the song plays.
  const marking = !story && s.style.format === "montage" && s.style.dropMode === "marked";
  const mark = marking ? (pin ?? snd.mark ?? null) : null;
  const beatsAll = snd.beats ?? marks;
  const onBeat = (t: number) => {
    const near = beatsAll.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), beatsAll[0] ?? t);
    return Math.abs(near - t) < 0.2 ? near : t;
  };
  const hold = win.end - win.cardAt;
  const lead = stretch ?? win.cardAt - win.start;
  const len = lead + hold;
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
  const inSong = (t: number) => Math.min(D, Math.max(0, t));
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const t = timeAt(e.clientX);
    const inBox = !story && t >= start && t <= start + len;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (marking) {
      // (Marking the drop: a tap on the song puts it there, a drag from the box moves the
      // box, and one from anywhere else slides the drop along.)
      grab.current = t - start;
      tap.current = inBox ? e.clientX : null;
      if (!inBox) setPin(onBeat(inSong(t)));
      return;
    }
    grab.current = inBox ? t - start : Math.min(len, 2);
    place(e.clientX);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    if (pin !== null) setPin(onBeat(inSong(timeAt(e.clientX))));
    else if (tap.current !== null) {
      if (Math.abs(e.clientX - tap.current) < 5) return;
      tap.current = null;
      place(e.clientX);
    } else if (drag !== null) place(e.clientX);
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (pin !== null) {
      studio.setDropMark(pin);
      setPin(null);
      return;
    }
    if (tap.current !== null) {
      tap.current = null;
      studio.setDropMark(inSong(timeAt(e.clientX)));
      return;
    }
    if (drag === null) return;
    // A click that didn't move anything leaves an automatic choice automatic.
    const moved = Math.abs(drag - (story ? (win.payoff ?? 0) : win.start)) > 0.01;
    if (moved || !win.auto) {
      if (story) studio.setPayoff(drag);
      else studio.setSongStart(drag);
    }
    setDrag(null);
  };
  // The box's right edge: how long the edits run, the card coming in on a bar line.
  const lengthAt = (x: number) => Math.min(MAX_LENGTH, Math.max(3, Math.min(snap(timeAt(x) - hold) - start, D - start - hold - 0.2)));
  const grip = (e: PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setStretch(lengthAt(e.clientX));
  };
  const pull = (e: PointerEvent<HTMLSpanElement>) => {
    if (stretch !== null && e.currentTarget.hasPointerCapture(e.pointerId)) setStretch(lengthAt(e.clientX));
  };
  const release = () => {
    if (stretch === null) return;
    // (A click that didn't move it leaves the length as it was.)
    if (Math.abs(stretch - (win.cardAt - win.start)) > 0.05) studio.setLength(stretch);
    setStretch(null);
  };
  const nudge = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    e.stopPropagation();
    const card = win.cardAt;
    const next = e.key === "ArrowRight" ? marks.find((m) => m > card + 0.05) : [...marks].reverse().find((m) => m < card - 0.05);
    if (next !== undefined) studio.setLength(next - start);
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

  const pinDown = (e: PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setPin(onBeat(inSong(timeAt(e.clientX))));
  };
  const pinMove = (e: PointerEvent<HTMLSpanElement>) => {
    if (pin !== null && e.currentTarget.hasPointerCapture(e.pointerId)) setPin(onBeat(inSong(timeAt(e.clientX))));
  };
  const pinUp = (e: PointerEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    if (pin === null) return;
    studio.setDropMark(pin);
    setPin(null);
  };
  const pinKey = (e: KeyboardEvent<HTMLSpanElement>) => {
    if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || mark === null) return;
    e.preventDefault();
    e.stopPropagation();
    const next = e.key === "ArrowRight" ? beatsAll.find((b) => b > mark + 0.05) : [...beatsAll].reverse().find((b) => b < mark - 0.05);
    if (next !== undefined) studio.setDropMark(next);
  };

  // The edit's stretch close up, to put the drop on its beat: every beat and bar line, the
  // part before the drop and the part after it. (Held still while the drop is dragged on it.)
  const [z0, z1] = held.current ?? [win.start, win.end];
  const zp = (t: number) => ((t - z0) / Math.max(0.1, z1 - z0)) * 100;
  const zAt = (x: number) => {
    const r = zoom.current!.getBoundingClientRect();
    return z0 + ((x - r.left) / Math.max(1, r.width)) * (z1 - z0);
  };
  const zDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    held.current = [z0, z1];
    setPin(onBeat(inSong(zAt(e.clientX))));
  };
  const zMove = (e: PointerEvent<HTMLDivElement>) => {
    if (pin !== null && held.current && e.currentTarget.hasPointerCapture(e.pointerId)) setPin(onBeat(inSong(zAt(e.clientX))));
  };
  const zUp = () => {
    held.current = null;
    if (pin === null) return;
    studio.setDropMark(pin);
    setPin(null);
  };
  const zBars = (snd.downbeats ?? []).filter((d) => d >= z0 - 0.1 && d <= z1 + 0.1);
  const footEnd = Math.min(win.cardAt, z1);

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
        aria-valuetext={story ? `The burst hits at ${mmss(payoff ?? 0)}` : `From ${mmss(Math.round(start))} to ${mmss(Math.round(start) + Math.round(len))}`}
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
        {snd.lines?.map((t, i) => (
          <span key={`l${i}`} className="line-mark" style={{ left: `${(t / D) * 100}%` }} title={`A sung line starts at ${mmss(t)}`} />
        ))}
        {story ? (
          <span className="payoff" style={{ left: `${((payoff ?? 0) / D) * 100}%` }} />
        ) : (
          <span className="window" style={{ left: `${(start / D) * 100}%`, width: `${(Math.min(len, D) / D) * 100}%` }}>
            {lead < len - 0.05 && <span className="card-part" style={{ left: `${(lead / len) * 100}%` }} title="The card" />}
            <span
              className="grip"
              role="slider"
              tabIndex={0}
              aria-label="How long the edits run"
              aria-valuemin={3}
              aria-valuemax={Math.round(MAX_LENGTH + hold)}
              aria-valuenow={Math.round(len)}
              aria-valuetext={`${Math.round(len)} seconds`}
              title="Drag to make the edits longer or shorter"
              onPointerDown={grip}
              onPointerMove={pull}
              onPointerUp={release}
              onPointerCancel={release}
              onKeyDown={nudge}
            />
          </span>
        )}
        {mark !== null && <span className="drop-line" style={{ left: `${(mark / D) * 100}%` }} aria-hidden="true" />}
        {mark !== null && (
          <span
            className="drop-pin"
            style={{ left: `${(mark / D) * 100}%` }}
            role="slider"
            tabIndex={0}
            aria-label="Your drop"
            aria-valuemin={0}
            aria-valuemax={Math.round(D)}
            aria-valuenow={Math.round(mark)}
            aria-valuetext={`The drop at ${mmss(Math.round(mark))}`}
            title="Your drop: drag the knob to where the drop hits"
            onPointerDown={pinDown}
            onPointerMove={pinMove}
            onPointerUp={pinUp}
            onPointerCancel={pinUp}
            onKeyDown={pinKey}
          />
        )}
        {head !== null && <span className="head" style={{ left: `${(head / D) * 100}%` }} />}
      </div>
      <div className="timeline-foot">
        <button type="button" className="btn ghost" onClick={play} aria-label={playing ? "Stop" : "Play this part"}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
          {playing ? "Stop" : "Play"}
        </button>
        <span className="num muted">{story ? `The burst hits at ${mmss(payoff ?? 0)}` : `${mmss(Math.round(start))} to ${mmss(Math.round(start) + Math.round(len))} · ${Math.round(len)}s`}</span>
        {!win.auto && (
          <button type="button" className="btn ghost" onClick={() => (story ? studio.setPayoff(null) : studio.setSongStart(null))} title="Let it choose again">
            <RotateCcw size={14} /> Auto
          </button>
        )}
        {marking && playing && (
          <button type="button" className="btn primary small" onClick={() => studio.setDropMark(Math.max(0, (audio.current?.currentTime ?? head ?? 0) - 0.08))} title="Tap as the drop hits">
            Drop here
          </button>
        )}
      </div>
      <span className="hint">
        {story
          ? "Drag the line to the moment that should hit as the talking ends: the burst of shots starts there."
          : `${
              marking && mark !== null
                ? win.auto
                  ? "The box is set round your drop. Drag it to start somewhere else: it keeps the drop in."
                  : "Every edit in the batch starts here, your drop in it. It snaps to the bar lines."
                : win.auto
                  ? s.sound?.fromReel
                    ? "Starts at the Reel's 0:00. Drag the box to start somewhere else in the song."
                    : "It picked the strongest stretch. Drag the box to start somewhere else."
                  : "Every edit in the batch starts here. It snaps to the bar lines."
            } Drag its right edge to make the edits longer or shorter.`}
      </span>
      {!story && s.style.format === "montage" && (
        <div className="field">
          <Switch
            checked={marking}
            onChange={(v) => studio.setDropMode(v ? "marked" : "found")}
            hint={
              !marking
                ? "Off: the edits drop where the song does, as it's found."
                : mark !== null && win.drop === undefined
                  ? `Your drop at ${mmss(Math.round(mark))} is too near the ${mark < D / 2 ? "start" : "end"} of the song for an edit to drop on: move the pin.`
                  : `Your drop${mark !== null ? ` at ${mmss(Math.round(mark))}` : ""}. Put it on its beat on the close-up below (tap or drag; the arrow keys move it a beat), on the song above, or press Play and tap Drop here as it hits. Then tag clips Before or After it under Footage, and give each side a caption under Style.`
            }
          >
            Mark the drop myself
          </Switch>
        </div>
      )}
      {marking && (
        <div className="close-up">
          <div
            ref={zoom}
            className="zoom"
            role="slider"
            tabIndex={0}
            aria-label="Your drop, on the edit's stretch close up"
            aria-valuemin={Math.round(z0)}
            aria-valuemax={Math.round(z1)}
            aria-valuenow={Math.round(mark ?? z0)}
            aria-valuetext={mark !== null ? `The drop at ${mmss(Math.round(mark))}` : "No drop marked"}
            onPointerDown={zDown}
            onPointerMove={zMove}
            onPointerUp={zUp}
            onPointerCancel={zUp}
            onKeyDown={pinKey}
          >
            {mark !== null && mark > z0 && mark < footEnd && (
              <>
                <span className="side before" style={{ width: `${zp(mark)}%` }} />
                <span className="side after" style={{ left: `${zp(mark)}%`, width: `${zp(footEnd) - zp(mark)}%` }} />
              </>
            )}
            <div className="bars" aria-hidden="true">
              {studio.loudnessOver(z0, z1, 120).map((b, i) => (
                <i key={i} style={{ height: `${Math.max(5, b * 100)}%` }} />
              ))}
            </div>
            {beatsAll
              .filter((b) => b >= z0 && b <= z1)
              .map((b) => (
                <span key={b} className={`beat${zBars.some((d) => Math.abs(d - b) < 0.02) ? " bar" : ""}`} style={{ left: `${zp(b)}%` }} />
              ))}
            {snd.drops
              ?.filter((t) => t >= z0 && t <= z1)
              .map((t) => (
                <span key={`d${t}`} className="drop-mark" style={{ left: `${zp(t)}%` }} />
              ))}
            {win.cardAt < z1 - 0.05 && <span className="card-part" style={{ left: `${zp(win.cardAt)}%` }} />}
            {mark !== null && mark >= z0 && mark <= z1 && <span className="drop-line" style={{ left: `${zp(mark)}%` }} aria-hidden="true" />}
            {head !== null && head >= z0 && head <= z1 && <span className="head" style={{ left: `${zp(head)}%` }} />}
          </div>
          <div className="close-up-foot num">
            <span>{mmss(Math.round(z0))}</span>
            {mark !== null && mark > z0 && mark < footEnd && (
              <span>
                <b className="before">{(mark - z0).toFixed(1)}s before the drop</b> · <b className="after">{(footEnd - mark).toFixed(1)}s after</b>
              </span>
            )}
            <span>{mmss(Math.round(z1))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

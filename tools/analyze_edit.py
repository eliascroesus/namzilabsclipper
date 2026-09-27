#!/usr/bin/env python3
"""Break a short-form edit down into the numbers an editor works with.

For one video this writes, into its own folder:

  summary.json   duration, format, every cut, shot lengths, tempo, beats, how
                 tightly the cuts sit on the music, zoom and flash events
  frames.csv     per-frame luma, change from the previous frame, and camera
                 motion (scale, pan, rotation) estimated from tracked points
  timeline.png   onset strength with the beat grid, cuts, motion and luma on
                 one time axis
  sheet-NN.png   contact sheets: a frame every --every seconds, labelled
  shots.png      the first frame of every shot, labelled with its start and length

Usage:
  python3 tools/analyze_edit.py VIDEO [VIDEO ...] --out analysis/ [--every 0.5]

Needs: pip install imageio-ffmpeg librosa soundfile opencv-python-headless
       scenedetect matplotlib
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import subprocess
from pathlib import Path

import cv2
import imageio_ffmpeg
import librosa
import numpy as np

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


# ── audio ────────────────────────────────────────────────────────────────────

def audio_analysis(video: Path, work: Path) -> dict:
    wav = work / "audio.wav"
    subprocess.run(
        [FFMPEG, "-loglevel", "error", "-y", "-i", str(video), "-vn", "-ac", "1", "-ar", "22050", str(wav)],
        check=True,
    )
    y, sr = librosa.load(str(wav), sr=22050)
    hop = 512
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    env_t = librosa.times_like(env, sr=sr, hop_length=hop)
    tempo, beats = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=hop, units="time")
    onsets = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, units="time", backtrack=False)
    onset_strength = np.interp(onsets, env_t, env) if len(onsets) else np.array([])
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    # Strong hits: the top quarter of onsets by strength, a stand-in for kicks, snares and drops.
    strong = onsets[onset_strength >= np.percentile(onset_strength, 75)] if len(onsets) else np.array([])
    return {
        "tempo_bpm": float(np.atleast_1d(tempo)[0]),
        "beats": [round(float(b), 3) for b in beats],
        "onsets": [round(float(o), 3) for o in onsets],
        "strong_onsets": [round(float(o), 3) for o in strong],
        "_env": env, "_env_t": env_t, "_rms": rms,
        "silent": bool(np.max(np.abs(y)) < 1e-3) if len(y) else True,
    }


# ── video: per-frame metrics ─────────────────────────────────────────────────

def frame_metrics(video: Path) -> tuple[list[dict], float, tuple[int, int]]:
    cap = cv2.VideoCapture(str(video))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    small_w = 240
    small_h = max(2, int(round(h * small_w / w)))
    rows, prev = [], None
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        g = cv2.cvtColor(cv2.resize(frame, (small_w, small_h), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
        row = {"frame": i, "t": round(i / fps, 4), "luma": float(g.mean()), "diff": 0.0,
               "scale": math.nan, "tx": math.nan, "ty": math.nan, "rot": math.nan, "tracked": 0}
        if prev is not None:
            row["diff"] = float(np.mean(cv2.absdiff(g, prev)))
            pts = cv2.goodFeaturesToTrack(prev, maxCorners=250, qualityLevel=0.01, minDistance=6)
            if pts is not None and len(pts) >= 12:
                nxt, st, _ = cv2.calcOpticalFlowPyrLK(prev, g, pts, None, winSize=(21, 21), maxLevel=3)
                good0, good1 = pts[st.flatten() == 1], nxt[st.flatten() == 1]
                if len(good0) >= 12:
                    m, inl = cv2.estimateAffinePartial2D(good0, good1, method=cv2.RANSAC, ransacReprojThreshold=2.0)
                    if m is not None and inl is not None and inl.sum() >= 10:
                        a, b = m[0, 0], m[1, 0]
                        row.update(scale=float(math.hypot(a, b)), rot=float(math.degrees(math.atan2(b, a))),
                                   tx=float(m[0, 2] * w / small_w), ty=float(m[1, 2] * h / small_h),
                                   tracked=int(inl.sum()))
        rows.append(row)
        prev = g
        i += 1
    cap.release()
    return rows, fps, (w, h)


def scene_cuts(video: Path) -> list[float]:
    from scenedetect import ContentDetector, detect
    # min_scene_len=2: fast edits hold a shot for as little as 2 to 4 frames, and the
    # default of 15 would merge them into one.
    scenes = detect(str(video), ContentDetector(threshold=27.0, min_scene_len=2))
    return [round(s[0].seconds, 4) for s in scenes[1:]]


# ── derived events ───────────────────────────────────────────────────────────

def nearest(values: np.ndarray, t: float) -> float:
    return float(np.min(np.abs(values - t))) if len(values) else math.inf


def zoom_events(rows: list[dict], cuts: list[float], fps: float) -> list[dict]:
    """Stretches where the frame scales fast: punch-ins and pull-outs, not slow drifts."""
    scale = np.array([r["scale"] for r in rows])
    t = np.array([r["t"] for r in rows])
    logs = np.log(np.where(np.isfinite(scale) & (scale > 0), scale, 1.0))
    cut_frames = {int(round(c * fps)) for c in cuts}
    for cf in cut_frames:  # the frame straddling a cut is not a zoom
        if 0 <= cf < len(logs):
            logs[cf] = 0.0
    events, i = [], 0
    while i < len(logs):
        if abs(logs[i]) > 0.012:  # more than 1.2% scale change in one frame
            j = i
            while j + 1 < len(logs) and abs(logs[j + 1]) > 0.004 and np.sign(logs[j + 1]) == np.sign(logs[i]):
                j += 1
            total = float(np.exp(logs[i:j + 1].sum()) - 1)
            if abs(total) > 0.03:
                events.append({"start": round(float(t[i]), 3), "end": round(float(t[j]), 3),
                               "frames": int(j - i + 1), "scale_change": round(total, 3),
                               "kind": "punch-in" if total > 0 else "pull-out"})
            i = j + 1
        else:
            i += 1
    return events


def flash_events(rows: list[dict]) -> list[dict]:
    luma = np.array([r["luma"] for r in rows])
    t = np.array([r["t"] for r in rows])
    med = np.median(luma)
    out = []
    for i in range(1, len(luma) - 1):
        if luma[i] - max(luma[i - 1], med) > 35 and luma[i] > 170:
            out.append({"t": round(float(t[i]), 3), "kind": "white flash", "luma": round(float(luma[i]), 1)})
        if luma[i] < 12 and luma[i - 1] > 30:
            out.append({"t": round(float(t[i]), 3), "kind": "black frame", "luma": round(float(luma[i]), 1)})
    return out


def sync_stats(cuts: list[float], beats: list[float], onsets: list[float], strong: list[float], fps: float) -> dict:
    b, o, s = np.array(beats), np.array(onsets), np.array(strong)
    frame = 1.0 / fps
    per_cut = []
    for c in cuts:
        per_cut.append({"t": c, "to_beat_ms": round(nearest(b, c) * 1000), "to_onset_ms": round(nearest(o, c) * 1000),
                        "to_strong_ms": round(nearest(s, c) * 1000)})
    def share(key: str, tol: float) -> float:
        return round(sum(1 for p in per_cut if p[key] <= tol * 1000) / len(per_cut), 3) if per_cut else 0.0
    beat_period = float(np.median(np.diff(b))) if len(b) > 1 else math.nan
    gaps_in_beats = []
    for a1, a2 in zip(cuts, cuts[1:]):
        if beat_period and not math.isnan(beat_period):
            gaps_in_beats.append(round((a2 - a1) / beat_period, 2))
    return {
        "within_1_frame": {"beat": share("to_beat_ms", frame * 1.5), "onset": share("to_onset_ms", frame * 1.5),
                           "strong_onset": share("to_strong_ms", frame * 1.5)},
        "within_3_frames": {"beat": share("to_beat_ms", frame * 3), "onset": share("to_onset_ms", frame * 3)},
        "beat_period_s": round(beat_period, 3) if not math.isnan(beat_period) else None,
        "cut_gaps_in_beats": gaps_in_beats,
        "per_cut": per_cut,
    }


# ── pictures ─────────────────────────────────────────────────────────────────

def grab(cap: cv2.VideoCapture, t: float, fps: float):
    cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, int(round(t * fps))))
    ok, frame = cap.read()
    return frame if ok else None


def label(img, text: str):
    cv2.rectangle(img, (0, 0), (img.shape[1], 22), (0, 0, 0), -1)
    cv2.putText(img, text, (5, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    return img


def tile(images: list, cols: int, thumb_w: int):
    if not images:
        return None
    th = images[0].shape[0]
    rows = math.ceil(len(images) / cols)
    sheet = np.full((rows * th, cols * thumb_w, 3), 24, np.uint8)
    for k, im in enumerate(images):
        r, c = divmod(k, cols)
        sheet[r * th:(r + 1) * th, c * thumb_w:(c + 1) * thumb_w] = im
    return sheet


def contact_sheets(video: Path, out: Path, every: float, duration: float, fps: float, w: int, h: int,
                   cuts: list[float]) -> list[str]:
    cap = cv2.VideoCapture(str(video))
    thumb_w = 216 if h > w else 300
    thumb_h = int(round(h * thumb_w / w))
    cols = 6 if h > w else 4
    per_sheet = cols * (4 if h > w else 5)
    times = list(np.arange(0, duration, every))
    written = []
    for n in range(0, len(times), per_sheet):
        ims = []
        for t in times[n:n + per_sheet]:
            f = grab(cap, float(t), fps)
            if f is None:
                continue
            ims.append(label(cv2.resize(f, (thumb_w, thumb_h), interpolation=cv2.INTER_AREA), f"{t:5.2f}s"))
        sheet = tile(ims, cols, thumb_w)
        if sheet is not None:
            p = out / f"sheet-{n // per_sheet + 1:02d}.png"
            cv2.imwrite(str(p), sheet)
            written.append(p.name)
    # One frame per shot, a few frames in so a transition's first frame doesn't hide it.
    starts = [0.0] + cuts
    ends = cuts + [duration]
    ims = []
    for k, (s, e) in enumerate(zip(starts, ends)):
        f = grab(cap, min(e - 0.5 / fps, s + min(0.15, (e - s) / 2)), fps)
        if f is not None:
            ims.append(label(cv2.resize(f, (thumb_w, thumb_h), interpolation=cv2.INTER_AREA),
                             f"#{k + 1} {s:5.2f}s {e - s:4.2f}s"))
    for n in range(0, len(ims), per_sheet):
        sheet = tile(ims[n:n + per_sheet], cols, thumb_w)
        p = out / (f"shots-{n // per_sheet + 1:02d}.png")
        cv2.imwrite(str(p), sheet)
        written.append(p.name)
    cap.release()
    return written


def timeline_png(out: Path, name: str, audio: dict, rows: list[dict], cuts: list[float], zooms: list[dict],
                 duration: float):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    t = np.array([r["t"] for r in rows])
    scale = np.array([r["scale"] for r in rows])
    luma = np.array([r["luma"] for r in rows])
    fig, ax = plt.subplots(3, 1, figsize=(16, 7), sharex=True, gridspec_kw={"height_ratios": [2, 1, 1]})
    ax[0].plot(audio["_env_t"], audio["_env"], lw=0.8, color="#444")
    for b in audio["beats"]:
        ax[0].axvline(b, color="#568CFF", lw=0.8, alpha=0.6)
    for c in cuts:
        for a in ax:
            a.axvline(c, color="#F0553D", lw=1.2, alpha=0.9)
    ax[0].set_title(f"{name}: onset strength, beats (blue) and cuts (red), tempo {audio['tempo_bpm']:.1f} bpm")
    zoom_pct = (np.nan_to_num(scale, nan=1.0) - 1.0) * 100
    ax[1].plot(t, zoom_pct, lw=0.8, color="#0EAB0E")
    for z in zooms:
        ax[1].axvspan(z["start"], z["end"] + 1 / 30, color="#0EAB0E", alpha=0.25)
    ax[1].set_ylabel("scale %/frame")
    ax[2].plot(t, luma, lw=0.8, color="#8176F9")
    ax[2].set_ylabel("luma")
    ax[2].set_xlabel("seconds")
    ax[2].set_xlim(0, duration)
    ax[2].set_xticks(np.arange(0, duration + 0.001, 1.0))
    fig.tight_layout()
    fig.savefig(out / "timeline.png", dpi=90)
    plt.close(fig)


# ── main ─────────────────────────────────────────────────────────────────────

def analyze(video: Path, out_root: Path, every: float) -> dict:
    out = out_root / video.stem
    out.mkdir(parents=True, exist_ok=True)
    rows, fps, (w, h) = frame_metrics(video)
    duration = len(rows) / fps
    cuts = scene_cuts(video)
    audio = audio_analysis(video, out)
    zooms = zoom_events(rows, cuts, fps)
    flashes = flash_events(rows)
    sync = sync_stats(cuts, audio["beats"], audio["onsets"], audio["strong_onsets"], fps)
    shots = np.diff([0.0] + cuts + [duration])
    summary = {
        "file": video.name,
        "duration_s": round(duration, 3),
        "size": [w, h],
        "aspect": f"{w}:{h}",
        "fps": round(fps, 3),
        "shots": len(shots),
        "cuts_per_second": round(len(cuts) / duration, 3) if duration else 0,
        "shot_length_s": {"min": round(float(shots.min()), 3), "median": round(float(np.median(shots)), 3),
                          "mean": round(float(shots.mean()), 3), "max": round(float(shots.max()), 3)},
        "shot_lengths_s": [round(float(s), 3) for s in shots],
        "cuts": cuts,
        "tempo_bpm": round(audio["tempo_bpm"], 1),
        "beats": audio["beats"],
        "strong_onsets": audio["strong_onsets"],
        "sync": sync,
        "zoom_events": zooms,
        "flash_events": flashes,
        "audio_silent": audio["silent"],
    }
    with open(out / "frames.csv", "w", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        wr.writeheader()
        wr.writerows(rows)
    summary["pictures"] = contact_sheets(video, out, every, duration, fps, w, h, cuts)
    timeline_png(out, video.stem[:40], audio, rows, cuts, zooms, duration)
    (out / "summary.json").write_text(json.dumps(summary, indent=2))
    return summary


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("videos", nargs="+", type=Path)
    ap.add_argument("--out", type=Path, default=Path("analysis"))
    ap.add_argument("--every", type=float, default=0.5, help="seconds between contact-sheet frames")
    args = ap.parse_args()
    for v in args.videos:
        s = analyze(v, args.out, args.every)
        print(f"{v.name[:44]:44s} {s['duration_s']:6.2f}s {s['aspect']:9s} shots={s['shots']:3d} "
              f"median={s['shot_length_s']['median']:.2f}s tempo={s['tempo_bpm']:.0f} "
              f"on-beat(±1f)={s['sync']['within_1_frame']['beat']:.0%} on-onset(±1f)={s['sync']['within_1_frame']['onset']:.0%} "
              f"zooms={len(s['zoom_events'])} flashes={len(s['flash_events'])}")


if __name__ == "__main__":
    main()

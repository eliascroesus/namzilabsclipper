#!/usr/bin/env python3
"""Break a short-form edit down into the numbers an editor works with.

For one video this writes, into its own folder:

  summary.json   duration, format, every cut, shot lengths, tempo, beats (librosa's,
                 and the steady grid the app uses when the music keeps one exact
                 tempo, both moved to where the hits start, as the app does), how
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

def _acf(x: np.ndarray) -> np.ndarray:
    x = x - x.mean()
    n = len(x)
    f = np.fft.rfft(x, 2 * n)
    a = np.fft.irfft(f * np.conj(f))[:n]
    return a / (a[0] or 1.0)


def _peak_between(a: np.ndarray, lo: float, hi: float):
    i0, i1 = max(1, math.floor(lo)), min(len(a) - 2, math.ceil(hi))
    if i1 <= i0:
        return None
    i = i0 + int(np.argmax(a[i0:i1 + 1]))
    if (i == i0 and a[i - 1] > a[i]) or (i == i1 and a[i + 1] > a[i]):
        return None  # on the slope up to a peak outside the window
    y0, y1, y2 = a[i - 1], a[i], a[i + 1]
    den = y0 - 2 * y1 + y2
    d = max(-0.5, min(0.5, 0.5 * (y0 - y2) / den)) if den < 0 else 0.0
    return i + d, y1


def _profile(x: np.ndarray, period: float, bins: int = 64, a: int = 0, b: int | None = None) -> np.ndarray:
    b = len(x) if b is None else b
    i = np.arange(a, b)
    idx = np.minimum(bins - 1, ((i % period) / period * bins).astype(int))
    p = np.bincount(idx, weights=x[a:b], minlength=bins) / np.maximum(1, np.bincount(idx, minlength=bins))
    return (np.roll(p, 1) + 2 * p + np.roll(p, -1)) / 4


def _z(p: np.ndarray) -> np.ndarray:
    return (p - p.mean()) / (p.std() or 1.0)


def _pull(low: np.ndarray, mid: np.ndarray, period: float, phase: float, a: int, b: int) -> tuple[float, float]:
    i = np.arange(a, b)
    v = low[a:b] + mid[a:b]
    z = np.sum(v * np.exp(1j * 4 * np.pi * (i - phase) / period))
    w = v.sum()
    return (abs(z) / w if w > 0 else 0.0), float(np.angle(z) / (2 * np.pi))


def _weight(low: np.ndarray, mid: np.ndarray, period: float, phase: float) -> float:
    ml, mm = low.mean() or 1.0, mid.mean() or 1.0
    vals = []
    f = phase
    while f < len(low):
        c = int(round(f))
        vals.append(low[max(0, c - 1):c + 4].max() / ml + mid[max(0, c - 1):c + 3].max() / mm)
        f += period
    return float(np.mean(vals)) if vals else 0.0


def _grid_at(env: np.ndarray, low: np.ndarray, mid: np.ndarray, rough: float):
    a = _acf(env)
    period, lags, k = rough, [], 1
    while k * period < len(a) * 0.45:
        w = 0.04 * period + 1 if k == 1 else 0.1 * period
        p = _peak_between(a, k * period - w, k * period + w)
        if p is None:
            break
        period = p[0] / k
        lags.append((k, period, p[1]))
        k *= 2
    long = [l for l in lags if l[0] >= 4]
    if len(long) < 2:
        return None
    if max(abs(l[1] - period) / period for l in long) > 0.0035 or np.mean([l[2] for l in long]) < 0.12:
        return None
    bins, half = 64, 32
    score = _z(_profile(low, period)) + _z(_profile(mid, period)) + 0.5 * _z(_profile(env, period))
    folded = score[:half] + score[half:]
    j = int(np.argmax(folded))
    y0, y1, y2 = folded[j - 1], folded[j], folded[(j + 1) % half]
    den = y0 - 2 * y1 + y2
    d = max(-0.5, min(0.5, 0.5 * (y0 - y2) / den)) if den < 0 else 0.0
    at = ((j + 0.5 + d) / bins * period + period) % (period / 2)
    phase = at if _weight(low, mid, period, at) >= _weight(low, mid, period, at + period / 2) else at + period / 2
    r, off = _pull(low, mid, period, phase, 0, len(env))
    if r < 0.05:
        return None
    span = int(round(16 * period))
    level = (low + mid).mean()
    checked = held = 0
    for s0 in range(0, len(env) - span + 1, span):
        if (low[s0:s0 + span] + mid[s0:s0 + span]).mean() < 0.5 * level:
            continue
        rr, oo = _pull(low, mid, period, phase, s0, s0 + span)
        checked += 1
        if rr >= 0.4 * r and abs((oo - off + 1.5) % 1 - 0.5) <= 0.2:
            held += 1
    if checked >= 3 and held < checked * 0.7:
        return None
    return period, phase


def steady_grid(y: np.ndarray, sr: int, hop: int, env: np.ndarray, tracker_bpm: float):
    """The song's beat grid as the app finds it (app/src/engine/audio/grid.ts): the
    exact tempo from where the onset envelope repeats 4, 8, 16... beats later, the beat
    on the kick and snare rather than the hats. (period s, first beat s) or None when
    the music doesn't keep one steady tempo."""
    mdb = librosa.power_to_db(librosa.feature.melspectrogram(y=y, sr=sr, n_fft=2048, hop_length=hop, n_mels=128))
    centres = librosa.mel_frequencies(n_mels=130, fmax=sr / 2)[1:-1]
    k_hi = max(2, int(np.sum(centres < 150)))
    m_lo = int(np.sum(centres < 200))
    m_hi = max(m_lo + 2, int(np.sum(centres < 2000)))
    low = librosa.onset.onset_strength(S=mdb[:k_hi], sr=sr)
    mid = librosa.onset.onset_strength(S=mdb[m_lo:m_hi], sr=sr)
    fps = sr / hop
    drum_bpm = float(np.atleast_1d(librosa.feature.tempo(onset_envelope=low + mid, sr=sr, hop_length=hop))[0])
    bpm = lambda p: 60 * fps / p
    beat_like = lambda p: p > 2 and 60 <= bpm(p) <= 200 and len(env) >= p * 12
    guesses = [60 * fps / tracker_bpm, 60 * fps / drum_bpm]
    levels = sorted((p * m for p in guesses for m in (2 / 3, 3 / 2, 1 / 2, 2)), key=lambda p: abs(math.log2(bpm(p) / 120)))
    tried: list[float] = []
    for p in guesses + levels:
        if not beat_like(p) or any(abs(q - p) < 0.02 * p for q in tried):
            continue
        tried.append(p)
        g = _grid_at(env, low, mid, p)
        if g:
            return float(g[0]) / fps, float(g[1]) / fps
    return None


def hf_flux(y: np.ndarray, sr: int, n: int = 256, hop: int = 64) -> tuple[np.ndarray, np.ndarray]:
    """How much the spectrum above 1 kHz rises from one 3 ms step to the next (the
    app's audio/attacks.ts): (times of the steps' window centres, flux)."""
    mag = np.log1p(100 * np.abs(librosa.stft(y, n_fft=n, hop_length=hop, window="hann", center=True)))
    k0 = int(round(1000 * n / sr))
    d = np.maximum(0, np.diff(mag[k0:n // 2], axis=1)).mean(axis=0)
    d = np.concatenate([[0.0], d])
    return np.arange(len(d)) * hop / sr, d


def hit_start(t: np.ndarray, d: np.ndarray, a: float, b: float):
    """The strongest hit in [a, b) seconds traced back to where it starts: (time, strength) or None."""
    lo, hi = np.searchsorted(t, a), np.searchsorted(t, b)
    if hi <= lo:
        return None
    best = lo + int(np.argmax(d[lo:hi]))
    f = best
    while f > 1 and d[f - 1] > 0.33 * d[best]:
        f -= 1
    around = d[max(0, np.searchsorted(t, a - 0.03)):hi]
    if d[best] < 2 * float(np.median(around)) + 1e-4:
        return None
    return float(t[f]), float(d[best])


def grid_shift(t: np.ndarray, d: np.ndarray, beats: np.ndarray, onsets: np.ndarray) -> float:
    """How far the hits start from the beats the onset envelope gives (the app's
    beatShift): measured on the beats when most carry a clear hit, otherwise through
    every onset; 30 ms late when there's nothing to go on."""
    def gaps(times, most):
        step = max(1, len(times) // most)
        out = []
        for x in times[::step]:
            h = hit_start(t, d, x - 0.12, x + 0.04)
            if h:
                out.append((h[0] - x, h[1]))
        return out

    def clear_median(found):
        strong = sorted(found, key=lambda g: -g[1])[:max(8, math.ceil(len(found) / 2))]
        return float(sorted(g for g, _ in strong)[len(strong) // 2])

    bounded = lambda x: min(0.05, max(-0.12, x))
    if len(beats) < 8:
        return 0.0
    on_beats = gaps(beats, 240)
    if len(on_beats) >= 24:
        return bounded(clear_median(on_beats))
    lag = gaps(onsets, 400)
    near = []
    for b in beats:
        if len(onsets):
            k = int(np.argmin(np.abs(onsets - b)))
            if abs(onsets[k] - b) < 0.035:
                near.append(onsets[k] - b)
    if len(lag) >= 8 and len(near) >= 8:
        return bounded(clear_median(lag) + float(sorted(near)[len(near) // 2]))
    if len(on_beats) >= 8:
        return bounded(clear_median(on_beats))
    return -0.03


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
    grid = steady_grid(y, sr, hop, env, float(np.atleast_1d(tempo)[0])) if len(beats) >= 8 else None
    onsets = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, units="time", backtrack=False)
    onset_strength = np.interp(onsets, env_t, env) if len(onsets) else np.array([])
    # The envelope places every beat and onset some way into its hit; move them all to
    # where the hits start, as the app does, so "on the beat" means on the attack.
    ft, fd = hf_flux(y, sr)
    heard = np.arange(grid[1], len(y) / sr, grid[0]) if grid else np.asarray(beats, float)
    shift = grid_shift(ft, fd, heard, np.asarray(onsets, float))
    beats = np.asarray(beats, float) + shift
    if grid:
        grid = (grid[0], grid[1] + shift)
    starts = []
    for o in onsets:
        h = hit_start(ft, fd, o + shift - 0.035, o + shift + 0.035)
        starts.append(h[0] if h else o + shift)
    onsets = np.asarray(starts, float)
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    # Strong hits: the top quarter of onsets by strength, a stand-in for kicks, snares and drops.
    strong = onsets[onset_strength >= np.percentile(onset_strength, 75)] if len(onsets) else np.array([])
    return {
        "tempo_bpm": float(np.atleast_1d(tempo)[0]),
        "beats": [round(float(b), 3) for b in beats],
        "grid": {"bpm": round(60 / grid[0], 3), "period_s": round(grid[0], 5), "first_beat_s": round(grid[1], 4)} if grid else None,
        "hit_shift_ms": round(shift * 1000, 1),
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


def sync_stats(cuts: list[float], beats: list[float], onsets: list[float], strong: list[float], fps: float,
               grid: dict | None = None) -> dict:
    b, o, s = np.array(beats), np.array(onsets), np.array(strong)
    frame = 1.0 / fps
    per_cut = []
    # (A silent soundtrack has no beats or onsets: nothing is near.)
    ms = lambda values, c: round(nearest(values, c) * 1000) if len(values) else math.inf
    for c in cuts:
        per_cut.append({"t": c, "to_beat_ms": ms(b, c), "to_onset_ms": ms(o, c), "to_strong_ms": ms(s, c)})
        if grid:
            # Signed: below zero, the cut comes before the beat (as editors cut).
            T = grid["period_s"]
            per_cut[-1]["to_grid_ms"] = round((((c - grid["first_beat_s"]) + T / 2) % T - T / 2) * 1000)
    def share(key: str, tol: float) -> float:
        return round(sum(1 for p in per_cut if p[key] <= tol * 1000) / len(per_cut), 3) if per_cut else 0.0
    beat_period = float(np.median(np.diff(b))) if len(b) > 1 else math.nan
    gaps_in_beats = []
    for a1, a2 in zip(cuts, cuts[1:]):
        if beat_period and not math.isnan(beat_period):
            gaps_in_beats.append(round((a2 - a1) / beat_period, 2))
    on_grid = None
    if grid and per_cut:
        g = np.array([p["to_grid_ms"] for p in per_cut], float)
        T = grid["period_s"] * 1000
        on = np.abs(g) < T / 4
        on_grid = {"bpm": grid["bpm"], "within_1_frame": round(float(np.mean(np.abs(g) <= frame * 1500)), 3),
                   "within_3_frames": round(float(np.mean(np.abs(g) <= frame * 3000)), 3),
                   "lead_ms": round(float(np.median(g[on]))) if on.any() else None,
                   "on_the_and": int(np.sum(~on))}
    return {
        "grid": on_grid,
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
    grid = audio.get("grid")
    beats = np.arange(grid["first_beat_s"], duration, grid["period_s"]) if grid else audio["beats"]
    for b in beats:
        ax[0].axvline(b, color="#568CFF", lw=0.8, alpha=0.6)
    for c in cuts:
        for a in ax:
            a.axvline(c, color="#F0553D", lw=1.2, alpha=0.9)
    tempo = f"steady grid at {grid['bpm']:.2f} bpm" if grid else f"tempo {audio['tempo_bpm']:.1f} bpm"
    ax[0].set_title(f"{name}: onset strength, beats (blue) and cuts (red), {tempo}")
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
    sync = sync_stats(cuts, audio["beats"], audio["onsets"], audio["strong_onsets"], fps, audio["grid"])
    sync["hit_shift_ms"] = audio["hit_shift_ms"]
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
        "grid": audio["grid"],
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
        g = s["sync"]["grid"]
        if g:
            print(f"{'':44s} steady grid {g['bpm']:.2f} bpm, on the hits ({-s['sync']['hit_shift_ms']:.0f} ms ahead of the envelope): "
                  f"cuts within 1.5 frames of a beat {g['within_1_frame']:.0%}, "
                  f"within 3 {g['within_3_frames']:.0%}, leading it by {-(g['lead_ms'] or 0)} ms (median), "
                  f"{g['on_the_and']} on an \"and\"")


if __name__ == "__main__":
    main()

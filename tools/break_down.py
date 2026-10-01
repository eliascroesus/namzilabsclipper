#!/usr/bin/env python3
"""Take an edit apart frame by frame: every cut and what kind of cut it is, every
effect laid over the footage, every card or picture laid over it, every caption with
its size, place and look, and where it all sits against the music.

For each video this writes, into its own folder under --out:

  breakdown.json   the edit's numbers: per cut, its kind (hard cut, flash, dip, zoom
                   in or out, whip or slide and which way, spin, blur, glitch, dissolve,
                   shake after) with its measurements; effects inside shots (punch-ins,
                   shakes, flashes, black and white, freezes, speed ramps, colour
                   splits, letterbox); cards and pictures over the footage (where, how
                   big, turned, how they come in); captions (text, box, height in
                   pixels, colour, outline or box, when); and the music under each cut
  events.md        the same as a readable timeline
  frames.csv       per frame: brightness, saturation, sharpness, change, camera motion
                   (scale, rotation, pan), optical flow, colour split, black bars
  strips/          for every cut and every effect, the frames around it side by side,
                   labelled with what was measured (cuts-NN.png: ten cuts to a sheet)
  text/            each caption's first frame, cut out and enlarged, for its font

It builds on analyze_edit.py (the cuts, the beat grid, the camera motion) and runs
RapidOCR (pip install rapidocr-onnxruntime) for the text.

Usage:
  python3 tools/break_down.py VIDEO [VIDEO ...] --out breakdown/
"""
from __future__ import annotations

import argparse
import csv
import difflib
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from analyze_edit import audio_analysis, scene_cuts, zoom_events  # noqa: E402

SMALL_W = 320
FLOW_W = 160


# ── per frame ────────────────────────────────────────────────────────────────

def _bars(g: np.ndarray) -> tuple[float, float, float, float]:
    """Black bars: how much of the frame's top, bottom, left and right is near black, as shares of it."""
    h, w = g.shape
    rows = g.mean(axis=1)
    cols = g.mean(axis=0)
    def run(v: np.ndarray) -> int:
        n = 0
        for x in v:
            if x < 16:
                n += 1
            else:
                break
        return n
    return run(rows) / h, run(rows[::-1]) / h, run(cols) / w, run(cols[::-1]) / w


def _shift(a: np.ndarray, b: np.ndarray) -> tuple[float, float, float]:
    """How far b sits from a (phase correlation on their edges): dx, dy, how sure."""
    hp = lambda x: x - cv2.GaussianBlur(x, (0, 0), 3)
    (dx, dy), resp = cv2.phaseCorrelate(hp(a.astype(np.float32)), hp(b.astype(np.float32)))
    return float(dx), float(dy), float(resp)


def _tear(g: np.ndarray) -> int:
    """A glitch's tears: rows where the picture breaks off clean right across the frame
    (a band shifted sideways, a block of noise), which footage itself almost never has."""
    d = np.abs(np.diff(g.astype(np.int16), axis=0)) > 40
    return int(np.sum(d.mean(axis=1) > 0.55))


def frames(video: Path) -> tuple[list[dict], float, tuple[int, int]]:
    cap = cv2.VideoCapture(str(video))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    sh = max(2, int(round(H * SMALL_W / W)))
    fh = max(2, int(round(H * FLOW_W / W)))
    rows: list[dict] = []
    prev = prev_flow = None
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        small = cv2.resize(frame, (SMALL_W, sh), interpolation=cv2.INTER_AREA)
        g = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
        lit = hsv[..., 2] > 40
        b, gg, r = (small[..., k].astype(np.float32) for k in range(3))
        top, bottom, left, right = _bars(g)
        row = {
            "frame": i, "t": round(i / fps, 4),
            "luma": round(float(g.mean()), 2),
            "sat": round(float(hsv[..., 1][lit].mean() / 255) if lit.any() else 0.0, 4),
            "r": round(float(r.mean()), 1), "g": round(float(gg.mean()), 1), "b": round(float(b.mean()), 1),
            "sharp": round(float(cv2.Laplacian(g, cv2.CV_32F).var()), 1),
            "diff": 0.0, "scale": math.nan, "rot": math.nan, "tx": math.nan, "ty": math.nan, "tracked": 0,
            "flow": 0.0, "flow_dx": 0.0, "flow_dy": 0.0, "flow_rest": 0.0,
            "split": 0.0, "tear": 0.0,
            "bar_top": round(top, 3), "bar_bottom": round(bottom, 3), "bar_left": round(left, 3), "bar_right": round(right, 3),
        }
        row["tear"] = _tear(g)
        # The red and blue drawn apart (a colour split): where blue sits against red.
        dx, dy, resp = _shift(r, b)
        if resp > 0.05:
            row["split"] = round(math.hypot(dx, dy) * W / SMALL_W, 2)
        f = cv2.resize(g, (FLOW_W, fh), interpolation=cv2.INTER_AREA)
        if prev is not None:
            row["diff"] = round(float(np.mean(cv2.absdiff(g, prev))), 2)
            pts = cv2.goodFeaturesToTrack(prev, maxCorners=250, qualityLevel=0.01, minDistance=6)
            if pts is not None and len(pts) >= 12:
                nxt, st, _ = cv2.calcOpticalFlowPyrLK(prev, g, pts, None, winSize=(21, 21), maxLevel=3)
                good0, good1 = pts[st.flatten() == 1], nxt[st.flatten() == 1]
                if len(good0) >= 12:
                    m, inl = cv2.estimateAffinePartial2D(good0, good1, method=cv2.RANSAC, ransacReprojThreshold=2.0)
                    if m is not None and inl is not None and inl.sum() >= 10:
                        a, c = m[0, 0], m[1, 0]
                        row.update(scale=round(float(math.hypot(a, c)), 5), rot=round(float(math.degrees(math.atan2(c, a))), 3),
                                   tx=round(float(m[0, 2] * W / SMALL_W), 2), ty=round(float(m[1, 2] * H / sh), 2), tracked=int(inl.sum()))
            fl = cv2.calcOpticalFlowFarneback(prev_flow, f, None, 0.5, 3, 15, 3, 5, 1.2, 0)
            k = W / FLOW_W
            mag = np.hypot(fl[..., 0], fl[..., 1])
            mdx, mdy = float(np.median(fl[..., 0])), float(np.median(fl[..., 1]))
            row["flow"] = round(float(mag.mean()) * k, 2)
            row["flow_dx"] = round(mdx * k, 2)
            row["flow_dy"] = round(mdy * k, 2)
            row["flow_rest"] = round(float(np.hypot(fl[..., 0] - mdx, fl[..., 1] - mdy).mean()) * k, 2)
        rows.append(row)
        prev, prev_flow = g, f
        i += 1
    cap.release()
    return rows, fps, (W, H)


# ── cards and pictures laid over the footage ─────────────────────────────────

def cards_in(frame: np.ndarray) -> list[dict]:
    """Rectangles with hard edges standing out from what's around them: a card, a picture
    or a window laid over the footage. Centre, size (shares of the frame), angle."""
    h, w = frame.shape[:2]
    g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(cv2.GaussianBlur(g, (3, 3), 0), 40, 120)
    edges = cv2.dilate(edges, np.ones((2, 2), np.uint8))
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < 0.02 * w * h or area > 0.92 * w * h:
            continue
        approx = cv2.approxPolyDP(c, 0.02 * cv2.arcLength(c, True), True)
        if len(approx) != 4 or not cv2.isContourConvex(approx):
            continue
        rect = cv2.minAreaRect(approx)
        (cx, cy), (rw, rh), ang = rect
        if rw * rh <= 0 or area / (rw * rh) < 0.85:
            continue
        # Inside against outside, just across its edge: a card stands out from what's under it.
        mask = np.zeros((h, w), np.uint8)
        cv2.drawContours(mask, [approx], -1, 255, -1)
        ring_out = cv2.dilate(mask, np.ones((9, 9), np.uint8)) - mask
        ring_in = mask - cv2.erode(mask, np.ones((9, 9), np.uint8))
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB).astype(np.float32)
        contrast = float(np.linalg.norm(lab[ring_in > 0].mean(axis=0) - lab[ring_out > 0].mean(axis=0))) if (ring_out > 0).any() and (ring_in > 0).any() else 0.0
        if contrast < 12:
            continue
        a = ang if rw >= rh else ang - 90
        a = ((a + 45) % 90) - 45
        out.append({"cx": round(cx / w, 3), "cy": round(cy / h, 3), "w": round(max(rw, rh) / w if rw >= rh else rw / w, 3),
                    "h": round(rh / h if rw >= rh else max(rw, rh) / h, 3), "angle": round(float(a), 1), "contrast": round(contrast, 1)})
    # Duplicates (the inner and outer edge of one card): keep the bigger.
    out.sort(key=lambda r: -r["w"] * r["h"])
    kept: list[dict] = []
    for r in out:
        if all(abs(r["cx"] - k["cx"]) > 0.03 or abs(r["cy"] - k["cy"]) > 0.03 for k in kept):
            kept.append(r)
    return kept[:4]


def card_runs(video: Path, fps: float, n: int, cuts_f: set[int]) -> list[dict]:
    """Cards followed through the frames: when each shows, where it goes, how it came in."""
    cap = cv2.VideoCapture(str(video))
    runs: list[dict] = []
    live: list[dict] = []
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        small = cv2.resize(frame, (SMALL_W, int(round(frame.shape[0] * SMALL_W / frame.shape[1]))), interpolation=cv2.INTER_AREA)
        found = cards_in(small)
        nxt = []
        for c in found:
            best = None
            for r in live:
                last = r["path"][-1]
                if abs(last["cx"] - c["cx"]) < 0.12 and abs(last["cy"] - c["cy"]) < 0.12 and abs(last["w"] - c["w"]) < 0.15:
                    best = r
                    break
            if best is not None:
                best["path"].append({"f": i, **c})
                live.remove(best)
                nxt.append(best)
            else:
                nxt.append({"start_f": i, "path": [{"f": i, **c}]})
        for r in live:
            if i - r["path"][-1]["f"] > 2:
                runs.append(r)
            else:
                nxt.append(r)
        live = nxt
        i += 1
    runs.extend(live)
    cap.release()
    out = []
    for r in runs:
        p = r["path"]
        if len(p) < 4:
            continue
        s, e = p[0], p[-1]
        moved = math.hypot(e["cx"] - s["cx"], e["cy"] - s["cy"])
        grew = (e["w"] * e["h"]) / max(1e-6, s["w"] * s["h"])
        came = "slid in" if moved > 0.08 else "grew in" if grew > 1.3 else "shrank" if grew < 0.75 else "cut in"
        out.append({"start": round(p[0]["f"] / fps, 3), "end": round(p[-1]["f"] / fps, 3), "frames": len(p),
                    "at_cut": any(abs(p[0]["f"] - c) <= 1 for c in cuts_f), "came": came,
                    "first": {k: s[k] for k in ("cx", "cy", "w", "h", "angle")}, "last": {k: e[k] for k in ("cx", "cy", "w", "h", "angle")},
                    "contrast": round(float(np.median([q["contrast"] for q in p])), 1)})
    return out


# ── text ─────────────────────────────────────────────────────────────────────

def captions(video: Path, fps: float, n: int, W: int, H: int, out: Path, every: int = 3) -> list[dict]:
    """The text on screen, read every `every` frames, joined into runs of one caption:
    its words, box, letter height in pixels, colours, and its first frame cut out."""
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError:
        return []
    ocr = RapidOCR()
    cap = cv2.VideoCapture(str(video))
    seen: list[dict] = []
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if i % every == 0:
            res, _ = ocr(frame)
            for box, text, score in res or []:
                if float(score) < 0.6 or len(text.strip()) < 2:
                    continue
                q = np.array(box, np.float32)
                x0, y0 = q.min(axis=0)
                x1, y1 = q.max(axis=0)
                seen.append({"f": i, "text": text.strip(), "box": [float(x0), float(y0), float(x1), float(y1)], "score": float(score)})
        i += 1
    # Runs: the same words in about the same place on frames close together.
    runs: list[dict] = []
    for s in sorted(seen, key=lambda s: s["f"]):
        for r in runs:
            b, rb = s["box"], r["box"]
            near = abs((b[1] + b[3]) / 2 - (rb[1] + rb[3]) / 2) < 0.04 * H and abs((b[0] + b[2]) / 2 - (rb[0] + rb[2]) / 2) < 0.15 * W
            same = difflib.SequenceMatcher(None, s["text"].lower(), r["text"].lower()).ratio() > 0.75
            if near and same and s["f"] - r["last_f"] <= 3 * every:
                r["last_f"] = s["f"]
                if len(s["text"]) > len(r["text"]):
                    r["text"] = s["text"]
                r["box"] = [min(r["box"][0], b[0]), min(r["box"][1], b[1]), max(r["box"][2], b[2]), max(r["box"][3], b[3])]
                r["n"] += 1
                break
        else:
            runs.append({"first_f": s["f"], "last_f": s["f"], "text": s["text"], "box": list(s["box"]), "n": 1})
    out_runs = []
    cap.release()
    firsts = thumbs(video, {r["first_f"] + every for r in runs if r["n"] >= 2}, W, H, W)
    tdir = out / "text"
    tdir.mkdir(exist_ok=True)
    for k, r in enumerate(runs):
        if r["n"] < 2:
            continue
        x0, y0, x1, y1 = r["box"]
        frame = firsts.get(r["first_f"] + every)
        ok = frame is not None
        info = {"text": r["text"], "start": round(r["first_f"] / fps, 3), "end": round((r["last_f"] + every) / fps, 3),
                "box": [round(x0 / W, 3), round(y0 / H, 3), round(x1 / W, 3), round(y1 / H, 3)],
                "height_px": round(y1 - y0, 1), "height_share": round((y1 - y0) / min(W, H), 4)}
        if ok:
            pad = int(0.4 * (y1 - y0))
            crop = frame[max(0, int(y0) - pad):min(H, int(y1) + pad), max(0, int(x0) - pad):min(W, int(x1) + pad)]
            if crop.size:
                g = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
                # The letters: the brightest or darkest tenth, whichever stands apart from the rest.
                hi, lo = np.percentile(g, 92), np.percentile(g, 8)
                med = np.median(g)
                letters = g >= hi if hi - med > med - lo else g <= lo
                col = crop[letters].mean(axis=0) if letters.any() else crop.reshape(-1, 3).mean(axis=0)
                rest = crop[~letters].mean(axis=0) if (~letters).any() else col
                info["colour"] = "#%02x%02x%02x" % (int(col[2]), int(col[1]), int(col[0]))
                info["around"] = "#%02x%02x%02x" % (int(rest[2]), int(rest[1]), int(rest[0]))
                # A box behind it: the area round the letters flat and far from the picture's own.
                ring = cv2.dilate(letters.astype(np.uint8), np.ones((7, 7), np.uint8)) - letters.astype(np.uint8)
                info["flat_behind"] = bool(ring.any() and float(g[ring > 0].std()) < 12)
                big = cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
                name = f"text-{k:02d}.png"
                cv2.imwrite(str(tdir / name), big)
                info["crop"] = f"text/{name}"
        out_runs.append(info)
    return out_runs


# ── cuts and effects ─────────────────────────────────────────────────────────

def _arr(rows: list[dict], key: str) -> np.ndarray:
    return np.array([r[key] for r in rows], float)


def classify_cut(rows: list[dict], f: int, fps: float, W: int, H: int) -> dict:
    """What happens around the cut at frame f: its kind and the numbers behind it."""
    n = len(rows)
    lo, hi = max(1, f - 6), min(n - 1, f + 7)
    luma, sharp, diff = _arr(rows, "luma"), _arr(rows, "sharp"), _arr(rows, "diff")
    scale = np.nan_to_num(_arr(rows, "scale"), nan=1.0)
    rot = np.nan_to_num(_arr(rows, "rot"), nan=0.0)
    flow_dx, flow_dy, flow = _arr(rows, "flow_dx"), _arr(rows, "flow_dy"), _arr(rows, "flow")
    split, tear = _arr(rows, "split"), _arr(rows, "tear")
    kinds: list[str] = []
    info: dict = {"t": rows[f]["t"], "frame": f}
    # Sharpness against each side's own (a few frames away from the cut).
    before = np.median(sharp[max(0, f - 14):max(1, f - 6)]) if f > 7 else np.median(sharp[:max(1, f)])
    after = np.median(sharp[min(n - 1, f + 6):min(n, f + 14)]) if f + 7 < n else np.median(sharp[f:])
    ref = max(1.0, min(before, after))
    dip = float(np.min(sharp[lo:hi]) / ref)
    info["sharp_min_ratio"] = round(dip, 2)
    # Brightness: a flash (to white) or a dip (to black) across the cut.
    base = float(np.median(np.concatenate([luma[max(0, f - 14):max(1, f - 6)], luma[min(n - 1, f + 6):min(n, f + 14)]]))) if n > 20 else float(np.median(luma))
    peak, low = float(np.max(luma[lo:hi])), float(np.min(luma[lo:hi]))
    if peak > 175 and peak - base > 45:
        k = lo + int(np.argmax(luma[lo:hi]))
        span = int(np.sum(luma[lo:hi] > base + 0.5 * (peak - base)))
        kinds.append("flash")
        info["flash"] = {"peak_luma": round(peak, 1), "at_frame": k - f, "frames": span}
    if low < 14 and base > 35:
        k = lo + int(np.argmin(luma[lo:hi]))
        kinds.append("dip to black")
        info["dip"] = {"min_luma": round(low, 1), "at_frame": k - f, "frames": int(np.sum(luma[lo:hi] < 0.4 * base))}
    # Zoom into the cut, and the next shot landing zoomed and settling.
    pre = float(np.sum(np.log(scale[max(1, f - 4):f])))
    post = float(np.sum(np.log(scale[f + 1:min(n, f + 7)])))
    info["zoom_pre"] = round(math.exp(pre) - 1, 3)
    info["zoom_post"] = round(math.exp(post) - 1, 3)
    if pre > 0.05:
        kinds.append("zoom in to the cut")
    if post < -0.05:
        kinds.append("lands zoomed in, settles")
    if pre < -0.05:
        kinds.append("pulls out to the cut")
    if post > 0.05:
        kinds.append("lands pulled out, pushes in")
    # A whip or slide: fast movement across the cut, smeared.
    mx = float(np.max(np.abs(flow_dx[lo:hi])) / W)
    my = float(np.max(np.abs(flow_dy[lo:hi])) / H)
    info["pan_max_share"] = round(max(mx, my), 3)
    if max(mx, my) > 0.04 and dip < 0.6:
        k = lo + int(np.argmax(np.abs(flow_dx[lo:hi]) / W + np.abs(flow_dy[lo:hi]) / H))
        dxs, dys = flow_dx[k], flow_dy[k]
        way = ("left" if dxs < 0 else "right") if abs(dxs) / W >= abs(dys) / H else ("up" if dys < 0 else "down")
        kinds.append(f"whip/slide {way}")
    rmax = float(np.max(np.abs(rot[lo:hi])))
    info["rot_max_deg"] = round(rmax, 2)
    if rmax > 2.5:
        kinds.append("spin/turn")
    if dip < 0.35 and "flash" not in kinds and not any(k.startswith("whip") for k in kinds) and max(abs(pre), abs(post)) < 0.05:
        kinds.append("blur")
    # A colour split (red and blue drawn apart) or a glitch's tears, on the frames either side.
    sp = float(np.max(split[lo:hi]))
    te = float(np.max(tear[lo:hi]))
    base_tear = float(np.median(tear[max(0, f - 20):min(n, f + 20)]))
    if sp > 3 or te >= max(3, 3 * base_tear + 2):
        kinds.append("colour split" if sp > 3 and te < 3 else "glitch")
        info["split_px"] = round(sp, 1)
        info["tear_rows"] = int(te)
    # Shaking after it: the picture knocked one way then the other, frame after frame.
    tx = np.nan_to_num(_arr(rows, "tx"))[f + 1:min(n, f + 10)]
    ty = np.nan_to_num(_arr(rows, "ty"))[f + 1:min(n, f + 10)]
    tr = _arr(rows, "tracked")[f + 1:min(n, f + 10)]
    if len(tx) >= 6 and np.median(tr) >= 30:
        jolt = np.hypot(tx, ty) / W
        alt = int(np.sum((np.sign(tx[1:]) != np.sign(tx[:-1])) & (np.abs(tx[1:]) / W > 0.004)))
        if alt >= 3 and 0.005 < float(np.max(jolt)) < 0.08:
            kinds.append("shake after")
            info["shake"] = {"amp_share": round(float(np.max(jolt)), 3), "alternations": alt}
    info["kind"] = kinds or ["hard cut"]
    return info


def dissolve_frames(video: Path, rows: list[dict], cut_info: list[dict]) -> None:
    """A dissolve, tested: the frames across the cut are mixes of the shot before and the
    shot after (each nearer a blend of the two than either one). Marks the cut and how
    many frames it takes."""
    wanted = {k for c in cut_info for k in range(c["frame"] - 6, c["frame"] + 7)}
    cache = thumbs(video, wanted, 96, 96, 96)
    def gray(k: int):
        fr = cache.get(k)
        return cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY).astype(np.float32) if fr is not None else None
    for c in cut_info:
        f = c["frame"]
        if f < 7 or f + 7 >= len(rows):
            continue
        A, B = gray(f - 6), gray(f + 6)
        if A is None or B is None or float(np.mean(np.abs(A - B))) < 12:
            continue
        mixed = 0
        alphas = []
        for k in range(f - 4, f + 5):
            X = gray(k)
            if X is None:
                continue
            d = (A - B).ravel()
            a = float(np.clip(np.dot((X - B).ravel(), d) / max(1e-6, np.dot(d, d)), 0, 1))
            blend = a * A + (1 - a) * B
            err = float(np.mean(np.abs(X - blend)))
            ends = min(float(np.mean(np.abs(X - A))), float(np.mean(np.abs(X - B))))
            if 0.15 < a < 0.85 and err < 0.6 * ends:
                mixed += 1
                alphas.append(round(a, 2))
        if mixed >= 2:
            c["kind"] = [k for k in c["kind"] if k != "hard cut"] + [f"dissolve ({mixed + 1} frames)"]
            c["dissolve_alphas"] = alphas


def runs(mask: np.ndarray, min_len: int) -> list[tuple[int, int]]:
    out, i = [], 0
    while i < len(mask):
        if mask[i]:
            j = i
            while j + 1 < len(mask) and mask[j + 1]:
                j += 1
            if j - i + 1 >= min_len:
                out.append((i, j))
            i = j + 1
        else:
            i += 1
    return out


def inside_effects(rows: list[dict], cuts_f: list[int], fps: float, W: int, H: int) -> list[dict]:
    """What happens inside the shots, away from the cuts."""
    n = len(rows)
    near_cut = np.zeros(n, bool)
    for c in cuts_f:
        near_cut[max(0, c - 3):min(n, c + 4)] = True
    luma, sat, diff, flow = _arr(rows, "luma"), _arr(rows, "sat"), _arr(rows, "diff"), _arr(rows, "flow")
    split = _arr(rows, "split")
    tx, ty = np.nan_to_num(_arr(rows, "tx")), np.nan_to_num(_arr(rows, "ty"))
    out = []
    med = float(np.median(luma))
    for i in range(1, n - 1):
        if near_cut[i]:
            continue
        if luma[i] - max(luma[i - 1], med) > 40 and luma[i] > 170:
            out.append({"t": rows[i]["t"], "kind": "flash inside a shot", "luma": round(float(luma[i]), 1)})
        if luma[i] < 12 and luma[i - 1] > 35:
            out.append({"t": rows[i]["t"], "kind": "black frame inside a shot"})
    for a, b in runs(sat < 0.05, 4):
        out.append({"t": rows[a]["t"], "end": rows[b]["t"], "kind": "black and white", "frames": b - a + 1})
    # Freezes: no change at all for a third of a second or more (not a still picture: a clip that stops).
    for a, b in runs(diff < 0.25, 10):
        if np.median(flow[max(0, a - 10):a]) > 1.0:
            out.append({"t": rows[a]["t"], "end": rows[b]["t"], "kind": "freeze", "frames": b - a + 1})
    for a, b in runs((split > 3) & ~near_cut, 2):
        out.append({"t": rows[a]["t"], "end": rows[b]["t"], "kind": "colour split", "px": round(float(split[a:b + 1].max()), 1)})
    tear = _arr(rows, "tear")
    for a, b in runs((tear >= 4) & ~near_cut, 1):
        out.append({"t": rows[a]["t"], "end": rows[b]["t"], "kind": "glitch tears", "rows": int(tear[a:b + 1].max())})
    # Shakes: the picture knocked one way then the other, frame after frame (well tracked, not a scene change).
    tracked = _arr(rows, "tracked")
    flip = np.zeros(n, bool)
    for i in range(2, n):
        flip[i] = tracked[i] >= 30 and tracked[i - 1] >= 30 and np.sign(tx[i]) != np.sign(tx[i - 1]) and abs(tx[i]) / W > 0.006 and abs(tx[i - 1]) / W > 0.006 and abs(tx[i]) / W < 0.08
    for a, b in runs(flip & ~near_cut, 3):
        out.append({"t": rows[a]["t"], "end": rows[b]["t"], "kind": "shake", "amp_share": round(float(np.max(np.abs(tx[a:b + 1])) / W), 3)})
    # Speed changes: within a shot, the movement slowing right down and picking up again.
    bounds = [0] + sorted(cuts_f) + [n]
    for s, e in zip(bounds, bounds[1:]):
        if e - s < 15:
            continue
        v = np.convolve(flow[s + 2:e - 1], np.ones(3) / 3, mode="same")
        if len(v) < 9 or v.max() < 3:
            continue
        lo_i = int(np.argmin(v[2:-2])) + 2
        if v.max() / max(0.3, v[lo_i]) > 4 and v[:lo_i].max(initial=0) > 2 * v[lo_i] and v[lo_i:].max(initial=0) > 2 * v[lo_i]:
            out.append({"t": rows[s + 2 + lo_i]["t"], "kind": "slow then fast (a speed ramp?)", "flow_ratio": round(float(v.max() / max(0.3, v[lo_i])), 1)})
    return sorted(out, key=lambda e: e["t"])


# ── pictures of it ───────────────────────────────────────────────────────────

def thumbs(video: Path, wanted: set[int], W: int, H: int, thumb_w: int = 150) -> dict[int, np.ndarray]:
    """The frames asked for, as thumbnails, read in order (seeking lands a frame or two off in some files)."""
    th = int(round(H * thumb_w / W))
    cap = cv2.VideoCapture(str(video))
    out: dict[int, np.ndarray] = {}
    i = 0
    last = max(wanted) if wanted else -1
    while i <= last:
        ok, fr = cap.read()
        if not ok:
            break
        if i in wanted:
            out[i] = cv2.resize(fr, (thumb_w, th), interpolation=cv2.INTER_AREA)
        i += 1
    cap.release()
    return out


def strip(cache: dict[int, np.ndarray], rows: list[dict], f: int, W: int, H: int, before: int = 3, after: int = 4, thumb_w: int = 150) -> np.ndarray:
    th = int(round(H * thumb_w / W))
    ims = []
    for k in range(f - before, f + after + 1):
        if k < 0 or k >= len(rows):
            ims.append(np.full((th + 34, thumb_w, 3), 24, np.uint8))
            continue
        im = cache.get(k, np.zeros((th, thumb_w, 3), np.uint8))
        pad = np.full((34, thumb_w, 3), 24, np.uint8)
        r = rows[k]
        sc = r["scale"] if isinstance(r["scale"], float) and not math.isnan(r["scale"]) else 1.0
        cv2.putText(pad, f"{k - f:+d} {r['t']:.2f}s", (3, 13), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 220, 0) if k == f else (230, 230, 230), 1, cv2.LINE_AA)
        cv2.putText(pad, f"L{r['luma']:.0f} S{r['sharp']:.0f} z{(sc - 1) * 100:+.1f}", (3, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (170, 170, 170), 1, cv2.LINE_AA)
        ims.append(np.vstack([pad, im]))
    return np.hstack(ims)


def sheets(video: Path, rows: list[dict], marks: list[tuple[int, str]], W: int, H: int, out: Path, prefix: str, per: int = 8) -> list[str]:
    wanted = {k for f, _ in marks for k in range(f - 3, f + 5) if 0 <= k < len(rows)}
    cache = thumbs(video, wanted, W, H)
    written = []
    for n in range(0, len(marks), per):
        rowsimg = []
        for f, title in marks[n:n + per]:
            s = strip(cache, rows, f, W, H)
            head = np.full((20, s.shape[1], 3), 40, np.uint8)
            cv2.putText(head, title[:150], (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
            rowsimg.append(np.vstack([head, s]))
        if rowsimg:
            wmax = max(r.shape[1] for r in rowsimg)
            rowsimg = [np.hstack([r, np.full((r.shape[0], wmax - r.shape[1], 3), 24, np.uint8)]) if r.shape[1] < wmax else r for r in rowsimg]
            name = f"{prefix}-{n // per + 1:02d}.png"
            cv2.imwrite(str(out / name), np.vstack(rowsimg))
            written.append(name)
    return written


# ── the music under it ───────────────────────────────────────────────────────

def music_at(t: float, audio: dict) -> dict:
    g = audio.get("grid")
    # (The steady grid where the song keeps one: the tracker's beats can stop short.)
    beats = np.arange(g["first_beat_s"] % g["period_s"], t + 2 * g["period_s"], g["period_s"]) if g else np.array(audio["beats"])
    strong = np.array(audio["strong_onsets"])
    onsets = np.array(audio["onsets"])
    near = lambda v: round(float(np.min(np.abs(v - t))) * 1000) if len(v) else None
    out = {"to_beat_ms": near(beats), "to_onset_ms": near(onsets), "to_strong_ms": near(strong)}
    if g:
        T = g["period_s"]
        k = (t - g["first_beat_s"]) / T
        out["beat_index"] = round(k, 2)
        out["off_grid_ms"] = round(((t - g["first_beat_s"] + T / 2) % T - T / 2) * 1000)
    return out


def loudness_drop(audio: dict) -> float | None:
    """Where the song steps up hardest (two seconds against the two before), in seconds."""
    rms = np.asarray(audio["_rms"], float)
    t = np.asarray(audio["_env_t"], float)[: len(rms)]
    if len(rms) < 60:
        return None
    fps = 1 / max(1e-6, float(t[1] - t[0]))
    w = int(round(2 * fps))
    best, at = 0.0, None
    for i in range(w, len(rms) - w):
        step = rms[i:i + w].mean() - rms[i - w:i].mean()
        if step > best:
            best, at = step, float(t[i])
    return at if best > 0.15 * float(rms.max()) else None


# ── one video ────────────────────────────────────────────────────────────────

def break_down(video: Path, out_root: Path, ocr: bool = True) -> dict:
    out = out_root / video.stem[:60]
    (out / "strips").mkdir(parents=True, exist_ok=True)
    rows, fps, (W, H) = frames(video)
    n = len(rows)
    duration = n / fps
    cuts = scene_cuts(video)
    cuts_f = sorted({int(round(c * fps)) for c in cuts if 0 < c * fps < n})
    try:
        audio = audio_analysis(video, out)
    except Exception as e:  # a video with no sound
        audio = {"beats": [], "onsets": [], "strong_onsets": [], "grid": None, "tempo_bpm": 0.0, "_rms": [], "_env_t": [], "silent": True}
        print(f"  no music: {e}", file=sys.stderr)
    cut_info = []
    for f in cuts_f:
        c = classify_cut(rows, f, fps, W, H)
        c["music"] = music_at(c["t"], audio)
        cut_info.append(c)
    dissolve_frames(video, rows, cut_info)
    effects = inside_effects(rows, cuts_f, fps, W, H)
    for e in effects:
        e["music"] = music_at(e["t"], audio)
    zooms = zoom_events([{**r, "scale": r["scale"] if not (isinstance(r["scale"], float) and math.isnan(r["scale"])) else math.nan} for r in rows], cuts, fps)
    cards = card_runs(video, fps, n, set(cuts_f))
    texts = captions(video, fps, n, W, H, out) if ocr else []
    shots = np.diff([0.0] + [f / fps for f in cuts_f] + [duration])
    drop = loudness_drop(audio) if audio.get("_rms") is not None and len(audio.get("_rms", [])) else None
    sat = _arr(rows, "sat")
    summary = {
        "file": video.name, "size": [W, H], "fps": round(fps, 3), "duration_s": round(duration, 3),
        "tempo_bpm": round(float(audio.get("tempo_bpm", 0.0)), 1), "grid": audio.get("grid"),
        "loudest_step_s": round(drop, 2) if drop is not None else None,
        "shots": len(shots), "shot_lengths_s": [round(float(s), 3) for s in shots],
        "look": {"saturation_median": round(float(np.median(sat)), 3), "luma_median": round(float(np.median(_arr(rows, "luma"))), 1),
                 "black_and_white_share": round(float(np.mean(sat < 0.05)), 3),
                 "letterbox_share": round(float(np.mean((_arr(rows, "bar_top") > 0.05) & (_arr(rows, "bar_bottom") > 0.05))), 3)},
        "cuts": cut_info, "inside": effects, "zooms": zooms, "cards": cards, "captions": texts,
    }
    marks = [(c["frame"], f"cut {k + 1} at {c['t']:.2f}s: {', '.join(c['kind'])}") for k, c in enumerate(cut_info)]
    summary["strips"] = sheets(video, rows, marks, W, H, out / "strips", "cuts")
    fx_marks = [(int(round(e["t"] * fps)), f"{e['kind']} at {e['t']:.2f}s") for e in effects]
    fx_marks += [(int(round(z["start"] * fps)), f"{z['kind']} {z['scale_change']:+.0%} over {z['frames']} frames at {z['start']:.2f}s") for z in zooms]
    fx_marks += [(int(round(c["start"] * fps)), f"card {c['came']} at {c['start']:.2f}s ({c['first']['w']:.2f}x{c['first']['h']:.2f}, {c['first']['angle']:+.0f} deg)") for c in cards]
    summary["fx_strips"] = sheets(video, rows, sorted(fx_marks), W, H, out / "strips", "fx")
    with open(out / "frames.csv", "w", newline="") as fh:
        wr = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        wr.writeheader()
        wr.writerows(rows)
    (out / "breakdown.json").write_text(json.dumps(summary, indent=1))
    (out / "events.md").write_text(events_md(summary))
    return summary


def events_md(s: dict) -> str:
    L = [f"# {s['file']}", "", f"{s['size'][0]}x{s['size'][1]}, {s['fps']} fps, {s['duration_s']} s, {s['shots']} shots, tempo {s['tempo_bpm']}, loudest step at {s['loudest_step_s']} s", ""]
    L.append(f"Look: saturation {s['look']['saturation_median']}, brightness {s['look']['luma_median']}, black and white {s['look']['black_and_white_share']:.0%} of frames, letterboxed {s['look']['letterbox_share']:.0%}")
    L += ["", "## Cuts", "", "| # | t | kind | zoom pre/post | blur | to beat ms | to strong hit ms |", "|---|---|---|---|---|---|---|"]
    for k, c in enumerate(s["cuts"]):
        m = c["music"]
        L.append(f"| {k + 1} | {c['t']:.2f} | {', '.join(c['kind'])} | {c['zoom_pre']:+.2f}/{c['zoom_post']:+.2f} | {c['sharp_min_ratio']} | {m['to_beat_ms']} | {m['to_strong_ms']} |")
    L += ["", "## Inside the shots", ""]
    for e in s["inside"]:
        L.append(f"- {e['t']:.2f}s {e['kind']} {json.dumps({k: v for k, v in e.items() if k not in ('t', 'kind', 'music')})}")
    for z in s["zooms"]:
        L.append(f"- {z['start']:.2f}s {z['kind']} {z['scale_change']:+.0%} over {z['frames']} frames")
    L += ["", "## Cards and pictures over the footage", ""]
    for c in s["cards"]:
        L.append(f"- {c['start']:.2f} to {c['end']:.2f}s {c['came']}{' (on a cut)' if c['at_cut'] else ''}: centre {c['first']['cx']},{c['first']['cy']} size {c['first']['w']}x{c['first']['h']} angle {c['first']['angle']} -> {c['last']['cx']},{c['last']['cy']}")
    L += ["", "## Captions", ""]
    for t in s["captions"]:
        L.append(f"- {t['start']:.2f} to {t['end']:.2f}s \"{t['text']}\" box {t['box']} letters {t['height_px']} px ({t['height_share']:.3f} of the short side), {t.get('colour', '?')} on {t.get('around', '?')}{', on a box' if t.get('flat_behind') else ''}")
    return "\n".join(L) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("videos", nargs="+", type=Path)
    ap.add_argument("--out", type=Path, default=Path("breakdown"))
    ap.add_argument("--no-ocr", action="store_true")
    args = ap.parse_args()
    for v in args.videos:
        s = break_down(v, args.out, ocr=not args.no_ocr)
        kinds: dict[str, int] = {}
        for c in s["cuts"]:
            for k in c["kind"]:
                kinds[k] = kinds.get(k, 0) + 1
        print(f"{v.name[:44]:44s} {s['duration_s']:6.2f}s shots={s['shots']:3d} cuts={kinds} inside={len(s['inside'])} cards={len(s['cards'])} captions={len(s['captions'])}")


if __name__ == "__main__":
    main()

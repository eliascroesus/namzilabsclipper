#!/usr/bin/env python3
"""Render an HTML motion template to an MP4, one exact frame at a time.

The page must set `window.__meta = {width, height, duration, fps}` and
`window.__seek(t)`, and flip `window.__ready = true` once its fonts and images
have loaded. Every frame is computed rather than screen-recorded, so 30fps is
30 distinct frames with nothing dropped.

Usage:
  python3 tools/render_html.py templates/endcard/laptop.html out.mp4 \
      --query "aspect=9x16&top=start free&bottom=namzilabs.co" [--ss 2] [--crf 16]

Needs: pip install playwright imageio-ffmpeg   (and a Chromium; see --chromium)
"""
from __future__ import annotations

import argparse
import os
import subprocess
from pathlib import Path
from urllib.parse import quote

import imageio_ffmpeg
from playwright.sync_api import sync_playwright

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def render(template: Path, out: Path, query: str, ss: int, crf: int, chromium: str | None) -> None:
    # Keep the query's own separators but escape what's inside the values: spaces,
    # and "#" above all, which would otherwise end the query and start a fragment
    # (so accent=#568CFF would silently arrive empty).
    safe = "&".join(
        "=".join(quote(part, safe="/.:") for part in pair.split("=", 1)) for pair in query.split("&") if pair
    )
    url = template.resolve().as_uri() + "?capture=1" + ("&" + safe if safe else "")
    with sync_playwright() as p:
        launch = {"executable_path": chromium} if chromium else {}
        browser = p.chromium.launch(**launch)
        probe = browser.new_page()
        probe.goto(url)
        probe.wait_for_function("window.__ready === true", timeout=30_000)
        meta = probe.evaluate("window.__meta")
        probe.close()

        w, h, fps = int(meta["width"]), int(meta["height"]), int(meta.get("fps", 30))
        frames = round(float(meta["duration"]) * fps)
        page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=ss)
        page.goto(url)
        page.wait_for_function("window.__ready === true", timeout=30_000)

        out.parent.mkdir(parents=True, exist_ok=True)
        # Supersampled frames are scaled back down with lanczos: cleaner edges on
        # thin strokes and small type than rendering at 1x.
        vf = f"scale={w}:{h}:flags=lanczos" if ss > 1 else "null"
        enc = subprocess.Popen(
            [FFMPEG, "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", str(fps), "-i", "-",
             "-vf", vf, "-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-pix_fmt", "yuv420p",
             "-movflags", "+faststart", str(out)],
            stdin=subprocess.PIPE,
        )
        for i in range(frames):
            page.evaluate("t => window.__seek(t)", i / fps)
            enc.stdin.write(page.screenshot(type="png", clip={"x": 0, "y": 0, "width": w, "height": h}))
        enc.stdin.close()
        if enc.wait() != 0:
            raise SystemExit("ffmpeg failed")
        browser.close()
    print(f"{out}  {w}x{h}  {frames} frames @ {fps}fps")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("template", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--query", default="", help='template parameters, e.g. "aspect=4x3&top=start free"')
    ap.add_argument("--ss", type=int, default=2, help="supersample factor (default 2)")
    ap.add_argument("--crf", type=int, default=16, help="x264 quality, lower is better (default 16)")
    ap.add_argument("--chromium", default=os.environ.get("CHROMIUM_PATH"),
                    help="path to a Chromium binary (defaults to Playwright's own)")
    args = ap.parse_args()
    render(args.template, args.out, args.query, args.ss, args.crf, args.chromium)


if __name__ == "__main__":
    main()

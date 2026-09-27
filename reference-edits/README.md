# Reference edits

Short edits (Reels, TikToks, Shorts) that show the style the clipping machine should produce: clips cut from raw footage or YouTube videos, swapping on the music, with captions, zooms and a hook that stops the scroll. Claude breaks each one down cut by cut and beat by beat, and the patterns become the machine's editing rules.

## How to upload

1. Open this folder on GitHub: `reference-edits/` on the `claude/laughing-wozniak-zg8a1n` branch.
2. **Add file → Upload files**, drag the videos in, then **Commit changes**.
3. Tell Claude they're in.

- MP4 or MOV, at the best quality you can get. The original file beats a screen recording; if you do screen-record, keep the app's buttons out of the frame if you can.
- The browser takes files up to 25 MB each (a 30 to 60 second Reel is usually 3 to 15 MB). For anything bigger, compress it or share a Google Drive link.
- No special names needed.

## Make the repo private first

These are other creators' videos, usually with licensed music on them. This repo is public, so uploading them here republishes them for anyone to download. Switch it to private before uploading: **Settings → General → Danger Zone → Change repository visibility**. That keeps the screenshots private too.

## What makes an example most useful

Optional, but it sharpens the analysis a lot. For each edit, if you know it:

- **the source** it was cut from (a YouTube link or the raw file), so Claude can see which moments were picked and which were skipped
- **the song**
- **one line on what you like** about it

Put it in the commit message, or in a `notes.md` in this folder, like this:

```text
03-podcast-hook.mp4
source: https://www.youtube.com/watch?v=...
song: artist - title
like: every cut lands on the kick, and the zoom punches in on the punchline
```

Variety helps: a talking-head or podcast clip, a montage of short clips, a fast hype edit, and at least one that ends with a promo, a demo or "link in bio".

## What Claude pulls out of each one

- **Timing:** every cut, and where it lands against the music (on the kick, the snare, the drop, or between beats)
- **Pacing:** shot lengths across the edit, and what the first 1 to 2 seconds do to hook you
- **Text:** captions and titles: font, size, position, colour, and how the words pop in
- **Moves:** zoom punches, speed ramps, shakes, transitions, flashes
- **Framing:** how a wide 16:9 source becomes a 9:16 vertical (crop, follow the face, split screen, blurred fill)
- **The ending:** how the call to action or the promo is cut in

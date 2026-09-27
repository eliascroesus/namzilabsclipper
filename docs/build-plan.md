# Build plan: the clipping machine

## What it does

Paste one or more YouTube links, or drop in videos, photos and screen recordings. The machine finds the best moments, makes several finished edits in the formats the reference edits use (see [edit-analysis.md](edit-analysis.md)), and ends each one on the product's demo card in the nio.trade style, or on a "check bio" card. You download the MP4s, each with a ready post caption and the sound to add. It runs for free on your own Mac.

## The pipeline

| # | Stage | What happens | Free tools |
|---|---|---|---|
| 1 | **Ingest** | Download the best video and audio from each link, or take the uploads; make a clean 30fps working copy | yt-dlp, ffmpeg |
| 2 | **Understand** | Transcript with a time for every word; where the speech is; every shot; faces; tags for the b-roll ("car", "jet", "trading screen", "crowd", "city at night"); loudness and energy | Whisper (whisper.cpp or faster-whisper), silero-vad, PySceneDetect, MediaPipe, OpenCLIP, librosa |
| 3 | **Pick** | Candidate windows cut on sentence boundaries, scored for a hook (a question, a number, money, a contrast, "you"), a payoff nearby, energy, a face on screen and visual variety. A local model ranks the top ten and writes the hook caption, the POV label or the meme text in the references' voice. It never invents a number | Ollama with Qwen2.5 7B, running on the Mac |
| 4 | **Assemble** | One of the four templates fills in: segment order, caption style, pacing and transitions, all taken from the measured rules. Dialogue gets its pauses (over about 0.2s) and filler words cut out, as jump cuts. Montage cuts and flex bursts snap to the song's accents to within a frame | our code |
| 5 | **Render** | Cuts, crops, a warm grade (LUT), captions, transitions (dip to black, crossfade, film burn), and the audio mix (music under the speech, ducked, mastered to −14 LUFS). The cards and animated text come from the HTML renderer and are laid over the video | ffmpeg with libass, [`tools/render_html.py`](../tools/render_html.py) + Playwright |
| 6 | **Check** | Every output goes back through [`tools/analyze_edit.py`](../tools/analyze_edit.py): the hook is on frame one, montage cuts sit within a frame of an accent, shot lengths fall in the reference ranges, the card is there, loudness is right. Anything off gets re-cut before you see it | our analyzer |
| 7 | **Deliver** | MP4s in 9:16 and 4:3 (4:5 on request), 1080p, 30fps, plus a `post.txt` for each: the caption, hashtags, and which sound to add from which second | |

## Frame shape: Nio's 4:3, and 9:16

- **4:3 landscape** is how nio.trade posts. It crops a 16:9 YouTube frame without losing anyone, so it keeps the cinematic look and needs no reframing. This is the default for story clips.
- **9:16** needs a moving crop: follow the speaker's face (MediaPipe, smoothed so it glides rather than jitters). Screen recordings fit the width over a blurred copy of themselves, and wide scenery gets a slow pan.

## Music, and the rule that shapes the design

- Instagram and TikTok license their trending sounds for use inside the apps only. A downloaded song baked into an upload gets muted, blocked or held back, and business accounts only get the commercial library.
- So the machine keeps a **music folder** of the songs you want to use, for timing only. It maps each song's beats, accents and drops, cuts the edit to them, and exports two files: a preview with the song, and the upload file without it. `post.txt` says "add <song> from 0:12". Add that sound in the app and the cuts land where they should.
- To bake music in (a business account, say), use royalty-free libraries such as the YouTube Audio Library or Pixabay Music.
- Picking what's trending stays with you: the Reels audio page marks trending sounds, and no free API is reliable. You drop the songs into the folder, and the machine matches each clip to the song that fits its energy and length.

## Cards

- **The demo card**, built: [`templates/endcard/laptop.html`](../templates/endcard/laptop.html). A laptop showing the product, the call to action above, the address below, and the hand-drawn arrow, with the entrance, pull-out and fade measured from the Nio clips. Each product gets a small brand kit: the screenshot, the call-to-action line, the address, the arrow colour.
- **Next:** a screen recording playing on the laptop instead of a still, a phone version for app demos, a "check bio" card (your profile screenshot with the arrow landing on the link in bio), and "follow @handle".

## Where it runs

- **On your Mac, with a web page on localhost as the interface.** Paste links, drop files, pick the formats and how many variants, press Make, download. That's the only effort. Compute is free, YouTube downloads work from a home connection (YouTube often blocks downloads from cloud servers), and Apple silicon runs Whisper and the local model quickly. Queue a batch of links overnight and wake up to a folder of edits.
- **A public website later** is possible, but not free: video processing needs paid servers, and YouTube blocks their addresses.
- **In this cloud environment** I can build and test everything except the YouTube downloads and the Whisper models, until youtube.com, googlevideo.com and huggingface.co are added to the environment's allowed network domains.

## The free stack

| Job | Tool | Licence |
|---|---|---|
| Download from YouTube | yt-dlp | Unlicense |
| Cut, crop, grade, mix, encode | ffmpeg (with libass for captions) | LGPL / GPL |
| Transcript with word times | whisper.cpp or faster-whisper, Whisper large-v3-turbo | MIT |
| Speech detection | silero-vad | MIT |
| Shots | PySceneDetect | BSD-3 |
| Beats, accents, drops, loudness | librosa | ISC |
| Faces for the 9:16 crop | MediaPipe, OpenCV | Apache 2.0 |
| B-roll tags | OpenCLIP | MIT |
| Picking moments, writing hooks | Ollama + Qwen2.5 7B Instruct | MIT / Apache 2.0 |
| Cards and animated text | HTML + Playwright (Chromium) | Apache 2.0 |
| App | FastAPI + a plain web page | MIT |
| Fonts | Inter, Instrument Serif, Oswald, League Gothic | OFL |

## Milestones

| | Milestone | What it proves |
|---|---|---|
| **M0** | Done: the reference analysis, the analyzer, the demo card, the frame renderer | The look is reproducible |
| **M1** | **Montage maker:** a folder of clips or photos, a song and a brand kit become a beat-synced montage with a mood caption and the demo card, in 9:16 and 4:3 | Music timing and the card, end to end |
| **M2** | **Story clipper:** a YouTube link becomes 3 to 5 clips: the hook on black, cleaned dialogue with documentary subtitles, a flex burst from the same video's b-roll, the card | The hard part: picking the moment |
| **M3** | **One-click app:** the localhost page, brand kits, the music folder, batches of links, a gallery with downloads | Paste and done |
| **M4** | **The rest:** the reaction and text-meme templates, the POV-label variant, the check-bio card, film burns and grades, the automatic quality gate, overnight batches | Volume |

## Rights, briefly

- Clip your own footage, or creators who allow or pay for clipping. Clipping other people's videos, or public figures as some of the references do, is what gets posts taken down.
- Captions only carry numbers that were said or shown in the source, the same no-invented-proof rule as the rest of the Namzilabs content.

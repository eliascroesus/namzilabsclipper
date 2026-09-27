# Build plan: the clipping machine

## What it does

A website you open in Chrome. Drop in videos, photos and screen recordings (YouTube links come later, see below). It finds the best moments, makes several finished edits in the formats the reference edits use (see [edit-analysis.md](edit-analysis.md)), and ends each one on the product's demo card in the nio.trade style, or on a "check bio" card. You download the MP4s, each with a ready post caption and the sound to add.

**Nothing to install, and no AI models on your Mac.** The video work runs inside the browser on the Mac's own hardware. The AI work runs on free cloud AI services.

## How it splits

| Runs in Chrome, on your Mac | Runs in free cloud AI |
|---|---|
| Reading and decoding the videos, on the Mac's media engine (the hardware Final Cut and QuickTime export with) | The transcript, with a time for every word |
| Finding the shots, the beats and accents of the song, the faces | Picking the moments and writing the hooks, POV labels and meme text |
| Laying out every frame: crops, the grade, captions, transitions, the card (GPU) | |
| Mixing the audio, and encoding the finished MP4 (media engine) | |

- The browser uses **WebCodecs** to decode and encode video on the media engine, and **WebGPU/WebGL** for everything drawn. On an M4 Pro a 30-second 1080p clip should export in seconds, not minutes.
- Only the **audio** of what you clip goes to the transcript service, and only the **transcript** goes to the one that picks moments. The video stays on the Mac.
- The free AI tiers each need a free API key, pasted once into the site's settings and kept in the browser. Free tiers have daily limits (plenty for one person) and may use what's sent to improve their models, so keep private client footage out of them.
- The site itself is a static page, hosted free (Vercel works with a private repo).

## Two things a browser can't do by itself

1. **Pull a video from a YouTube link.** Browsers don't let a web page download YouTube's video streams, and YouTube blocks cloud servers that try. So:
   - **First version:** drag the video file in.
   - **Then:** a small companion Chrome extension that grabs the video from YouTube inside your own browser, where YouTube treats it like you watching (it installs into Chrome in one click, and saves nothing to your Mac). Built on YouTube.js (MIT).
2. **Use the trending sound itself.** The apps license trending sounds for in-app use only; baked into an upload they get muted or held back, and business accounts only get the commercial library. So you drop in any Reel that uses the sound (you already save these), and the site reads the song's beats and accents from it and cuts to them. It exports the edit without the song, and the post note says "add <song> from 0:12". Add that sound in the app and the cuts land. For music baked in (a business account, say), use royalty-free libraries such as the YouTube Audio Library or Pixabay Music.

## The pipeline

| # | Stage | What happens | Where, with what |
|---|---|---|---|
| 1 | **Ingest** | Read the dropped files straight from disk, whatever their size, without copying them | Browser: Mediabunny (MPL-2.0), WebCodecs |
| 2 | **Understand** | Every shot, speech versus music, faces, the song's beat grid, accents and drops, loudness. A transcript with word times | Browser: our own shot and beat detection (ported from the analyzer in `tools/`), Web Audio, MediaPipe face detection (Apache 2.0, a small file loaded with the page). Cloud: Whisper large-v3-turbo on Groq's free tier |
| 3 | **Pick** | Candidate windows on sentence boundaries, scored for a hook (a question, a number, money, a contrast, "you"), a payoff nearby, energy and a face on screen. The AI ranks them and writes the hook caption, POV label or meme text in the references' voice. It never invents a number | Browser scores; cloud: Google's Gemini API free tier |
| 4 | **Assemble** | One of the four templates: segment order, caption style, pacing and transitions, all from the measured rules. Dialogue loses its pauses (over about 0.2s) and filler words, as jump cuts. Montage cuts and flex bursts snap to the song's accents to within a frame | Browser |
| 5 | **Render** | Crops (4:3 like Nio, or 9:16 following the speaker's face), a warm grade, captions in the six styles, dip to black, crossfade, film burn, the demo card. The audio mix: music under speech, ducked, mastered to −14 LUFS | Browser: WebGL/WebGPU compositor, WebCodecs H.264 + AAC encode on the media engine |
| 6 | **Check** | Every edit is measured before you see it: hook on frame one, montage cuts within a frame of an accent, shot lengths in the reference ranges, the card present, loudness right. Anything off gets re-cut | Browser, the same measurements as `tools/analyze_edit.py` |
| 7 | **Deliver** | MP4s in 9:16 and 4:3, 1080p, 30fps, and a post note for each: caption, hashtags, the sound to add and from which second | Browser download |

## Frame shape

- **4:3 landscape**, how nio.trade posts: it crops a 16:9 YouTube frame without losing anyone. The default for story clips.
- **9:16**: a crop that follows the speaker's face, smoothed so it glides. Screen recordings fit the width over a blurred copy of themselves.

## Cards

- **The demo card**, built as a template: [`templates/endcard/laptop.html`](../templates/endcard/laptop.html). The in-browser renderer draws the same design. Each product gets a brand kit: the screenshot or screen recording on the laptop, the call-to-action line, the address, the arrow colour.
- **Next:** a screen recording playing on the laptop, a phone version for app demos, "check bio" (your profile with the arrow on the link in bio), "follow @handle".

## The stack

| Job | Tool | Licence |
|---|---|---|
| The app | Vite + TypeScript, a static page | MIT |
| Read and write MP4/WebM/MOV | Mediabunny | MPL-2.0 |
| Decode and encode on the media engine | WebCodecs (built into Chrome) | |
| Draw frames | WebGL2 / WebGPU (built into Chrome) | |
| Audio: decode, mix, beats, accents | Web Audio (built in) + our own beat tracker | |
| Faces | MediaPipe Tasks Vision | Apache 2.0 |
| Transcript | Whisper large-v3-turbo on Groq (free tier) | MIT model |
| Picking moments, writing hooks | Gemini API (free tier) | |
| YouTube links (later) | a Chrome extension using YouTube.js | MIT |
| Hosting | Vercel free tier | |
| Fonts | Inter, Instrument Serif, Oswald, League Gothic | OFL |

The Python tools in `tools/` stay as the lab bench: they measure reference edits and check the browser's output during development.

## Building and testing it

The cloud environment this repo is developed in has the same browser engine with WebCodecs and WebGPU, so the whole app gets built and tested here. That build has no H.264 or AAC (they're licensed codecs), so tests run in VP9 and Opus. Chrome on the Mac has both in hardware, and writes normal H.264 MP4s. Testing the cloud AI steps here needs their hosts allowed in the environment's network settings.

## Milestones

| | Milestone | What it proves |
|---|---|---|
| **M0** | Done: the reference analysis, the analyzer, the demo card, the frame renderer | The look is reproducible |
| **M1** | **Montage maker, in the browser:** drop clips or photos, a Reel with the sound, and a brand kit; get a beat-synced montage with a mood caption and the demo card, in 9:16 and 4:3 | The in-browser engine, music timing and the card, end to end on your Mac |
| **M2** | **Story clipper:** drop a long video; get 3 to 5 clips with the hook on black, cleaned dialogue with documentary subtitles, a flex burst from the same video's b-roll, the card | The hard part: picking the moment |
| **M3** | **Links and batches:** the Chrome extension for YouTube links, a queue, a gallery | Paste and done |
| **M4** | **The rest:** the reaction and text-meme templates, the POV-label variant, the check-bio card, film burns and grades, the quality gate | Volume |

## Rights, briefly

- Clip your own footage, or creators who allow or pay for clipping. Clipping other people's videos, or public figures as some of the references do, is what gets posts taken down.
- Captions only carry numbers that were said or shown in the source, the same no-invented-proof rule as the rest of the Namzilabs content.

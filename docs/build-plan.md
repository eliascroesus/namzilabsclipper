# Build plan: the clipping machine

**Status (Sep 2026):** built and working in [`app/`](../app/): the montage, story, twist and meme formats, the demo card, the whole engine in the browser. Next: YouTube links through a small Chrome extension, then the reaction format and more cards. See [Milestones](#milestones).

## What it does

A website you open in Chrome. Drop in videos, photos and screen recordings (YouTube links come later, see below). It finds the best moments, makes several finished edits in the formats the reference edits use (see [edit-analysis.md](edit-analysis.md)), and ends each one on the product's demo card in the nio.trade style, or on a "check bio" card. You download the MP4s, each with a ready post caption and the sound to add.

**Nothing to install, and no AI models on your Mac.** The video work runs inside the browser on the Mac's own hardware. The AI work runs on free cloud AI services.

## How it splits

| Runs in Chrome, on your Mac | Runs in free cloud AI |
|---|---|
| Reading and decoding the videos, on the Mac's media engine (the hardware Final Cut and QuickTime export with) | The transcript of a long video, with a time for every phrase |
| Finding the shots, the beats and accents of the song, where the subject is, where people talk | Picking the moments and writing their hooks |
| Laying out every frame: crops, the grade, captions, transitions, the card (GPU) | |
| Mixing the audio, and encoding the finished MP4 (media engine) | |

- The browser uses **WebCodecs** to decode and encode video on the media engine, and **WebGPU/WebGL** for everything drawn. On an M4 Pro a 30-second 1080p clip should export in seconds, not minutes.
- Only the **audio** of what you clip goes to the transcript service, and only the **transcript** goes to the one that picks moments. The video stays on the Mac.
- The AI step needs one free Gemini key, pasted once into the site and kept in the browser. The free tier has daily limits (plenty for one person) and Google may use what's sent to improve its models, so keep private client footage out of Story mode. Montage, twist and meme use no AI at all.
- The site itself is a static page, hosted free on GitHub Pages (Vercel or Netlify with a private repo).

## Two things a browser can't do by itself

1. **Pull a video from a YouTube link.** Browsers don't let a web page download YouTube's video streams, and YouTube blocks cloud servers that try. So:
   - **First version:** drag the video file in.
   - **Then:** a small companion Chrome extension that grabs the video from YouTube inside your own browser, where YouTube treats it like you watching (it installs into Chrome in one click, and saves nothing to your Mac). Built on YouTube.js (MIT).
2. **Use the trending sound itself.** The apps license trending sounds for in-app use only; baked into an upload they get muted or held back, and business accounts only get the commercial library. So you drop in any Reel that uses the sound (you already save these), and the site reads the song's beats and accents from it and cuts to them. It exports the edit without the song, and the post note says "add <song> from 0:12". Add that sound in the app and the cuts land. For music baked in (a business account, say), use royalty-free libraries such as the YouTube Audio Library or Pixabay Music.

## The pipeline

| # | Stage | What happens | Where, with what |
|---|---|---|---|
| 1 | **Ingest** | Read the dropped files straight from disk, whatever their size, without copying them | Browser: Mediabunny (MPL-2.0), WebCodecs |
| 2 | **Understand** | Every shot, where people talk, the subject's position, the song's beat grid, accents and drops, loudness. For Story, a transcript with phrase times | Browser: our own shot detection and a librosa port for the beats (frame-identical to librosa), voice detection. Cloud: Gemini transcribes the sound |
| 3 | **Pick** | Montage: every usable stretch of footage scored (sharp, well lit, colourful, moving, people) and matched to the music's energy. Story: the AI picks moments that stand alone, with a hook up front and a payoff, and writes the hook in the references' voice. It never invents a number | Browser scores; cloud: Gemini's free tier |
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
| The subject in a frame | Our own saliency (coarse edges, contrast, skin tones) | |
| Transcript, picking moments, writing hooks | Gemini API (free tier), newest Flash model | |
| MP3 and AAC where the browser lacks them | @mediabunny/mp3-encoder, @mediabunny/aac-encoder (WASM, loaded only when needed) | MPL-2.0 |
| YouTube links (next) | a Chrome extension using YouTube.js | MIT |
| Hosting | GitHub Pages | |
| Fonts | Inter, Instrument Serif, Oswald, League Gothic | OFL |

The Python tools in `tools/` stay as the lab bench: they measure reference edits and check the browser's output during development.

## Building and testing it

The cloud environment this repo is developed in has the same browser engine with WebCodecs and WebGL, so the whole app gets built and tested here, in headless Chromium, the way a person would use it (`app/e2e/`). That build has no H.264 or AAC (licensed codecs), so tests render VP9 and Opus. Chrome on the Mac has both in hardware and writes normal H.264 MP4s. The Gemini calls are tested against a stand-in; a real key is needed to judge transcription quality.

## Milestones

| | Milestone | Status |
|---|---|---|
| **M0** | The reference analysis, the analyzer, the demo card, the frame renderer | Done |
| **M1** | **Montage maker in the browser:** clips and photos plus a Reel's sound and a brand kit become beat-synced montages ending on the card, in 9:16, 4:3, 1:1 and 4:5 | Done. Measured like the references: every cut within 3 frames of a beat, 73% within one |
| **M2** | **Story clipper:** a long video becomes clips of its best moments: hook on black, pauses cut, word-timed subtitles, the burst on the drop, the card | Done. Tested end to end with Gemini's answers stubbed; needs a real key to check transcription quality |
| **M3** | **Links and batches:** a Chrome extension for YouTube links, a queue | Next |
| **M4** | **The rest:** twist and meme (done); the reaction format, the phone and check-bio cards, speed ramps, more grades | In progress |

## Rights, briefly

- Clip your own footage, or creators who allow or pay for clipping. Clipping other people's videos, or public figures as some of the references do, is what gets posts taken down.
- Captions only carry numbers that were said or shown in the source, the same no-invented-proof rule as the rest of the Namzilabs content.

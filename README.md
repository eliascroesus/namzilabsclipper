# Namzilabs clipper

A clipping machine that runs in the browser. Drop in footage and a sound, and it makes finished short-form edits cut to the music, each ending on a demo card for the product it promotes. Nothing to install and no AI models on your computer: the video work runs inside Chrome on the Mac's own video engine and GPU, and the one AI step (listening to long videos) uses Google's free Gemini API.

**Open it:** https://eliascroesus.github.io/namzilabsclipper/ (see [Publishing](#publishing) for the one-time switch that turns this on)

## What it makes

| Format | You drop | You get |
|---|---|---|
| **Montage** | Clips and photos, and a Reel that uses the sound you want | Your best moments cut on the song's accents (mico and nio.trade style): longer shots in the build, faster after the drop, one flash or film burn on the drop, a mood line or POV caption |
| **Story** | A long video of someone talking (vlog, podcast, interview), plus a sound | Its best 15 to 60 second moments as clips: the hook on frame one, pauses cut out, word-timed subtitles, a burst of the best shots on the song's drop, then the card (nio.trade's best-performing shape) |
| **Twist** | Flex footage, plus a clip of the other side (the desk, the screen, the work) | "what they see vs... / what they don't...": a montage of the flex, a hard flip on a downbeat to one long shot of the real side (brezscales style) |
| **Meme** | One clip | The clip held 8 to 11 seconds, faded up from black, a small block of text over it, the song carrying it (gillioniare, brezscales) |

Every edit ends on **the demo card**: black, a laptop showing your product (or a phone, for an app), the call to action above, the address below, and the hand-drawn arrow between them, slowly pulling out, exactly as the nio.trade Reels do it. Set the lines, the screenshot and the arrow colour once; they're remembered.

Each result comes as an MP4 **with the song** and a copy **without it**, plus a post note. When the sound came from a Reel, the edit starts at that Reel's 0:00, so tapping the sound in Instagram and choosing **Use audio** lines every cut up with the beat.

## How to use it

1. Open the link in **Chrome on your Mac** (Chrome uses the Mac's hardware to decode and encode, and writes the H.264 MP4 Instagram wants).
2. Pick a format.
3. Drop the footage. Anything Chrome plays works: iPhone MOV and MP4, screen recordings, photos (JPEG, PNG; export HEIC photos as JPEG first).
4. Drop the sound: a Reel that uses the trending sound, or any song. The easy way to get a Reel onto the Mac: screen-record it on your iPhone with the sound on, AirDrop the recording, drop it in. Only its sound is used. (A screen recording rarely starts where the Reel does, so post the version with the song in it rather than adding the sound in the app.)
5. For Story: paste a free Gemini key from [Google AI Studio](https://aistudio.google.com/apikey) (no card), then **Find the moments**, tick the ones you want and edit their hooks.
6. **Make edits**. Download, post, add the sound in the app if you used the version without it.

Your footage never leaves the computer. For Story, only the video's sound is sent to Gemini, and only its transcript comes back.

**YouTube links:** a browser page can't download from YouTube, so for now download the video first and drop the file in. A small Chrome extension that grabs it from inside your own browser is the next step (see the [build plan](docs/build-plan.md)).

## What's in here

| | |
|---|---|
| [`app/`](app/) | The clipper itself: a static site (Vite + TypeScript + React) with the engine, the UI and the tests. [How it's built](app/README.md) |
| [`docs/edit-analysis.md`](docs/edit-analysis.md) | The reference edits taken apart: formats, measured cut timing, captions, and the demo card spec |
| [`docs/build-plan.md`](docs/build-plan.md) | How the machine works, the free stack, what's done and what's next |
| [`docs/namzilabs-context.md`](docs/namzilabs-context.md) | Namzilabs as a product: the app, its look, the content rules |
| [`reference-edits/`](reference-edits/) | Example Reels to learn from |
| [`templates/endcard/laptop.html`](templates/endcard/laptop.html) | The original HTML version of the demo card |
| [`tools/`](tools/) | The lab bench: `analyze_edit.py` measures any edit (cuts, beats, sync, motion), `render_html.py` renders HTML motion templates |
| [`screenshots/`](screenshots/) | Real screens of the Namzilabs app |

## Publishing

The app deploys itself to GitHub Pages on every push that touches `app/` ([workflow](.github/workflows/pages.yml)). It needs switching on once: **Settings > Pages > Build and deployment > Source: GitHub Actions**. If the repo goes private, GitHub Pages needs a paid plan; Vercel or Netlify host the same `app/dist` folder free (build command `npm run build`, root `app`).

## Measuring an edit

```bash
pip install -r tools/requirements.txt
python3 tools/analyze_edit.py reference-edits/*.mp4 --out analysis/
```

The app's own output measures like the references: every montage cut within three frames of a beat (73% within one frame, against mico's 71%), cuts leading the beat by about 40 ms as the references do, and every edit mastered to -14 LUFS.

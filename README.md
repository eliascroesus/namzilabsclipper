# Namzilabs clipper

A clipping machine that runs in the browser. Drop in footage and a sound, and it makes finished short-form edits cut to the music, each ending on a demo card for the product it promotes. Nothing to install: the video work runs inside Chrome on the Mac's own video engine and GPU, and the AI steps (seeing what's in the footage, listening to long videos) use Google's free Gemini API.

**Open it:** https://eliascroesus.github.io/namzilabsclipper/ (see [Publishing](#publishing) for the one-time switch that turns this on)

## What it makes

| Format | You drop | You get |
|---|---|---|
| **Montage** | Clips and photos, and a Reel that uses the sound you want | Your best moments cut on the song's accents (mico and nio.trade style): longer shots in the build, faster after the drop, one flash or film burn on the drop, a mood line or POV caption |
| **Story** | A long video of someone talking (vlog, podcast, interview), plus a sound | Its best 15 to 60 second moments as clips: the hook on frame one, pauses cut out, word-timed subtitles, a burst of the best shots on the song's drop, then the card (nio.trade's best-performing shape) |
| **Twist** | Flex footage, plus a clip of the other side (the desk, the screen, the work) | "what they see vs... / what they don't...": a montage of the flex, a hard flip on a downbeat to one long shot of the real side (brezscales style) |
| **Meme** | One clip | The clip held 8 to 11 seconds, faded up from black, a small block of text over it, the song carrying it (gillioniare, brezscales) |

Every edit ends on **the demo card**: black, a laptop showing your product (or a phone, for an app), the call to action above, the address below, and the hand-drawn arrow between them, slowly pulling out, exactly as the nio.trade Reels do it. Set the lines, the screenshot and the arrow colour once; they're remembered.

Each result comes as an MP4 **with the song** and a copy **without it**, plus a post note. When the sound came from a Reel, the edit starts at that Reel's 0:00, so tapping the sound in Instagram and choosing **Use audio** lines every cut up with the beat. Drag the box on the song's timeline to start somewhere else; the post note then says where to start the sound.

## How it picks and frames

- **Smart picks.** With a free Gemini key, Gemini looks at contact sheets of your footage (small numbered stills, one every few seconds, never the video) and rates every moment for how much it sells the life (supercars, jets, watches, views) and how striking it is, and says what's in it. The edits open on the Lamborghini and skip the coffee-shop chat; titles, end screens and talking heads stay out while anything better is left. A strip under each clip shows where its flex is. The answers are remembered per file, so the same video is never rated twice.
- **Every edit in a batch is different.** Each opens on a different moment, never reuses one, favours different scenes, and cuts at its own rhythm (one busier, the next calmer, about a quarter more or fewer cuts), so five edits from one 40 minute video don't share their clips.
- **Face tracking** (on by default, one switch). When wide footage is cropped to 9:16, the crop follows the person in the shot: it holds still while they stay near the middle, glides when they move, and never lets the face slip out of frame. A 230 KB face detector (YuNet) runs in the page for this.
- **Black bars are left out.** A letterboxed film or a phone video inside a YouTube frame is cropped from the picture itself, so no black bars end up in the edit.
- **YouTube videos skip the sponsor read.** If the file name carries the video's ID (as `yt-dlp` names files: `Title [dQw4w9WgXcQ].mp4`), the sponsor reads, intro and outro that SponsorBlock's viewers marked are left out. A long video's first seconds and its end screen are avoided either way.
- **Hits on the drop.** The drop gets a flash and a punch-in, a film burn, or a punch-in with a shake, turning over through a batch; the music's strongest hits get a small punch-in. Story clips punch in on every other jump cut so the cuts read as deliberate.
- **Velocity** (a switch, off by default): speed ramps, the car-edit look. Each shot hits in slow motion on the beat and rushes into the next cut, slowest on the drop, and the cuts that open a four-bar phrase get a zoom blur. Footage shot at 60 fps slows down smoothly; 30 fps footage gets a gentler ramp.

## How to use it

1. Open the link in **Chrome on your Mac** (Chrome uses the Mac's hardware to decode and encode, and writes the H.264 MP4 Instagram wants).
2. Pick a format.
3. Drop the footage. Anything Chrome plays works: iPhone MOV and MP4, screen recordings, photos (JPEG, PNG; export HEIC photos as JPEG first).
4. Drop the sound: a Reel that uses the trending sound, or any song. The easy way to get a Reel onto the Mac: screen-record it on your iPhone with the sound on, AirDrop the recording, drop it in. Only its sound is used. (A screen recording rarely starts where the Reel does, so post the version with the song in it rather than adding the sound in the app.)
5. Drag the box on the song's timeline to where the edits should start (it snaps to the bar lines; **Play** plays that stretch). For Story, drag the line to the moment that should hit as the talking ends.
6. Paste a free Gemini key from [Google AI Studio](https://aistudio.google.com/apikey) (no card) for smart picks and Story. For Story, **Find the moments**, tick the ones you want and edit their hooks.
7. **Make edits**. Download, post, add the sound in the app if you used the version without it. Delete any edit you don't want with the × on it (it stops one that's still being made).

Your videos never leave the computer. With smart picks on, Gemini sees small stills of them; for Story, the video's sound goes to Gemini and only its transcript comes back.

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

The app's own output measures like the references: cuts lead the beat by about 45 ms (a frame early, as editors cut and as the references do), and every edit is mastered to -14 LUFS with the peaks kept under -1 dB after encoding.

Most music made on a computer (dance, pop, trap, drill, garage) runs at one exact tempo, so when a song keeps one, the beat grid is measured to a hundredth of a bpm and put on the kick and the snare, not the hi-hats. On a 4:22 garage track at 134 bpm, cuts from a beat tracker alone drifted up to a tenth of a second and, before the drop, 11 to 14 of 20 landed on the hats between beats; now every cut of a rendered edit lands within three frames of the beat you hear, the same way through the whole song, and a 15 or 30 second clip of it (what a Reel's sound is) finds the same grid. Bar lines come from the kick and the bass line rather than the chords, which songs often push ahead of the bar, and a cut goes between beats only on a hit that stands out from what always plays there (a syncopated kick, not the hats). `analyze_edit.py` measures against that grid too.

# Namzilabs clipper

A clipping machine that runs in the browser. Drop in footage and a sound, and it makes finished short-form edits cut to the music, each ending on a demo card for the product it promotes. Nothing to install: the video work runs inside Chrome on the Mac's own video engine and GPU, two small AI models run in the page (one sees what's in the footage, one hears where the singing is), and Google's free Gemini API, if you add a key, sharpens the picks and listens to long videos for Story.

**Open it:** https://eliascroesus.github.io/namzilabsclipper/ (see [Publishing](#publishing) for the one-time switch that turns this on). A second page, **[Mimic](https://eliascroesus.github.io/namzilabsclipper/mimic.html)**, edits raw talking footage the way a reference ad is edited (below).

## What it makes

| Format | You drop | You get |
|---|---|---|
| **Montage** | Clips and photos, and a Reel that uses the sound you want | Your best moments cut on the beat (mico and nio.trade style): two beats a shot into the drop, one repeating pattern after it with clips re-cut on the beat, a flash or film burn on the drop, a mood line or POV caption |
| **Story** | A long video of someone talking (vlog, podcast, interview), plus a sound | Its best 15 to 60 second moments as clips: the hook on frame one, pauses cut out, word-timed subtitles, a burst of the best shots on the song's drop, then the card (nio.trade's best-performing shape) |
| **Twist** | Flex footage, plus a clip of the other side (the desk, the screen, the work) | "what they see vs... / what they don't...": a montage of the flex, a hard flip on a downbeat to one long shot of the real side (brezscales style) |
| **Meme** | One clip | The clip held 8 to 11 seconds, faded up from black, a small block of text over it, the song carrying it (gillioniare, brezscales) |

Every edit ends on **the demo card**: black, a laptop showing your product (or a phone, for an app), the call to action above, the address below, and the hand-drawn arrow between them, slowly pulling out, exactly as the nio.trade Reels do it. Set the lines, the screenshot and the arrow colour once; they're remembered. Or end on **your own video** (a motion design, a logo sting): pick **Your video** under End card and drop it in. It plays whole at the end of every edit (up to 15 seconds of it), as it was made (no grade, its own sound off, the song under it), filling the frame when it's the edit's shape and sitting inside it when not.

Each result comes as an MP4 **with the song** and a copy **without it**, plus a post note. When the sound came from a Reel, the edit starts at that Reel's 0:00, so tapping the sound in Instagram and choosing **Use audio** lines every cut up with the beat. Drag the box on the song's timeline to start somewhere else; the post note then says where to start the sound. Drag the box's right edge to make the edits longer or shorter, from a few seconds to a minute (or set **Length** under Style). The card comes in on a bar line, and the music fades out over its last moment.

## Mimic: copy an ad's edit

The second page (**Mimic** in the header). Drop the ad or video you want yours to look like, your raw footage, and optionally extras (pictures and clips) and music. The page studies the reference on your computer and edits your footage the same way:

- **Captions** in its place, size, colour and style, coming on word by word as your words are said (or however the reference brings them on), from a speech model that runs in the page (25 European languages, Danish included; the words can be fixed by hand or by Gemini, each keeping its time).
- **Cards** with your pictures in them, cropped to the reference's shapes and sliding or cutting on and off as its cards do, at the same point of your talk (the hook's to the second); **cutaways** with your clips.
- **Zooms** stepping in and out as the reference's do, and a jump at every cut in your footage so it reads as a punch-in.
- **Sound and ending**: your music from where the reference's comes in, as far under the voice; its sounds on the same events; its black ending.
- A switch: **also clip the footage** (cut its pauses down to the reference's), or keep your cut as it is.

What it measured on the example ad, and how each part works: [docs/mimic.md](docs/mimic.md).

## How it picks and frames

- **Picks like an editor, no key needed.** A small picture model in the page (TinyCLIP, 9 MB) looks at stills of your footage and says what every moment shows (a supercar, a jet, a villa, a view, a desk, a talking head) and how much it sells the life. Each edit is built from the best moments of everything you dropped, the way an editor pulls selects: the hook, the drop and the last shot get the most striking of them, and talking heads, title cards and filler stay out while there's anything better. A frame too dark to read on a phone counts for less, whatever it shows, and the first frame, which has to read at a glance, is a bright one when there is one. Variety comes from what the shots show, not which file they came from (eight scenes of one Reel are eight shots; four clips of one car from the same side are one), and two shots of the same thing back to back change the framing, so a cut doesn't read as a glitch. A strip under each clip shows where its flex is.
- **Sharper with Gemini.** With a free Gemini key, Gemini rates the same stills (small numbered contact sheets, one frame every few seconds, never the video) instead. The answers are remembered per file, so the same video is never rated twice.
- **Cut on the beat, the same way every two bars.** Measured cut by cut against their songs' beat grids ([the rhythm](docs/edit-analysis.md#the-rhythm-cut-by-cut-against-each-songs-grid)), the reference editors hold one rhythm from the drop to the end, and so does the app. Before the drop: a cut every two beats on the bar's beats, nothing cut in the silence of a break, and the shot into the drop pushing in as it holds. From the drop to the card: one two-bar pattern, repeated, on the beats the song itself hits (a beat with nothing on it is passed over, and a syncopated kick gets its cut in every bar it plays), each shot about half a second and none longer than a second and a half, with the best of the flex saved for it. In every bar one clip carries over a beat with a jump cut, and at the end of every four bars (two, in every other edit) one clip is re-cut on the half beat, jumping forward in it and punching in: how the reference editors cut fast without burning through footage (a fifth to a third of their cuts). On mico's song the app picks its editor's own pattern, 1, 1, 2, 1 and 3 beats; the planner it replaces, chasing every accent, could hold three seconds, then one, then three.
- **Clean shots from long videos.** A long video is skimmed a frame every second or two, which judges its moments but can miss a fast-cut vlog's own cuts, so a shot could run over one and flash to another scene off the beat. A video from YouTube has a key frame wherever a scene starts, and the skim reads key frames, so when the picture changes from one to the next, the cut is on a key frame in between, known to the frame: shots keep a quarter of a second clear of it, where they used to keep more than a second either side of a guess. Before an edit is made, every frame of the stretches it uses is looked at for the video's own cuts (on thumbnails averaged down from a larger picture, against the change around each frame, so a cut in shaky footage or between two dark shots isn't missed), and the edit is planned again around any it finds, so the only cuts you see are the edit's.
- **Every edit in a batch is different.** Each opens on, drops into and closes on moments no other edit in the batch used anywhere, while the footage has strong ones left (a strong shot seen in another edit still beats filler), and the first edit leaves the later ones hook and drop candidates of their own instead of spending them in its body. The rest of each edit draws on the moments the others haven't shown, least of all the ones another edit is remembered by (its opening, drop and last shot), and each cuts at its own rhythm (one busier, the next calmer). Three edits from a seven minute vlog now repeat 6 of their 47 shots, all in the second and third, and open, drop and close on nine different moments; they repeated 14 of 54, and one shot was the first edit's closer, the second's hook and the third's closer.
- **Face tracking** (on by default, one switch). When wide footage is cropped to 9:16, the crop follows the person in the shot: it holds still while they stay near the middle, glides when they move, and never lets the face slip out of frame. A 230 KB face detector (YuNet) runs in the page for this.
- **Black bars are left out.** A letterboxed film or a phone video inside a YouTube frame is cropped from the picture itself, so no black bars end up in the edit.
- **YouTube videos skip the sponsor read.** If the file name carries the video's ID (as `yt-dlp` names files: `Title [dQw4w9WgXcQ].mp4`), the sponsor reads, intro and outro that SponsorBlock's viewers marked are left out. A long video's first seconds and its end screen are avoided either way.
- **Hits on the drop.** The shot into the drop pushes in as it holds; the drop lands with a flash and a punch-in, a golden film burn, or a punch-in with a shake, turning over through a batch, and whichever it is, the picture smears out from the middle for a few frames and splits red from blue as it lands. The music's strongest hits after it get a small punch-in. Story clips punch in on every other jump cut so the cuts read as deliberate.
- **Velocity** (a switch, off by default): speed ramps, the car-edit look. Each shot hits in slow motion on the beat and rushes into the next cut, slowest on the drop, and the cuts that open a four-bar phrase get a zoom blur. Footage shot at 60 fps slows down smoothly; 30 fps footage gets a gentler ramp.

## How to use it

1. Open the link in **Chrome on your Mac** (Chrome uses the Mac's hardware to decode and encode, and writes the H.264 MP4 Instagram wants).
2. Pick a format.
3. Drop the footage. Anything Chrome plays works: iPhone MOV and MP4, screen recordings, photos (JPEG, PNG; export HEIC photos as JPEG first).
4. Drop the sound: a Reel that uses the trending sound, or any song. The easy way to get a Reel onto the Mac: screen-record it on your iPhone with the sound on, AirDrop the recording, drop it in. Only its sound is used. (A screen recording rarely starts where the Reel does, so post the version with the song in it rather than adding the sound in the app.)
5. Drag the box on the song's timeline to where the edits should start (it snaps to the bar lines; **Play** plays that stretch), and its right edge to how long they should run. For Story, drag the line to the moment that should hit as the talking ends.
6. Optional: paste a free Gemini key from [Google AI Studio](https://aistudio.google.com/apikey) (no card) for sharper picks; Story needs one. For Story, **Find the moments**, tick the ones you want and edit their hooks.
7. **Make edits**. Download, post, add the sound in the app if you used the version without it. Delete any edit you don't want with the × on it (it stops one that's still being made).

Your videos never leave the computer. Without a key nothing does: both models run in the page (they download once, about 30 MB, and the browser keeps them). With a Gemini key, Gemini sees small stills of your footage; for Story, the video's sound goes to Gemini and only its transcript comes back.

**YouTube links:** a browser page can't download from YouTube, so for now download the video first and drop the file in. A small Chrome extension that grabs it from inside your own browser is the next step (see the [build plan](docs/build-plan.md)).

## What's in here

| | |
|---|---|
| [`app/`](app/) | The clipper itself: a static site (Vite + TypeScript + React) with the engine, the UI and the tests. [How it's built](app/README.md) |
| [`docs/edit-analysis.md`](docs/edit-analysis.md) | The reference edits taken apart: formats, measured cut timing, captions, and the demo card spec |
| [`docs/build-plan.md`](docs/build-plan.md) | How the machine works, the free stack, what's done and what's next |
| [`docs/namzilabs-context.md`](docs/namzilabs-context.md) | Namzilabs as a product: the app, its look, the content rules |
| [`reference-edits/`](reference-edits/) | Example Reels to learn from |
| [`docs/mimic.md`](docs/mimic.md) | The Mimic page: the example ad measured, how a reference is studied and copied |
| [`rawvidneededited/`](rawvidneededited/) | Raw footage to edit (the Mimic page's example) |
| [`inspirationedit/`](inspirationedit/) | An ad to copy (the Mimic page's example) |
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

The app's own output measures like the references: cuts land on the start of the hit (the best reference montage cuts 3 ms after it, the app within a frame before it and never more than 5 ms after), and every edit is mastered to -14 LUFS with the peaks kept under -1 dB after encoding. Both the app and `analyze_edit.py` measure where each hit starts, in 3 ms steps: an onset detector's beats sit 25 to 55 ms after that, which is how late an edit cut on them lands.

The song's shape is checked the same way. On KETTAMA's Comes and Goes the vocal model finds every sung line of the verse within 30 ms of where a studio-grade separation puts it. From 0:34, where the song drops out at 0:41 and the verse's first line lands at 0:43, an edit cuts every two beats, holds one shot through the silence and the beat after it, and drops on the verse's first bar. After it, where the kicks fall between the beats, it cuts the same two bars over and over (2, 1, 1, 1, 1.5 and 1.5 beats, the cuts between beats on the kicks wherever a bar has them), and in 30 seconds of it nothing after the drop holds longer than two beats.

Most music made on a computer (dance, pop, trap, drill, garage) runs at one exact tempo, so when a song keeps one, the beat grid is measured to a hundredth of a bpm and put on the kick and the snare, not the hi-hats. On a 4:22 garage track at 134 bpm, cuts from a beat tracker alone drifted up to a tenth of a second and, before the drop, 11 to 14 of 20 landed on the hats between beats; now every cut of a rendered edit lands on the beat you hear or on a kick between beats, the same way through the whole song, and a 15 or 30 second clip of it (what a Reel's sound is) finds the same grid, to within 15 ms. Bar lines come from the kick and the bass line rather than the chords, which songs often push ahead of the bar, and a cut goes between beats only on a hit that stands out from what always plays there (a syncopated kick, not the hats). `analyze_edit.py` measures against that grid too.

A song played by hand, or sparse (a voice and finger snaps on 2 and 4), keeps no exact grid, and a beat tracker can settle on a tempo none of its hits keep: the nio.trade Reel sound with the snaps was heard at 117 bpm, so a snap landed on a beat one time in three and the cuts missed them. Now the song's standout hits vote on the tempo, the beats move onto where they start, and a bar line with next to nothing on it pulls a cut less than the snap beside it. The same sound is heard at 87 bpm with 9 of its 10 hardest hits on a beat, and in a 14 second edit of it every snap gets a cut (before, 3 of 7 in the edit that showed it).

A kick that falls every beat and a half (a 3-3-2 groove: trap, afrobeats, a lot of pop) can hold a steady grid at two thirds of the tempo too. nio.trade's lyric montage was heard at 103 bpm, where a third of its hits fall a third of a beat off the grid; its editor's cuts sit on 155. Now, when a grid 3:2 away keeps the song's hardest hits (on its beats or exactly between them) clearly better and the drums keep to it at least as tightly, that's the beat: the song is heard at 155, and the ten other songs tested keep theirs.
